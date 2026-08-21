import { addDays, daysBetween } from './dateUtils.ts'
import { catalogProfiles, domainProfiles, normalizeCourseName } from './courseCatalog.ts'
import { curriculumUnitsForCourse } from './curriculum.ts'
import type { Course, CourseIntelligenceResult, DiagnosticQuestion, LearningStage, ScheduleProfile } from './types.ts'

const question = (
  id: string,
  type: DiagnosticQuestion['type'],
  evidenceType: DiagnosticQuestion['evidenceType'],
  prompt: string,
  options: string[],
  scores: number[],
  point: string,
  difficulty: DiagnosticQuestion['difficulty'] = '基础',
): DiagnosticQuestion => ({
  id,
  courseId: '',
  version: 1,
  type,
  evidenceType,
  prompt,
  options,
  scores: Object.fromEntries(options.map((option, index) => [option, scores[index] ?? 0])),
  point,
  difficulty,
})

const holidayWeekCount = (schedule?: ScheduleProfile) => {
  if (!schedule?.holidayStart || !schedule.holidayEnd) return 6
  const totalDays = Math.max(1, daysBetween(schedule.holidayStart, schedule.holidayEnd) + 1)
  return Math.max(2, Math.min(8, Math.round(totalDays / 7)))
}

const stageIndexes = (count: number, sourceLength: number) => {
  if (count >= sourceLength) return Array.from({ length: sourceLength }, (_, index) => index)
  if (count === 2) return [0, sourceLength - 1]
  return Array.from({ length: count }, (_, index) => Math.round(index * (sourceLength - 1) / (count - 1)))
}

const scoreBand = (course: Course) => {
  if (course.assessmentMode !== 'score' || course.score === '' || course.maxScore === '' || Number(course.maxScore) <= 0) return 'standard' as const
  const ratio = Number(course.score) / Number(course.maxScore)
  return ratio < .3 ? 'foundation' as const : ratio < .7 ? 'recovery' as const : 'advanced' as const
}

const stagesFor = (course: Course, schedule: ScheduleProfile | undefined, topics: string[], deliverables: string[], dimensions: string[], exactTopics = false): LearningStage[] => {
  const count = exactTopics ? Math.min(holidayWeekCount(schedule), topics.length) : holidayWeekCount(schedule)
  const indexes = stageIndexes(Math.min(count, topics.length), topics.length)
  const selected = indexes.map(index => ({ topic: topics[index], deliverable: deliverables[index] }))
  if (!exactTopics && count > selected.length) {
    const extras = Array.from({ length: count - selected.length }, (_, index) => ({
      topic: `强化与迁移 ${index + 1}`,
      deliverable: `第 ${index + 1} 份迁移练习记录`,
    }))
    selected.splice(Math.max(1, selected.length - 1), 0, ...extras)
  }
  const band = scoreBand(course)
  const stageSeeds = selected.slice(0, count)
  const stageCount = stageSeeds.length
  const totalDays = schedule?.holidayStart && schedule.holidayEnd ? Math.max(1, daysBetween(schedule.holidayStart, schedule.holidayEnd) + 1) : stageCount * 7
  const distributeAcrossHoliday = stageCount === holidayWeekCount(schedule)
  return stageSeeds.map((seed, index) => {
    const point = dimensions[index % dimensions.length]
    const first = index === 0
    const last = index === stageCount - 1
    const title = exactTopics ? seed.topic : first && band === 'foundation' ? '前置基础与概念定位'
      : first && band === 'recovery' ? '及格差距与高频错因'
        : first && band === 'advanced' ? '综合应用与限时迁移'
          : seed.topic
    const startOffset = distributeAcrossHoliday ? Math.floor(index * totalDays / stageCount) : index * 7
    const endOffset = distributeAcrossHoliday ? Math.max(startOffset, Math.floor((index + 1) * totalDays / stageCount) - 1) : startOffset + 6
    const startDate = schedule?.holidayStart ? addDays(schedule.holidayStart, startOffset) : ''
    const endDate = startDate && schedule?.holidayEnd ? [addDays(schedule.holidayStart, endOffset), schedule.holidayEnd].sort()[0] : ''
    return {
      courseId: course.id,
      week: `第 ${index + 1} 周`,
      startDate,
      endDate,
      title,
      focus: first && band === 'foundation' ? `从${dimensions.slice(0, 2).join('、')}的前置能力开始，先确认能独立完成的最小步骤。`
        : first && band === 'recovery' ? `围绕${dimensions.slice(0, 3).join('、')}定位距离目标最近的高频问题。`
          : first && band === 'advanced' ? `直接验证${dimensions.slice(-2).join('、')}中的综合应用和迁移能力。`
            : last ? `用同等难度的新任务复测${point}，保留最终验证阶段。` : `围绕${point}建立可复用的方法。`,
      practice: band === 'foundation' ? `完成短步骤练习并立即核对，每次只处理一个${point}问题。`
        : band === 'advanced' ? `完成综合或限时任务，并解释${point}的迁移过程。`
          : `完成典型练习，按原因记录${point}中的失误。`,
      deliverable: last ? `最终验证：${seed.deliverable}` : seed.deliverable,
      difficulty: band === 'foundation' ? '基础' : band === 'advanced' ? '进阶' : index < 2 ? '基础' : '中等',
    }
  })
}

