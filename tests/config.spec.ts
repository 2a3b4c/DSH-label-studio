import { describe, expect, it } from 'vitest'
import {
  Config,
  DEFAULT_ACTIVE_TASK_MAX_BYTES,
  DEFAULT_CONTEXT_LEASE_TTL_MS,
  DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS,
  DEFAULT_CONTEXT_OPEN_RETRY_MS,
  DEFAULT_EVENT_HISTORY_SIZE,
  DEFAULT_EVENT_WAIT_TIMEOUT_MS,
  DEFAULT_FOCUS_ACK_TIMEOUT_MS,
  DEFAULT_LABEL_STUDIO_BASE_URL,
  DEFAULT_LABEL_STUDIO_LAUNCH_MODE,
  DEFAULT_PYTHON_EXECUTABLE,
  DEFAULT_RECENT_PROJECT_LIMIT,
  DEFAULT_REFRESH_TOKEN_CREDENTIAL,
  DEFAULT_REST_RESPONSE_MAX_BYTES,
  resolveConfig,
} from '../src/config.ts'

describe('resolveConfig', () => {
  it('resolves the global Python launcher and credential-reference defaults', () => {
    expect(resolveConfig({})).toEqual({
      activeTaskMaxBytes: DEFAULT_ACTIVE_TASK_MAX_BYTES,
      baseUrl: DEFAULT_LABEL_STUDIO_BASE_URL,
      contextLeaseTtlMs: DEFAULT_CONTEXT_LEASE_TTL_MS,
      contextCloseTimeoutMs: DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS,
      contextOpenRetryMs: DEFAULT_CONTEXT_OPEN_RETRY_MS,
      eventHistorySize: DEFAULT_EVENT_HISTORY_SIZE,
      eventWaitTimeoutMs: DEFAULT_EVENT_WAIT_TIMEOUT_MS,
      focusAckTimeoutMs: DEFAULT_FOCUS_ACK_TIMEOUT_MS,
      launchMode: DEFAULT_LABEL_STUDIO_LAUNCH_MODE,
      pythonExecutable: DEFAULT_PYTHON_EXECUTABLE,
      recentProjectLimit: DEFAULT_RECENT_PROJECT_LIMIT,
      refreshTokenCredential: DEFAULT_REFRESH_TOKEN_CREDENTIAL,
      restResponseMaxBytes: DEFAULT_REST_RESPONSE_MAX_BYTES,
      shutdownGraceMs: 5_000,
      startupTimeoutMs: 120_000,
    })
  })

  it('accepts an explicit Python executable and external launch mode', () => {
    expect(resolveConfig({
      launchMode: 'python',
      pythonExecutable: 'C:\\Python313\\python.exe',
    })).toMatchObject({
      launchMode: 'python',
      pythonExecutable: 'C:\\Python313\\python.exe',
    })
    expect(resolveConfig({ launchMode: 'external' })).toMatchObject({ launchMode: 'external' })
  })

  it.each(['condaExecutable', 'condaEnvironment', 'labelStudioExecutable'])(
    'rejects removed launcher field %s',
    (field) => {
      const normalized = Config({ [field]: 'legacy' })
      expect(() => resolveConfig(normalized)).toThrow(field)
    },
  )

  it('rejects the removed autoStart field instead of silently ignoring it', () => {
    const normalized = Config({ autoStart: false } as never)
    expect(() => resolveConfig(normalized)).toThrow('autoStart')
  })

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an unsafe active-task output limit: %s',
    (activeTaskMaxBytes) => {
      expect(() => resolveConfig({ activeTaskMaxBytes }))
        .toThrow('activeTaskMaxBytes')
    },
  )

  it('validates browser open retry and best-effort close limits', () => {
    expect(resolveConfig({ contextOpenRetryMs: 17, contextCloseTimeoutMs: 23 }))
      .toMatchObject({ contextOpenRetryMs: 17, contextCloseTimeoutMs: 23 })
    for (const field of ['contextOpenRetryMs', 'contextCloseTimeoutMs'] as const) {
      expect(() => resolveConfig({ [field]: 0 })).toThrow(field)
      expect(() => resolveConfig({ [field]: 1.5 })).toThrow(field)
    }
  })

  it('requires event waits to finish before the browser lease expires', () => {
    expect(() => resolveConfig({ contextLeaseTtlMs: 10, eventWaitTimeoutMs: 10 }))
      .toThrow('eventWaitTimeoutMs')
    expect(resolveConfig({ contextLeaseTtlMs: 10, eventWaitTimeoutMs: 9, eventHistorySize: 1 }))
      .toMatchObject({ contextLeaseTtlMs: 10, eventWaitTimeoutMs: 9, eventHistorySize: 1 })
  })

  it('accepts only a safe recent-project limit from 1 through 100', () => {
    expect(resolveConfig({ recentProjectLimit: 1 }).recentProjectLimit).toBe(1)
    expect(resolveConfig({ recentProjectLimit: 100 }).recentProjectLimit).toBe(100)
    for (const recentProjectLimit of [0, 1.5, 101, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => resolveConfig({ recentProjectLimit })).toThrow('recentProjectLimit')
    }
  })

  it('rejects an unknown configuration field', () => {
    expect(() => resolveConfig({ recentProjectLimit: 10, historyPath: '/tmp/history' } as never))
      .toThrow('historyPath')
  })

  it('brands an explicit refresh-token reference and response limit', () => {
    expect(resolveConfig({
      refreshTokenCredential: 'TRAINING_LABEL_STUDIO_PAT',
      restResponseMaxBytes: 16_384,
    })).toMatchObject({
      refreshTokenCredential: 'TRAINING_LABEL_STUDIO_PAT',
      restResponseMaxBytes: 16_384,
    })
  })

  it('rejects the removed apiKeyEnv field instead of silently ignoring it', () => {
    const normalized = Config({ apiKeyEnv: 'LEGACY_SECRET' } as never)
    expect(() => resolveConfig(normalized))
      .toThrow('apiKeyEnv')
  })

  it.each([
    'allowDirectAnnotationUpdate',
    'allowAnnotationUpdate',
    'enableDirectAnnotationUpdate',
    'enableAnnotationPatch',
  ])('rejects an unsupported annotation-write field instead of silently enabling it: %s', (field) => {
    const normalized = Config({ [field]: true })
    expect(() => resolveConfig(normalized)).toThrow(field)
  })

  it('rejects an invalid credential reference', () => {
    expect(() => resolveConfig({ refreshTokenCredential: 'not a credential ref' }))
      .toThrow('credential ref')
  })

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an unsafe focus ACK timeout: %s',
    (focusAckTimeoutMs) => {
      expect(() => resolveConfig({ focusAckTimeoutMs }))
        .toThrow('focusAckTimeoutMs')
    },
  )

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an unsafe REST response limit: %s',
    (restResponseMaxBytes) => {
      expect(() => resolveConfig({ restResponseMaxBytes }))
        .toThrow('restResponseMaxBytes')
    },
  )

  it.each([
    'https://label-studio.example.com',
    'http://192.168.1.10:8080',
    'file:///tmp/label-studio',
  ])('rejects a non-loopback base URL: %s', (baseUrl) => {
    expect(() => resolveConfig({ baseUrl })).toThrow(/loopback HTTP/)
  })

  it('normalizes a trailing slash and accepts localhost', () => {
    expect(resolveConfig({ baseUrl: 'http://localhost:9090/' }).baseUrl)
      .toBe('http://localhost:9090')
  })
})
