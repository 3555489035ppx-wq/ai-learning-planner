import { addDays, localDateISO, localTimestamp, mondayOfWeek } from './dateUtils.ts'
import { createCurriculumProfile } from './curriculum.ts'
import { cloneDefaultTimeSlots } from './timetable.ts'
import { verifiedChineseResources } from './data/resources.cn.ts'
import { reviewedBilibiliResources } from './data/bilibili-resources.cn.ts'
import { normalizeResourceMetadata } from './resourceProvider.ts'
import type { AppData, Course, CourseType, EducationStage, LearningResource, LearningTask, ScheduleConstraint } from './types.ts'

export const STORAGE_KEY = 'holiday-leap-mvp-v7'
export const V6_STORAGE_KEY = 'holiday-leap-mvp-v6'
export const V4_STORAGE_KEY = 'holiday-leap-mvp-v4'
export const CURRENT_SCHEMA_VERSION = 9
export const RESOURCE_CATALOG_VERSION = '2026.07.22.4'
export const SCHEMA_MIGRATION_BACKUP_KEY = 'holiday-leap-schema-migration-backup-v9'
export const V7_MIGRATION_BACKUP_KEY = 'holiday-leap-migration-backup-v6-to-v7'
export const V6_MIGRATION_BACKUP_KEY = 'holiday-leap-migration-backup-v4-to-v6'
export const PREVIOUS_STORAGE_KEY = 'holiday-leap-mvp-v3'
export const LEGACY_STORAGE_KEY = 'holiday-leap-mvp-v2'
export const MIGRATION_BACKUP_KEY = 'holiday-leap-migration-backup-v2'
export const V3_MIGRATION_BACKUP_KEY = 'holiday-leap-migration-backup-v3'
export const todayISO = localDateISO
export { addDays, mondayOfWeek }

export const courseTypesForStage = (stage: EducationStage | ''): CourseType[] => {
  if (stage === '高中') return ['学科课程', '高考专项', '竞赛/拓展']
  if (stage === '大学') return ['公共基础课', '专业基础课', '专业核心课', '专业选修课', '语言/等级考试', '软件工具课', '项目/作品课']
  return []
}

export const reconcileCourseStage = (course: Course, stage: EducationStage | '') => {
  const allowed = courseTypesForStage(stage)
  const incompatible = Boolean(course.courseType && !allowed.includes(course.courseType))
  return { course: { ...course, stage, courseType: incompatible ? '' as const : course.courseType }, incompatible }
}

export const createCourse = (overrides: Partial<Course> = {}): Course => ({
  id: crypto.randomUUID(),
  revision: 1,
  name: '',
  canonicalId: '',
  canonicalName: '',
  subjectDomain: '',
  normalizationConfidence: 0,
  ambiguityOptions: [],
  ambiguityResolved: false,
  stage: '',
  stageStatus: 'confirmed',
  legacyStage: '',
  legacyCourseType: '',
  curriculum: createCurriculumProfile(),
  courseType: '',
  assessmentMode: 'score',
  score: '',
  maxScore: '',
  passScore: '',
  examType: '',
  incomplete: false,
  mastery: '',
  projectCompleted: false,
  completedWorks: 0,
  projectChecklist: [],
  mainDifficulty: '',
  selfEvidence: '',
  goalType: '',
  targetScore: '',
  targetDate: '',
  priority: false,
  priorityWeight: 1,
  desiredResult: '',
  desiredResultEdited: false,
  suggestionSource: '',
  goalSuggestions: [],
  ...overrides,
})

export const createConstraint = (overrides: Partial<ScheduleConstraint> = {}): ScheduleConstraint => ({
  id: crypto.randomUUID(),
  startAt: `${localDateISO()}T00:00:00+08:00`,
  endAt: `${localDateISO()}T23:59:59+08:00`,
  type: 'custom',
  capacityMinutes: 0,
  note: '',
  ...overrides,
})