const questionsFor = (course: Course, dimensions: string[]): DiagnosticQuestion[] => {
  const domain = course.subjectDomain || normalizeCourseName(course.name, course.canonicalId).subjectDomain
  if (course.canonicalId === 'high.math') return [
    { ...question('high-math-set', 'knowledge', 'objective_quiz', '若元素 x 属于集合 A，以下哪项是正确记号？', ['x∈A', 'A∈x', 'x=A'], [2, 0, 0], '集合与逻辑'), correctOption: 'x∈A' },
    { ...question('high-math-function', 'concept', 'objective_quiz', '判断函数单调性前，最先需要确认什么？', ['定义域与区间', '只看一个函数值', '直接画任意直线'], [2, 0, 0], '函数与性质'), correctOption: '定义域与区间' },
    question('high-math-algebra', 'application', 'performance_task', '请写出解一个一元二次方程的步骤，并说明判别式在其中的作用。', ['无法写出', '能写部分步骤', '能完整写出并检查'], [0, 1, 2], '代数运算', '中等'),
    question('high-math-geometry', 'application', 'performance_task', '面对一道几何题，你能否标出已知、目标并写出至少一条可用关系？', ['无法完成', '需要提示', '可以独立完成并检查'], [0, 1, 2], '几何关系', '中等'),
  ]
  if (course.canonicalId === 'cs.data-structures') return [
    { ...question('ds-complexity', 'knowledge', 'objective_quiz', '顺序查找 n 个元素时，最坏时间复杂度是哪一个？', ['O(n)', 'O(1)', 'O(log n)'], [2, 0, 0], '复杂度'), correctOption: 'O(n)' },
    { ...question('ds-linear', 'concept', 'objective_quiz', '链表相对顺序表最直接的结构差异是什么？', ['节点通过指针连接', '元素必须连续存储', '只能保存数字'], [2, 0, 0], '线性表'), correctOption: '节点通过指针连接' },
    question('ds-tree', 'application', 'performance_task', '请画出或描述一棵二叉树的前序遍历步骤。', ['无法完成', '需要提示', '可以独立完成并核对'], [0, 1, 2], '树', '中等'),
    question('ds-graph', 'application', 'performance_task', '给定一个小型关系网络，你能否选择邻接表或邻接矩阵并说明理由？', ['无法选择', '能选择但说不清理由', '能选择并说明空间代价'], [0, 1, 2], '图', '中等'),
  ]
  if (domain === '数学与统计' || domain === '大学英语与语言考试' || domain === '编程语言与Web开发' || domain === '计算机系统网络与数据库' || domain === '人工智能与数据科学') {
    const first = dimensions[0] || '基础概念'
    const second = dimensions[1] || '典型应用'
    return [
      { ...question(`${course.canonicalId || 'course'}-objective-1`, 'knowledge', 'objective_quiz', `关于“${first}”，哪种做法最能提供可验证的掌握证据？`, ['独立完成一个新例并说明条件', '只重新浏览笔记', '根据熟悉感判断'], [2, 0, 0], first), correctOption: '独立完成一个新例并说明条件' },
      { ...question(`${course.canonicalId || 'course'}-objective-2`, 'concept', 'objective_quiz', `处理“${second}”时，第一步应该是什么？`, ['确认输入、目标与适用条件', '直接套用最后看到的答案', '跳过检查过程'], [2, 0, 0], second), correctOption: '确认输入、目标与适用条件' },
      question(`${course.canonicalId || 'course'}-application`, 'application', 'performance_task', `请独立完成一个与示例不同的“${second}”最小任务，并说明检查结果。`, ['尚不能完成', '需要提示后完成', '可独立完成并检查'], [0, 1, 2], second, '中等'),
      question(`${course.canonicalId || 'course'}-review`, 'quality', 'self_assessment', `完成“${first}”后，你目前有明确的复查或纠错流程吗？`, ['没有', '能检查一部分', '有完整检查流程'], [0, 1, 2], first),
    ]
  }
  if (domain === '平面与图像设计') return [
    question('image-layer', 'tool', 'performance_task', '面对需要反复修改的图像作品，你能否规范命名、分组并保持图层可编辑？', ['还不能', '需要参考', '可以独立完成'], [0, 1, 2], '图层与对象组织'),
    question('image-mask', 'workflow', 'performance_task', '需要局部隐藏素材时，你能否使用蒙版而不是直接破坏原图？', ['不会', '跟随教程可以', '可以独立选择方法'], [0, 1, 2], '蒙版与非破坏性编辑'),
    question('image-selection', 'application', 'self_assessment', '复杂边缘、选区或局部调色中，你目前最接近哪种情况？', ['无法建立可用选区', '边缘质量不稳定', '可以完成并检查边缘'], [0, 1, 2], '选区与局部调整'),
    question('image-export', 'quality', 'performance_task', '导出前能否检查尺寸、色彩模式、格式和可读性？', ['没有检查流程', '只检查部分', '有完整检查表'], [0, 1, 2], '导出与质量检查'),
  ]
  if (domain === '矢量设计') return [
    question('vector-shape', 'tool', 'performance_task', '能否用形状、布尔运算和钢笔工具构建可编辑图形？', ['还不能', '需要参考', '可以独立完成'], [0, 1, 2], '形状与钢笔'),
    question('vector-path', 'workflow', 'performance_task', '面对曲线路径时，能否控制锚点与手柄获得平滑轮廓？', ['不会', '不稳定', '可以检查并修正'], [0, 1, 2], '锚点与路径'),
    question('vector-system', 'quality', 'self_assessment', '制作一组图标时能否保持网格、描边和视觉重量一致？', ['没有方法', '部分一致', '有系统检查'], [0, 1, 2], '图标系统'),
    question('vector-export', 'quality', 'performance_task', '能否按用途导出 SVG、PDF 或位图资产？', ['不会', '只会一种格式', '能按用途选择'], [0, 1, 2], '矢量导出'),
  ]
  if (domain === '三维建模与CAD') return [
    question('cad-space', 'tool', 'performance_task', '能否正确使用坐标、视图、捕捉或单位建立基础几何？', ['还不能', '需要提示', '可以独立完成'], [0, 1, 2], '空间与坐标'),
    question('cad-geometry', 'workflow', 'performance_task', '能否用曲线、草图、曲面或实体完成一个封闭结构？', ['不会', '能完成部分', '能完成并检查'], [0, 1, 2], '曲线与实体'),
    question('cad-quality', 'quality', 'self_assessment', '模型最常见的问题属于哪一类？', ['几何无法建立', '接缝或拓扑问题', '主要是精度与命名'], [0, 1, 2], '拓扑与精度'),
    question('cad-export', 'quality', 'performance_task', '能否检查单位、法线、封闭性并选择正确导出格式？', ['不会', '只检查部分', '有完整检查流程'], [0, 1, 2], '模型导出'),
  ]
  if (domain === '视频剪辑与动效') return [
    question('video-assets', 'workflow', 'performance_task', '能否按镜头、声音和版本组织素材与工程文件？', ['还不能', '基本分类', '可以规范管理'], [0, 1, 2], '素材管理'),
    question('video-timeline', 'application', 'performance_task', '能否在时间轴中独立完成粗剪、精剪和节奏调整？', ['不会', '需要参考', '可以独立完成'], [0, 1, 2], '时间轴剪辑'),
    question('video-motion', 'tool', 'self_assessment', '关键帧、缓动或合成中最接近哪种情况？', ['不会设置', '能做基础效果', '能控制节奏与层级'], [0, 1, 2], '关键帧动效'),
    question('video-export', 'quality', 'performance_task', '能否按平台要求检查分辨率、码率、音频和字幕？', ['不会', '只检查部分', '有完整导出流程'], [0, 1, 2], '编码导出'),
  ]
  return dimensions.slice(0, 4).map((point, index) => question(
    `${course.canonicalId || 'course'}-${index + 1}`,
    index === 0 ? 'concept' : index === 3 ? 'quality' : 'application',
    index % 2 === 0 ? 'self_assessment' : 'performance_task',
    index === 0 ? `在「${course.name}」中，你能否用自己的话解释“${point}”并举出一个例子？`
      : index === 1 ? `面对「${point}」的典型任务，你能否不依赖完整示例独立完成？`
        : index === 2 ? `当「${point}」的条件变化时，你能否选择并调整原有方法？`
          : `完成「${point}」后，你是否有明确的质量检查或复盘标准？`,
    index === 0 ? ['还不能解释', '能复述但不会举例', '能解释并举例'] : ['还不能独立完成', '需要提示', '可以独立完成并检查'],
    [0, 1, 2],
    point,
    index >= 2 ? '中等' : '基础',
  ))
}

