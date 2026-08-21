import { getCourseIntelligence } from './courseIntelligence.ts'
import { isStableCatalogCourse } from './courseCatalog.ts'
import type { Course, LearningResource, ResourceQuery, ResourceSearchSuggestion, ResourceSnapshot, ResourceSort, ScheduleProfile } from './types.ts'

export interface ResourceProvider {
  readonly kind: 'mock' | 'remote'
  readonly available: boolean
  search(query: ResourceQuery, signal?: AbortSignal): Promise<ResourceSnapshot[]>
}

export const mockResourceProvider: ResourceProvider = {
  kind: 'mock',
  available: false,
  async search() {
    // The front-end mock deliberately returns no video metadata. Search suggestions
    // are shown separately and never promoted to reviewed resources.
    return []
  },
}

export const createRemoteResourceProvider = (endpoint: string, timeoutMs = 8_000): ResourceProvider => {
  if (!endpoint.startsWith('/api/')) throw new Error('资源服务只能使用同源 /api/ 地址，禁止在前端直连带密钥的第三方接口。')
  const cache = new Map<string, ResourceSnapshot[]>()
  return {
    kind: 'remote',
    available: true,
    async search(query, signal) {
      const key = JSON.stringify(query)
      const cached = cache.get(key)
      if (cached) return cached.map(item => ({ ...item, knowledgePoints: [...item.knowledgePoints], suitableTaskTypes: [...item.suitableTaskTypes] }))
      const controller = new AbortController()
      const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(query),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`资源服务暂时不可用（${response.status}），请稍后重试。`)
        const resources = validateResourceSnapshots(await response.json())
        cache.set(key, resources)
        return resources
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw Object.assign(new Error('资源检索超时或已取消，请缩小课程或知识点范围后重试。'), { cause: error })
        throw error
      } finally {
        globalThis.clearTimeout(timeout)
        signal?.removeEventListener('abort', abort)
      }
    },
  }
}

const nullableNumber = (value: unknown) => value === null || typeof value === 'number' && Number.isFinite(value)

export const validateResourceSnapshots = (value: unknown): ResourceSnapshot[] => {
  if (!Array.isArray(value)) throw new Error('资源快照必须是数组。')
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`第 ${index + 1} 条资源快照不是对象。`)
    const record = item as Partial<ResourceSnapshot>
    if (record.platform !== '哔哩哔哩' || !record.id || !record.videoId || !record.originalUrl || !record.title || !record.author || !record.searchQuery || !record.canonicalCourseId || !record.originalCourseName || !record.stage) throw new Error(`第 ${index + 1} 条资源快照缺少平台、ID、原始链接、课程、标题、作者或检索词。`)
    if (!/^BV[0-9A-Za-z]{10}$/.test(record.videoId) || !record.originalUrl.includes(`/video/${record.videoId}`)) throw new Error(`第 ${index + 1} 条资源快照的 BV 号或原始链接无效。`)
    if (!['reviewed', 'candidate', 'unavailable'].includes(record.status ?? '')) throw new Error(`第 ${index + 1} 条资源快照状态无效。`)
    if (![record.viewCount, record.likeCount, record.favoriteCount, record.coinCount].every(nullableNumber)) throw new Error(`第 ${index + 1} 条资源快照统计字段必须为数字或 null。`)
    if (!Array.isArray(record.knowledgePoints) || !record.knowledgePoints.length || !Array.isArray(record.suitableTaskTypes) || !record.suitableTaskTypes.length) throw new Error(`第 ${index + 1} 条资源快照缺少知识点或适用任务类型。`)
    if (![record.qualityScore, record.trustScore, record.foundationMatchScore].every(value => typeof value === 'number' && value >= 0 && value <= 100)) throw new Error(`第 ${index + 1} 条资源快照质量、可信度或基础匹配分无效。`)
    if (typeof record.relevanceScore !== 'number' || record.relevanceScore < 0 || record.relevanceScore > 100) throw new Error(`第 ${index + 1} 条资源快照相关度无效。`)
    if (record.status === 'reviewed' && (!record.reviewedAt || !record.reviewer || record.healthStatus !== 'active' || !record.lastCheckedAt)) throw new Error(`第 ${index + 1} 条审核资源缺少审核人、审核日期或有效链接检查。`)
    return record as ResourceSnapshot
  })
}

export const resourceSnapshotScore = (parts: { knowledge: number; quality: number; trust: number; foundation: number; popularity: number | null }) => {
  const weighted: Array<[number, number | null]> = [[.40, parts.knowledge], [.25, parts.quality], [.15, parts.popularity], [.10, parts.trust], [.10, parts.foundation]]
  const available = weighted.filter((entry): entry is [number, number] => entry[1] !== null)
  const denominator = available.reduce((sum, [weight]) => sum + weight, 0)
  return denominator ? Math.round(available.reduce((sum, [weight, score]) => sum + weight * score, 0) / denominator) : 0
}

