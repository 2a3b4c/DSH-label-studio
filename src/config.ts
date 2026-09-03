/** Label Studio plugin configuration and explicit default resolution. */

import z from '@deepseek-ai/schemastery'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import { DEFAULT_LABEL_STUDIO_BASE_URL } from './shared.ts'

export { DEFAULT_LABEL_STUDIO_BASE_URL } from './shared.ts'
/** Supported ownership policy for an unavailable Label Studio endpoint. */
export type LabelStudioLaunchMode = 'python' | 'external'
/** Default launcher used by the installable Bundle and repository example. */
export const DEFAULT_LABEL_STUDIO_LAUNCH_MODE: LabelStudioLaunchMode = 'python'
/** Default global Python command resolved by the subprocess provider. */
export const DEFAULT_PYTHON_EXECUTABLE = 'python'
/** Default PAT refresh-token credential reference for authenticated REST operations. */
export const DEFAULT_REFRESH_TOKEN_CREDENTIAL = 'LABEL_STUDIO_PAT'
/** Default maximum decoded byte length of one Label Studio REST response. */
export const DEFAULT_REST_RESPONSE_MAX_BYTES = 8_388_608
/** Default maximum serialized ContentBlock bytes returned by the active-task tool. */
export const DEFAULT_ACTIVE_TASK_MAX_BYTES = 262_144
/** Default deadline for a browser to apply and acknowledge one focus request. */
export const DEFAULT_FOCUS_ACK_TIMEOUT_MS = 5_000
/** Default readiness deadline for a cold Label Studio database migration. */
export const DEFAULT_STARTUP_TIMEOUT_MS = 120_000
/** Default TERM-to-KILL grace for the managed Label Studio process tree. */
export const DEFAULT_SHUTDOWN_GRACE_MS = 5_000
/** Default lifetime renewed by successful browser event waits. */
export const DEFAULT_CONTEXT_LEASE_TTL_MS = 30_000
/** Default maximum duration of one browser event long poll. */
export const DEFAULT_EVENT_WAIT_TIMEOUT_MS = 25_000
/** Default retained browser event count per DSH Session. */
export const DEFAULT_EVENT_HISTORY_SIZE = 64
/** Default interval before retrying an open whose dispatch result is unknown. */
export const DEFAULT_CONTEXT_OPEN_RETRY_MS = 1_000
/** Default abort deadline for best-effort browser lease closure. */
export const DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS = 1_000
/** Default number of recently visited projects retained for each Session. */
export const DEFAULT_RECENT_PROJECT_LIMIT = 10

/** User-configurable Label Studio plugin fields. */
export interface Config {
  /** Loopback HTTP(S) endpoint rendered in the browser and used by REST tools. */
  baseUrl?: string
  /** Launcher used when the endpoint is unavailable; external mode never spawns. */
  launchMode?: LabelStudioLaunchMode
  /** Bare or absolute Python executable whose environment contains Label Studio. */
  pythonExecutable?: string
  /** PAT refresh-token credential reference resolved for every authenticated REST operation. */
  refreshTokenCredential?: string
  /** Positive readiness deadline after spawning Label Studio. */
  startupTimeoutMs?: number
  /** Positive process-tree termination grace. */
  shutdownGraceMs?: number
  /** Positive safe-integer limit applied to every decoded REST response body. */
  restResponseMaxBytes?: number
  /** Positive safe-integer limit applied to the active-task model ContentBlock array. */
  activeTaskMaxBytes?: number
  /** Positive safe-integer deadline for browser focus acknowledgement. */
  focusAckTimeoutMs?: number
  /** Positive browser context lease lifetime. */
  contextLeaseTtlMs?: number
  /** Positive long-poll timeout shorter than the lease lifetime. */
  eventWaitTimeoutMs?: number
  /** Positive bounded event history length per Session. */
  eventHistorySize?: number
  /** Positive safe-integer delay before retrying an uncertain lease open. */
  contextOpenRetryMs?: number
  /** Positive safe-integer limit for best-effort browser lease closure. */
  contextCloseTimeoutMs?: number
  /** Maximum recently visited Label Studio projects retained for each Session. */
  recentProjectLimit?: number
}

