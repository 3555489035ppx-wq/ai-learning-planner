export type EducationStage = '高中' | '大学' | '其他'
export type CourseType = '必修课' | '选修课' | '语言考试' | '专业考试' | '技能课程'
export type ExamType = '期末考试' | '补考' | '模拟考试' | '资格考试' | '自测'
export type MasteryLevel = '几乎不会' | '基础薄弱' | '一般' | '较熟练' | '熟练'
export type GoalType = '补弱' | '补考' | '四六级' | '考研' | '考证' | '技能提升'
export type TaskStatus = '待完成' | '已完成' | '已延期' | '已跳过'
export type ResourceStatus = '可用' | '已加入计划' | '不感兴趣'

export interface Course {
  id: string
  name: string
  stage: EducationStage | ''
  courseType: CourseType | ''
  score: number | ''
  maxScore: number | ''
  passScore: number | ''
  examType: ExamType | ''
  incomplete: boolean
  mastery: MasteryLevel | ''
  goalType: GoalType | ''
  targetScore: number | ''
  targetDate: string
  priority: boolean
  desiredResult: string
}

export interface ScheduleProfile {
  holidayStart: string
  holidayEnd: string
  weekdayMinutes: number
  weekendMinutes: number
  preferredTimes: string[]
  travelDates: string
  fixedCommitments: string
  restDays: string[]
  maxFocusMinutes: number
  interruptionReason: string
}

export interface LearningResource {
  id: string
  title: string
  platform: '哔哩哔哩' | '抖音' | 'MIT OpenCourseWare' | 'Khan Academy' | '用户提供' | '站内测验'
  author: string
  durationMin: number
  suitableStage: string
  knowledgePoints: string[]
  recommendation: string
  humanVerified: boolean
  url: string
  status: ResourceStatus
  userProvided?: boolean
}

export interface LearningTask {
  id: string
  date: string
  time: string
  title: string
  courseId: string
  knowledgePoint: string
  resourceId: string
  materialLabel: string
  watchMinutes: number
  practiceCount: number
  quizTask: string
  completionCriteria: string
  estimatedMinutes: number
  status: TaskStatus
  skipReason: string
  changeNote: string
  order: number
}

export interface DiagnosisResult {
  generatedAt: string
  courseId: string
  scoreEvaluation: string
  completeness: number
  confidence: '低' | '中' | '高'
  weakReasons: string[]
  requiresBaselineQuiz: boolean
  baselineQuizMinutes: number
  weakKnowledgePoints: string[]
  realisticGoal: string
  sixWeekStages: Array<{ week: string; title: string; focus: string }>
  recommendedResourceIds: string[]
  rationale: string[]
  disclaimer: string
}

export interface ProgressSnapshot {
  initialAccuracy: number
  weeklyAccuracy: number
  masteryBefore: number
  masteryNow: number
  wrongAnswers: number
  repeatedWeakPoints: string[]
  actualStudyMinutes: number
  resourceCompleted: number
  resourceTotal: number
  nextWeekReason: string
  nextWeekAppliedAt: string
}

export interface UserSettings {
  displayName: string
  reminderTime: string
  resourcePreference: string
  acceptShortVideo: boolean
  dailyReminder: boolean
  adjustmentReminder: boolean
  privacyAccepted: boolean
}

export interface CoachMessage {
  id: string
  role: 'user' | 'coach'
  text: string
  createdAt: string
}

export interface AppData {
  version: 1
  onboardingCompleted: boolean
  courses: Course[]
  schedule: ScheduleProfile
  resources: LearningResource[]
  tasks: LearningTask[]
  diagnosis: DiagnosisResult | null
  progress: ProgressSnapshot
  settings: UserSettings
  coachMessages: CoachMessage[]
  planChanges: string[]
}

export interface ProviderResult<T> {
  data: T
  provider: 'mock'
  generatedAt: string
}

export interface PlanAdjustment {
  message: string
  changedTaskIds: string[]
  tasks: LearningTask[]
  changeNote: string
}
