import { profile, type CourseCatalogProfile } from './courseProfiles.ts'
import type { SubjectDomain } from '../types.ts'

const definitions: Array<[string, string, string[], SubjectDomain, string[], string[]]> = [
  ['high.chinese', '高中语文', ['语文', '高考语文'], '新闻传播与汉语言文学', ['文本理解', '古诗文阅读', '写作表达'], ['语文教材', '高考语文', '阅读', '作文']],
  ['high.math', '高中数学', ['数学', '高考数学'], '数学与统计', ['概念理解', '运算推导', '题型迁移'], ['高中数学', '高考数学', '教材', '真题']],
  ['high.english', '高中英语', ['英语', '高考英语'], '大学英语与语言考试', ['词汇语法', '阅读听力', '写作表达'], ['高中英语', '高考英语', '阅读', '听力']],
  ['high.physics', '高中物理', ['物理', '高考物理'], '物理', ['物理图景', '模型推导', '实验分析'], ['高中物理', '高考物理', '实验', '模型']],
  ['high.chemistry', '高中化学', ['化学', '高考化学'], '化学', ['物质结构', '反应原理', '实验分析'], ['高中化学', '高考化学', '实验', '反应']],
  ['high.biology', '高中生物', ['生物', '高考生物'], '生物科学', ['结构功能', '过程机制', '实验数据'], ['高中生物', '高考生物', '实验', '遗传']],
  ['high.politics', '高中思想政治', ['政治', '思想政治', '高考政治'], '经济金融会计与管理', ['概念框架', '材料分析', '规范表达'], ['高中政治', '高考政治', '时政材料']],
  ['high.history', '高中历史', ['历史', '高考历史'], '新闻传播与汉语言文学', ['时空线索', '史料分析', '论证表达'], ['高中历史', '高考历史', '史料']],
  ['high.geography', '高中地理', ['地理', '高考地理'], '通用技能', ['区域认知', '过程分析', '图表判读'], ['高中地理', '高考地理', '地图', '图表']],
]

// 课程库只维护稳定课程身份。高中教材章节受省份、年级和版本影响，
// 未选择教材或录入目录前保持空数组，避免把通用主题冒充真实章节。
export const highSchoolCourseProfiles: CourseCatalogProfile[] = definitions.map(([canonicalId, name, aliases, domain, diagnostics, keywords]) => profile({
  canonicalId,
  name,
  aliases,
  stage: '高中',
  domain,
  category: domain === '数学与统计' ? '数学类' : domain === '大学英语与语言考试' ? '语言类' : '理论学科类',
  disciplineGroup: '高中学科',
  prerequisites: [],
  units: [],
  assessments: ['以用户所选省份、考试类型和教材版本为准'],
  diagnosticTemplates: diagnostics,
  outcomes: ['理解核心概念', '完成对应题型或表达任务', '通过复测验证掌握情况'],
  resourceKeywords: keywords,
  forbiddenKeywords: ['小学', '初中', '大学专业课'],
  planStrategy: '先读取省份、年级、教材版本或用户目录，再按前置关系安排诊断、学习与复测。',
  catalogNote: '课程身份已人工维护；教材章节必须由用户背景或课程目录确认。',
}))