const SUPPORTED_CONFIG_FIELDS = {
  baseUrl: true,
  launchMode: true,
  pythonExecutable: true,
  refreshTokenCredential: true,
  startupTimeoutMs: true,
  shutdownGraceMs: true,
  restResponseMaxBytes: true,
  activeTaskMaxBytes: true,
  focusAckTimeoutMs: true,
  contextLeaseTtlMs: true,
  eventWaitTimeoutMs: true,
  eventHistorySize: true,
  contextOpenRetryMs: true,
  contextCloseTimeoutMs: true,
  recentProjectLimit: true,
} as const satisfies Record<keyof Config, true>

/** Schemastery projection used by Cordis loaders and configuration UIs. */
export const Config: z<Config> = z.object({
  baseUrl: z.string().default(DEFAULT_LABEL_STUDIO_BASE_URL),
  launchMode: z.union(['python', 'external'] as const)
    .default(DEFAULT_LABEL_STUDIO_LAUNCH_MODE),
  pythonExecutable: z.string().default(DEFAULT_PYTHON_EXECUTABLE),
  refreshTokenCredential: z.string().role('credential-ref').default(DEFAULT_REFRESH_TOKEN_CREDENTIAL),
  startupTimeoutMs: z.number().min(1).default(DEFAULT_STARTUP_TIMEOUT_MS),
  shutdownGraceMs: z.number().min(1).default(DEFAULT_SHUTDOWN_GRACE_MS),
  restResponseMaxBytes: z.number().min(1).default(DEFAULT_REST_RESPONSE_MAX_BYTES),
  activeTaskMaxBytes: z.number().min(1).default(DEFAULT_ACTIVE_TASK_MAX_BYTES),
  focusAckTimeoutMs: z.number().min(1).default(DEFAULT_FOCUS_ACK_TIMEOUT_MS),
  contextLeaseTtlMs: z.number().min(1).default(DEFAULT_CONTEXT_LEASE_TTL_MS),
  eventWaitTimeoutMs: z.number().min(1).default(DEFAULT_EVENT_WAIT_TIMEOUT_MS),
  eventHistorySize: z.number().min(1).default(DEFAULT_EVENT_HISTORY_SIZE),
  contextOpenRetryMs: z.number().min(1).default(DEFAULT_CONTEXT_OPEN_RETRY_MS),
  contextCloseTimeoutMs: z.number().min(1).default(DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS),
  recentProjectLimit: z.number().min(1).max(100).default(DEFAULT_RECENT_PROJECT_LIMIT),
})

/** Fully validated facts captured by one plugin instance. */
export interface ResolvedConfig {
  baseUrl: string
  launchMode: LabelStudioLaunchMode
  pythonExecutable: string
  refreshTokenCredential: CredentialRef
  startupTimeoutMs: number
  shutdownGraceMs: number
  restResponseMaxBytes: number
  activeTaskMaxBytes: number
  focusAckTimeoutMs: number
  contextLeaseTtlMs: number
  eventWaitTimeoutMs: number
  eventHistorySize: number
  contextOpenRetryMs: number
  contextCloseTimeoutMs: number
  recentProjectLimit: number
}

/**
 * Resolve every launcher and API default at the package boundary.
 * @param config - raw Cordis plugin configuration.
 * @returns validated immutable runtime facts.
 */
