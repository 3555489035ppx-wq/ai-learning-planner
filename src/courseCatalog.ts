import type { Course, DomainCategory, NormalizedCourse, SubjectDomain } from './types.ts'
import type { CourseCatalogProfile } from './catalog/courseProfiles.ts'
import { highSchoolCourseProfiles } from './catalog/high-school.cn.ts'
import { universityCourseProfiles } from './catalog/university.cn.ts'

export interface DomainProfile {
  subjectDomain: SubjectDomain
  broadCategory: DomainCategory
  dimensions: string[]
  outcomes: string[]
  stageTopics: string[]
  deliverables: string[]
  resourceKeywords: string[]
  forbiddenKeywords: string[]
}

const profile = (
  subjectDomain: SubjectDomain,
  broadCategory: DomainCategory,
  dimensions: string[],
  outcomes: string[],
  stageTopics: string[],
  deliverables: string[],
  resourceKeywords: string[],
  forbiddenKeywords: string[] = [],
): DomainProfile => ({ subjectDomain, broadCategory, dimensions, outcomes, stageTopics, deliverables, resourceKeywords, forbiddenKeywords })

export const domainProfiles: Record<SubjectDomain, DomainProfile> = {
  数学与统计: profile('数学与统计', '数学类', ['前置基础', '概念理解', '计算与推导', '建模应用', '错因复盘'], ['能解释核心概念并独立完成典型题。', '建立按错因分类和重做验证的流程。', '完成一次与目标难度匹配的综合测验。'], ['前置与基线', '核心概念', '典型方法', '变式应用', '综合训练', '最终验证'], ['基础诊断表', '概念卡', '题型步骤表', '变式练习', '限时报告', '复测记录'], ['教材', '例题', '习题', '错题', '统计软件'], ['蒙版', '时间轴']),
  大学英语与语言考试: profile('大学英语与语言考试', '语言类', ['词汇提取', '阅读与听力', '语言规则', '写作与口语', '复习节奏'], ['提升输入理解并建立高频词汇复习流程。', '完成限定时间的写作或口语任务。', '形成输入、输出和错因复盘闭环。'], ['能力基线', '高频词汇', '输入理解', '输出表达', '限时整合', '复测巩固'], ['语言能力表', '词汇卡', '阅读听力记录', '修订稿', '限时报告', '复测清单'], ['词汇', '阅读', '听力', '写作', '真题'], ['蒙版', '建模']),
  编程语言与Web开发: profile('编程语言与Web开发', '编程类', ['语法与概念', '问题拆解', '编码实现', '调试测试', '项目复盘'], ['能独立实现一个可运行的小功能。', '掌握调试、测试和边界检查流程。', '完成一个可展示的小项目。'], ['环境与基线', '核心语法', '问题拆解', '调试测试', '项目实现', '重构验证'], ['运行记录', '代码练习集', '功能拆解', '测试记录', '可运行项目', '复盘说明'], ['官方文档', '代码练习', '调试', '测试', '项目'], ['蒙版', '临床']),
  计算机系统网络与数据库: profile('计算机系统网络与数据库', '编程类', ['系统概念', '结构关系', '协议与流程', '实验操作', '故障分析'], ['建立系统、网络或数据库的核心结构图。', '能解释关键流程并完成基础实验。', '能从现象定位常见故障层级。'], ['系统基线', '核心结构', '关键流程', '实验验证', '综合排错', '最终复测'], ['概念关系图', '结构图', '流程说明', '实验记录', '排错报告', '复测清单'], ['操作系统', '网络协议', '数据库', '实验', '官方文档'], ['蒙版', '文学鉴赏']),
  人工智能与数据科学: profile('人工智能与数据科学', '编程类', ['数学基础', '数据处理', '模型理解', '实验评估', '结果解释'], ['完成一条可复现的数据或模型实验流程。', '能解释训练、验证和评估指标。', '完成一个小型数据分析或模型项目。'], ['基础与环境', '数据准备', '模型概念', '实验评估', '项目整合', '复现实验'], ['环境记录', '数据说明', '模型卡', '实验报告', '项目成果', '复现清单'], ['数据集', '模型', '评估', 'Python', '实验'], ['蒙版', '护理']),
  电子信息与通信: profile('电子信息与通信', '理论学科类', ['电路基础', '信号理解', '系统分析', '实验测量', '故障定位'], ['能解释核心电路或通信链路。', '完成一次仿真或实物测量。', '形成信号、系统和误差分析流程。'], ['基础测查', '电路与信号', '系统流程', '仿真实验', '综合分析', '测量复核'], ['基础清单', '电路图', '流程图', '实验记录', '分析报告', '复核表'], ['电路', '信号', '通信', '仿真', '测量'], ['蒙版', '诉讼']),
  自动化与控制: profile('自动化与控制', '理论学科类', ['系统建模', '反馈概念', '稳定性分析', '控制器设计', '仿真验证'], ['建立对象模型并解释反馈结构。', '完成控制器参数与响应分析。', '通过仿真验证稳定性和性能。'], ['模型基线', '反馈结构', '分析方法', '控制设计', '仿真整合', '最终验证'], ['模型说明', '结构图', '分析表', '控制方案', '仿真报告', '验证记录'], ['控制系统', 'PLC', '传感器', '仿真', '反馈'], ['蒙版', '文学']),
  机械与制造: profile('机械与制造', '理论学科类', ['工程表达', '受力与运动', '机构原理', '设计计算', '制造约束'], ['能阅读和表达基础工程图。', '完成典型机构或零件分析。', '输出一份满足制造约束的设计说明。'], ['制图基线', '力学基础', '机构分析', '设计计算', '方案整合', '工程校核'], ['制图练习', '受力图', '机构表', '计算书', '设计方案', '校核表'], ['机械设计', '工程制图', '材料力学', '制造', '标准'], ['蒙版', '语法']),
  土木与建筑: profile('土木与建筑', '理论学科类', ['空间与制图', '结构概念', '材料与构造', '计算分析', '规范应用'], ['能读懂结构或建筑图纸。', '完成典型构件或空间方案分析。', '能依据基础规范检查成果。'], ['图纸基线', '结构构造', '材料方法', '计算表达', '方案整合', '规范校核'], ['识图记录', '构造图', '方法表', '计算书', '方案图', '校核清单'], ['建筑', '结构', '制图', '规范', '工程案例'], ['蒙版', '词汇']),
  物理: profile('物理', '理论学科类', ['物理图景', '定律理解', '数学表达', '实验分析', '综合应用'], ['能用图景和公式解释核心现象。', '完成典型模型与实验数据分析。', '完成一次综合问题复测。'], ['现象基线', '定律概念', '模型推导', '实验应用', '综合训练', '复测验证'], ['问题清单', '定律卡', '推导记录', '实验报告', '综合练习', '复测表'], ['物理模型', '实验', '例题', '推导', '测量'], ['蒙版', '诉讼']),
  化学: profile('化学', '理论学科类', ['物质结构', '反应原理', '计算表达', '实验操作', '安全与误差'], ['建立结构、性质和反应的联系。', '完成典型计算和实验方案。', '能分析实验误差与安全风险。'], ['基础基线', '结构与性质', '反应原理', '实验计算', '综合应用', '实验复核'], ['概念表', '关系图', '反应卡', '实验记录', '综合报告', '复核清单'], ['化学反应', '实验', '结构', '计算', '安全'], ['蒙版', '程序调试']),
  生物科学: profile('生物科学', '理论学科类', ['结构层次', '生命过程', '实验设计', '数据解释', '机制联系'], ['能解释结构与功能关系。', '完成典型实验设计和数据解读。', '形成机制图与主动回忆流程。'], ['概念基线', '结构功能', '过程机制', '实验设计', '综合联系', '主动复测'], ['概念表', '结构图', '机制图', '实验方案', '综合报告', '复测清单'], ['生物机制', '实验', '细胞', '遗传', '数据'], ['蒙版', '诉讼']),
  医学: profile('医学', '理论学科类', ['正常结构功能', '病理机制', '症状体征', '诊断思路', '临床决策'], ['建立从结构功能到疾病机制的联系。', '能按证据组织基础临床思路。', '完成一个病例式综合复盘。'], ['基础定位', '结构功能', '病理机制', '病例分析', '综合决策', '复测验证'], ['基础表', '结构图', '机制图', '病例记录', '决策清单', '复测记录'], ['医学教材', '解剖', '生理', '病理', '病例'], ['蒙版', 'Logo']),
  护理与药学: profile('护理与药学', '理论学科类', ['基础机制', '评估与用药', '操作流程', '风险管理', '案例应用'], ['掌握关键护理或药学机制。', '能按流程完成评估、操作或用药分析。', '完成一次安全风险复盘。'], ['知识基线', '机制与评估', '标准流程', '案例应用', '风险整合', '最终复核'], ['问题表', '机制卡', '流程单', '案例记录', '风险清单', '复核表'], ['护理流程', '药理', '用药', '病例', '安全'], ['蒙版', '前端']),
  法学: profile('法学', '理论学科类', ['法律概念', '规范体系', '要件分析', '案例适用', '论证表达'], ['建立核心规范与要件框架。', '能按要件分析典型案例。', '完成一份结构化法律论证。'], ['概念基线', '规范体系', '要件方法', '案例分析', '综合论证', '复测校核'], ['概念表', '规范图', '要件表', '案例记录', '论证稿', '复测清单'], ['法条', '案例', '要件', '论证', '司法解释'], ['蒙版', '调试']),
  经济金融会计与管理: profile('经济金融会计与管理', '理论学科类', ['核心概念', '模型与规则', '数据分析', '案例决策', '复盘表达'], ['建立核心模型、规则或管理框架。', '完成数据或案例分析。', '输出一份可解释的决策报告。'], ['概念基线', '模型规则', '数据方法', '案例应用', '综合决策', '复测验证'], ['概念表', '模型卡', '分析表', '案例记录', '决策报告', '复测清单'], ['经济模型', '财务分析', '会计准则', '管理案例', '数据'], ['蒙版', '解剖']),
  新闻传播与汉语言文学: profile('新闻传播与汉语言文学', '理论学科类', ['文本理解', '概念框架', '材料分析', '写作表达', '编辑复盘'], ['建立文本、论点与表达框架。', '完成材料提取和结构化表达。', '输出一篇经过修订的文本。'], ['阅读基线', '概念与文本', '材料提取', '写作编辑', '综合表达', '修订验证'], ['阅读表', '框架图', '材料卡', '初稿', '完整稿', '修订说明'], ['文本', '写作', '传播案例', '文学', '编辑'], ['蒙版', '电路']),
  心理学与教育学: profile('心理学与教育学', '理论学科类', ['核心理论', '研究方法', '测量与数据', '案例解释', '实践反思'], ['建立主要理论与证据的联系。', '能判断基础研究设计和数据。', '完成一个教育或心理案例分析。'], ['理论基线', '核心理论', '研究方法', '案例应用', '综合设计', '证据复测'], ['理论表', '关系图', '研究卡', '案例记录', '方案稿', '复测清单'], ['心理理论', '教育研究', '实验', '统计', '案例'], ['蒙版', '建模导出']),
  体育科学: profile('体育科学', '理论学科类', ['人体基础', '动作技术', '训练原则', '负荷监控', '安全恢复'], ['理解训练与人体反应。', '完成可执行的训练设计。', '用记录验证负荷和恢复效果。'], ['身体基线', '动作基础', '训练原则', '计划实践', '监控调整', '最终复测'], ['基线表', '动作记录', '原则卡', '训练计划', '监控日志', '复测记录'], ['运动生理', '训练', '动作', '恢复', '安全'], ['蒙版', '法条']),
  平面与图像设计: profile('平面与图像设计', '设计软件类', ['图层与选区', '蒙版与合成', '调色与精修', '版式视觉', '导出规范'], ['能完成海报排版、蒙版合成和基础精修。', '建立非破坏性图像处理工作流。', '输出一份规范的完整作品。'], ['文件基线', '图层选区', '蒙版调色', '版式合成', '完整作品', '导出复盘'], ['文件检查表', '选区练习', '合成练习', '版式稿', '完整海报', '导出清单'], ['Photoshop', '图层', '选区', '蒙版', '调色'], ['三维拓扑', '法律要件']),
  矢量设计: profile('矢量设计', '设计软件类', ['形状与钢笔', '锚点与路径', '颜色与外观', '图标系统', '矢量导出'], ['能用钢笔、形状和路径完成矢量作品。', '建立可编辑的图标或Logo系统。', '规范导出一套矢量资产。'], ['文件基线', '形状钢笔', '路径外观', '图标系统', '完整作品', '导出复盘'], ['工具清单', '路径练习', '外观练习', '图标组', '矢量作品', '导出规范'], ['Illustrator', '钢笔', '路径', '矢量', 'Logo'], ['蒙版合成', '三维拓扑']),
  三维建模与CAD: profile('三维建模与CAD', '设计软件类', ['空间与坐标', '曲线与草图', '曲面或实体', '拓扑与精度', '模型导出'], ['能建立规范的曲线、曲面或实体模型。', '掌握对象组织和模型检查。', '完成一个可交付的三维模型。'], ['界面坐标', '草图曲线', '曲面实体', '模型检查', '完整建模', '导出复盘'], ['坐标练习', '曲线练习', '建模练习', '检查报告', '完整模型', '导出清单'], ['Rhino', 'Blender', 'AutoCAD', '曲面', '建模'], ['蒙版', '选区', '调色']),
  视频剪辑与动效: profile('视频剪辑与动效', '设计软件类', ['素材与时间轴', '剪辑节奏', '音频与字幕', '关键帧动效', '编码导出'], ['能完成结构清晰的短视频剪辑。', '掌握时间轴、音频或关键帧流程。', '输出一条符合规格的成片。'], ['项目素材', '时间轴剪辑', '声音字幕', '动效合成', '完整成片', '编码复盘'], ['素材表', '粗剪版', '声音版', '动效练习', '完整成片', '导出清单'], ['Premiere', 'After Effects', '时间轴', '关键帧', '导出'], ['蒙版选区诊断', '法律要件']),
  UIUX与交互设计: profile('UIUX与交互设计', '设计软件类', ['用户与场景', '信息架构', '界面布局', '交互原型', '可用性验证'], ['完成一个关键流程的交互原型。', '建立从需求到验证的设计过程。', '通过可用性检查修订方案。'], ['问题定义', '信息架构', '界面布局', '交互原型', '用户验证', '方案复盘'], ['用户问题表', '流程图', '界面稿', '可点击原型', '测试记录', '修订说明'], ['Figma', '交互设计', '原型', '可用性', '设计系统'], ['三维拓扑', '药理']),
  产品设计理论与项目: profile('产品设计理论与项目', '项目/作品类', ['需求洞察', '设计方法', '人机与体验', '方案表达', '作品复盘'], ['完成从问题定义到方案表达的设计项目。', '能说明设计决策和验证依据。', '整理一份可展示的作品过程。'], ['问题与需求', '方法研究', '方案发散', '原型验证', '项目交付', '作品复盘'], ['项目任务书', '研究记录', '方案草图', '验证记录', '完整方案', '作品说明'], ['产品设计', '人机工程', '设计方法', '原型', '作品集'], ['函数极限', '临床诊断']),
  通用技能: profile('通用技能', '通用技能类', ['任务理解', '基础操作', '过程执行', '质量判断', '复盘迁移'], ['能独立完成一个典型任务。', '找到最容易卡住的步骤并练习。', '形成可重复使用的学习流程。'], ['任务定位', '基础拆解', '完整执行', '质量修正', '独立完成', '复盘迁移'], ['目标清单', '步骤记录', '阶段成果', '检查表', '独立成果', '方法清单'], ['入门', '典型任务', '练习', '项目', '复盘'], []),
}

