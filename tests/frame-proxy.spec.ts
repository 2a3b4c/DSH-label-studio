import { once } from 'node:events'
import { createServer, request as httpRequest, type IncomingHttpHeaders, type Server } from 'node:http'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LABEL_STUDIO_FRAME_BRIDGE_PATH,
  LabelStudioFrameProxy,
} from '../src/frame-proxy.ts'

const servers: Server[] = []
const proxies: LabelStudioFrameProxy[] = []

afterEach(async () => {
  await Promise.all(proxies.splice(0).map(proxy => proxy.close()))
  await Promise.all(servers.splice(0).map(server => closeServer(server)))
})

async function listen(handler: Parameters<typeof createServer>[0]): Promise<{ server: Server; origin: string }> {
  const server = createServer(handler)
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing server address')
  return { server, origin: `http://127.0.0.1:${String(address.port)}` }
}

async function start(upstreamBaseUrl: string, htmlMaxBytes = 64): Promise<{
  proxy: LabelStudioFrameProxy
  baseUrl: string
  origin: string
}> {
  const proxy = new LabelStudioFrameProxy({
    upstreamBaseUrl,
    inspectionProtocol: 'dsh-label-studio-page/v1',
    htmlMaxBytes,
  })
  proxies.push(proxy)
  return { proxy, ...await proxy.start() }
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return
  server.closeAllConnections?.()
  await new Promise<void>((resolve, reject) => {
    server.close(error => { if (error === undefined) resolve(); else reject(error) })
  })
}

function rawRequest(
  origin: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Buffer; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const url = new URL(origin)
    const request = httpRequest({ hostname: url.hostname, port: url.port, path, headers }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.once('end', () => resolve({
        status: response.statusCode ?? 0, body: Buffer.concat(chunks), headers: response.headers,
      }))
    })
    request.once('error', reject)
    request.end()
  })
}

