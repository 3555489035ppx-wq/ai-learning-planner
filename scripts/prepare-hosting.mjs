import { mkdir, writeFile } from 'node:fs/promises'

const worker = `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404 || request.method !== 'GET') return response

    const accept = request.headers.get('accept') || ''
    if (!accept.includes('text/html')) return response

    const fallbackUrl = new URL('/', request.url)
    return env.ASSETS.fetch(new Request(fallbackUrl, request))
  },
}
`

await mkdir(new URL('../dist/server/', import.meta.url), { recursive: true })
await writeFile(new URL('../dist/server/index.js', import.meta.url), worker, 'utf8')