type CatalogEntry = CourseCatalogProfile

export const catalogProfiles: CourseCatalogProfile[] = [...highSchoolCourseProfiles, ...universityCourseProfiles]
const entries = catalogProfiles

const clean = (value: string) => value.trim().replace(/[\s\u3000_-]+/g, '').toLocaleLowerCase('zh-CN')
const entryById = new Map(entries.map(item => [item.canonicalId, item]))
const aliasIndex = new Map<string, CatalogEntry>()
entries.forEach(item => [item.name, ...item.aliases].forEach(alias => aliasIndex.set(clean(alias), item)))

const broadFor = (domain: SubjectDomain): DomainCategory => domainProfiles[domain].broadCategory

const stableHash = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(36)
}

const domainRules: Array<{ domain: SubjectDomain; group: string; pattern: RegExp }> = [
  { domain: '平面与图像设计', group: '设计', pattern: /数字图像处理|平面构成|字体设计|版式设计|品牌设计|图像设计/ },
  { domain: '矢量设计', group: '设计', pattern: /矢量设计|矢量图形/ },
  { domain: '三维建模与CAD', group: '设计工程', pattern: /3dsmax|c4d|cinema4d|solidworks|sketchup|keyshot|三维建模|工业建模|建筑制图/ },
  { domain: '视频剪辑与动效', group: '设计', pattern: /视频剪辑|动态图形|动效设计|影视后期/ },
  { domain: 'UIUX与交互设计', group: '设计', pattern: /ui设计|ux设计|交互设计|用户体验|figma/ },
  { domain: '产品设计理论与项目', group: '设计', pattern: /产品设计|设计素描|设计方法|人机工程|设计心理|作品集/ },
  { domain: '人工智能与数据科学', group: '计算机', pattern: /人工智能|机器学习|深度学习|自然语言处理|计算机视觉|数据科学|数据挖掘|大数据/ },
  { domain: '计算机系统网络与数据库', group: '计算机', pattern: /计算机组成|操作系统|计算机网络|数据库|软件工程|软件需求|软件测试|软件项目管理|软件体系结构|计算机科学|信息安全/ },
  { domain: '编程语言与Web开发', group: '计算机', pattern: /程序设计|数据结构|算法|web前端|前端开发|vue|react|unity|ue5|matlab|编程/ },
  { domain: '自动化与控制', group: '工程', pattern: /自动控制|现代控制|电机与拖动|plc|传感器|自动化/ },
  { domain: '电子信息与通信', group: '工程', pattern: /电路分析|模拟电子|数字电子|信号与系统|通信原理|单片机|嵌入式|电子信息/ },
  { domain: '机械与制造', group: '工程', pattern: /机械|理论力学|材料力学|工程制图|制造/ },
  { domain: '土木与建筑', group: '工程', pattern: /结构力学|混凝土|土力学|工程测量|建筑设计|建筑构造|建筑史|城市规划|土木|建筑/ },
  { domain: '医学', group: '医学', pattern: /临床|人体解剖|生理学|病理学|内科学|外科学|医学/ },
  { domain: '护理与药学', group: '医学', pattern: /护理|药理|药学|药物化学|药剂|病理生理/ },
  { domain: '生物科学', group: '理学', pattern: /生物|细胞|遗传|微生物|分子生物/ },
  { domain: '化学', group: '理学', pattern: /化学|化工|食品化学/ },
  { domain: '物理', group: '理学', pattern: /大学物理|电磁学|热学|光学|量子力学|物理/ },
  { domain: '数学与统计', group: '理学', pattern: /数学|高等代数|数学分析|解析几何|概率|数理统计|常微分|计量经济|统计学|spss/ },
  { domain: '法学', group: '法学', pattern: /法理|宪法|民法|刑法|行政法|诉讼法|法学/ },
  { domain: '经济金融会计与管理', group: '经管', pattern: /经济学|金融|会计|审计|财务|管理学|市场营销|人力资源|运营管理|战略管理|组织行为|消费者行为|市场调查|品牌管理|广告学|营销|财政|货币银行|思想|马克思|形势与政策/ },
  { domain: '新闻传播与汉语言文学', group: '人文', pattern: /文学|汉语|新闻|传播|采访|写作|编辑出版|新媒体运营/ },
  { domain: '心理学与教育学', group: '社科', pattern: /心理|教育学|课程与教学|教育研究|教育史/ },
  { domain: '体育科学', group: '体育', pattern: /体育|运动解剖|运动生理|运动训练/ },
  { domain: '大学英语与语言考试', group: '语言', pattern: /英语|雅思|托福|翻译理论|英美文学|口语|听力/ },
]