export function resolveConfig(config: Config): ResolvedConfig {
  if ('apiKeyEnv' in config) {
    throw new Error('label-studio: apiKeyEnv was removed; use refreshTokenCredential')
  }
  if ('allowDirectAnnotationUpdate' in config) {
    throw new Error('label-studio: allowDirectAnnotationUpdate is unsupported; create predictions for user review')
  }
  const unsupportedField = Object.keys(config)
    .find(field => !Object.hasOwn(SUPPORTED_CONFIG_FIELDS, field))
  if (unsupportedField !== undefined) {
    throw new Error(`label-studio: unsupported configuration field "${unsupportedField}"`)
  }
  let url: URL
  try {
    url = new URL(config.baseUrl ?? DEFAULT_LABEL_STUDIO_BASE_URL)
  } catch {
    throw new Error('label-studio: baseUrl must be a loopback HTTP(S) URL')
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]'
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !loopback) {
    throw new Error('label-studio: baseUrl must be a loopback HTTP(S) URL')
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error('label-studio: baseUrl must not contain credentials, a query, or a fragment')
  }
  const pythonExecutable = nonEmpty(
    config.pythonExecutable ?? DEFAULT_PYTHON_EXECUTABLE,
    'pythonExecutable',
  )
  const launchMode = config.launchMode ?? DEFAULT_LABEL_STUDIO_LAUNCH_MODE
  const startupTimeoutMs = positive(config.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS, 'startupTimeoutMs')
  const shutdownGraceMs = positive(config.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS, 'shutdownGraceMs')
  const restResponseMaxBytes = positiveSafeInteger(
    config.restResponseMaxBytes ?? DEFAULT_REST_RESPONSE_MAX_BYTES,
    'restResponseMaxBytes',
  )
  const activeTaskMaxBytes = positiveSafeInteger(
    config.activeTaskMaxBytes ?? DEFAULT_ACTIVE_TASK_MAX_BYTES,
    'activeTaskMaxBytes',
  )
  const focusAckTimeoutMs = positiveSafeInteger(
    config.focusAckTimeoutMs ?? DEFAULT_FOCUS_ACK_TIMEOUT_MS,
    'focusAckTimeoutMs',
  )
  const contextLeaseTtlMs = positiveSafeInteger(
    config.contextLeaseTtlMs ?? DEFAULT_CONTEXT_LEASE_TTL_MS,
    'contextLeaseTtlMs',
  )
  const eventWaitTimeoutMs = positiveSafeInteger(
    config.eventWaitTimeoutMs ?? DEFAULT_EVENT_WAIT_TIMEOUT_MS,
    'eventWaitTimeoutMs',
  )
  const eventHistorySize = positiveSafeInteger(
    config.eventHistorySize ?? DEFAULT_EVENT_HISTORY_SIZE,
    'eventHistorySize',
  )
  const contextOpenRetryMs = positiveSafeInteger(
    config.contextOpenRetryMs ?? DEFAULT_CONTEXT_OPEN_RETRY_MS,
    'contextOpenRetryMs',
  )
  const contextCloseTimeoutMs = positiveSafeInteger(
    config.contextCloseTimeoutMs ?? DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS,
    'contextCloseTimeoutMs',
  )
  const recentProjectLimit = positiveSafeInteger(
    config.recentProjectLimit ?? DEFAULT_RECENT_PROJECT_LIMIT,
    'recentProjectLimit',
  )
  if (recentProjectLimit > 100) {
    throw new Error('label-studio: recentProjectLimit must be at most 100')
  }
  if (eventWaitTimeoutMs >= contextLeaseTtlMs) {
    throw new Error('label-studio: eventWaitTimeoutMs must be less than contextLeaseTtlMs')
  }
  return {
    baseUrl: url.href.replace(/\/$/, ''),
    launchMode,
    pythonExecutable,
    refreshTokenCredential: credentialRef(
      config.refreshTokenCredential ?? DEFAULT_REFRESH_TOKEN_CREDENTIAL,
    ),
    startupTimeoutMs,
    shutdownGraceMs,
    restResponseMaxBytes,
    activeTaskMaxBytes,
    focusAckTimeoutMs,
    contextLeaseTtlMs,
    contextOpenRetryMs,
    contextCloseTimeoutMs,
    eventWaitTimeoutMs,
    eventHistorySize,
    recentProjectLimit,
  }
}

function nonEmpty(value: string, field: string): string {
  if (value.trim() === '') throw new Error(`label-studio: ${field} must be non-empty`)
  return value
}

function positive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`label-studio: ${field} must be a positive finite number`)
  }
  return value
}

function positiveSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`label-studio: ${field} must be a positive safe integer`)
  }
  return value
}
