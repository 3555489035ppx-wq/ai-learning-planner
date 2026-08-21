import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { STORAGE_KEY } from '../src/data.ts'

const workspace = process.cwd()
const portfolioSeed = (scenario: string) => execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/create-portfolio-seed.mjs', scenario], { cwd: workspace, encoding: 'utf8' })

async function loadScenario(page: Page, scenario: string, route: string) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEY, value: portfolioSeed(scenario) })
  await page.goto(route)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

test('作品集旅程 A：低分高中数学先显示低置信度诊断，再展示恢复入口', async ({ page }) => {
  await loadScenario(page, 'high-school-recovery', '/diagnosis')
  await expect(page.getByText('当前诊断置信度')).toBeVisible()
  await expect(page.getByText('低', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: '高中数学基础诊断' })).toBeVisible()

  await page.goto('/today')
  await expect(page.getByText(/检测到计划需要恢复/)).toBeVisible()
  await page.getByRole('button', { name: '查看恢复选项' }).click()
  await expect(page.getByRole('dialog', { name: '恢复学习计划' })).toBeVisible()
  await expect(page.getByText(/预计影响/).first()).toBeVisible()
})

test('作品集旅程 B：产品设计课程不会串入数学或编程内容', async ({ page }) => {
  await loadScenario(page, 'product-design-isolation', '/plan')
  const text = await page.locator('main').innerText()
  expect(text).toContain('Photoshop')
  expect(text).toContain('Illustrator')
  expect(text).toContain('Rhino')
  expect(text).not.toMatch(/高等数学|一元二次|Python|数据结构/)
})

test('作品集旅程 C：计算机课程保持各自课程上下文', async ({ page }) => {
  await loadScenario(page, 'computer-science-isolation', '/plan')
  const text = await page.locator('main').innerText()
  expect(text).toContain('Python')
  expect(text).toContain('数据结构')
  expect(text).toContain('高等数学')
  expect(text).not.toMatch(/Photoshop|Illustrator|Rhino/)
})

test('作品集 Demo：无需填写即可进入高二六科诊断、30 天计划和辅导建议', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(key => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await page.getByRole('button', { name: '体验高中生 Demo' }).first().click()
  await expect(page.getByRole('heading', { name: '先看清每门课的起点，再安排 30 天' })).toBeVisible()
  await expect(page.getByRole('button', { name: '高中数学' })).toBeVisible()
  await page.getByRole('link', { name: '30 天学习计划' }).click()
  await expect(page.getByRole('heading', { name: '六门课程，每天都有推进' })).toBeVisible()
  await page.getByRole('link', { name: '查看一对一辅导建议' }).click()
  await expect(page.getByRole('heading', { name: '只推荐与当前薄弱点相关的辅导' })).toBeVisible()
  await expect(page.getByText('数学专项辅导')).toBeVisible()
  await expect(page.getByText('物理专项辅导')).toBeVisible()
})
