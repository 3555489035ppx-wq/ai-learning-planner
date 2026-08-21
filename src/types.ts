export type EducationStage = '高中' | '大学'
export type LegacyEducationStage = '小学' | '初中' | '职业技能' | '其他'
export type CourseType =
  | '文化课' | '升学考试' | '竞赛' | '素质拓展'
  | '必修课' | '选修课' | '语言考试' | '专业考试' | '技能课程' | '项目课程'
  | '软件技能' | '职业资格' | '项目实训' | '兴趣学习'
  | '学科课程' | '证书考试' | '项目学习' | '其他'
  | '高考专项' | '竞赛/拓展'
  | '公共基础课' | '专业基础课' | '专业核心课' | '专业选修课' | '语言/等级考试' | '软件工具课' | '项目/作品课'
export type AssessmentMode = 'score' | 'mastery' | 'project'
export type ExamType = '期末考试' | '补考' | '模拟考试' | '资格考试' | '升学考试' | '自测'
export type MasteryLevel = '刚开始' | '几乎不会' | '基础薄弱' | '一般' | '较熟练' | '熟练'
export type GoalType = '补弱' | '补考' | '巩固' | '拔高' | '四六级' | '考研' | '考证' | '技能提升' | '完成作品' | '项目交付'
export type TaskStatus = '待确认' | '待完成' | '进行中' | '已完成' | '已延期' | '已跳过'
export type ResourceStatus = '可用' | '稍后学习' | '已加入计划' | '已完成' | '不感兴趣'
export type DomainCategory = '数学类' | '语言类' | '编程类' | '设计软件类' | '理论学科类' | '考试类' | '项目/作品类' | '通用技能类'
export type SubjectDomain =
  | '数学与统计' | '大学英语与语言考试' | '编程语言与Web开发' | '计算机系统网络与数据库'
  | '人工智能与数据科学' | '电子信息与通信' | '自动化与控制' | '机械与制造'
  | '土木与建筑' | '物理' | '化学' | '生物科学' | '医学' | '护理与药学'
  | '法学' | '经济金融会计与管理' | '新闻传播与汉语言文学' | '心理学与教育学'
  | '体育科学' | '平面与图像设计' | '矢量设计' | '三维建模与CAD'
  | '视频剪辑与动效' | 'UIUX与交互设计' | '产品设计理论与项目' | '通用技能'
export type ConfidenceLevel = '低' | '中' | '高'
export type DiagnosticEvidenceType = 'objective_quiz' | 'self_assessment' | 'performance_task' | 'exam_score'
export type EvidenceType =
  | 'task_completion'
  | 'time_spent'
  | 'objective_result'
  | 'self_check'
  | 'work_output'
  | 'difficulty_rating'
  | 'skip_reason'
  | 'resource_feedback'
export type DiagnosisStatus = 'draft' | 'completed' | 'superseded'
export type PlanStatus = 'draft' | 'active' | 'stale' | 'archived'
export type ScheduleTemplate = 'light' | 'standard' | 'sprint' | 'custom'

export interface CurriculumUnit {
  id: string
  title: string
  order: number
  prerequisites: string[]
}

export interface CurriculumProfile {
  stage: EducationStage | ''
  province: string
  city: string
  grade: string
  semester: '上学期' | '下学期' | '其他' | ''
  textbookVersion: string
  subjectSelection: string[]
  examRegion: string
  school: string
  major: string
  instructor: string
  examFormat: string
  syllabusTitle: string
  syllabusUnits: CurriculumUnit[]
  source: 'preset' | 'user-input' | 'uploaded-outline' | 'unknown'
}

export type TimePeriod = 'morning' | 'afternoon' | 'evening'

export interface TimeSlot {
  id: string
  period: TimePeriod
  label: string
  start: string
  end: string
  order: number
  enabled: boolean
}

export interface AmbiguityOption {
  id: string
  label: string
  subjectDomain: SubjectDomain
}

export interface NormalizedCourse {
  canonicalId: string
  canonicalName: string
  aliases: string[]
  disciplineGroup: string
  subjectDomain: SubjectDomain
  toolFamily?: string
  confidence: number
  ambiguityOptions?: AmbiguityOption[]
}