const courseSpecificPlan = (canonicalId: string) => {
  if (canonicalId === 'cs.data-structures') return {
    dimensions: ['复杂度', '线性表', '树', '图', '算法分析'],
    topics: ['复杂度与抽象数据类型', '线性表、栈与队列', '树与二叉树遍历', '图的表示与遍历', '查找、排序与综合复测'],
    deliverables: ['复杂度对比表', '线性表操作代码与测试', '二叉树遍历过程图', '图遍历实现与结果说明', '算法分析复测记录'],
    outcomes: ['能比较常见操作的时间复杂度。', '能实现并测试线性结构与树、图的基础操作。', '能说明所选数据结构及其代价。'],
  }
  return null
}

const goalsFor = (course: Course, outcomes: string[]) => outcomes.map(outcome => `${course.canonicalName || course.name}：${outcome}`)

export interface CourseIntelligenceProvider {
  analyze(course: Course, schedule?: ScheduleProfile): Promise<CourseIntelligenceResult>
}

export const getCourseIntelligence = (course: Course, schedule?: ScheduleProfile): CourseIntelligenceResult => {
  const normalized = normalizeCourseName(course.name, course.ambiguityResolved ? course.canonicalId : '')
  const profile = domainProfiles[normalized.subjectDomain]
  const catalogProfile = catalogProfiles.find(item => item.canonicalId === normalized.canonicalId)
  const specific = courseSpecificPlan(normalized.canonicalId)
  const ambiguity = Boolean(normalized.ambiguityOptions?.length)
  const fallbackUsed = normalized.subjectDomain === '通用技能'
  const userOrPresetUnits = curriculumUnitsForCourse(course, profile.stageTopics)
  const curriculumUnits = userOrPresetUnits.length ? userOrPresetUnits : (catalogProfile?.units ?? []).map((unit, index) => ({ ...unit, order: index + 1, prerequisites: [...unit.prerequisites] }))
  const needsMoreContext = Boolean(course.stage === '高中' && !curriculumUnits.length)
    || Boolean((fallbackUsed || normalized.confidence < .5) && !course.curriculum.syllabusUnits.length)
  const dimensions = specific?.dimensions ?? profile.dimensions
  const stageTopics = curriculumUnits.length ? curriculumUnits.map(unit => unit.title) : specific?.topics ?? profile.stageTopics
  const deliverables = stageTopics.map((_, index) => specific?.deliverables[index % specific.deliverables.length] ?? profile.deliverables[index % profile.deliverables.length])
  return {
    courseId: course.id,
    normalizedName: normalized.canonicalName,
    normalizedCourse: normalized,
    domainCategory: profile.broadCategory,
    subjectDomain: profile.subjectDomain,
    assessmentMode: course.assessmentMode,
    suggestedGoals: goalsFor({ ...course, canonicalName: normalized.canonicalName }, specific?.outcomes ?? profile.outcomes),
    competencyDimensions: [...dimensions],
    curriculumUnits,
    diagnosticQuiz: questionsFor({ ...course, canonicalId: normalized.canonicalId, subjectDomain: normalized.subjectDomain }, dimensions).map(item => ({ ...item, courseId: course.id })),
    learningStages: stagesFor(course, schedule, stageTopics, deliverables, dimensions, curriculumUnits.length > 0).map(item => ({ ...item, courseId: course.id })),
    resourceKeywords: [...profile.resourceKeywords],
    forbiddenKeywords: [...profile.forbiddenKeywords],
    confidence: ambiguity || fallbackUsed ? 'low' : normalized.confidence >= .9 ? 'high' : 'medium',
    fallbackUsed,
    needsClarification: ambiguity || normalized.confidence < .5,
    needsMoreContext,
  }
}

