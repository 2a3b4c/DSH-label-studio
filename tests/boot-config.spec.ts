import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { injectLabelStudioBootConfig } from '../src/boot-config.ts'
import { resolveConfig } from '../src/config.ts'

function readBootConfig(html: string): Record<string, unknown> {
  const source = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1]
  if (source === undefined) throw new Error('Label Studio boot script missing')
  const window: Record<string, unknown> = {}
  runInNewContext(source, { window })
  const value = window.__DSH_LABEL_STUDIO__
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Label Studio boot config must be an object')
  }
  return value as Record<string, unknown>
}

describe('Label Studio browser boot config', () => {
  it('projects only the validated loopback endpoint before the application body', () => {
    const config = resolveConfig({
      baseUrl: 'http://localhost:9090/',
      refreshTokenCredential: 'TRAINING_LABEL_STUDIO_PAT',
      restResponseMaxBytes: 16_384,
    })
    const html = injectLabelStudioBootConfig(
      '<html><body><div id="root"></div><script type="module"></script></body></html>',
      {
        baseUrl: config.baseUrl,
        contextOpenRetryMs: config.contextOpenRetryMs,
        contextCloseTimeoutMs: config.contextCloseTimeoutMs,
        eventHistorySize: config.eventHistorySize,
      },
    )
    expect(html.indexOf('__DSH_LABEL_STUDIO__')).toBeLessThan(html.indexOf('<div id="root">'))
    expect(readBootConfig(html)).toEqual({
      baseUrl: 'http://localhost:9090',
      contextOpenRetryMs: 1000,
      contextCloseTimeoutMs: 1000,
      eventHistorySize: 64,
    })
    expect(html).not.toContain('TRAINING_LABEL_STUDIO_PAT')
    expect(html).not.toContain('restResponseMaxBytes')
  })

  it('cannot obtain a non-loopback endpoint from configuration resolution', () => {
    expect(() => resolveConfig({ baseUrl: 'https://label-studio.example.com' }))
      .toThrow('loopback HTTP')
  })

  it('escapes HTML-significant endpoint text defensively', () => {
    const html = injectLabelStudioBootConfig('<main />', {
      baseUrl: 'http://localhost:8080/<script>', contextOpenRetryMs: 1, contextCloseTimeoutMs: 1, eventHistorySize: 1,
    })
    expect(html).not.toContain('localhost:8080/<script>')
    expect(html).toContain('localhost:8080/\\u003cscript>')
  })
})