export interface DiagnosticQuestion {
  id: string
  courseId: string
  version: number
  evidenceType: DiagnosticEvidenceType
  type: 'knowledge' | 'concept' | 'application' | 'tool' | 'workflow' | 'quality' | 'self-assessment' | 'performance'
  prompt: string
  options: string[]
  scores: Record<string, number>
  correctOption?: string
  point: string
  difficulty: '基础' | '中等' | '进阶'
}

export interface LearningStage {
  courseId: string
  week: string
  startDate: string
  endDate: string
  title: string
  focus: string
  practice: string
  deliverable: string
  difficulty: '基础' | '中等' | '进阶'
}

export interface CourseIntelligenceResult {
  courseId: string
  normalizedName: string
  normalizedCourse: NormalizedCourse
  domainCategory: DomainCategory
  subjectDomain: SubjectDomain
  assessmentMode: AssessmentMode
  suggestedGoals: string[]
  competencyDimensions: string[]
  curriculumUnits: CurriculumUnit[]
  diagnosticQuiz: DiagnosticQuestion[]
  learningStages: LearningStage[]
  resourceKeywords: string[]
  forbiddenKeywords: string[]
  confidence: 'low' | 'medium' | 'high'
  fallbackUsed: boolean
  needsClarification: boolean
  needsMoreContext: boolean
}

export interface Course {
  id: string
  /** Stable presentation order. When omitted, source-array order is preserved. */
  displayOrder?: number
  revision: number
  name: string
  canonicalId: string
  canonicalName: string
  subjectDomain: SubjectDomain | ''
  normalizationConfidence: number
  ambiguityOptions: AmbiguityOption[]
  ambiguityResolved: boolean
  stage: EducationStage | ''
  stageStatus: 'confirmed' | 'needs-reconfirmation'
  legacyStage: string
  legacyCourseType: string
  curriculum: CurriculumProfile
  courseType: CourseType | ''
  assessmentMode: AssessmentMode
  score: number | ''
  maxScore: number | ''
  passScore: number | ''
  examType: ExamType | ''
  incomplete: boolean
  mastery: MasteryLevel | ''
  projectCompleted: boolean
  completedWorks: number
  projectChecklist: string[]
  mainDifficulty: string
  selfEvidence: string
  goalType: GoalType | ''
  targetScore: number | ''
  targetDate: string
  priority: boolean
  priorityWeight: number
  desiredResult: string
  desiredResultEdited: boolean
  suggestionSource: string
  goalSuggestions: string[]
  archivedAt?: string
}

export interface CourseContext {
  id: string
  name: string
  normalizedName: string
  educationStage: EducationStage
  category: string
  province?: string
  grade?: string
  textbookVersion?: string
  major?: string
  courseType?: string
  currentScore?: number
  maxScore?: number
  passScore?: number
  targetScore?: number
  examDate?: string
  targetOutcome: string
  knowledgeMap: CurriculumUnit[]
  diagnosisVersion?: string
}

export interface ScheduleConstraint {
  id: string
  startAt: string
  endAt: string
  type: 'travel' | 'class' | 'part_time' | 'rest' | 'custom'
  capacityMinutes: number
  note: string
}

export interface ScheduleProfile {
  holidayStart: string
  holidayEnd: string
  weekdayMinutes: number
  weekendMinutes: number
  preferredTimes: string[]
  constraints: ScheduleConstraint[]
  travelDates: string
  fixedCommitments: string
  restDays: string[]
  maxFocusMinutes: number
  interruptionReason: string
  dailyOverrides: Record<string, number>
  useDefaultTimetable: boolean
  timeSlots: TimeSlot[]
  template: ScheduleTemplate
  /** V7 defaults are soft preferences; strict modes are opt-in. */
  autoLoadProfile?: 'light' | 'balanced' | 'intensive'
  maxAutoTasksPerDay?: number
  bufferDaysPerWeek?: number
  strictHolidayRange?: boolean
  strictDailyCapacity?: boolean
}

export type ResourcePlatform = '国家智慧教育平台' | '中国大学 MOOC' | '学堂在线' | 'Adobe Learn' | 'Rhino Learn' | 'British Council' | 'Python 文档' | 'MDN' | 'MIT OpenCourseWare' | '哔哩哔哩' | '抖音' | '用户提供' | '站内任务'
export type ResourceContentType = '系统课程' | '视频' | '文章/讲义' | '练习题' | '项目任务' | '模板'
export type ResourceDifficulty = '入门' | '基础' | '进阶' | '综合'
export type ResourceSort = '综合推荐' | '播放最多' | '收藏最多' | '最新审核'

