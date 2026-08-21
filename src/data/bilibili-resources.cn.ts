import type { LearningResource, SubjectDomain } from '../types.ts'

const reviewedAt = '2026-07-18'

type Seed = {
  bvid: string
  title: string
  author: string
  publishedAt: string
  durationText: string
  canonicalId: string
  courseName: string
  domain: SubjectDomain
  points: string[]
  stage: '高中' | '大学'
  suitableFoundation: string
  taskUse: string
  recommendation: string
  qualityScore: number
  trustScore: number
}

const categoryFor = (domain: SubjectDomain): LearningResource['domainCategory'] => domain === '数学与统计' ? '数学类' : domain === '编程语言与Web开发' ? '编程类' : '设计软件类'

const resource = (seed: Seed): LearningResource => ({
  id: `bilibili-${seed.bvid}`,
  title: seed.title,
  platform: '哔哩哔哩',
  author: seed.author,
  durationMin: 30,
  canonicalCourseIds: [seed.canonicalId],
  courseNames: [seed.courseName],
  domainCategory: categoryFor(seed.domain),
  subjectDomains: [seed.domain],
  suitableStage: `${seed.stage} · ${seed.suitableFoundation}`,
  educationStages: [seed.stage],
  difficulty: seed.suitableFoundation.includes('零基础') ? '入门' : '基础',
  contentType: '视频',
  language: '中文',
  knowledgePoints: seed.points,
  curriculumTags: [seed.courseName, ...seed.points],
  knowledgePointIds: seed.points,
  recommendation: seed.recommendation,
  humanVerified: true,
  reviewedAt,
  verificationNote: `已人工核对具体 B 站视频页、BV 号、标题、UP 主、发布时间和内容目录；平台热度数据未形成带日期快照，因此保持空值。`,
  url: `https://www.bilibili.com/video/${seed.bvid}/`,
  status: '可用',
  healthStatus: 'active',
  lastCheckedAt: reviewedAt,
  bilibili: {
    bvid: seed.bvid,
    coverUrl: null,
    publishedAt: seed.publishedAt,
    durationText: seed.durationText,
    viewCount: null,
    likeCount: null,
    favoriteCount: null,
    coinCount: null,
    statsSnapshotAt: null,
    reviewStatus: '人工审核通过',
    reviewedAt,
    suitableFoundation: seed.suitableFoundation,
    taskUse: seed.taskUse,
    knowledgeMatchScore: 100,
    qualityScore: seed.qualityScore,
    trustScore: seed.trustScore,
    foundationMatchScore: 90,
    popularityScore: null,
  },
})

