import test from 'node:test'
import assert from 'node:assert/strict'
import { applyNormalizationToCourse, catalogProfiles, isStableCatalogCourse, normalizeCourseName } from '../src/courseCatalog.ts'
import { createCourse, initialData, todayISO } from '../src/data.ts'
import { addDays } from '../src/dateUtils.ts'
import { buildDiagnosis, buildHolidayPlan, matchingResources, resourceMatchesCourse } from '../src/providers.ts'

const formalCourses = [
  '程序设计基础', '数据结构', '计算机组成原理', '操作系统', '计算机网络', '数据库系统', '软件工程', '离散数学',
  'Java 程序设计', '软件需求工程', '软件测试', '软件项目管理', 'Web 前端开发', '软件体系结构',
  'Python 程序设计', '线性代数', '概率论', '机器学习', '深度学习', '自然语言处理', '计算机视觉',
  '高等数学', '概率论与数理统计', 'Python', '数据库原理', '数据挖掘', '大数据技术',
  '电路分析', '模拟电子技术', '数字电子技术', '信号与系统', '通信原理', '单片机原理',
  '自动控制原理', '现代控制理论', '电机与拖动', 'PLC', '传感器原理', '嵌入式系统',
  '工程制图', '理论力学', '材料力学', '机械原理', '机械设计', 'AutoCAD',
  '工程力学', '结构力学', '混凝土结构', '土力学', '工程测量', '建筑制图',
  '建筑设计', '建筑构造', '中国建筑史', '城市规划原理', 'SketchUp',
  '设计素描', '产品设计方法学', '人机工程学', '设计心理学', 'Rhino', 'KeyShot', 'Photoshop', 'Illustrator',
  '平面构成', '字体设计', '版式设计', '品牌设计',
  '数字图像处理', 'Premiere Pro', 'After Effects', 'Blender', '交互设计', '动态图形设计',
  '人体解剖学', '生理学', '生物化学', '病理学', '药理学', '内科学', '外科学',
  '基础护理学', '内科护理学', '外科护理学', '病理生理学', '护理心理学',
  '无机化学', '有机化学', '分析化学', '药物化学', '药剂学', '物理化学', '结构化学',
  '普通生物学', '细胞生物学', '遗传学', '微生物学', '分子生物学',
  '法理学', '宪法学', '民法', '刑法', '行政法', '民事诉讼法',
  '微观经济学', '宏观经济学', '计量经济学', '财政学', '货币银行学', '国际经济学',
  '金融学', '公司金融', '证券投资学', '国际金融', '金融风险管理', '金融计量学',
  '管理学', '市场营销', '人力资源管理', '运营管理', '战略管理', '组织行为学',
  '基础会计', '中级财务会计', '成本会计', '管理会计', '审计学', '财务管理',
  '消费者行为学', '市场调查', '品牌管理', '广告学', '新媒体营销', '营销策划',
  '中国古代文学', '中国现代文学', '外国文学', '现代汉语', '古代汉语', '文学理论',
  '综合英语', '英语听力', '英语口语', '英语写作', '翻译理论', '英美文学',
  '新闻学概论', '传播学概论', '新闻采访与写作', '编辑出版学', '新媒体运营',
  '普通心理学', '发展心理学', '社会心理学', '认知心理学', '心理统计学', '实验心理学',
  '教育学原理', '教育心理学', '课程与教学论', '教育研究方法', '中外教育史',
  '力学', '电磁学', '热学', '光学', '量子力学', '数学分析', '高等代数', '解析几何', '数理统计', '常微分方程',
  '环境化学', '环境监测', '水污染控制', '大气污染控制', '固体废物处理', '环境影响评价',
  '食品化学', '食品微生物学', '食品工艺学', '食品分析', '食品安全学',
  '运动解剖学', '运动生理学', '体育心理学', '运动训练学', '学校体育学',
]

const commonInputs = [
  '高数', '线代', '概率论', '大英', '四级', '六级', '雅思', 'C语言', 'C++', 'Java', 'Python', 'SQL', 'MATLAB', 'SPSS', 'Excel',
  'PS', 'PR', 'AE', '犀牛', '3ds Max', 'C4D', 'SolidWorks', 'SketchUp', 'KeyShot', 'Vue', 'React', 'Unity', 'UE5',
  '毛概', '马原', '形势与政策', '大学物理', '大学化学', '大学生心理健康', '体育',
]

