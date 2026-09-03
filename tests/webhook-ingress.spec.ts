import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { createLabelStudioWebhookHandler, encodeWebhookSecret } from '../src/webhook-ingress.ts'
import { LABEL_STUDIO_1_22_WEBHOOKS } from './fixtures/label-studio-1.22-webhooks.ts'

function request(body: Uint8Array | string, options: { method?: string; contentType?: string; secret?: string; length?: string } = {}): IncomingMessage {
  const stream = Readable.from([typeof body === 'string' ? Buffer.from(body) : Buffer.from(body)])
  return Object.assign(stream, {
    method: options.method ?? 'POST',
    headers: {
      'content-type': options.contentType ?? 'application/json',
      ...(options.secret === undefined ? {} : { 'x-dsh-label-studio-webhook': options.secret }),
      ...(options.length === undefined ? {} : { 'content-length': options.length }),
    },
  }) as IncomingMessage
}

function response() {
  const headers = new Map<string, string>()
  const state = { statusCode: 200, body: '' }
  const res = {
    get statusCode() { return state.statusCode },
    set statusCode(value: number) { state.statusCode = value },
    setHeader: (name: string, value: string | number | readonly string[]) => { headers.set(name.toLowerCase(), String(value)) },
    end: (body?: string) => { state.body = body ?? '' },
  } as unknown as ServerResponse
  return { res, state, headers }
}

describe('createLabelStudioWebhookHandler', () => {
  const secret = new Uint8Array([1, 2, 3, 4])
  const header = encodeWebhookSecret(secret)

  it('awaits durable coordination and returns 204 for an authenticated event', async () => {
    const landing = Promise.withResolvers<void>()
    const accept = vi.fn(async () => landing.promise)
    const handler = createLabelStudioWebhookHandler({ accept } as never, { path: '/hook', maxBodyBytes: 4_096, secret })
    const output = response()
    const pending = handler(request(JSON.stringify(LABEL_STUDIO_1_22_WEBHOOKS.tasksCreated), { secret: header }), output.res)
    await Promise.resolve()
    expect(output.state.statusCode).toBe(200)
    landing.resolve()
    await pending
    expect(output.state).toEqual({ statusCode: 204, body: '' })
  })

  it.each([
    { expected: 405, options: { method: 'GET', secret: header }, body: '{}' },
    { expected: 415, options: { contentType: 'text/plain', secret: header }, body: '{}' },
    { expected: 401, options: {}, body: '{}' },
    { expected: 413, options: { length: '99', secret: header }, body: '{}' },
    { expected: 400, options: { secret: header }, body: '{' },
  ])('returns fixed status $expected for invalid requests', async ({ expected, options, body }) => {
    const handler = createLabelStudioWebhookHandler({ accept: vi.fn() } as never, { path: '/hook', maxBodyBytes: 8, secret })
    const output = response()
    await handler(request(body, options), output.res)
    expect(output.state).toEqual({ statusCode: expected, body: '' })
  })

  it('rejects actual overflow and malformed UTF-8', async () => {
    const handler = createLabelStudioWebhookHandler({ accept: vi.fn() } as never, { path: '/hook', maxBodyBytes: 4, secret })
    for (const body of ['12345', new Uint8Array([0xc3, 0x28])]) {
      const output = response()
      await handler(request(body, { secret: header }), output.res)
      expect(output.state.statusCode).toBe(body === '12345' ? 413 : 400)
    }
  })

  it('maps coordinator shutdown or storage failure to 503', async () => {
    const handler = createLabelStudioWebhookHandler({ accept: vi.fn().mockRejectedValue(new Error('closing')) } as never, { path: '/hook', maxBodyBytes: 100, secret })
    const output = response()
    await handler(request(JSON.stringify(LABEL_STUDIO_1_22_WEBHOOKS.projectDeleted), { secret: header }), output.res)
    expect(output.state.statusCode).toBe(503)
  })
})