// 手工审核静态目录，不在浏览器中请求 B 站接口。热度快照缺失时保持 null。
export const reviewedBilibiliResources: LearningResource[] = [
  resource({ bvid: 'BV1aV411i7XW', title: '零基础高中数学必修一/必修二/必修三', author: '一起谈数学', publishedAt: '2021-02-14', durationText: '分集约 16–25 分钟', canonicalId: 'high.math', courseName: '高中数学', domain: '数学与统计', points: ['集合与函数', '三角函数', '数列与不等式'], stage: '高中', suitableFoundation: '零基础到基础复习', taskUse: '章节预习与例题跟练', recommendation: '分章节覆盖集合、函数、三角函数和数列，适合按教材目录选择分集。', qualityScore: 84, trustScore: 76 }),
  resource({ bvid: 'BV11K411L7BW', title: '高中数学必修一：知识点短视频讲解', author: 'KK老师带你学数学', publishedAt: '2020-04-10', durationText: '分知识点短视频', canonicalId: 'high.math', courseName: '高中数学', domain: '数学与统计', points: ['集合与函数', '指数与对数函数', '函数应用'], stage: '高中', suitableFoundation: '基础复习', taskUse: '知识点补漏与课后复述', recommendation: '按单一知识点拆分，适合短时补漏并在观看后立即完成例题。', qualityScore: 82, trustScore: 74 }),
  resource({ bvid: 'BV12u411g78J', title: '高等数学（上册）同济八版精讲', author: 'bili_西农理羽', publishedAt: '2023-09-24', durationText: '分集约 9–25 分钟', canonicalId: 'math.calculus', courseName: '高等数学', domain: '数学与统计', points: ['函数与极限', '导数与微分', '积分基础'], stage: '大学', suitableFoundation: '初学与期末复习', taskUse: '章节学习与例题复现', recommendation: '按同济版章节组织，并公开映射、函数、极限和导数等分集目录。', qualityScore: 90, trustScore: 88 }),
  resource({ bvid: 'BV1pr4y187fv', title: '高等数学（同济版）系统讲解', author: '大学数学不难学', publishedAt: '2022-05-06', durationText: '分集约 21–59 分钟', canonicalId: 'math.calculus', courseName: '高等数学', domain: '数学与统计', points: ['函数与极限', '导数与微分', '定积分与应用'], stage: '大学', suitableFoundation: '基础到进阶复习', taskUse: '概念推导与典型题训练', recommendation: '分集包含极限、连续、导数、中值定理和积分，适合按薄弱点选择。', qualityScore: 88, trustScore: 84 }),
  resource({ bvid: 'BV1o4411M71o', title: '黑马程序员 Python 基础入门教程', author: '黑马程序员', publishedAt: '2019-06-06', durationText: '分集约 4–20 分钟', canonicalId: 'programming.python', courseName: 'Python程序设计', domain: '编程语言与Web开发', points: ['基础语法与数据类型', '控制结构与函数', '文件与面向对象'], stage: '大学', suitableFoundation: '零基础', taskUse: '编码跟练与单元自测', recommendation: '从环境、数据类型到函数和面向对象逐步展开，适合每节配一个可运行练习。', qualityScore: 91, trustScore: 92 }),
  resource({ bvid: 'BV1NG411J7Ac', title: 'Python 面向对象：类、对象与方法调用', author: '千锋Python', publishedAt: '2022-09-29', durationText: '5 集，单集约 3–16 分钟', canonicalId: 'programming.python', courseName: 'Python程序设计', domain: '编程语言与Web开发', points: ['函数与对象', '类与属性', '构造方法'], stage: '大学', suitableFoundation: '已掌握基础语法', taskUse: '概念补弱与最小代码实现', recommendation: '范围集中在面向对象基础，适合作为系统课程后的针对性补充。', qualityScore: 84, trustScore: 82 }),
  resource({ bvid: 'BV1TT4y1e7BA', title: '青岛大学王卓：数据结构与算法基础', author: 'Python大本营', publishedAt: '2022-04-15', durationText: '173 集，单集约 11–23 分钟', canonicalId: 'cs.data-structures', courseName: '数据结构', domain: '编程语言与Web开发', points: ['算法复杂度', '线性表与链表', '树与图'], stage: '大学', suitableFoundation: '课程同步与期末复习', taskUse: '概念学习、代码实现与复杂度分析', recommendation: '课程目录覆盖抽象数据类型、算法分析、线性表、树和图，适合对照教材学习。', qualityScore: 88, trustScore: 78 }),
  resource({ bvid: 'BV12C411G7LR', title: '队列、数组队列、链表队列：完整代码动画解析', author: 'TOTUMA', publishedAt: '2024-04-13', durationText: '动画课程分集', canonicalId: 'cs.data-structures', courseName: '数据结构', domain: '编程语言与Web开发', points: ['线性表与链表', '栈与队列', '代码实现与测试'], stage: '大学', suitableFoundation: '基础概念后', taskUse: '动画理解、编码复现与边界测试', recommendation: '用动画解释数组队列和链表队列，并提供完整代码，适合从概念过渡到实现。', qualityScore: 87, trustScore: 80 }),
  resource({ bvid: 'BV1cx411X7mp', title: 'Photoshop 基础入门教程全集', author: 'PS学堂', publishedAt: '2017-04-07', durationText: '分集约 10–20 分钟', canonicalId: 'design.photoshop', courseName: 'Adobe Photoshop', domain: '平面与图像设计', points: ['图层与选区', '蒙版与合成', '文件与导出'], stage: '大学', suitableFoundation: '零基础', taskUse: '工具学习与最小操作练习', recommendation: '按工具和属性拆分，并包含剪贴蒙版等实践分集，适合建立基础操作流程。', qualityScore: 88, trustScore: 84 }),
  resource({ bvid: 'BV1HK4y1T7i1', title: 'PS 入门：图层与蒙版通俗讲解', author: '摄影师泰罗', publishedAt: '2021-03-15', durationText: '06:55', canonicalId: 'design.photoshop', courseName: 'Adobe Photoshop', domain: '平面与图像设计', points: ['图层与选区', '蒙版与合成', '非破坏性编辑'], stage: '大学', suitableFoundation: '零基础概念补弱', taskUse: '概念理解与蒙版操作复现', recommendation: '通过实体类比解释图层与蒙版，适合先理解概念再完成非破坏性编辑练习。', qualityScore: 92, trustScore: 86 }),
  resource({ bvid: 'BV1yq4y177mB', title: 'Rhino 扫盲课：基础入门教程', author: '阿撒', publishedAt: '2021-05-11', durationText: '7 集，单集约 13–29 分钟', canonicalId: 'cad.rhino', courseName: 'Rhino', domain: '三维建模与CAD', points: ['界面与坐标', '曲线创建与编辑', '曲面与实体'], stage: '大学', suitableFoundation: '零基础', taskUse: '命令跟练与基础模型复现', recommendation: '目录从界面、点线到面和实体，适合建立 Rhino 基础建模工作流。', qualityScore: 87, trustScore: 82 }),
  resource({ bvid: 'BV1vf421S7rF', title: 'Rhino 8.5 工业产品建模系统教程', author: '品创设计', publishedAt: '2024-04-29', durationText: '系统分集课程', canonicalId: 'cad.rhino', courseName: 'Rhino', domain: '三维建模与CAD', points: ['曲线创建与编辑', '曲面建模', '模型检查与导出'], stage: '大学', suitableFoundation: '零基础到进阶', taskUse: '曲线曲面训练与成果模型', recommendation: '按曲线、曲面和综合案例递进，适合完成可检查的产品建模成果。', qualityScore: 86, trustScore: 80 }),
]
