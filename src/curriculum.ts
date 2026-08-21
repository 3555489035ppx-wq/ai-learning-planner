import type { Course, CurriculumProfile, CurriculumUnit, EducationStage } from './types.ts'

export const supportedEducationStages: EducationStage[] = ['高中', '大学']
export const legacyEducationStages = ['小学', '初中', '职业技能', '职业/技能', '其他'] as const
export const normalizeEducationStage = (value: unknown): EducationStage | '' => supportedEducationStages.includes(String(value) as EducationStage) ? value as EducationStage : ''
export const isLegacyEducationStage = (value: unknown) => legacyEducationStages.includes(String(value) as typeof legacyEducationStages[number])

export const createCurriculumProfile = (stage: EducationStage | '' = '', overrides: Partial<CurriculumProfile> = {}): CurriculumProfile => ({
  stage,
  province: '',
  city: '',
  grade: '',
  semester: '',
  textbookVersion: '',
  subjectSelection: [],
  examRegion: '',
  school: '',
  major: '',
  instructor: '',
  examFormat: '',
  syllabusTitle: '',
  syllabusUnits: [],
  source: 'unknown',
  ...overrides,
})

export const parseSyllabusUnits = (value: string): CurriculumUnit[] => value
  .split(/\r?\n|[；;]/)
  .map(item => item.trim())
  .filter(Boolean)
  .map((title, index) => ({ id: `unit-${index + 1}-${title.replace(/\s+/g, '-').slice(0, 18)}`, title, order: index + 1, prerequisites: index ? [`unit-${index}-${value.split(/\r?\n|[；;]/)[index - 1]?.trim().replace(/\s+/g, '-').slice(0, 18)}`] : [] }))

export const syllabusText = (profile: CurriculumProfile) => [...profile.syllabusUnits].sort((a, b) => a.order - b.order).map(unit => unit.title).join('\n')

export const curriculumErrors = (course: Course) => {
  const errors: Record<string, string> = {}
  const profile = course.curriculum
  if (!course.stage) errors.stage = '请选择教育阶段。'
  if (course.stageStatus === 'needs-reconfirmation') errors.stage = `原教育阶段“${course.legacyStage || '旧阶段'}”需要迁移到高中或大学，或归档课程。`
  if (course.stage === '高中') {
    if (!profile.province) errors.province = '请选择所在省份。'
    if (!profile.textbookVersion && !profile.syllabusUnits.length) errors.textbookVersion = '请选择教材版本，或录入课程目录。'
  }
  if (course.stage === '大学') {
    if (!profile.major) errors.major = '请填写专业。'
  }
  return errors
}

export const profileSummary = (course: Course) => {
  const values = [course.stage, course.curriculum.province, course.curriculum.grade, course.curriculum.semester, course.curriculum.textbookVersion || course.curriculum.syllabusTitle].filter(Boolean)
  return values.join(' · ') || '课程背景待补充'
}

export const userCurriculumUnits = (course: Course) => [...course.curriculum.syllabusUnits].sort((a, b) => a.order - b.order)

const units = (titles: string[]): CurriculumUnit[] => titles.map((title, index) => ({ id: `preset-${index + 1}-${title.slice(0, 12)}`, title, order: index + 1, prerequisites: index ? [`preset-${index}-${titles[index - 1].slice(0, 12)}`] : [] }))

const highSchoolPresets: Record<string, string[]> = {
  数学: ['集合与常用逻辑用语', '一元二次函数、方程和不等式', '函数概念与性质', '指数函数与对数函数', '三角函数', '统计与概率'],
  英语: ['词汇与语块', '语法与长难句', '阅读信息定位', '听力要点提取', '写作结构与表达'],
  物理: ['运动与相互作用', '功与能量', '曲线运动', '电场与电路', '实验与数据处理'],
  化学: ['物质分类与转化', '物质的量', '氧化还原反应', '元素化合物', '化学反应与能量'],
}

export const curriculumUnitsForCourse = (course: Course, fallbackTitles: string[] = []): CurriculumUnit[] => {
  const provided = userCurriculumUnits(course)
  if (provided.length) return provided
  if (course.stage === '高中' && course.curriculum.textbookVersion) {
    const matched = Object.entries(highSchoolPresets).find(([keyword]) => course.name.includes(keyword))
    if (matched) return units(matched[1])
  }
  if (course.stage === '高中') return []
  // 大学课程的章节因学校、教师和教材而异；领域主题不能冒充真实课程章节。
  // fallbackTitles 仅保留参数兼容性，正式单元必须来自用户大纲。
  void fallbackTitles
  return []
}
