/** Browser assembly for the Label Studio replacement root. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { LabelStudioAction } from './LabelStudioAction.tsx'
import { LabelStudioPanelController, type LabelStudioPanelSnapshot } from './panel-state.ts'
import type { LabelStudioContextSourceId } from '@deepseek-ai/dsh-label-studio-protocol'
import { LabelStudioContextBridge } from './context-bridge.ts'
import { LabelStudioCurrentPageBridge } from './current-page-bridge.ts'
import { LabelStudioContextController, type LabelStudioContextSnapshot } from './context-state.ts'
import type { LabelStudioPageContext } from '@deepseek-ai/dsh-label-studio-protocol'
import { parseLabelStudioTargetInput, type LabelStudioTargetInput } from './page-url.ts'
import { en, NS, zh, type LabelStudioKey } from './locales.ts'
import { LabelStudioRoot } from './layout/LabelStudioRoot.tsx'
import { createLabelStudioLayoutStore } from './layout/store.ts'
import { LabelStudioLayoutController, type LabelStudioPanelActions } from './layout/service.ts'
import { LabelStudioThemePresenter } from './layout/theme-presenter.ts'

export { LabelStudioLayoutController } from './layout/service.ts'
export {
  isLabelStudioBridgeFailure,
  isLabelStudioPluginFailure,
  isLabelStudioTransportUnknown,
  LabelStudioContextBridge,
} from './context-bridge.ts'
export type { LabelStudioBridgeFailure } from './context-bridge.ts'
export { LabelStudioCurrentPageBridge } from './current-page-bridge.ts'
export type { LabelStudioInspectionRpc } from './current-page-bridge.ts'
export type {
  LabelStudioControlledPage,
  LabelStudioContextSnapshot,
  LabelStudioInspectionStatus,
  LabelStudioSessionContextStatus,
  LabelStudioSyncStatus,
  LabelStudioWebhookStatus,
} from './context-state.ts'
export { LabelStudioContextController } from './context-state.ts'
export { buildLabelStudioPageUrl, parseLabelStudioTargetInput } from './page-url.ts'
export type { LabelStudioTargetInput } from './page-url.ts'
export type { LabelStudioPanelSnapshot } from './panel-state.ts'
export type { LabelStudioKey } from './locales.ts'

declare global {
  interface Window {
    /** Host-validated Label Studio browser endpoint. */
    __DSH_LABEL_STUDIO__?: {
      baseUrl: string
      frameBaseUrl: string
      frameCapability: string
      inspectionProtocol: 'dsh-label-studio-page/v1'
      currentPageTimeoutMs: number
      contextOpenRetryMs: number
      contextCloseTimeoutMs: number
      eventHistorySize: number
      webhookStatus?: 'disabled' | 'ready' | 'unavailable'
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Label Studio workbench copy. */
    labelStudio: LabelStudioKey
  }
}

/** Injected facts for the Session-header toggle. */
export interface LabelStudioActionInjected {
  hooks: { labelStudioPanel: SnapshotStore<LabelStudioPanelSnapshot> }
  toggle: () => void
}

/** Injected facts consumed by the replacement root and its direct panel child. */
export interface LabelStudioRootInjected {
  hooks: {
    labelStudioPanel: SnapshotStore<LabelStudioPanelSnapshot>
    labelStudioContext: SnapshotStore<LabelStudioContextSnapshot>
  }
  baseUrl: string
  bindSession: (sessionId: SessionId | undefined) => void
  confirmApplied: (navigationRevision: number) => void
  attachFrame: (frame: HTMLIFrameElement | null) => void
  selectTarget: (input: LabelStudioTargetInput) => Promise<void>
  selectPage: (page: LabelStudioPageContext) => Promise<void>
  close: () => void
  reload: () => void
  openExternal: () => void
}

export const inject = ['slots', 'locale', 'theme', 'connection']