export const verifiedResources: LearningResource[] = [
  {
    id: 'resource-adobe-photoshop', title: 'Adobe Learn：Photoshop 教程', platform: 'Adobe Learn', author: 'Adobe', durationMin: 30,
    canonicalCourseIds: ['design.photoshop'], courseNames: ['Adobe Photoshop'], domainCategory: '设计软件类', subjectDomains: ['平面与图像设计'], suitableStage: '大学 · 软件工具课', educationStages: ['大学'], difficulty: '入门', contentType: '系统课程', language: '双语',
    knowledgePoints: ['图层与选区', '蒙版与合成', '调色与精修', '导出规范'], curriculumTags: ['软件技能', '图像处理'], knowledgePointIds: ['图层与选区', '蒙版与合成'], recommendation: 'Adobe 官方维护，适合建立非破坏性图像处理流程。', humanVerified: true, reviewedAt: '2026-07-16', verificationNote: '已核对 Adobe 官方学习页。', url: 'https://www.adobe.com/learn/photoshop', status: '可用', healthStatus: 'active', lastCheckedAt: '2026-07-16',
  },
  {
    id: 'resource-adobe-illustrator', title: 'Adobe Learn：Illustrator 教程', platform: 'Adobe Learn', author: 'Adobe', durationMin: 30,
    canonicalCourseIds: ['design.illustrator'], courseNames: ['Adobe Illustrator'], domainCategory: '设计软件类', subjectDomains: ['矢量设计'], suitableStage: '大学 · 软件工具课', educationStages: ['大学'], difficulty: '入门', contentType: '系统课程', language: '双语',
    knowledgePoints: ['形状与钢笔', '锚点与路径', '图标系统', '矢量导出'], curriculumTags: ['软件技能', '矢量设计'], knowledgePointIds: ['形状与钢笔', '锚点与路径'], recommendation: 'Adobe 官方教程，适合钢笔、路径和矢量资产练习。', humanVerified: true, reviewedAt: '2026-07-16', verificationNote: '已核对 Adobe 官方学习页。', url: 'https://www.adobe.com/learn/illustrator', status: '可用', healthStatus: 'active', lastCheckedAt: '2026-07-16',
  },
  {
    id: 'resource-rhino-learn', title: 'Rhino 官方学习中心', platform: 'Rhino Learn', author: 'Robert McNeel & Associates', durationMin: 45,
    canonicalCourseIds: ['cad.rhino'], courseNames: ['Rhino'], domainCategory: '设计软件类', subjectDomains: ['三维建模与CAD'], suitableStage: '大学 · 软件工具课', educationStages: ['大学'], difficulty: '基础', contentType: '系统课程', language: '双语',
    knowledgePoints: ['空间与坐标', '曲线与实体', '拓扑与精度', '模型导出'], curriculumTags: ['软件技能', '三维建模'], knowledgePointIds: ['空间与坐标', '曲线与实体'], recommendation: 'Rhino 官方入口，适合按建模对象选择教程和练习文件。', humanVerified: true, reviewedAt: '2026-07-16', verificationNote: '已核对 Rhino 官方学习中心。', url: 'https://www.rhino3d.com/learn/', status: '可用', healthStatus: 'active', lastCheckedAt: '2026-07-16',
  },
  {
    id: 'resource-british-council', title: 'British Council LearnEnglish', platform: 'British Council', author: 'British Council', durationMin: 25,
    canonicalCourseIds: ['language.college-english', 'language.cet4', 'language.cet6', 'language.ielts'], courseNames: ['大学英语', '大学英语四级', '大学英语六级', '雅思'], domainCategory: '语言类', subjectDomains: ['大学英语与语言考试'], suitableStage: '高中或大学', educationStages: ['高中', '大学'], difficulty: '基础', contentType: '练习题', language: '英文',
    knowledgePoints: ['词汇提取', '阅读与听力', '语言规则', '写作与口语'], curriculumTags: ['语言学习'], knowledgePointIds: ['词汇提取', '阅读与听力'], recommendation: '按语言能力组织练习，适合建立输入、输出和复习闭环。', humanVerified: true, reviewedAt: '2026-07-16', verificationNote: '已核对 British Council 官方学习入口。', url: 'https://learnenglish.britishcouncil.org/', status: '可用', healthStatus: 'active', lastCheckedAt: '2026-07-16',
  },
  {
    id: 'resource-python-tutorial', title: 'Python 官方教程', platform: 'Python 文档', author: 'Python Software Foundation', durationMin: 35,
    canonicalCourseIds: ['programming.python'], courseNames: ['Python 程序设计'], domainCategory: '编程类', subjectDomains: ['编程语言与Web开发'], suitableStage: '大学 · 编程基础', educationStages: ['大学'], difficulty: '基础', contentType: '文章/讲义', language: '中文',
    knowledgePoints: ['语法与概念', '编码实现', '调试测试'], curriculumTags: ['编程基础'], knowledgePointIds: ['语法与概念', '编码实现'], recommendation: '官方中文文档，适合核对语言概念并配合编码练习。', humanVerified: true, reviewedAt: '2026-07-16', verificationNote: '已核对 Python 官方中文教程。', url: 'https://docs.python.org/zh-cn/3/tutorial/', status: '可用', healthStatus: 'active', lastCheckedAt: '2026-07-16',
  },
  {
    id: 'resource-mdn-js', title: 'MDN JavaScript 指南', platform: 'MDN', author: 'Mozilla Contributors', durationMin: 40,
    canonicalCourseIds: ['programming.javascript'], courseNames: ['JavaScript'], domainCategory: '编程类', subjectDomains: ['编程语言与Web开发'], suitableStage: '大学 · 编程基础', educationStages: ['大学'], difficulty: '基础', contentType: '文章/讲义', language: '中文',
    knowledgePoints: ['语法与概念', '编码实现', '调试测试'], curriculumTags: ['Web 开发'], knowledgePointIds: ['语法与概念', '编码实现'], recommendation: '结构清晰且持续维护，适合 JavaScript 知识点查阅。', humanVerified: true, reviewedAt: '2026-07-16', verificationNote: '已核对 MDN 中文指南。', url: 'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide', status: '可用', healthStatus: 'active', lastCheckedAt: '2026-07-16',
  },
  {
    id: 'resource-mit-calculus', title: 'Single Variable Calculus', platform: 'MIT OpenCourseWare', author: 'Prof. David Jerison · MIT OpenCourseWare', durationMin: 60,
    canonicalCourseIds: ['math.calculus'], courseNames: ['高等数学'], domainCategory: '数学类', subjectDomains: ['数学与统计'], suitableStage: '大学 · 系统学习', educationStages: ['大学'], difficulty: '进阶', contentType: '系统课程', language: '英文',
    knowledgePoints: ['前置基础', '概念理解', '计算与推导', '建模应用'], curriculumTags: ['大学数学', '微积分'], knowledgePointIds: ['前置基础', '概念理解'], recommendation: '包含讲义、视频、习题与答案，适合大学微积分系统复习。', humanVerified: true, reviewedAt: '2026-07-16', verificationNote: '已核对 MIT OpenCourseWare 课程页；默认中文偏好下隐藏。', url: 'https://ocw.mit.edu/courses/18-01sc-single-variable-calculus-fall-2010/', status: '可用', healthStatus: 'active', lastCheckedAt: '2026-07-16',
  },
  ...verifiedChineseResources,
  ...reviewedBilibiliResources,
]