export const normalizeResourceMetadata = (resource: LearningResource): LearningResource => ({
  ...resource,
  originalCourseName: resource.originalCourseName ?? resource.courseNames[0] ?? '',
  province: resource.province ?? '',
  textbookVersion: resource.textbookVersion ?? resource.curriculumTags[0] ?? '',
  major: resource.major ?? '',
  chapter: resource.chapter ?? resource.knowledgePoints[0] ?? '',
  officialOrOriginal: resource.officialOrOriginal ?? null,
  reposted: resource.reposted ?? null,
  originalSourceNote: resource.originalSourceNote ?? resource.verificationNote,
  publishedAt: resource.publishedAt ?? resource.bilibili?.publishedAt ?? '',
  reviewer: resource.reviewer ?? (resource.humanVerified ? '人工目录维护者' : ''),
  suitableTaskTypes: resource.suitableTaskTypes?.length ? [...resource.suitableTaskTypes] : resource.bilibili?.taskUse ? [resource.bilibili.taskUse] : [resource.contentType],
})

const metric = (resource: LearningResource, key: 'viewCount' | 'favoriteCount') => resource.bilibili?.[key] ?? null

export const sortReviewedCatalog = (
  resources: LearningResource[],
  sort: ResourceSort,
  relevance: (resource: LearningResource) => number,
) => [...resources].sort((left, right) => {
  if (sort === '播放最多' || sort === '收藏最多') {
    const key = sort === '播放最多' ? 'viewCount' : 'favoriteCount'
    const leftValue = metric(left, key)
    const rightValue = metric(right, key)
    if (leftValue === null && rightValue !== null) return 1
    if (rightValue === null && leftValue !== null) return -1
    if (leftValue !== rightValue) return (rightValue ?? -1) - (leftValue ?? -1)
  }
  if (sort === '最新审核') {
    const byDate = (right.reviewedAt || '').localeCompare(left.reviewedAt || '')
    if (byDate) return byDate
  }
  return relevance(right) - relevance(left) || right.humanVerified.toString().localeCompare(left.humanVerified.toString()) || left.id.localeCompare(right.id)
})

const safePart = (value: string) => value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()

export const resourceQueryForCourse = (course: Course, knowledgePoint = ''): ResourceQuery => ({
  canonicalCourseId: course.canonicalId,
  courseName: course.canonicalName || course.name,
  stage: course.stage || '其他',
  province: course.curriculum.province || undefined,
  textbookVersion: course.curriculum.textbookVersion || course.curriculum.syllabusTitle || undefined,
  knowledgePoint: knowledgePoint || undefined,
  foundation: course.mastery || (course.assessmentMode === 'score' && course.score !== '' && course.maxScore !== '' ? `${course.score}/${course.maxScore}` : undefined),
})