export const localCourseIntelligenceProvider: CourseIntelligenceProvider = {
  async analyze(course, schedule) { return getCourseIntelligence(course, schedule) },
}

const validateRemoteResult = (result: CourseIntelligenceResult, course: Course, schedule?: ScheduleProfile) => {
  if (result.courseId !== course.id || !result.normalizedCourse?.canonicalId || result.diagnosticQuiz.length < 2 || result.diagnosticQuiz.length > 12 || result.learningStages.length < 2 || result.learningStages.length > 8) throw new Error('远程课程智能返回的数据边界无效。')
  const weeks = result.learningStages.map(stage => Number(stage.week.match(/\d+/)?.[0] ?? 0))
  if (weeks.some((week, index) => week !== index + 1)) throw new Error('远程课程智能返回的阶段顺序无效。')
  result.diagnosticQuiz.forEach(item => {
    if (!item.id || item.version < 1 || item.options.length < 2 || item.options.some(option => !(option in item.scores))) throw new Error('远程诊断题结构无效。')
  })
  if (schedule && holidayWeekCount(schedule) !== result.learningStages.length) throw new Error('远程学习阶段与假期长度不一致。')
  if (schedule && result.learningStages.some(stage => !stage.startDate || !stage.endDate || stage.startDate < schedule.holidayStart || stage.endDate > schedule.holidayEnd || stage.startDate > stage.endDate)) throw new Error('远程学习阶段日期超出假期边界。')
  return result
}

