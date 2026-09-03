/**
 * Label Studio plugin: managed local process, authenticated REST tools, and
 * browser workbench boot configuration.
 * @module @deepseek-ai/dsh-label-studio
 */

import { randomBytes } from 'node:crypto'
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
import { registerLabelStudioContextRpc, resolvePersistentSessionIdentity } from './context-rpc.ts'
import { LabelStudioCurrentPageBroker } from './current-page-broker.ts'
import { LabelStudioFrameProxy } from './frame-proxy.ts'
import { disposeLabelStudioResources, LabelStudioOperationGate } from './lifecycle.ts'
import { LabelStudioOperationContextResolver } from './operation-context.ts'
import { LabelStudioRuntime } from './runtime.ts'
import { LabelStudioSessionContextStore } from './session-context-store.ts'
import { registerLabelStudioTools } from './tools.ts'
import { LabelStudioWebhookBindingCoordinator } from './webhook-binding.ts'
import { createLabelStudioWebhookHandler } from './webhook-ingress.ts'
import { LabelStudioWebhookRegistrar } from './webhook-registration.ts'

const LABEL_STUDIO_INSPECTION_PROTOCOL = 'dsh-label-studio-page/v1' as const

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
  LabelStudioWebhookRegistration,
  UpdatedProjectLabelConfig,
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
  labelStudioPageInspectionId,
  labelStudioPredictionId,
  labelStudioProjectId,
  labelStudioTaskId,
} from './context-types.ts'
export { LabelStudioContextError, LabelStudioContextRegistry } from './context-registry.ts'
export type {
  LabelStudioContextErrorCode,
  LabelStudioLeaseBinding,
} from './context-registry.ts'
export { registerLabelStudioContextRpc, resolvePersistentSessionIdentity } from './context-rpc.ts'
export type { LabelStudioContextRpcOptions } from './context-rpc.ts'
export { LabelStudioCurrentPageBroker, LabelStudioCurrentPageError } from './current-page-broker.ts'
export { LABEL_STUDIO_FRAME_BRIDGE_PATH, LabelStudioFrameProxy } from './frame-proxy.ts'
export type { LabelStudioFrameProxyAddress, LabelStudioFrameProxyOptions } from './frame-proxy.ts'
export {
  LabelStudioOperationContextError,
  LabelStudioOperationContextResolver,
} from './operation-context.ts'
export type {
  LabelStudioCurrentPageReader,
  LabelStudioOperationKind,
  LabelStudioResolvedOperationContext,
  LabelStudioTargetRequirement,
  LabelStudioTargetSelector,
} from './operation-context.ts'
export {
  Config,
  DEFAULT_ACTIVE_TASK_MAX_BYTES,
  DEFAULT_CONTEXT_LEASE_TTL_MS,
  DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS,
  DEFAULT_CONTEXT_OPEN_RETRY_MS,
  DEFAULT_EVENT_HISTORY_SIZE,
  DEFAULT_EVENT_WAIT_TIMEOUT_MS,
  DEFAULT_CURRENT_PAGE_TIMEOUT_MS,
  DEFAULT_FRAME_PROXY_HTML_MAX_BYTES,
  DEFAULT_FOCUS_ACK_TIMEOUT_MS,
  DEFAULT_LABEL_STUDIO_BASE_URL,
  DEFAULT_LABEL_STUDIO_LAUNCH_MODE,
  DEFAULT_PYTHON_EXECUTABLE,
  DEFAULT_REFRESH_TOKEN_CREDENTIAL,
  DEFAULT_RECENT_PROJECT_LIMIT,
  DEFAULT_REST_RESPONSE_MAX_BYTES,
  DEFAULT_SHUTDOWN_GRACE_MS,
  DEFAULT_STARTUP_TIMEOUT_MS,
  DEFAULT_MANAGED_WEBHOOK_TIMEOUT_SECONDS,
  DEFAULT_WEBHOOK_MAX_BODY_BYTES,
  DEFAULT_WEBHOOK_MODE,
  DEFAULT_WEBHOOK_PATH,
  resolveConfig,
} from './config.ts'
export type { LabelStudioLaunchMode, LabelStudioWebhookMode, ResolvedConfig } from './config.ts'
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
export { LabelStudioWebhookBindingCoordinator } from './webhook-binding.ts'
export type { LabelStudioWebhookBindingOutcome } from './webhook-binding.ts'
export { createLabelStudioWebhookHandler, encodeWebhookSecret } from './webhook-ingress.ts'
export type { LabelStudioWebhookIngressOptions } from './webhook-ingress.ts'
export { LabelStudioWebhookRegistrar } from './webhook-registration.ts'
export type { CreateWebhookInput } from './webhook-registration.ts'
export { LABEL_STUDIO_WEBHOOK_ACTIONS, parseLabelStudioWebhook } from './webhook-payload.ts'
export type { LabelStudioWebhookEvent } from './webhook-payload.ts'

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
  const frameProxy = new LabelStudioFrameProxy({
    upstreamBaseUrl: resolved.baseUrl,
    inspectionProtocol: LABEL_STUDIO_INSPECTION_PROTOCOL,
    htmlMaxBytes: resolved.frameProxyHtmlMaxBytes,
  })
  let frameAddress: Awaited<ReturnType<LabelStudioFrameProxy['start']>>
  try {
    frameAddress = await frameProxy.start()
  } catch (error) {
    await Promise.allSettled([runtime.dispose(), sessionContexts.close()])
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
  const currentPages = new LabelStudioCurrentPageBroker(contexts, changes)
  const resolver = new LabelStudioOperationContextResolver(
    sessionContexts,
    currentPages,
    api,
    resolved.currentPageTimeoutMs,
  )
  const webhookRegistrar = new LabelStudioWebhookRegistrar(api, sessionContexts)
  let webhookStatus: 'disabled' | 'ready' | 'unavailable' = resolved.webhookMode === 'off'
    ? 'disabled'
    : 'unavailable'
  let ensureWebhook: ((signal: AbortSignal) => Promise<void>) | undefined
  const disposeTools = registerLabelStudioTools(
    ctx,
    runtime,
    api,
    contexts,
    changes,
    operations,
    resolver,
    sessionContexts,
    {
      activeTaskMaxBytes: resolved.activeTaskMaxBytes,
      focusAckTimeoutMs: resolved.focusAckTimeoutMs,
      ensureWebhook: async (signal) => {
        if (ensureWebhook === undefined) return
        try {
          await ensureWebhook(signal)
          webhookStatus = 'ready'
          changes.publishWebhookStatus('ready')
        } catch (error) {
          webhookStatus = 'unavailable'
          changes.publishWebhookStatus('unavailable')
          if (resolved.webhookMode === 'required') throw error
        }
      },
    },
  )
  let activeBrowserDisposer: (() => Promise<void>) | undefined

  ctx.inject(['connection', 'sessions', 'sessionPersistence', 'webServer'], (browserCtx) => {
    browserCtx.effect(async () => {
      let removeWebhookIngress: (() => void) | undefined
      if (resolved.webhookMode !== 'off') {
        const webhookCoordinator = new LabelStudioWebhookBindingCoordinator(sessionContexts, changes, {
          sessionIds: () => contexts.sessionIds(),
          resolveIdentity: (sessionId, signal) => resolvePersistentSessionIdentity(
            browserCtx, sessionId, signal, contexts, changes, sessionContexts,
          ),
          currentPages,
          timeoutMs: resolved.currentPageTimeoutMs,
        })
        const secret = randomBytes(32)
        removeWebhookIngress = browserCtx.webServer.register({
          kind: 'exact',
          path: resolved.webhookPath,
          handler: createLabelStudioWebhookHandler(webhookCoordinator, {
            path: resolved.webhookPath,
            maxBodyBytes: resolved.webhookMaxBodyBytes,
            secret,
          }),
        })
        const callbackUrl = `http://127.0.0.1:${browserCtx.webServer.port}${resolved.webhookPath}`
        ensureWebhook = signal => webhookRegistrar.ensureInstalled(callbackUrl, secret, signal).then(() => undefined)
        try {
          await ensureWebhook(new AbortController().signal)
          webhookStatus = 'ready'
        } catch (error) {
          webhookStatus = 'unavailable'
          if (resolved.webhookMode === 'required') {
            ensureWebhook = undefined
            removeWebhookIngress()
            throw error
          }
        }
      }
      const removeBootConfig = browserCtx.webServer.tapIndex(
        html => injectLabelStudioBootConfig(html, {
          baseUrl: resolved.baseUrl,
          frameBaseUrl: frameAddress.baseUrl,
          frameCapability: frameAddress.capability,
          inspectionProtocol: LABEL_STUDIO_INSPECTION_PROTOCOL,
          currentPageTimeoutMs: resolved.currentPageTimeoutMs,
          contextOpenRetryMs: resolved.contextOpenRetryMs,
          contextCloseTimeoutMs: resolved.contextCloseTimeoutMs,
          eventHistorySize: resolved.eventHistorySize,
          webhookStatus,
        }),
      )
      const removeRpc = registerLabelStudioContextRpc(
        browserCtx,
        contexts,
        changes,
        sessionContexts,
        operations,
        { eventWaitTimeoutMs: resolved.eventWaitTimeoutMs },
        currentPages,
      )
      let disposed = false
      const disposeBrowser = async () => {
        if (disposed) return
        disposed = true
        ensureWebhook = undefined
        removeWebhookIngress?.()
        const results = await Promise.allSettled([webhookRegistrar.dispose(), removeRpc()])
        removeBootConfig()
        if (activeBrowserDisposer === disposeBrowser) activeBrowserDisposer = undefined
        const failures = results.filter(result => result.status === 'rejected')
        if (failures.length === 1) throw failures[0]!.reason
        if (failures.length > 1) throw new AggregateError(failures.map(result => result.reason))
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
      disposeCurrentPages: () => { currentPages.dispose() },
      disposeFrameProxy: () => frameProxy.close(),
      disposeBroker: () => changes.dispose(),
      disposeRegistry: () => { contexts.dispose() },
      disposeRuntime: () => runtime.dispose(),
      disposeStore: () => sessionContexts.close(),
    })
  }, 'label-studio: ordered package shutdown')
}
