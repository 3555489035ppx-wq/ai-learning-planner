import { expect, test, type Page } from '@playwright/test'
import { addDays, createCourse, createTask, initialData, STORAGE_KEY, todayISO } from '../src/data.ts'
import { mondayOfWeek } from '../src/dateUtils.ts'
import { buildDiagnosis, completeDiagnosisAttempt, recordTaskEvent } from '../src/providers.ts'

const futureDate = (days: number) => addDays(todayISO(), days)

async function reset(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
}

async function addHighSchoolCourse(page: Page) {
  const detailedEntry = page.getByRole('button', { name: '使用详细录入' })
  await page.waitForURL(/\/onboarding/)
  await expect(detailedEntry).toBeVisible()
  await detailedEntry.click()
  await expect(page.getByRole('button', { name: '添加课程' })).toBeVisible()
  await page.getByRole('button', { name: '添加课程' }).click()
  await page.getByLabel('课程名称').fill('高中数学')
  await page.locator('select[name$="-stage"]').selectOption('高中')
  await page.locator('select[name$="-type"]:not([name$="-exam-type"])').selectOption('学科课程')
  await page.getByLabel('省份').selectOption('广东')
  await page.getByLabel('年级').fill('高二')
  await page.getByLabel('学期').selectOption('上学期')
  await page.getByLabel('教材版本').selectOption({ index: 1 })
  await page.getByLabel('本次得分').fill('58')
  await page.getByLabel('试卷满分').fill('150')
  await page.getByLabel('及格线').fill('90')
  await page.getByLabel('考试类型').selectOption('期末考试')
  await page.getByLabel('自评掌握程度').selectOption('基础薄弱')
  await page.getByLabel('主要卡点').fill('函数和导数题无法独立完成')
  await page.getByLabel('判断依据').fill('期末卷函数题只完成了第一问，导数题没有写出关键步骤')
}

async function finishHighSchoolOnboarding(page: Page) {
  await page.getByRole('button', { name: /保存并继续/ }).click()
  await expect(page.getByRole('heading', { name: '把想达到的结果说具体。' })).toBeVisible()
  await page.getByRole('button', { name: '补弱', exact: true }).click()
  await page.getByLabel(/目标分数/).fill('100')
  await page.getByLabel('目标日期或考试日期').fill(futureDate(35))
  await page.getByLabel('希望达到的学习结果').fill('能独立完成函数和导数基础题，正确率达到 70%')
  await page.getByRole('button', { name: /保存并继续/ }).click()
  await page.getByLabel('假期开始').fill(todayISO())
  await page.getByLabel('假期结束').fill(futureDate(42))
  await page.getByLabel('工作日每日可用时间（分钟）').fill('120')
  await page.getByLabel('周末每日可用时间（分钟）').fill('150')
  await page.getByLabel('单次最长专注时间（分钟）').fill('45')
  await page.getByLabel('最容易中断学习的原因').fill('临时出门和手机消息')
  await page.getByRole('button', { name: /生成全部课程计划/ }).click()
  await expect(page).toHaveURL(/\/plan$/)
  const confirm = page.getByRole('button', { name: '确认并启用全部课程' })
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(page.getByText(/已一次性启用第/)).toBeVisible()
  await page.goto('/today')
}