export interface LearningResource {
  id: string
  title: string
  platform: ResourcePlatform
  author: string
  durationMin: number
  canonicalCourseIds: string[]
  courseNames: string[]
  domainCategory: DomainCategory
  subjectDomains: SubjectDomain[]
  suitableStage: string
  educationStages: EducationStage[]
  difficulty: ResourceDifficulty
  contentType: ResourceContentType
  language: string
  knowledgePoints: string[]
  curriculumTags: string[]
  knowledgePointIds: string[]
  recommendation: string
  humanVerified: boolean
  reviewedAt: string
  verificationNote: string
  url: string
  status: ResourceStatus
  userProvided?: boolean
  dismissedAt?: string
  healthStatus: 'active' | 'unknown' | 'unavailable'
  lastCheckedAt: string
  originalCourseName?: string
  province?: string
  textbookVersion?: string
  major?: string
  chapter?: string
  officialOrOriginal?: boolean | null
  reposted?: boolean | null
  originalSourceNote?: string
  publishedAt?: string
  reviewer?: string
  suitableTaskTypes?: string[]
  bilibili?: {
    bvid: string
    coverUrl: string | null
    publishedAt: string
    durationText: string
    viewCount: number | null
    likeCount: number | null
    favoriteCount: number | null
    coinCount: number | null
    statsSnapshotAt: string | null
    reviewStatus: '人工审核通过' | '待复核' | '已失效'
    reviewedAt: string
    suitableFoundation: string
    taskUse: string
    knowledgeMatchScore: number
    qualityScore: number
    trustScore: number
    foundationMatchScore: number
    popularityScore: number | null
    openedAt?: string
  }
}

export interface LearningTask {
  id: string
  planId: string
  date: string
  originalPlannedDate: string
  time: string
  slotId: string
  title: string
  action: string
  courseId: string
  stageLabel: string
  stageStartDate: string
  stageEndDate: string
  knowledgePoint: string
  unitId: string
  resourceId: string
  resourceIds: string[]
  materialLabel: string
  watchMinutes: number
  practiceMinutes: number
  quizMinutes: number
  practiceCount: number
  quizTask: string
  completionCriteria: string
  completionCriteriaItems: string[]
  reviewAt?: string
  arrangementReason: string
  estimatedMinutes: number
  difficulty: '基础' | '中等' | '进阶'
  status: TaskStatus
  scheduleStatus: 'scheduled' | 'needs-confirmation' | 'unscheduled'
  scheduleIssue: string
  skipReason: string
  changeNote: string
  order: number
  source: 'system' | 'temporary' | 'user'
  phaseId: string
  weeklyGoalId: string
  taskType: 'learn' | 'practice' | 'quiz' | 'review' | 'project' | 'micro_check'
  knowledgePointIds: string[]
  rationale: TaskRationale
  evidenceRequirement: TaskEvidenceRequirement
  minimumViableMinutes: number
}

/**
 * V7 schedule domain. Learning content and calendar placement are deliberately
 * separate so a task can remain useful even when it does not fit this week.
 */
export type LearningStageStatus = 'locked' | 'ready' | 'active' | 'completed'
export type TaskPoolStatus = 'blocked' | 'ready' | 'scheduled' | 'in_progress' | 'completed' | 'deferred' | 'cancelled'
export type PlacementStatus = 'draft' | 'published' | 'completed' | 'missed' | 'removed'
export type SlotAvailability = 'available' | 'unavailable' | 'travel' | 'rest' | 'fixed' | 'locked'
export type ScheduleIssueSeverity = 'blocking' | 'recoverable' | 'info'

export interface LearningStageDefinition {
  id: string
  courseId: string
  order: number
  title: string
  objective: string
  knowledgePointIds: string[]
  entryCriteria: string[]
  exitCriteria: string[]
  dependencyStageIds: string[]
  status: LearningStageStatus
  progress: number
  completedAt?: string
  estimatedEffortMinutes?: number
  /** Imported V6 timing is audit metadata, never a scheduling boundary. */
  legacyTiming?: { startDate: string; endDate: string }
}