export const buildBilibiliSearchSuggestions = (course: Course, schedule?: ScheduleProfile, requestedPoint = ''): { suggestions: ResourceSearchSuggestion[]; blockedReason: string } => {
  const intelligence = getCourseIntelligence(course, schedule)
  const hasRealSyllabus = course.curriculum.syllabusUnits.length >= 2
  const knownCourse = isStableCatalogCourse(course.canonicalId)
  if (!knownCourse && !hasRealSyllabus) return { suggestions: [], blockedReason: '课程库中没有足够上下文，请先补充至少两个真实章节或模块。' }
  if (intelligence.needsClarification && !hasRealSyllabus && !knownCourse) return { suggestions: [], blockedReason: '请先确认课程具体方向，再生成检索建议。' }
  const query = resourceQueryForCourse(course, requestedPoint)
  const points = [requestedPoint, ...intelligence.curriculumUnits.map(unit => unit.title), ...intelligence.competencyDimensions].filter(Boolean)
  const uniquePoints = [...new Set(points)].slice(0, 4)
  const prefix = safePart([query.stage, query.province, query.courseName, query.textbookVersion].filter(Boolean).join(' '))
  const commonPatterns = [
    ['基础概念讲解', '第一次接触或基础不稳时', '看完后写出 3 个核心概念与适用条件'],
    ['零基础入门', '需要补前置基础时', '完成 3 道最小步骤练习并核对'],
    ['典型例题精讲', '从理解过渡到独立应用时', '遮住答案重做 2 个同类新例'],
    ['易错点总结', '重复出现同类错误时', '把错因分为概念、步骤和检查三类'],
    ['章节复习', '完成一个阶段后的结构化复习', '画出本章节知识关系并标记薄弱点'],
    ['练习题讲解', '需要即时练习反馈时', '独立完成 5 题并记录未达原因'],
    ['期末复习', '接近考试或阶段复测时', '完成一次限时小测并按知识点复盘'],
    ['学习方法与解题思路', '知道知识但无法稳定完成任务时', '写出可复用的步骤清单并用新任务验证'],
    ['教材同步精讲', '需要按当前教材或课程目录推进时', '把视频目录与自己的章节逐项对齐'],
    ['前置基础补习', '当前任务卡在先修知识时', '列出前置缺口并完成 3 个最小练习'],
    ['重点难点梳理', '章节内容多、难以取舍时', '写出本章 3 个重点和 1 个仍未解决的问题'],
    ['高频考点训练', '准备阶段测验或考试时', '完成一组同难度新题并按知识点统计'],
    ['真题与模拟题讲解', '需要验证考试迁移时', '限时完成对应题目，再核对讲解'],
    ['限时训练', '理解但速度不稳定时', '记录用时、失分点和第二次完成时间'],
    ['错题复盘', '已经积累同类错误时', '不看答案重做并记录错误触发条件'],
    ['知识框架总结', '阶段结束需要建立整体结构时', '画出知识关系并标记先修与应用'],
    ['阶段自测', '需要判断是否进入下一阶段时', '独立完成小测并如实记录未达项'],
    ['迁移应用', '能够跟随但不会独立应用时', '完成一个条件变化的新任务并解释调整'],
    ['复习清单', '复习内容分散时', '整理可逐项检查的复习清单'],
    ['课堂同步复习', '需要跟上学校课程节奏时', '用自己的课堂笔记核对并补充遗漏'],
    ['专题串联复习', '需要连接多个相关知识点时', '写出知识点之间的先后关系并完成一道综合任务'],
    ['口述与输出检验', '看懂但无法独立表达时', '不看材料口述核心方法，再核对遗漏并修正'],
  ] as const
  const practicalPatterns = [
    ['入门实操', '需要从最小操作建立手感时', '关闭教程后独立复现一个最小成果'],
    ['完整案例拆解', '需要理解从输入到成果的完整流程时', '写出流程、关键决策和检查标准'],
    ['项目跟练', '需要形成可展示或可运行成果时', '完成一个缩小范围的项目并保留源文件'],
    ['质量检查', '结果能完成但质量不稳定时', '按命名、结构、边界和输出逐项检查'],
    ['作品复盘', '已有作品或实现需要改进时', '记录修改前后差异与下一版目标'],
    ['工具流程', '命令或操作步骤不熟练时', '整理快捷步骤并独立完成一次'],
    ['常见错误排查', '运行、建模或输出经常失败时', '复现一个错误并记录排查顺序'],
    ['综合训练', '准备阶段交付或综合考试时', '完成输入、执行、检查和复盘闭环'],
  ] as const
  const theoryPatterns = [
    ['概念辨析', '相近概念容易混淆时', '写出定义、条件和一个反例'],
    ['材料分析', '需要从材料提取证据时', '标记事实、观点和推理链'],
    ['论述题方法', '知道知识但表达不完整时', '按观点、证据、解释完成一个短答'],
    ['记忆与提取练习', '需要长期记忆时', '间隔回忆并记录遗漏'],
    ['案例应用', '需要将理论用于情境时', '用一个新案例解释概念边界'],
    ['章节思维导图', '知识关系不清晰时', '建立章节结构并标出薄弱节点'],
    ['名词解释训练', '基础概念表达不准确时', '用自己的话解释并举例'],
    ['综合复习', '需要跨章节连接时', '完成一组跨知识点任务并标记依据'],
  ] as const
  const practicalDomains = new Set(['编程语言与Web开发', '计算机系统网络与数据库', '人工智能与数据科学', '平面与图像设计', '矢量设计', '三维建模与CAD', '视频剪辑与动效', 'UIUX与交互设计', '产品设计理论与项目'])
  const patterns = [...commonPatterns, ...(practicalDomains.has(intelligence.subjectDomain) ? practicalPatterns : theoryPatterns)].slice(0, 30)
  const suggestions = patterns.map(([suffix, scene, practice], index) => {
    const point = safePart(uniquePoints[index % Math.max(1, uniquePoints.length)] || query.courseName)
    return {
      id: `${course.canonicalId || course.id}-${index + 1}`,
      query: safePart(`${prefix} ${point} ${suffix}`),
      scene,
      afterWatchPractice: `${practice}（围绕：${point}）`,
      knowledgePoint: point,
      status: 'candidate' as const,
    }
  })
  return { suggestions, blockedReason: '' }
}