async function seedCompleted(page: Page) {
  const data = initialData()
  const course = createCourse({
    name: '高等数学', canonicalId: 'math.calculus', canonicalName: '高等数学', subjectDomain: '数学与统计', ambiguityResolved: true,
    stage: '大学', courseType: '必修课', assessmentMode: 'score', score: 58, maxScore: 100, passScore: 60, examType: '期末考试', mastery: '基础薄弱',
    mainDifficulty: '导数题不会独立完成', selfEvidence: '只能跟随例题', goalType: '补弱', targetScore: 75, targetDate: futureDate(35), priority: true, desiredResult: '掌握极限和导数基础题',
    curriculum: { ...createCourse().curriculum, stage: '大学', school: '示例大学', major: '产品设计', syllabusTitle: '高等数学（上）', syllabusUnits: [{ id: 'u1', title: '函数与极限', order: 1, prerequisites: [] }, { id: 'u2', title: '导数与微分', order: 2, prerequisites: ['u1'] }], source: 'user-input' },
  })
  const slot = data.schedule.timeSlots[0]
  const task = createTask({ date: todayISO(), originalPlannedDate: todayISO(), time: slot.start, slotId: slot.id, courseId: course.id, title: '导数基础 · 链式法则', stageLabel: '阶段 1', knowledgePoint: '导数与微分', unitId: 'u2', estimatedMinutes: 35, practiceMinutes: 30, quizMinutes: 5, practiceCount: 4, completionCriteria: '完成 4 题并记录 1 个错因', arrangementReason: '当前优先补弱课程的基础断点。', status: '待完成', scheduleStatus: 'scheduled' })
  data.onboardingCompleted = true
  data.courses = [course]
  data.tasks = [task]
  await page.goto('/')
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEY, value: JSON.stringify(data) })
  await page.goto('/today')
}

type JourneyCourse = { id: string; name: string; score?: number; maxScore?: number; assessment?: 'score' | 'mastery' | 'project'; projectCompleted?: boolean }

async function seedCourseBundle(page: Page, stage: '高中' | '大学', specs: JourneyCourse[], withCompletedDiagnoses = false) {
  const data = initialData()
  data.onboardingCompleted = true
  data.onboardingStep = 3
  data.schedule.holidayStart = todayISO()
  data.schedule.holidayEnd = futureDate(42)
  data.schedule.weekdayMinutes = 180
  data.schedule.weekendMinutes = 180
  data.schedule.restDays = []
  data.courses = specs.map((spec, index) => {
    const maxScore = spec.maxScore ?? 100
    const score = spec.score ?? Math.round(maxScore * .58)
    const assessment = spec.assessment ?? 'score'
    return createCourse({
      id: `journey-${index}-${spec.id}`,
      name: spec.name,
      canonicalId: spec.id,
      canonicalName: spec.name,
      ambiguityResolved: true,
      stage,
      stageStatus: 'confirmed',
      courseType: assessment === 'project' ? '项目/作品课' : stage === '高中' ? '学科课程' : '专业核心课',
      assessmentMode: assessment,
      score: assessment === 'score' ? score : '',
      maxScore: assessment === 'score' ? maxScore : '',
      passScore: assessment === 'score' ? Math.round(maxScore * .6) : '',
      examType: assessment === 'score' ? '期末考试' : '',
      mastery: '基础薄弱',
      completedWorks: assessment === 'project' && spec.projectCompleted ? 1 : 0,
      projectCompleted: Boolean(spec.projectCompleted),
      projectChecklist: assessment === 'project' ? ['可编辑源文件', '过程证据', '检查记录'] : [],
      mainDifficulty: assessment !== 'score' ? '能跟随示例，但无法独立完成并检查成果' : '基础知识点无法稳定独立完成',
      selfEvidence: assessment !== 'score' ? '最近一次作业需要大量参考，缺少过程与检查记录' : '最近一次考试中基础题步骤不完整且重复出错',
      goalType: assessment === 'project' ? '完成作品' : '补弱',
      targetScore: assessment === 'score' ? Math.max(Math.round(maxScore * .7), score + 1) : '',
      targetDate: futureDate(35),
      priority: index === 0,
      priorityWeight: specs.length - index,
      desiredResult: assessment !== 'score' ? '独立完成一项可编辑、可检查并能说明依据的成果' : '独立完成基础题并用同条件测验验证提升',
      desiredResultEdited: true,
      curriculum: { ...createCourse().curriculum, stage, province: stage === '高中' ? '广东' : '', grade: stage === '高中' ? '高二' : '', school: stage === '大学' ? '示例大学' : '', major: stage === '大学' ? '当前专业' : '', semester: '上学期', textbookVersion: stage === '高中' ? '人教 A 版' : spec.name, syllabusTitle: spec.name, syllabusUnits: [{ id: `${spec.id}-u1`, title: `${spec.name}基础模块`, order: 1, prerequisites: [] }, { id: `${spec.id}-u2`, title: `${spec.name}应用模块`, order: 2, prerequisites: [`${spec.id}-u1`] }], source: 'user-input' },
    })
  })
  if (withCompletedDiagnoses) {
    for (const course of data.courses) {
      const diagnosis = buildDiagnosis(data, course.id)
      const answers = Object.fromEntries(diagnosis.diagnosticQuiz.map(question => [question.id, question.options[0]]))
      const completed = completeDiagnosisAttempt(data, diagnosis, answers)
      data.diagnoses[course.id] = completed.diagnosis
      data.diagnosisHistory.push(completed.diagnosis)
      data.quizEvents.push(...completed.events)
    }
  }
  await page.goto('/')
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEY, value: JSON.stringify(data) })
  await page.goto('/plan')
}