export interface TaskPoolItem {
  id: string
  planId: string
  courseId: string
  stageId: string
  knowledgePointId: string
  knowledgePoint: string
  taskAction: string
  taskType: LearningTask['taskType']
  estimatedMinutes: number
  minimumViableMinutes: number
  priorityScore: number
  priorityReasons: string[]
  dependencyTaskIds: string[]
  resourceIds: string[]
  completionCriteria: string[]
  progressCurrent?: number
  progressTotal?: number
  status: TaskPoolStatus
  earliestDate?: string
  deadline?: string
  generationKey: string
  waitingWeeks: number
  deferredCount: number
  createdAt: string
  updatedAt: string
}

export interface TaskPlacement {
  id: string
  taskId: string
  weekStart: string
  date: string
  slotId: string
  plannedMinutes: number
  status: PlacementStatus
  source: 'auto' | 'manual' | 'recovery' | 'migration'
  createdAt: string
  updatedAt: string
}

export interface ScheduleEngineIssue {
  id: string
  code:
    | 'slot_conflict'
    | 'unavailable_time'
    | 'course_context'
    | 'invalid_task'
    | 'invalid_date'
    | 'invalid_reference'
    | 'dependency_order'
    | 'task_too_long'
    | 'duplicate_placement'
    | 'backlog'
    | 'deadline_risk'
    | 'light_load'
  severity: ScheduleIssueSeverity
  taskId?: string
  placementId?: string
  courseId?: string
  message: string
  technicalDetail?: string
}

export interface WeeklySchedule {
  id: string
  weekStart: string
  weekEnd: string
  placementIds: string[]
  backlogTaskIds: string[]
  status: 'draft' | 'published' | 'archived'
  version: number
  generatedAt: string
  publishedAt?: string
  issues: ScheduleEngineIssue[]
}

export interface TaskRationale {
  summary: string
  reasonCodes: Array<'score_gap' | 'goal_deadline' | 'dependency' | 'diagnosis' | 'continuity' | 'recovery' | 'user_priority'>
  evidenceIds: string[]
  dependencyTaskIds: string[]
  factors: Array<{ key: string; weight: number; explanation: string }>
  confidence: number
  limitations: string[]
}

export interface TaskEvidenceRequirement {
  acceptedTypes: EvidenceType[]
  minimumCount?: number
  completionRule: string
}

export interface EvidenceRecord {
  id: string
  courseId: string
  taskId?: string
  knowledgePointId?: string
  type: EvidenceType
  source: 'task' | 'quiz' | 'assessment' | 'resource' | 'user'
  value: number | string | boolean
  unit?: 'minutes' | 'percent' | 'count' | 'level' | 'text'
  rubric?: string
  comparabilityKey?: string
  observedAt: string
  provenance: {
    eventId?: string
    provider: 'local' | 'user' | 'imported'
    schemaVersion: number
  }
  confidence: number
}

export interface DailyCheck {
  id: string
  courseId: string
  taskId: string
  unitId: string
  knowledgePointId: string
  questionType: 'recall' | 'objective' | 'application' | 'performance'
  difficulty: '基础' | '中等' | '进阶'
  prompt: string
  rubric?: string[]
  options?: string[]
  correctOption?: string
  explanation: string
  fingerprint: string
  generatedAt: string
  attemptId: string
}

export interface TaskEvent {
  id: string
  taskId: string
  courseId: string
  planId: string
  type: 'created' | 'started' | 'completed' | 'restored' | 'delayed' | 'skipped' | 'moved' | 'resource-changed' | 'deleted' | 'edited'
  occurredAt: string
  plannedDate: string
  actualMinutes: number
  completionDegree?: '全部完成' | '部分完成' | '未完成'
  note?: string
  continueNeeded?: boolean
  detail: string
}

export interface QuizEvent {
  id: string
  attemptId: string
  questionVersion: number
  source: 'diagnosis' | 'today' | 'progress'
  evidenceType: DiagnosticEvidenceType
  courseId: string
  taskId?: string
  questionId: string
  point: string
  score: number
  maxScore: number
  answer: string
  confidence?: '掌握' | '部分掌握' | '需要复习'
  occurredAt: string
}