export const createTask = (overrides: Partial<LearningTask> = {}): LearningTask => {
  const task: LearningTask = {
  id: crypto.randomUUID(),
  planId: '',
  date: localDateISO(),
  originalPlannedDate: '',
  time: '09:00',
  slotId: '',
  title: '',
  action: '',
  courseId: '',
  stageLabel: '',
  stageStartDate: '',
  stageEndDate: '',
  knowledgePoint: '',
  unitId: '',
  resourceId: '',
  resourceIds: [],
  materialLabel: '',
  watchMinutes: 0,
  practiceMinutes: 20,
  quizMinutes: 5,
  practiceCount: 0,
  quizTask: '',
  completionCriteria: '',
  completionCriteriaItems: [],
  arrangementReason: '',
  estimatedMinutes: 30,
  difficulty: '基础',
  status: '待完成',
  scheduleStatus: 'scheduled',
  scheduleIssue: '',
  skipReason: '',
  changeNote: '',
  order: 0,
  source: 'system',
  phaseId: '',
  weeklyGoalId: '',
  taskType: 'learn',
  knowledgePointIds: [],
  rationale: {
    summary: '',
    reasonCodes: [],
    evidenceIds: [],
    dependencyTaskIds: [],
    factors: [],
    confidence: .5,
    limitations: ['尚未结合真实执行证据。'],
  },
  evidenceRequirement: {
    acceptedTypes: ['task_completion', 'time_spent', 'self_check'],
    minimumCount: 1,
    completionRule: '记录实际完成情况和至少一项检查结果。',
  },
  minimumViableMinutes: 15,
    ...overrides,
  }
  return {
    ...task,
    action: task.action || (task.materialLabel ? `学习“${task.materialLabel}”后完成练习或成果任务` : '完成练习或成果任务并记录检查结果'),
    resourceIds: task.resourceIds.length ? task.resourceIds : task.resourceId ? [task.resourceId] : [],
    completionCriteriaItems: task.completionCriteriaItems.length ? task.completionCriteriaItems : task.completionCriteria ? [task.completionCriteria] : [],
  }
}