describe('LabelStudioFrameProxy', () => {
  it('binds a random loopback origin, injects HTML, preserves CSP, and serves the bridge script', async () => {
    const upstream = await listen((_request, response) => {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'self'; script-src 'self'",
      })
      response.end('<html><body>Label Studio</body></html>')
    })
    const proxy = await start(upstream.origin, 1024)
    expect(new URL(proxy.baseUrl).hostname).toBe('127.0.0.1')
    expect(proxy.origin).toBe(new URL(proxy.baseUrl).origin)
    expect(proxy.origin).not.toBe(upstream.origin)
    expect(proxy.capability).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const second = await start(upstream.origin, 1024)
    expect(second.origin).not.toBe(proxy.origin)

    const html = await fetch(proxy.baseUrl)
    expect(await html.text()).toContain(`<script src="${LABEL_STUDIO_FRAME_BRIDGE_PATH}"></script>`)
    expect(html.headers.get('content-security-policy')).toBe("default-src 'self'; script-src 'self'")
    expect(html.headers.get('content-encoding')).toBeNull()
    expect(html.headers.get('content-length')).not.toBe('38')

    const script = await fetch(`${proxy.origin}${LABEL_STUDIO_FRAME_BRIDGE_PATH}`)
    expect(script.headers.get('content-type')).toContain('javascript')
    expect(await script.text()).toContain("addEventListener('message'")
  })

  it('supports Brotli HTML, preserves cookies, and bounds only decoded HTML', async () => {
    const exact = '<html><body>x</body></html>'
    const upstream = await listen((request, response) => {
      if (request.url === '/br') {
        const body = brotliCompressSync(exact)
        response.writeHead(200, {
          'content-type': 'text/html', 'content-encoding': 'br',
          'set-cookie': ['csrftoken=one; Path=/', 'sessionid=two; Path=/'],
        })
        response.end(body)
        return
      }
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(`${exact}!`)
    })
    const proxy = await start(upstream.origin, Buffer.byteLength(exact))
    const accepted = await rawRequest(proxy.origin, '/br')
    expect(accepted.status).toBe(200)
    expect(accepted.body.toString()).toContain(LABEL_STUDIO_FRAME_BRIDGE_PATH)
    expect(accepted.headers['set-cookie']).toEqual([
      'csrftoken=one; Path=/', 'sessionid=two; Path=/',
    ])
    expect((await rawRequest(proxy.origin, '/too-large')).status).toBe(502)
  })

  it('rejects a forged proxy authority before contacting the upstream', async () => {
    const hit = vi.fn()
    const upstream = await listen((_request, response) => { hit(); response.end('unexpected') })
    const proxy = await start(upstream.origin)
    const rejected = await rawRequest(proxy.origin, '/', { host: 'evil.example' })
    expect(rejected.status).toBe(400)
    expect(hit).not.toHaveBeenCalled()
  })

  it('streams the first upload and response chunks before either producer ends', async () => {
    const uploadChunk = Promise.withResolvers<void>()
    const releaseResponse = Promise.withResolvers<void>()
    const upstream = await listen((request, response) => {
      request.once('data', () => { uploadChunk.resolve() })
      request.once('end', () => {
        response.writeHead(200, { 'content-type': 'video/mp4' })
        response.write('first')
        void releaseResponse.promise.then(() => { response.end('second') })
      })
    })
    const proxy = await start(upstream.origin, 1)
    const url = new URL(proxy.origin)
    const completed = Promise.withResolvers<string>()
    const firstResponseChunk = Promise.withResolvers<void>()
    const request = httpRequest({
      hostname: url.hostname, port: url.port, path: '/stream', method: 'POST',
    }, (response) => {
      let body = ''
      response.on('data', chunk => { body += String(chunk); firstResponseChunk.resolve() })
      response.once('end', () => { completed.resolve(body) })
    })
    request.write('upload-first')
    await uploadChunk.promise
    request.end('upload-second')
    await firstResponseChunk.promise
    releaseResponse.resolve()
    await expect(completed.promise).resolves.toBe('firstsecond')
  })

  it('decodes compressed HTML and rewrites only configured-origin headers and redirects', async () => {
    const observed: Array<{ origin?: string; referer?: string; cookie?: string }> = []
    let upstreamOrigin = ''
    const upstream = await listen((request, response) => {
      observed.push({
        ...(request.headers.origin === undefined ? {} : { origin: request.headers.origin }),
        ...(request.headers.referer === undefined ? {} : { referer: request.headers.referer }),
        ...(request.headers.cookie === undefined ? {} : { cookie: request.headers.cookie }),
      })
      if (request.url === '/redirect') {
        response.writeHead(302, { location: `${upstreamOrigin}/projects/7/data?task=11` })
        response.end()
        return
      }
      const body = gzipSync('<html><body>compressed Label Studio</body></html>')
      response.writeHead(200, {
        'content-type': 'text/html', 'content-encoding': 'gzip', 'content-length': String(body.length),
      })
      response.end(body)
    })
    upstreamOrigin = upstream.origin
    const proxy = await start(upstream.origin, 1024)
    const html = await fetch(`${proxy.origin}/`, {
      headers: { origin: proxy.origin, referer: `${proxy.origin}/projects`, cookie: 'csrftoken=value' },
    })
    expect(await html.text()).toContain(LABEL_STUDIO_FRAME_BRIDGE_PATH)
    expect(html.headers.get('content-encoding')).toBeNull()
    expect(observed[0]).toEqual({
      origin: upstream.origin, referer: `${upstream.origin}/projects`, cookie: 'csrftoken=value',
    })
    const redirect = await fetch(`${proxy.origin}/redirect`, { redirect: 'manual' })
    expect(redirect.headers.get('location')).toBe(`${proxy.origin}/projects/7/data?task=11`)
  })

  it('streams uploads and oversized media without applying the HTML buffer limit', async () => {
    const body = Buffer.alloc(256 * 1024, 7)
    const received = Promise.withResolvers<number>()
    const upstream = await listen((request, response) => {
      if (request.method === 'POST') {
        let size = 0
        request.on('data', chunk => { size += Buffer.byteLength(chunk) })
        request.once('end', () => { received.resolve(size); response.end('uploaded') })
        return
      }
      response.writeHead(200, { 'content-type': 'image/png', 'content-length': String(body.length) })
      response.end(body)
    })
    const proxy = await start(upstream.origin, 32)
    const upload = await fetch(`${proxy.origin}/upload`, { method: 'POST', body })
    expect(await upload.text()).toBe('uploaded')
    await expect(received.promise).resolves.toBe(body.length)
    const media = await fetch(`${proxy.origin}/large.png`)
    expect(Buffer.from(await media.arrayBuffer())).toEqual(body)
  })

  it('never follows an absolute request target and closes active traffic to quiescence', async () => {
    const foreignHit = vi.fn()
    const foreign = await listen((_request, response) => { foreignHit(); response.end('foreign') })
    const upstreamPath = Promise.withResolvers<string>()
    const slowStarted = Promise.withResolvers<void>()
    const upstream = await listen((request, response) => {
      upstreamPath.resolve(request.url ?? '')
      if (request.url === '/slow') {
        slowStarted.resolve()
        return
      }
      response.end('upstream')
    })
    const proxy = await start(upstream.origin)
    const escaped = await rawRequest(proxy.origin, `${foreign.origin}/escape?x=1`)
    expect(escaped.body.toString()).toBe('upstream')
    await expect(upstreamPath.promise).resolves.toBe('/escape?x=1')
    expect(foreignHit).not.toHaveBeenCalled()

    const pending = fetch(`${proxy.origin}/slow`).catch(error => error)
    await slowStarted.promise
    await proxy.proxy.close()
    await proxy.proxy.close()
    await expect(pending).resolves.toBeInstanceOf(Error)
    await expect(fetch(`${proxy.origin}/after-close`)).rejects.toThrow()
  })
})