export interface AssessmentEvent {
  id: string
  courseId: string
  type: '正式考试' | '模拟考试' | '阶段小测' | '自评' | '作品检查'
  value: number
  maxValue: number
  knowledgePoint: string
  difficulty: '基础' | '中等' | '进阶'
  occurredAt: string
  note: string
}

export interface DiagnosisResult {
  id: string
  version: number
  courseRevision: number
  status: DiagnosisStatus
  source: 'local-rules' | 'remote-ai'
  evidenceType: DiagnosticEvidenceType
  attemptId: string
  questionVersion: number
  generatedAt: string
  completedAt: string
  courseId: string
  normalizedName: string
  canonicalId: string
  subjectDomain: SubjectDomain
  domainCategory: DomainCategory
  assessmentSummary: string
  currentLevel: string
  priorityProblem: string
  nextAction: string
  completeness: number
  confidence: ConfidenceLevel
  confidenceBasis: string
  weakReasons: string[]
  diagnosticQuiz: DiagnosticQuestion[]
  weakKnowledgePoints: string[]
  realisticGoal: string
  feasibilityWarning: string
  learningStages: LearningStage[]
  resourceKeywords: string[]
  rationale: string[]
  disclaimer: string
}

export interface PlanningBasis {
  source: 'score-baseline' | 'self-report-baseline' | 'completed-diagnosis'
  courseId: string
  currentLevel: string
  priorityProblems: string[]
  target: string
  confidence: 'low' | 'medium' | 'high'
  evidenceRefs: string[]
  createdAt: string
}

export interface PlanSnapshot {
  id: string
  version: number
  courseId: string
  diagnosisId?: string
  diagnosisVersion?: number
  planningBasis?: PlanningBasis
  diagnosisInputHash?: string
  planInputHash?: string
  inputSnapshotHash: string
  generatedAt: string
  activatedAt: string
  status: PlanStatus
  taskIds: string[]
  pendingTaskIds: string[]
  staleReasons: string[]
  bundleId?: string
}

export type PlanValidationFailureCode = 'capacity' | 'slot' | 'date' | 'course' | 'conflict' | 'resource' | 'task' | 'budget' | 'stage' | 'evidence'

export interface PlanValidationIssue {
  taskId: string
  courseId: string
  code: PlanValidationFailureCode
  message: string
}

export interface PlanValidationResult {
  valid: boolean
  reasons: string[]
  scheduledTaskIds: string[]
  confirmationTaskIds: string[]
  failedTaskIds: string[]
  failuresByReason: Record<PlanValidationFailureCode, number>
  issues: PlanValidationIssue[]
  quality: PlanQualitySummary
}

export interface PlanQualitySummary {
  structureValid: boolean
  capacityValid: boolean
  semanticValid: boolean
  executable: boolean
  weeklyCapacityMinutes: number
  weeklyBudgetMinutesByCourse: Record<string, number>
  scheduledMinutesByCourseWeek: Record<string, Record<string, number>>
  budgetFulfillmentRatio: Record<string, number>
  partialWeekIds: string[]
}

export interface LearningPhase {
  id: string
  courseId: string
  title: string
  startDate: string
  endDate: string
  objective: string
  exitCriteria: string[]
  dependencyPhaseIds: string[]
}

export interface WeeklyGoal {
  id: string
  phaseId: string
  courseId: string
  weekStart: string
  objective: string
  plannedMinutes: number
  completionCriteria: string[]
  knowledgePointIds: string[]
}

export interface GlobalPlanDraft {
  id: string
  version: number
  courseIds: string[]
  createdAt: string
  activatedAt: string
  dateRange: { start: string; end: string }
  tasks: LearningTask[]
  stagesByCourse: Record<string, LearningStage[]>
  phasesByCourse: Record<string, LearningPhase[]>
  weeklyGoals: WeeklyGoal[]
  allocationByCourse: Record<string, number>
  weeklyCapacityMinutes: number
  weeklyBudgetMinutesByCourse: Record<string, number>
  scheduledMinutesByCourseWeek: Record<string, Record<string, number>>
  budgetFulfillmentRatio: Record<string, number>
  allocationReasons: Record<string, string>
  planningBases: Record<string, PlanningBasis>
  dayReasons: Record<string, string>
  planInputHash: string
  validation: PlanValidationResult
  status: 'draft' | 'valid' | 'needs_adjustment' | 'activated' | 'archived'
  source: 'local-rules' | 'remote-ai'
}

