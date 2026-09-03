/**
 * Label Studio plugin: managed local process, authenticated REST tools, and
 * browser workbench boot configuration.
 * @module @deepseek-ai/dsh-label-studio
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { LabelStudioApi } from './api.ts'
import { injectLabelStudioBootConfig } from './boot-config.ts'
import { LabelStudioChangeBroker } from './change-broker.ts'
import { resolveConfig, type Config } from './config.ts'
import { LabelStudioContextRegistry } from './context-registry.ts'
import { registerLabelStudioContextRpc } from './context-rpc.ts'
import { disposeLabelStudioResources, LabelStudioOperationGate } from './lifecycle.ts'
import { LabelStudioRuntime } from './runtime.ts'
import { LabelStudioSessionContextStore } from './session-context-store.ts'
import { registerLabelStudioTools } from './tools.ts'

export { LabelStudioApi } from './api.ts'
export { LabelStudioHttpError, LabelStudioMutationOutcomeUnknownError } from './api.ts'
export type {
  CreatePredictionInput,
  CreateProjectInput,
  CreatedPrediction,
  CreatedProject,
  ImportedTasks,
  LabelStudioAnnotationView,
  LabelStudioPredictionView,
  LabelStudioProjectView,
  LabelStudioSelectedTaskView,
  LabelStudioTask,
  LabelStudioTaskView,
} from './api.ts'
export { validateSelectedTask } from './api.ts'
export { injectLabelStudioBootConfig } from './boot-config.ts'
export { LabelStudioChangeBroker } from './change-broker.ts'
export {
  labelStudioAnnotationId,
  labelStudioContextLeaseId,
  labelStudioContextSourceId,
  labelStudioFocusCorrelationId,
  labelStudioNavigationSequence,
  labelStudioPredictionId,
  labelStudioProjectId,
  labelStudioTaskId,
} from './context-types.ts'
export { LabelStudioContextError, LabelStudioContextRegistry } from './context-registry.ts'
export type {
  LabelStudioContextErrorCode,
  LabelStudioLeaseBinding,
} from './context-registry.ts'
export { registerLabelStudioContextRpc } from './context-rpc.ts'
export type { LabelStudioContextRpcOptions } from './context-rpc.ts'
export {
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
  DEFAULT_REFRESH_TOKEN_CREDENTIAL,
  DEFAULT_RECENT_PROJECT_LIMIT,
  DEFAULT_REST_RESPONSE_MAX_BYTES,
  DEFAULT_SHUTDOWN_GRACE_MS,
  DEFAULT_STARTUP_TIMEOUT_MS,
  resolveConfig,
} from './config.ts'
export type { LabelStudioLaunchMode, ResolvedConfig } from './config.ts'
export {
  labelStudioPageContextSchema,
  labelStudioSessionContextDomainSpec,
  labelStudioSessionContextRecordSchema,
} from './session-context-spec.ts'
export type {
  LabelStudioPageCommitReceipt,
  LabelStudioSessionContextRecord,
  LabelStudioSessionIdentity,
} from './session-context-spec.ts'
export {
  LabelStudioSessionContextError,
  LabelStudioSessionContextStore,
} from './session-context-store.ts'
export type { LabelStudioSessionContextStoreOptions } from './session-context-store.ts'
export {
  disposeLabelStudioResources,
  LabelStudioOperationClosedError,
  LabelStudioOperationGate,
} from './lifecycle.ts'
export type { LabelStudioShutdownResources } from './lifecycle.ts'
export { LabelStudioRuntime } from './runtime.ts'
export type { LabelStudioStatus } from './runtime.ts'
export { registerLabelStudioTools } from './tools.ts'

/** Cordis plugin name. */
export const name = 'label-studio'
/** Required Host services for process ownership, REST authentication, and tools. */
export const inject = ['tools', 'subprocess', 'credentials', 'storageDomain']

/**
 * Start or adopt Label Studio, register the REST tools, and expose its URL to
 * the optional browser carrier.
 * @param ctx - Host context carrying the required capability services.
 * @param config - validated or programmatically supplied plugin config.
 */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const resolved = resolveConfig(config)
  const operations = new LabelStudioOperationGate()
  const sessionContexts = await LabelStudioSessionContextStore.open(ctx, {
    recentProjectLimit: resolved.recentProjectLimit,
  })
  const runtime = new LabelStudioRuntime(ctx.subprocess, resolved)
  try {
    await runtime.start()
  } catch (error) {
    await sessionContexts.close()
    throw error
  }
  const api = new LabelStudioApi(
    resolved.baseUrl,
    resolved.refreshTokenCredential,
    ctx.credentials,
    resolved.restResponseMaxBytes,
  )
  const contexts = new LabelStudioContextRegistry(resolved.contextLeaseTtlMs)
  const changes = new LabelStudioChangeBroker(contexts, resolved.eventHistorySize, sessionContexts)
  const disposeTools = registerLabelStudioTools(
    ctx,
    runtime,
    api,
    contexts,
    changes,
    operations,
    {
      activeTaskMaxBytes: resolved.activeTaskMaxBytes,
      focusAckTimeoutMs: resolved.focusAckTimeoutMs,
    },
  )
  let activeBrowserDisposer: (() => Promise<void>) | undefined

  ctx.inject(['connection', 'sessions', 'sessionPersistence', 'webServer'], (browserCtx) => {
    browserCtx.effect(() => {
      const removeBootConfig = browserCtx.webServer.tapIndex(
        html => injectLabelStudioBootConfig(html, {
          baseUrl: resolved.baseUrl,
          contextOpenRetryMs: resolved.contextOpenRetryMs,
          contextCloseTimeoutMs: resolved.contextCloseTimeoutMs,
          eventHistorySize: resolved.eventHistorySize,
        }),
      )
      const removeRpc = registerLabelStudioContextRpc(
        browserCtx,
        contexts,
        changes,
        sessionContexts,
        operations,
        { eventWaitTimeoutMs: resolved.eventWaitTimeoutMs },
      )
      let disposed = false
      const disposeBrowser = async () => {
        if (disposed) return
        disposed = true
        await removeRpc()
        removeBootConfig()
        if (activeBrowserDisposer === disposeBrowser) activeBrowserDisposer = undefined
      }
      activeBrowserDisposer = disposeBrowser
      return disposeBrowser
    }, 'label-studio: browser context channel')
  })

  ctx.effect(() => async () => {
    await disposeLabelStudioResources({
      operations,
      disposeTools,
      ...(activeBrowserDisposer === undefined ? {} : { disposeBrowser: activeBrowserDisposer }),
      disposeBroker: () => changes.dispose(),
      disposeRegistry: () => { contexts.dispose() },
      disposeRuntime: () => runtime.dispose(),
      disposeStore: () => sessionContexts.close(),
    })
  }, 'label-studio: ordered package shutdown')
}