const globalJourneys = [
  {
    title: '高中 6 科（数学 15/150）',
    stage: '高中' as const,
    courses: [
      { id: 'high.math', name: '高中数学', score: 15, maxScore: 150 },
      { id: 'high.chinese', name: '高中语文', score: 82, maxScore: 150 },
      { id: 'high.english', name: '高中英语', score: 76, maxScore: 150 },
      { id: 'high.physics', name: '高中物理', score: 41, maxScore: 100 },
      { id: 'high.chemistry', name: '高中化学', score: 52, maxScore: 100 },
      { id: 'high.biology', name: '高中生物', score: 61, maxScore: 100 },
    ],
  },
  {
    title: '产品设计 6 课',
    stage: '大学' as const,
    courses: [
      { id: 'design.photoshop', name: 'Adobe Photoshop', score: 55 },
      { id: 'design.illustrator', name: 'Adobe Illustrator', assessment: 'mastery' },
      { id: 'cad.rhino', name: 'Rhino', score: 48 },
      { id: 'render.keyshot', name: 'KeyShot渲染', assessment: 'project', projectCompleted: false },
      { id: 'product.design-methods', name: '产品设计方法', score: 62 },
      { id: 'product.ergonomics', name: '人机工程学', score: 58 },
    ],
  },
  {
    title: '计算机 6 课',
    stage: '大学' as const,
    courses: [
      { id: 'programming.java', name: 'Java程序设计', score: 55 },
      { id: 'programming.python', name: 'Python程序设计', score: 62 },
      { id: 'cs.data-structures', name: '数据结构', score: 48 },
      { id: 'cs.operating-systems', name: '操作系统', score: 51 },
      { id: 'cs.computer-networks', name: '计算机网络', score: 53 },
      { id: 'database.principles', name: '数据库系统原理', score: 59 },
    ],
  },
]

for (const journey of globalJourneys) {
  test(`总课表旅程：${journey.title}全部进入同一草案并原子启用`, async ({ page }) => {
    await seedCourseBundle(page, journey.stage, journey.courses)
    await page.getByRole('button', { name: '生成全部课程计划' }).click()
    await expect(page.getByRole('heading', { name: '全部课程计划预览' })).toBeVisible()
    const draft = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').globalPlanDraft, STORAGE_KEY)
    expect(draft.courseIds).toHaveLength(journey.courses.length)
    expect(new Set(draft.tasks.map((task: { courseId: string }) => task.courseId)).size).toBe(journey.courses.length)
    const invalidTasks = draft.tasks.filter((task: { scheduleStatus: string; date: string; slotId: string }) => task.scheduleStatus !== 'scheduled' || !task.date || !task.slotId)
    const failedStage = invalidTasks[0]?.stageLabel
    const stageTasks = draft.tasks.filter((task: { stageLabel: string }) => task.stageLabel === failedStage).map((task: { title: string; courseId: string; date: string; slotId: string; estimatedMinutes: number; order: number; scheduleStatus: string }) => ({ title: task.title, courseId: task.courseId, date: task.date, slotId: task.slotId, estimatedMinutes: task.estimatedMinutes, order: task.order, scheduleStatus: task.scheduleStatus }))
    expect(draft.validation.valid, JSON.stringify({ reasons: draft.validation.reasons, invalidTasks, stageTasks }, null, 2)).toBe(true)
    await page.getByRole('button', { name: '确认并启用全部课程' }).click()
    await expect(page.getByText(/已一次性启用第/)).toBeVisible()
    const active = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), STORAGE_KEY)
    expect(new Set(active.tasks.map((task: { courseId: string }) => task.courseId)).size).toBe(journey.courses.length)
    expect(active.globalPlanDraft.status).toBe('activated')
    await page.reload()
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{}').globalPlanDraft?.status === 'activated', STORAGE_KEY)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
}