export interface ChangeSetItem {
  entityId: string
  before: Record<string, unknown>
  after: Record<string, unknown>
}

export interface ChangeSet {
  id: string
  scope: 'task' | 'course' | 'week' | 'plan'
  courseId?: string
  weekId?: string
  reason: string
  source: 'coach' | 'weekly_review' | 'manual' | 'regeneration' | 'migration'
  createdAt: string
  changes: ChangeSetItem[]
  revertedAt?: string
}

export interface WeekArchive {
  id: string
  weekStart: string
  weekEnd: string
  courseId: string
  planVersionIds: string[]
  plannedTaskIds: string[]
  plannedTasks: Array<{ taskId: string; courseId: string }>
  reflection: string
  archivedAt: string
}

export interface WeekReviewState {
  key: string
  courseId: string
  weekStart: string
  version: number
  status: 'draft' | 'applied' | 'superseded'
  appliedChangeSetId: string
  appliedAt: string
}

export interface ResourceDismissal {
  id: string
  resourceId: string
  courseId: string
  subjectDomain: SubjectDomain
  platform: ResourcePlatform
  reason: string
  createdAt: string
  revertedAt?: string
}

export interface ResourceEvent {
  id: string
  resourceId: string
  courseId: string
  type: 'saved' | 'opened' | 'completed' | 'dismissed' | 'restored'
  occurredAt: string
  detail: string
}

export interface ProgressState {
  reflection: string
  nextWeekReason: string
  nextWeekAppliedAt: string
  appliedLocks: Record<string, string>
  weekReflections: Record<string, string>
  weekReviewStates: Record<string, WeekReviewState>
  previousPlan: LearningTask[] | null
  appliedRevision: string
}

export interface UserSettings {
  displayName: string
  avatarDataUrl: string
  reminderTime: string
  resourcePreference: string
  resourcePlatforms: ResourcePlatform[]
  resourceLanguages: string[]
  resourceContentTypes: ResourceContentType[]
  resourceDifficulty: ResourceDifficulty
  maxResourceMinutes: number
  onlyHumanVerified: boolean
  acceptShortVideo: boolean
  dailyReminder: boolean
  adjustmentReminder: boolean
  dailySelfCheck: boolean
  privacyAccepted: boolean
}

export interface ResourceQuery {
  canonicalCourseId: string
  courseName: string
  stage: EducationStage | '其他'
  province?: string
  textbookVersion?: string
  knowledgePoint?: string
  foundation?: string
}

export interface ResourceSnapshot {
  id: string
  platform: '哔哩哔哩'
  videoId: string
  originalUrl: string
  title: string
  author: string
  searchQuery: string
  canonicalCourseId: string
  originalCourseName: string
  stage: EducationStage
  province: string | null
  textbookVersion: string | null
  major: string | null
  chapter: string
  knowledgePoints: string[]
  suitableFoundation: string
  durationMin: number
  publishedAt: string
  officialOrOriginal: boolean | null
  reposted: boolean | null
  originalSourceNote: string
  viewCount: number | null
  likeCount: number | null
  favoriteCount: number | null
  coinCount: number | null
  statsSnapshotAt: string | null
  reviewedAt: string | null
  reviewer: string | null
  healthStatus: 'active' | 'unknown' | 'unavailable'
  lastCheckedAt: string | null
  recommendation: string
  suitableTaskTypes: string[]
  qualityScore: number
  trustScore: number
  foundationMatchScore: number
  relevanceScore: number
  status: 'reviewed' | 'candidate' | 'unavailable'
}

export interface ResourceSearchSuggestion {
  id: string
  query: string
  scene: string
  afterWatchPractice: string
  knowledgePoint: string
  status: 'candidate'
}

export interface CoachMessage {
  id: string
  role: 'user' | 'coach'
  text: string
  createdAt: string
}

export type CoachingStatus = 'requested' | 'confirmed' | 'rescheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
export type CoachingUrgency = '本周需要' | '下周安排' | '暂不确定'

