import { spawn } from 'node:child_process'

const port = '4174'
const baseURL = `http://127.0.0.1:${port}`
const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit', ...options })
  child.once('error', reject)
  child.once('exit', code => resolve(code ?? 1))
})

const vite = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port], { stdio: 'ignore' })
const stop = () => { if (!vite.killed) vite.kill() }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

try {
  const deadline = Date.now() + 30_000
  let ready = false
  while (!ready && Date.now() < deadline) {
    try { ready = (await fetch(baseURL)).ok } catch { await new Promise(resolve => setTimeout(resolve, 250)) }
  }
  if (!ready) throw new Error('Vite 未能在 30 秒内启动 E2E 服务。')
  const code = await run(process.execPath, ['./node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { env: { ...process.env, PW_EXTERNAL_SERVER: '1' } })
  process.exitCode = code
} finally {
  stop()
}