export const initialData = (): AppData => ({
  version: 7,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  resourceCatalogVersion: RESOURCE_CATALOG_VERSION,
  onboardingCompleted: false,
  onboardingStep: 1,
  courses: [],
  schedule: {
    holidayStart: localDateISO(),
    holidayEnd: addDays(localDateISO(), 41),
    weekdayMinutes: 90,
    weekendMinutes: 120,
    preferredTimes: [],
    constraints: [],
    travelDates: '',
    fixedCommitments: '',
    restDays: [],
    maxFocusMinutes: 45,
    interruptionReason: '',
    dailyOverrides: {},
    useDefaultTimetable: true,
    timeSlots: cloneDefaultTimeSlots(),
    template: 'standard',
    autoLoadProfile: 'balanced',
    maxAutoTasksPerDay: 3,
    bufferDaysPerWeek: 1,
    strictHolidayRange: false,
    strictDailyCapacity: false,
  },
  resources: verifiedResources.map(resource => normalizeResourceMetadata({ ...resource, canonicalCourseIds: [...resource.canonicalCourseIds], courseNames: [...resource.courseNames], subjectDomains: [...resource.subjectDomains], educationStages: [...resource.educationStages], knowledgePoints: [...resource.knowledgePoints], curriculumTags: [...resource.curriculumTags], knowledgePointIds: [...resource.knowledgePointIds] })),
  tasks: [],
  learningStages: [],
  taskPool: [],
  taskPlacements: [],
  weeklySchedules: [],
  planDrafts: {},
  globalPlanDraft: null,
  globalPlanHistory: [],
  planTaskArchive: {},
  plans: [],
  diagnoses: {},
  planningBases: {},
  diagnosisHistory: [],
  taskEvents: [],
  quizEvents: [],
  dailyChecks: [],
  assessmentEvents: [],
  evidenceRecords: [],
  changeSets: [],
  weekArchives: [],
  resourceDismissals: [],
  resourceEvents: [],
  progress: { reflection: '', nextWeekReason: '', nextWeekAppliedAt: '', appliedLocks: {}, weekReflections: {}, weekReviewStates: {}, previousPlan: null, appliedRevision: '' },
  settings: {
    displayName: '学习者', avatarDataUrl: '', reminderTime: '08:30', resourcePreference: '系统课程 + 练习',
    resourcePlatforms: ['国家智慧教育平台', '中国大学 MOOC', '学堂在线', '哔哩哔哩', 'Adobe Learn', 'Rhino Learn', 'Python 文档', 'MDN', '用户提供', '站内任务'],
    resourceLanguages: ['中文', '双语'], resourceContentTypes: ['系统课程', '视频', '文章/讲义', '练习题'], resourceDifficulty: '综合', maxResourceMinutes: 60,
    onlyHumanVerified: true, acceptShortVideo: false, dailyReminder: false, adjustmentReminder: true, dailySelfCheck: true, privacyAccepted: false,
  },
  coachMessages: [{ id: 'coach-welcome', role: 'coach', text: '说说时间、难度或课程优先级发生了什么变化。我会先给出调整预览，由你确认后再应用。', createdAt: localTimestamp() }],
  coachingRequests: [],
  coachingMessages: [],
  recoveryProposals: [],
  activeRecoveryProposalId: '',
  lastCoachChangeSetId: '',
  planChanges: [],
})