export interface MentorAvailability {
  id: string
  date: string
  start: string
  end: string
  status: 'available' | 'held' | 'booked'
}

export interface MentorProfile {
  id: string
  name: string
  role: string
  subjects: string[]
  expertise: string[]
  teachingStyle: string
  intro: string
  verified: boolean
  availability: MentorAvailability[]
}

export interface CoachingRequest {
  id: string
  courseId: string
  taskId?: string
  knowledgePoint: string
  problem: string
  goal: string
  urgency: CoachingUrgency
  preferredDate: string
  preferredSlotId: string
  mentorId?: string
  status: CoachingStatus
  agenda: string[]
  studentNote: string
  mentorNote: string
  followUpTaskId?: string
  createdAt: string
  updatedAt: string
  source: 'diagnosis' | 'today' | 'user'
}

export interface CoachingMessage {
  id: string
  requestId: string
  role: 'student' | 'mentor' | 'system'
  text: string
  createdAt: string
}

export interface RecoverySignal {
  id: string
  type: 'low_completion' | 'time_overrun' | 'repeated_skip' | 'high_difficulty' | 'overdue' | 'capacity_change'
  severity: 'notice' | 'actionable'
  evidenceIds: string[]
  detectedAt: string
  windowStart: string
  windowEnd: string
  explanation: string
}

export interface RecoveryOption {
  id: string
  type: 'reduce_daily_load' | 'extend_horizon' | 'rebalance_priority' | 'keep_plan'
  title: string
  explanation: string
  impact: {
    nextWeekMinutes: number
    affectedCourseIds: string[]
    shiftedTaskCount: number
    shortenedMinutes: number
    summary: string
    targetDateChanges: Array<{ courseId: string; before: string; after: string }>
  }
  changeSetPreview?: ChangeSet
}

export interface RecoveryProposal {
  id: string
  signalIds: string[]
  createdAt: string
  status: 'draft' | 'selected' | 'applied' | 'dismissed' | 'expired'
  options: RecoveryOption[]
  selectedOptionId?: string
}

export interface AppData {
  version: 6 | 7
  schemaVersion: number
  resourceCatalogVersion: string
  onboardingCompleted: boolean
  onboardingStep: number
  courses: Course[]
  schedule: ScheduleProfile
  resources: LearningResource[]
  tasks: LearningTask[]
  learningStages: LearningStageDefinition[]
  taskPool: TaskPoolItem[]
  taskPlacements: TaskPlacement[]
  weeklySchedules: WeeklySchedule[]
  planDrafts: Record<string, LearningTask[]>
  globalPlanDraft: GlobalPlanDraft | null
  globalPlanHistory: GlobalPlanDraft[]
  planTaskArchive: Record<string, LearningTask[]>
  plans: PlanSnapshot[]
  diagnoses: Record<string, DiagnosisResult>
  planningBases: Record<string, PlanningBasis>
  diagnosisHistory: DiagnosisResult[]
  taskEvents: TaskEvent[]
  quizEvents: QuizEvent[]
  dailyChecks: DailyCheck[]
  assessmentEvents: AssessmentEvent[]
  evidenceRecords: EvidenceRecord[]
  changeSets: ChangeSet[]
  weekArchives: WeekArchive[]
  resourceDismissals: ResourceDismissal[]
  resourceEvents: ResourceEvent[]
  progress: ProgressState
  settings: UserSettings
  coachMessages: CoachMessage[]
  coachingRequests: CoachingRequest[]
  coachingMessages: CoachingMessage[]
  recoveryProposals: RecoveryProposal[]
  activeRecoveryProposalId: string
  lastCoachChangeSetId: string
  planChanges: string[]
  migrationBackup?: string
  externalUpdateAt?: string
}

export interface ProviderResult<T> {
  data: T
  provider: 'local-rules' | 'remote'
  generatedAt: string
}

export interface PlanAdjustment {
  message: string
  changedTaskIds: string[]
  tasks: LearningTask[]
  changeNote: string
  reasons: string[]
  needsClarification?: boolean
  clarificationQuestion?: string
  changeSet?: ChangeSet
  schedulePatch?: Partial<ScheduleProfile>
  constraintDraft?: ScheduleConstraint
  coursePatches?: Array<Pick<Course, 'id' | 'priority' | 'priorityWeight'>>
}
