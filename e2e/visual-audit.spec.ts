import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { STORAGE_KEY } from '../src/data.ts'

const workspace = process.cwd()
const seed = execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/create-portfolio-seed.mjs', 'high-school-recovery'], { cwd: workspace, encoding: 'utf8' })
const desktopRoutes = [
  ['landing', '/'], ['onboarding', '/onboarding'], ['diagnosis', '/diagnosis'], ['plan', '/plan'], ['today', '/today'], ['coaching', '/coaching'], ['resources', '/resources'], ['progress', '/progress'], ['weekly-review', '/weekly-review'], ['settings', '/settings'],
] as const
const mobileRoutes = [
  ['landing', '/'], ['today', '/today'], ['diagnosis', '/diagnosis'], ['plan', '/plan'], ['coaching', '/coaching'], ['weekly-review', '/weekly-review'], ['settings', '/settings'],
] as const

test('作品集视觉回归：核心路由在桌面和移动端无控制台错误或页面级横向溢出', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(`${page.url()} :: ${message.text()}`) })
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEY, value: seed })

  await page.setViewportSize({ width: 1440, height: 900 })
  for (const [name, route] of desktopRoutes) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForTimeout(180)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${name} desktop overflow`).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(workspace, 'docs', 'screenshots', 'after', `${name}-1440x900.png`), fullPage: false })
  }

  await page.goto('/today')
  await page.getByRole('button', { name: '查看恢复选项' }).click()
  await expect(page.getByRole('dialog', { name: '恢复学习计划' })).toBeVisible()
  await page.screenshot({ path: path.join(workspace, 'docs', 'screenshots', 'after', 'plan-recovery-1440x900.png'), fullPage: false })

  await page.setViewportSize({ width: 390, height: 844 })
  for (const [name, route] of mobileRoutes) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForTimeout(180)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${name} mobile overflow`).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(workspace, 'docs', 'screenshots', 'after', `${name}-390x844.png`), fullPage: false })
  }
  expect(consoleErrors).toEqual([])
})