const makeCourse = (name: string) => applyNormalizationToCourse(createCourse({
  name, stage: '大学', courseType: '技能课程', assessmentMode: 'mastery', mastery: '基础薄弱',
  mainDifficulty: '无法独立完成典型任务', selfEvidence: '只能跟随示例完成，离开提示后会卡住',
  goalType: '技能提升', targetDate: addDays(todayISO(), 41), priority: true, desiredResult: '完成一个可检查的阶段成果',
}))

test('稳定课程库逐项通过分类、诊断、计划与资源校验', () => {
  let recognized = 0
  const failures: string[] = []
  for (const name of catalogProfiles.filter(item => item.stage === '大学').map(item => item.name)) {
    const data = initialData()
    const course = makeCourse(name)
    data.courses = [course]
    const normalized = normalizeCourseName(name)
    if (normalized.confidence >= .5) recognized += 1
    try {
      const diagnosis = buildDiagnosis(data, course.id)
      const tasks = buildHolidayPlan(data, diagnosis)
      const resources = matchingResources(data, course.id)
      assert.ok(diagnosis.diagnosticQuiz.length >= 2)
      assert.ok(diagnosis.learningStages.length >= 2 && diagnosis.learningStages.length <= 8)
      assert.ok(tasks.length > 0)
      assert.ok(tasks.every(task => task.courseId === course.id))
      assert.ok(resources.every(resource => resourceMatchesCourse(resource, course)))
      const domainText = JSON.stringify({ diagnosis, tasks })
      const forbidden = diagnosis.subjectDomain === '平面与图像设计' ? ['三维拓扑', '法律要件']
        : diagnosis.subjectDomain === '三维建模与CAD' ? ['蒙版', '选区', '调色']
          : diagnosis.subjectDomain === '编程语言与Web开发' ? ['临床诊断', '护理流程'] : []
      forbidden.forEach(keyword => assert.doesNotMatch(domainText, new RegExp(keyword)))
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const rate = recognized / catalogProfiles.filter(item => item.stage === '大学').length
  assert.ok(rate >= .9, `正式课程领域识别率 ${(rate * 100).toFixed(1)}%，低于 90%`)
  assert.deepEqual(failures, [])
})

test('常用简称逐项标准化或明确消歧，并通过技术流程', () => {
  const failures: string[] = []
  for (const name of commonInputs) {
    const normalized = normalizeCourseName(name)
    if (!isStableCatalogCourse(normalized.canonicalId) && !normalized.ambiguityOptions?.length) {
      const data = initialData()
      const unknown = makeCourse(name)
      data.courses = [unknown]
      const diagnosis = buildDiagnosis(data, unknown.id)
      const tasks = buildHolidayPlan(data, diagnosis)
      assert.equal(diagnosis.confidence, '低')
      assert.ok(tasks.length > 0)
      assert.match(JSON.stringify({ diagnosis, tasks }), new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      assert.doesNotMatch(JSON.stringify({ diagnosis, tasks }), /函数极限|导数积分|蒙版选区/)
      continue
    }
    const data = initialData()
    const course = makeCourse(name)
    data.courses = [course]
    try {
      const diagnosis = buildDiagnosis(data, course.id)
      assert.ok(buildHolidayPlan(data, diagnosis).length > 0)
      assert.ok(matchingResources(data, course.id).every(resource => resourceMatchesCourse(resource, course)))
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  assert.deepEqual(failures, [])
})

test('AI 与 CAD 在未选择含义前阻止诊断，选择后进入对应稳定课程', () => {
  for (const [name, resolution] of [['AI', 'design.illustrator'], ['CAD', 'cad.autocad']] as const) {
    const data = initialData()
    const ambiguous = makeCourse(name)
    data.courses = [ambiguous]
    assert.throws(() => buildDiagnosis(data, ambiguous.id), /歧义/)
    const resolved = applyNormalizationToCourse(ambiguous, resolution)
    data.courses = [resolved]
    assert.equal(buildDiagnosis(data, resolved.id).canonicalId, resolution)
  }
})
