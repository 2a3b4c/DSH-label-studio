/** Authenticated bounded HTTP ingress for Label Studio Webhooks. */

import { createHash, timingSafeEqual } from 'node:crypto'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { LabelStudioWebhookBindingCoordinator } from './webhook-binding.ts'
import { parseLabelStudioWebhook } from './webhook-payload.ts'

/** HTTP route limits and in-memory authentication value. */
export interface LabelStudioWebhookIngressOptions {
  readonly path: string
  readonly maxBodyBytes: number
  readonly secret: Uint8Array
}

/** Convert secret bytes to the exact opaque header value installed in Label Studio. */
export function encodeWebhookSecret(secret: Uint8Array): string {
  return Buffer.from(secret).toString('base64url')
}

/**
 * Create an exact-route handler that authenticates before parsing or synchronizing an event.
 * @param coordinator - durable binding synchronization owner.
 * @param options - request limit, route path, and ephemeral secret.
 * @returns Node HTTP handler owning every response.
 */
export function createLabelStudioWebhookHandler(
  coordinator: LabelStudioWebhookBindingCoordinator,
  options: LabelStudioWebhookIngressOptions,
): WebRoute['handler'] {
  const expected = digest(encodeWebhookSecret(options.secret))
  return async (req, res) => {
    if (req.method !== 'POST') return finish(res, 405)
    const mediaType = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
    if (mediaType !== 'application/json') return finish(res, 415)
    if (!authenticated(req.headers['x-dsh-label-studio-webhook'], expected)) return finish(res, 401)
    const declared = req.headers['content-length']
    if (declared !== undefined && (!/^\d+$/.test(declared) || BigInt(declared) > BigInt(options.maxBodyBytes))) {
      req.resume()
      return finish(res, 413)
    }
    let bytes: Uint8Array
    try {
      bytes = await readBounded(req, options.maxBodyBytes)
    } catch {
      return finish(res, 413)
    }
    let input: unknown
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      input = JSON.parse(text)
      await coordinator.accept(parseLabelStudioWebhook(input))
    } catch (error) {
      const status = input === undefined || isPayloadError(error) ? 400 : 503
      return finish(res, status)
    }
    finish(res, 204)
  }
}

function authenticated(value: string | string[] | undefined, expected: Buffer): boolean {
  const received = digest(typeof value === 'string' ? value : '')
  return timingSafeEqual(received, expected) && typeof value === 'string'
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

async function readBounded(stream: AsyncIterable<Buffer | string>, maxBytes: number): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of stream) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk)
    total += bytes.byteLength
    if (total > maxBytes) throw new Error('too large')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks, total)
}

function isPayloadError(error: unknown): boolean {
  return error instanceof SyntaxError
    || error instanceof TypeError
    || (error instanceof Error && error.message === 'label-studio: invalid webhook payload')
}

function finish(res: Parameters<WebRoute['handler']>[1], status: number): void {
  res.statusCode = status
  res.setHeader('Content-Length', '0')
  res.end()
}