function readBootConfig(): NonNullable<Window['__DSH_LABEL_STUDIO__']> {
  const config = window.__DSH_LABEL_STUDIO__
  if (config === undefined || config.baseUrl === '') throw new Error('label-studio client: missing browser boot config')
  try { new URL(config.baseUrl) } catch { throw new Error('label-studio client: invalid browser boot baseUrl') }
  for (const field of [
    'contextOpenRetryMs', 'contextCloseTimeoutMs', 'eventHistorySize', 'currentPageTimeoutMs',
  ] as const) {
    if (!Number.isSafeInteger(config[field]) || config[field] <= 0) {
      throw new Error(`label-studio client: invalid browser boot ${field}`)
    }
  }
  if (config.frameBaseUrl === '' || config.frameCapability === ''
    || config.inspectionProtocol !== 'dsh-label-studio-page/v1') {
    throw new Error('label-studio client: invalid frame boot config')
  }
  try { new URL(config.frameBaseUrl) } catch { throw new Error('label-studio client: invalid frame boot baseUrl') }
  return config
}

/**
 * Provide the compatible layout, replace the root, and add one Session action.
 * @param ctx - browser root context.
 */
export function apply(ctx: ClientContext): void {
  const boot = readBootConfig()
  const baseUrl = boot.frameBaseUrl
  const layout = new LabelStudioLayoutController()
  const panel = new LabelStudioPanelController(boot.frameBaseUrl, boot.baseUrl)
  const setOpen = (open: boolean): void => {
    if (panel.store.getSnapshot().open === open) return
    panel.setOpen(open)
    if (open) layout.openWorkbench()
    else layout.closeWorkbench()
  }
  const connection = ctx.get('connection') as ConnectionHandle
  const bridge = new LabelStudioContextBridge({ connection, channel: '/label-studio' })
  const currentPages = new LabelStudioCurrentPageBridge(
    bridge,
    () => panel.currentFrameWindow(),
    new URL(boot.frameBaseUrl).origin,
    boot.inspectionProtocol,
    boot.frameCapability,
  )
  const sourceId = globalThis.crypto.randomUUID() as LabelStudioContextSourceId
  const contexts = new LabelStudioContextController(bridge, {
    setOpen,
    applyPage: page => panel.applyPage(page),
    clearPage: () => { panel.clearPage() },
    reloadPage: () => { panel.reloadPage() },
    inspectCurrentPage: (event, lease, signal) => currentPages.inspect(event, lease, signal),
  }, sourceId, {
    contextOpenRetryMs: boot.contextOpenRetryMs,
    contextCloseTimeoutMs: boot.contextCloseTimeoutMs,
    eventHistorySize: boot.eventHistorySize,
    ...(boot.webhookStatus === undefined ? {} : { webhookStatus: boot.webhookStatus }),
  })

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'label-studio: dictionaries')
  ctx.effect(() => {
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRoot = ctx.slots.register({
      name: 'root',
      children: {
        'sidebar': { kind: 'single', scope: 'root' },
        'conversation': { kind: 'single', scope: 'session-maybe' },
        'details': { kind: 'single', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
      store: createLabelStudioLayoutStore,
      locale: NS,
      inject: (actions: LabelStudioPanelActions): LabelStudioRootInjected => {
        layout.attachPanels(actions)
        return {
          hooks: { labelStudioPanel: panel.store, labelStudioContext: contexts.store },
          baseUrl,
          bindSession: (sessionId) => { contexts.bindSession(sessionId) },
          confirmApplied: (revision) => { panel.confirmApplied(revision) },
          attachFrame: (frame) => {
            currentPages.cancel()
            panel.attachFrame(frame)
          },
          selectTarget: input => contexts.selectPage(parseLabelStudioTargetInput(input)),
          selectPage: page => contexts.selectPage(page),
          close: () => { setOpen(false) },
          reload: () => { contexts.reload() },
          openExternal: () => { panel.openExternal() },
        }
      },
    }, LabelStudioRoot)
    return () => {
      setOpen(false)
      disposeRoot()
      void disposeService()
    }
  }, 'label-studio: compatible layout + replacement root')

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'label-studio',
    order: 40,
    locale: NS,
    inject: (): LabelStudioActionInjected => ({
      hooks: { labelStudioPanel: panel.store },
      toggle: () => { setOpen(!panel.store.getSnapshot().open) },
    }),
  }, LabelStudioAction))

  ctx.effect(() => {
    const presenter = new LabelStudioThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', (snapshot) => { presenter.apply(snapshot) })
    return () => { off(); presenter.dispose() }
  }, 'label-studio: theme presenter')

  ctx.effect(() => async () => {
    await contexts.dispose()
    currentPages.dispose()
    panel.dispose()
  }, 'label-studio: browser context lifecycle')
}
