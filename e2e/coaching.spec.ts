import { expect, test } from '@playwright/test'
import { addDays, createCourse, createTask, initialData, STORAGE_KEY, todayISO } from '../src/data.ts'

test('1 对 1 辅导：申请、确认、完成并生成跟进任务', async ({ page }) => {
  const data = initialData()
  const course = createCourse({ id: 'coaching-math', name: '高等数学', canonicalId: 'math.calculus', canonicalName: '高等数学', subjectDomain: '数学与统计', stage: '大学', stageStatus: 'confirmed', courseType: '公共基础课', assessmentMode: 'score', score: 58, maxScore: 100, passScore: 60, examType: '期末考试', mastery: '基础薄弱', mainDifficulty: '导数题无法独立完成', selfEvidence: '最近一次练习需要反复看例题', goalType: '补弱', targetScore: 75, targetDate: addDays(todayISO(), 30), desiredResult: '独立完成导数基础题' })
  data.onboardingCompleted = true
  data.courses = [course]
  data.tasks = [createTask({ id: 'coaching-task', courseId: course.id, title: '高等数学 · 导数与微分 · 分层练习', knowledgePoint: '导数与微分', status: '进行中', difficulty: '进阶', action: '完成 5 道导数基础题并标出关键步骤', completionCriteria: '完成 5 道题并记录一个错因' })]
  await page.goto('/')
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEY, value: JSON.stringify(data) })
  await page.goto('/coaching')

  await page.locator('.mentor-slots button').first().click()
  const dialog = page.getByRole('dialog', { name: '申请一次有目标的辅导' })
  await dialog.getByLabel('我现在具体卡在哪里').fill('我会套公式，但不知道导数题第一步应该检查什么。')
  await dialog.getByLabel('这次辅导结束时，我希望能够').fill('独立完成 3 道同类题，并能说出检查步骤。')
  await dialog.getByRole('button', { name: '提交辅导申请' }).click()
  await expect(page.getByText('等待导师确认', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '模拟导师确认' }).click()
  await page.getByRole('button', { name: '进入辅导工作区' }).click()
  await page.getByLabel('导师确认的结论与下一步').fill('先练习写出定义域，再完成三道同类题；每题结束检查定义域和符号。')
  await page.getByRole('button', { name: '完成会话并生成跟进任务' }).click()
  await expect(page.getByText('已完成', { exact: true })).toBeVisible()
  await expect(page.getByText(/跟进任务已进入任务池/)).toBeVisible()
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), STORAGE_KEY)
  expect(stored.coachingRequests[0].status).toBe('completed')
  expect(stored.tasks.some((task: { title: string }) => task.title.includes('辅导后跟进'))).toBe(true)
})