export const createRemoteCourseIntelligenceProvider = (endpoint: string, timeoutMs = 8_000): CourseIntelligenceProvider => ({
  async analyze(course, schedule) {
    if (!endpoint.startsWith('/api/')) throw new Error('远程课程智能只能通过同源后端 /api/ 接口调用，禁止前端直连模型服务。')
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ course, schedule }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`课程智能服务暂时不可用（${response.status}）。`)
      return validateRemoteResult(await response.json() as CourseIntelligenceResult, course, schedule)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        const timeoutError = new Error('课程智能服务响应超时，已取消请求。') as Error & { cause?: unknown }
        timeoutError.cause = error
        throw timeoutError
      }
      throw error
    } finally { globalThis.clearTimeout(timeout) }
  },
})

export const createResilientCourseIntelligenceProvider = (
  remote: CourseIntelligenceProvider,
  fallback: CourseIntelligenceProvider = localCourseIntelligenceProvider,
  retries = 1,
): CourseIntelligenceProvider => ({
  async analyze(course, schedule) {
    let lastError: unknown
    for (let attempt = 0; attempt <= Math.max(0, retries); attempt += 1) {
      try {
        return await remote.analyze(course, schedule)
      } catch (error) {
        lastError = error
      }
    }
    const local = await fallback.analyze(course, schedule)
    if (!local) throw lastError instanceof Error ? lastError : new Error('远程与本地课程智能均不可用。')
    return local
  },
})