test('六个课程页面点击前后课程顺序稳定，更多与搜索不会因选中项折叠或重排', async ({ page }) => {
  const specs = ['高等数学', '大学英语', 'Python程序设计', '数据结构', '操作系统', '计算机网络', '数据库系统原理', 'Java程序设计'].map((name, index) => ({ id: `stable-${index}`, name, score: 50 + index }))
  await seedCourseBundle(page, '大学', specs)
  await page.getByRole('button', { name: '生成全部课程计划' }).click()
  await page.getByRole('button', { name: '确认并启用全部课程' }).click()
  const routes = ['/today', '/diagnosis', '/plan', '/resources', '/progress', '/weekly-review']
  for (const route of routes) {
    await page.goto(route)
    const more = page.getByRole('button', { name: /更多课程/ })
    await expect(more).toBeVisible()
    await more.click()
    const group = page.locator('.course-switcher')
    const before = await group.locator('button[aria-pressed]').allTextContents()
    await group.getByRole('button', { name: '计算机网络', exact: true }).click()
    const after = await group.locator('button[aria-pressed]').allTextContents()
    expect(after).toEqual(before)
    await expect(group.getByRole('button', { name: '计算机网络', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByPlaceholder('搜索课程…')).toBeVisible()
  }
})

test('现实变化：容量减少、关闭晚间和旅行调整只重排未完成任务，诊断与受保护任务保持', async ({ page }) => {
  const specs = [
    { id: 'math.calculus', name: '高等数学', score: 58 },
    { id: 'programming.python', name: 'Python程序设计', score: 62 },
    { id: 'cs.data-structures', name: '数据结构', score: 55 },
  ]
  await seedCourseBundle(page, '大学', specs, true)
  await page.getByRole('button', { name: '生成全部课程计划' }).click()
  await page.getByRole('button', { name: '确认并启用全部课程' }).click()
  const protectedState = await page.evaluate(key => {
    const data = JSON.parse(localStorage.getItem(key) || '{}')
    data.tasks[0].status = '已完成'
    data.tasks[1].status = '进行中'
    localStorage.setItem(key, JSON.stringify(data))
    return data.tasks.slice(0, 2).map((task: { id: string; date: string; status: string }) => ({ id: task.id, date: task.date, status: task.status }))
  }, STORAGE_KEY)
  await page.goto('/settings?section=time')
  await page.getByLabel('工作日每日分钟').fill('90')
  const eveningSwitches = page.locator('.slot-setting-row').filter({ hasText: '晚上' }).getByRole('switch')
  for (let index = 0; index < await eveningSwitches.count(); index += 1) if (await eveningSwitches.nth(index).getAttribute('aria-checked') === 'true') await eveningSwitches.nth(index).click()
  await page.goto('/plan')
  await page.getByRole('button', { name: /学习教练/ }).click()
  await page.getByLabel('告诉教练发生了什么').fill('我下周旅行 3 天')
  await page.getByRole('button', { name: '预览调整' }).click()
  await expect(page.getByText(/旅行重新安排/)).toBeVisible()
  await page.getByRole('button', { name: '确认应用' }).click()
  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), STORAGE_KEY)
  expect(Object.values(after.diagnoses).every((diagnosis: unknown) => (diagnosis as { status: string }).status === 'completed')).toBe(true)
  for (const protectedTask of protectedState) {
    const current = after.tasks.find((task: { id: string }) => task.id === protectedTask.id)
    expect(current.status).toBe(protectedTask.status)
    expect(current.date).toBe(protectedTask.date)
  }
  await page.getByRole('button', { name: /撤销：/ }).click()
  await expect(page.getByText(/已精准撤销这次教练调整/)).toBeVisible()
})