const fromEntry = (entry: CatalogEntry, confidence = .99): NormalizedCourse => ({
  canonicalId: entry.canonicalId,
  canonicalName: entry.name,
  aliases: [...entry.aliases],
  disciplineGroup: entry.disciplineGroup,
  subjectDomain: entry.domain,
  toolFamily: entry.toolFamily,
  confidence,
})

export const normalizeCourseName = (name: string, resolvedCanonicalId = ''): NormalizedCourse => {
  if (resolvedCanonicalId === 'ai.fundamentals') return { canonicalId: 'ai.fundamentals', canonicalName: '人工智能', aliases: ['AI'], disciplineGroup: '计算机', subjectDomain: '人工智能与数据科学', confidence: .99 }
  if (resolvedCanonicalId === 'cad.fundamentals') return { canonicalId: 'cad.fundamentals', canonicalName: 'CAD 制图基础', aliases: ['CAD'], disciplineGroup: '设计工程', subjectDomain: '三维建模与CAD', confidence: .99 }
  if (resolvedCanonicalId && entryById.has(resolvedCanonicalId)) return fromEntry(entryById.get(resolvedCanonicalId)!)
  const normalized = clean(name)
  if (normalized === 'ai') return {
    canonicalId: '', canonicalName: 'AI', aliases: ['AI'], disciplineGroup: '待确认', subjectDomain: '通用技能', confidence: 0,
    ambiguityOptions: [
      { id: 'design.illustrator', label: 'Adobe Illustrator（矢量设计）', subjectDomain: '矢量设计' },
      { id: 'ai.fundamentals', label: '人工智能（学科）', subjectDomain: '人工智能与数据科学' },
    ],
  }
  if (normalized === 'cad') return {
    canonicalId: '', canonicalName: 'CAD', aliases: ['CAD'], disciplineGroup: '待确认', subjectDomain: '三维建模与CAD', confidence: .3,
    ambiguityOptions: [
      { id: 'cad.autocad', label: 'AutoCAD 软件技能', subjectDomain: '三维建模与CAD' },
      { id: 'cad.fundamentals', label: 'CAD 制图基础', subjectDomain: '三维建模与CAD' },
    ],
  }
  const exact = aliasIndex.get(normalized)
  if (exact) return fromEntry(exact)
  const rule = domainRules.find(item => item.pattern.test(normalized))
  if (rule) return {
    canonicalId: `unverified.${stableHash(normalized)}`,
    canonicalName: name.trim(),
    aliases: [],
    disciplineGroup: rule.group,
    subjectDomain: rule.domain,
    confidence: .45,
  }
  return {
    canonicalId: `unknown.${stableHash(normalized || 'empty')}`,
    canonicalName: name.trim() || '未命名课程',
    aliases: [],
    disciplineGroup: '待补充',
    subjectDomain: '通用技能',
    confidence: .25,
  }
}

export const broadCategoryFor = (domain: SubjectDomain) => broadFor(domain)

export const courseProfileForId = (canonicalId: string) => entryById.get(canonicalId)
export const isStableCatalogCourse = (canonicalId: string) => entryById.has(canonicalId)

export const applyNormalizationToCourse = (course: Course, resolvedCanonicalId = ''): Course => {
  const normalized = normalizeCourseName(course.name, resolvedCanonicalId || course.canonicalId)
  return {
    ...course,
    canonicalId: normalized.canonicalId,
    canonicalName: normalized.canonicalName,
    subjectDomain: normalized.subjectDomain,
    normalizationConfidence: normalized.confidence,
    ambiguityOptions: normalized.ambiguityOptions ?? [],
    ambiguityResolved: !normalized.ambiguityOptions?.length,
  }
}

export const profileForCourse = (course: Course) => {
  const normalized = normalizeCourseName(course.name, course.ambiguityResolved ? course.canonicalId : '')
  return { normalized, profile: domainProfiles[normalized.subjectDomain] }
}