test('流程 A：高中用户不做诊断直接生成基线计划、执行、自检并应用周复盘', async ({ page }) => {
  await reset(page)
  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.goto('/')
  await page.getByRole('link', { name: /开始制定我的计划/ }).first().click()
  await addHighSchoolCourse(page)
  await finishHighSchoolOnboarding(page)
  await expect(page).toHaveURL(/\/today$/)
  await page.getByRole('button', { name: /开始任务/ }).click()
  await page.getByRole('button', { name: /记录完成/ }).click()
  await page.getByLabel('实际学习分钟').fill('32')
  await page.getByRole('button', { name: '保存记录' }).click()
  await expect(page.getByText(/今日快速自检/)).toBeVisible()
  const objectiveAnswer = page.locator('input[name^="daily-check-"]').first()
  if (await objectiveAnswer.count()) await objectiveAnswer.check()
  else await page.locator('.daily-check-panel textarea').fill('我独立完成了一个新例，写出步骤并检查了适用条件和结果。')
  await page.locator('input[name^="daily-confidence-"]').first().check()
  await page.getByRole('button', { name: '保存作答' }).click()
  await page.goto('/weekly-review')
  await page.getByLabel('这周哪项任务最有效？').fill('先完成具体基础题最有效')
  await page.getByLabel('哪项没有完成，主要原因是什么？').fill('其他任务过长')
  await page.getByLabel('下周最希望调整什么？').fill('把未完成任务拆短')
  await page.getByRole('button', { name: '保存本周复盘' }).click()
  const preview = page.getByRole('button', { name: '查看计划调整差异' })
  if (await preview.isEnabled()) {
    await preview.click()
    await page.getByRole('button', { name: '应用下周新计划' }).click()
    await page.getByRole('button', { name: '撤销调整' }).click()
  }
  expect(consoleErrors).toEqual([])
})

test('流程 B：大学产品设计用户打开真实资源并加入指定节次', async ({ page }) => {
  await reset(page)
  await page.goto('/onboarding')
  const detailedEntry = page.getByRole('button', { name: '使用详细录入' })
  await expect(detailedEntry).toBeVisible()
  await detailedEntry.click()
  await expect(page.getByRole('button', { name: '添加课程' })).toBeVisible()
  await page.getByRole('button', { name: '添加课程' }).click()
  await page.getByLabel('课程名称').fill('产品设计方法')
  await page.locator('select[name$="-stage"]').selectOption('大学')
  await page.locator('select[name$="-type"]:not([name$="-exam-type"])').selectOption('项目/作品课')
  await page.getByLabel('学校或培养单位').fill('示例大学')
  await page.locator('input[name$="-major"]').fill('产品设计')
  await page.getByLabel('学期').selectOption('上学期')
  await page.getByLabel('教材或课程目录名称').fill('产品设计程序与方法')
  await page.getByLabel('章节/模块目录').fill('设计与方法\n用户研究\n概念生成\n方案表达')
  await page.getByRole('button', { name: '作品/项目' }).click()
  await page.getByLabel('自评掌握程度').selectOption('一般')
  await page.getByLabel('已完成作品数量').fill('1')
  await page.getByLabel('主要卡点').fill('调研结论无法转化为设计机会点')
  await page.getByLabel('判断依据').fill('最近一次作业只有访谈记录，没有形成洞察和方案依据')
  await page.getByLabel('成果检查项').fill('研究证据完整、机会点清晰、方案可说明')
  await page.getByRole('button', { name: /保存并继续/ }).click()
  await page.getByRole('button', { name: '完成作品', exact: true }).click()
  await page.getByLabel('目标日期或考试日期').fill(futureDate(35))
  await page.getByLabel('希望达到的学习结果').fill('完成一套有研究证据的产品设计方案')
  await page.getByRole('button', { name: /保存并继续/ }).click()
  await page.getByRole('button', { name: /生成全部课程计划/ }).click()
  await expect(page).toHaveURL(/\/plan$/)
  await page.getByRole('button', { name: '确认并启用全部课程' }).click()
  await page.goto('/today')
  await page.goto('/resources')
  await expect(page.getByRole('heading', { name: /产品设计程序与方法|学设计 做产品/ }).first()).toBeVisible()
  await page.getByRole('button', { name: /原始来源/ }).first().click()
  const sourceLink = page.getByRole('link', { name: '继续打开' })
  await expect(sourceLink).toHaveAttribute('href', /^https:\/\/higher\.smartedu\.cn\/course\//)
  await page.context().route(/^https:\/\/higher\.smartedu\.cn\//, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>外部资源测试页</title>' }))
  const popupPromise = page.waitForEvent('popup')
  await sourceLink.click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(/^https:\/\/higher\.smartedu\.cn\//)
  await popup.close()
  await page.getByRole('button', { name: '加入计划' }).first().click()
  await page.getByLabel('章节 / 知识点').fill('用户研究')
  await page.getByLabel('指定日期').fill(futureDate(3))
  await page.getByLabel('具体节次').selectOption('evening-2')
  await page.getByLabel('观看后的练习 / 成果物').fill('整理 3 条访谈证据并写出 1 个机会点')
  await page.getByRole('button', { name: '加入计划', exact: true }).last().click()
  await expect(page.getByText(/资源任务已加入指定课程与节次/)).toBeVisible()
})

test('流程 C：歧义课程必须确认含义后才能继续', async ({ page }) => {
  await reset(page)
  await page.goto('/onboarding')
  const detailedEntry = page.getByRole('button', { name: '使用详细录入' })
  await expect(detailedEntry).toBeVisible()
  await detailedEntry.click()
  await expect(page.getByRole('button', { name: '添加课程' })).toBeVisible()
  await page.getByRole('button', { name: '添加课程' }).click()
  await page.getByLabel('课程名称').fill('AI')
  await page.locator('select[name$="-stage"]').selectOption('大学')
  await page.locator('select[name$="-type"]:not([name$="-exam-type"])').selectOption('专业核心课')
  await page.getByLabel('学校或培养单位').fill('示例大学')
  await page.locator('input[name$="-major"]').fill('计算机科学')
  await page.getByLabel('学期').selectOption('上学期')
  await page.getByLabel('教材或课程目录名称').fill('人工智能基础')
  await page.getByLabel('章节/模块目录').fill('Python 基础\n数据处理\n模型训练\n模型评估')
  await page.getByRole('button', { name: '人工智能（学科）' }).click()
  await page.getByRole('button', { name: '熟练程度' }).click()
  await page.getByLabel('自评掌握程度').selectOption('基础薄弱')
  await page.getByLabel('主要卡点').fill('不会解释模型评估指标')
  await page.getByLabel('判断依据').fill('只能运行示例代码，无法说明准确率和召回率差异')
  await page.getByRole('button', { name: /保存并继续/ }).click()
  await expect(page.getByRole('heading', { name: '把想达到的结果说具体。' })).toBeVisible()
})

test('流程 D：全部路由控件有名称，移动端无页面级横向溢出', async ({ page }) => {
  await seedCompleted(page)
  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  const routes = ['/today', '/diagnosis', '/plan', '/resources', '/progress', '/weekly-review', '/settings', '/privacy', '/terms']
  for (const route of routes) {
    await page.goto(route)
    await expect(page.locator('[data-page-title]')).toBeVisible()
    const unnamedButtons = await page.locator('button:visible').evaluateAll(buttons => buttons.filter(button => !(button.textContent?.trim() || button.getAttribute('aria-label') || button.getAttribute('title'))).length)
    expect(unnamedButtons, `${route} 存在无名称按钮`).toBe(0)
    const emptyLinks = await page.locator('a:visible').evaluateAll(links => links.filter(link => !link.getAttribute('href')).length)
    expect(emptyLinks, `${route} 存在空链接`).toBe(0)
  }
  for (const width of [320, 375, 390, 414, 768, 1024]) {
    await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 })
    for (const route of ['/today', '/diagnosis', '/plan', '/resources', '/progress', '/weekly-review', '/settings']) {
      await page.goto(route)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${route} 在 ${width}px 横向溢出`).toBeLessThanOrEqual(1)
    }
  }
  expect(consoleErrors).toEqual([])
})

test('流程 E：进展页无数据、单时间点和多时间点使用三种真实布局', async ({ page }) => {
  const course = createCourse({ id: 'trend-course', name: '高等数学', stage: '大学', goalType: '补弱' })
  const weekStart = mondayOfWeek()
  const states = ['empty', 'current', 'trend'] as const
  for (const state of states) {
    const data = initialData()
    data.onboardingCompleted = true
    data.courses = [course]
    if (state !== 'empty') data.tasks.push(createTask({ id: `${state}-current`, courseId: course.id, date: weekStart, originalPlannedDate: weekStart, status: '已完成' }))
    if (state === 'trend') data.tasks.push(createTask({ id: `${state}-previous`, courseId: course.id, date: addDays(weekStart, -7), originalPlannedDate: addDays(weekStart, -7), status: '已完成' }))
    await page.goto('/')
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEY, value: JSON.stringify(data) })
    await page.goto('/progress')
    await page.locator('.progress-course-table > button').first().click()
    await expect(page.locator(`[data-trend-state="${state}"]`)).toBeVisible()
    await expect(page.locator('.real-trend')).toHaveCount(state === 'trend' ? 1 : 0)
    const cardHeight = await page.locator('.course-trend-card').evaluate(element => element.getBoundingClientRect().height)
    expect(cardHeight, `${state} 状态不应由固定空图表撑高`).toBeLessThan(state === 'trend' ? 560 : 360)
  }
})

test('流程 F：周复盘显示完整差异，确认应用后可撤销且不移动已完成任务', async ({ page }) => {
  const data = initialData()
  const course = createCourse({ id: 'review-course', name: '高等数学', stage: '大学', goalType: '补弱' })
  const weekStart = mondayOfWeek()
  const slot = data.schedule.timeSlots[0]
  const completed = createTask({ id: 'review-completed', courseId: course.id, date: weekStart, originalPlannedDate: weekStart, slotId: slot.id, time: slot.start, title: '已完成任务', status: '已完成' })
  const skipped = createTask({ id: 'review-skipped', courseId: course.id, date: addDays(weekStart, 1), originalPlannedDate: addDays(weekStart, 1), slotId: slot.id, time: slot.start, title: '需要重排的任务', status: '已跳过', skipReason: '任务过长' })
  data.onboardingCompleted = true
  data.courses = [course]
  data.tasks = [completed, skipped]
  data.taskEvents = [recordTaskEvent(completed, 'completed', '完成', 30), recordTaskEvent(skipped, 'skipped', '任务过长', 0)]
  await page.goto('/')
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEY, value: JSON.stringify(data) })
  await page.goto('/weekly-review')
  await expect(page.getByRole('columnheader', { name: '资源影响' })).toBeVisible()
  await expect(page.getByText('需要重排的任务').last()).toBeVisible()
  await page.getByLabel('哪项没有完成，主要原因是什么？').fill('任务过长，连续两个节次后无法保持专注')
  await page.getByLabel('下周最希望调整什么？').fill('把未完成任务拆短并保留复习间隔')
  await page.getByRole('button', { name: '保存本周复盘' }).click()
  await page.getByRole('button', { name: '确认应用下周计划' }).click()
  await expect(page.getByRole('dialog', { name: '确认应用下周计划' })).toBeVisible()
  await page.getByRole('button', { name: '应用下周新计划' }).click()
  await expect(page.getByText(/下周调整已应用并保存版本/)).toBeVisible()
  await page.getByRole('button', { name: '撤销调整' }).click()
  await expect(page.getByText(/下周调整已撤销/)).toBeVisible()
  const restored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').tasks, STORAGE_KEY)
  expect(restored.find((task: { id: string; date: string }) => task.id === completed.id).date).toBe(completed.date)
  expect(restored.find((task: { id: string; date: string }) => task.id === skipped.id).date).toBe(skipped.date)
})

test('流程 G：首次规划后可添加、阻止重复、编辑、暂停、删除并撤销课程', async ({ page }) => {
  await seedCompleted(page)
  await page.goto('/today')
  const courseTabs = page.locator('.course-switcher').first()
  const before = await courseTabs.locator('button[aria-pressed]').allTextContents()

  await page.getByRole('button', { name: /添加课程/ }).first().click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('课程名称').fill('Python')
  await dialog.getByLabel('课程类型').selectOption('专业基础课')
  await dialog.getByLabel('专业', { exact: true }).fill('计算机科学与技术')
  await dialog.getByLabel('本次得分').fill('72')
  await dialog.getByLabel('试卷满分').fill('100')
  await dialog.getByLabel('及格线').fill('60')
  await dialog.getByLabel('考试类型').selectOption('期末考试')
  await dialog.getByLabel('自评掌握程度').selectOption('一般')
  await dialog.getByRole('button', { name: '技能提升', exact: true }).click()
  await dialog.getByLabel('目标分数').fill('82')
  await dialog.getByLabel('目标日期').fill(futureDate(35))
  await dialog.getByLabel('希望达到的结果').fill('独立完成函数、调试和基础测试任务')
  await dialog.getByRole('button', { name: '预览课表变化' }).click()
  await expect(dialog.getByText(/加入课程后课表变化/)).toBeVisible()
  await dialog.getByRole('button', { name: '确认加入课程' }).click()
  await expect(page.getByText('已加入“Python”。新课表仍需在学习计划页确认启用。', { exact: true })).toBeVisible()
  const after = await courseTabs.locator('button[aria-pressed]').allTextContents()
  expect(after.slice(0, before.length)).toEqual(before)
  expect(after.at(-1)).toContain('Python')

  await page.getByRole('button', { name: /添加课程/ }).first().click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('课程名称').fill('Python程序设计')
  await dialog.getByRole('button', { name: '预览课表变化' }).click()
  await expect(dialog.getByText(/已经在课程列表中/)).toBeVisible()
  await dialog.getByRole('button', { name: '关闭' }).click()

  const persistedNames = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').courses.map((item: { name: string }) => item.name), STORAGE_KEY)
  expect(persistedNames).toContain('Python')
  await page.goto('/settings?section=courses')
  await page.getByLabel('编辑课程').selectOption({ label: 'Python' })
  await page.getByRole('button', { name: '编辑课程事实' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('本次得分').fill('76')
  await dialog.getByRole('button', { name: '预览计划变化' }).click()
  await expect(dialog.getByText(/课程修改后的课表变化/)).toBeVisible()
  await dialog.getByRole('button', { name: '确认保存' }).click()
  await expect(page.getByText('课程修改已保存，新总课表草案需确认后才会替换当前计划。', { exact: true })).toBeVisible()

  const pythonRow = page.locator('.setting-row').filter({ hasText: 'Python' })
  await pythonRow.getByRole('button', { name: '暂停' }).click()
  await expect(pythonRow.getByText(/已暂停于/)).toBeVisible()
  await pythonRow.getByRole('button', { name: '恢复' }).click()
  await pythonRow.getByRole('button', { name: '删除' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/确定删除「Python」吗/)).toBeVisible()
  await dialog.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByText('课程和当前任务已删除，可用“撤销最近课程变更”恢复。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /撤销最近课程变更/ }).first().click()
  await expect(page.locator('.setting-row').filter({ hasText: 'Python' })).toBeVisible()
})
