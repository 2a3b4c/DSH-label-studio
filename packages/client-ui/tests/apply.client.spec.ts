// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { LabelStudioAction } from '../src/client/LabelStudioAction.tsx'
import { LabelStudioRoot } from '../src/client/layout/LabelStudioRoot.tsx'
import { LabelStudioLayoutController } from '../src/client/layout/service.ts'
import { apply, inject } from '../src/client/index.ts'

interface SlotEntry {
  name: string
  component: unknown
  inject?: (actions?: never) => unknown
  children?: Record<string, unknown>
}

function bench() {
  const services = new Map<string, unknown>([['connection', {
    api: { settings: {} },
    isLoopback: false,
    generation: { getSnapshot: () => undefined, subscribe: () => () => {} },
    rpc: { call: vi.fn() },
  }]])
  const entries = new Map<string, SlotEntry[]>()
  const specs = new Map<string, unknown>()
  const disposers: Array<() => void | Promise<void>> = []
  const slots = {
    register(definition: Omit<SlotEntry, 'component'>, component: unknown) {
      const entry = { ...definition, component }
      const list = entries.get(entry.name) ?? []
      list.push(entry)
      entries.set(entry.name, list)
      for (const [name, spec] of Object.entries(entry.children ?? {})) specs.set(name, spec)
      return () => {
        entries.set(entry.name, (entries.get(entry.name) ?? []).filter(candidate => candidate !== entry))
      }
    },
    inject(_name: string, register: () => () => void) {
      disposers.push(register())
    },
    entries(name: string) { return entries.get(name) ?? [] },
    spec(name: string) { return specs.get(name) },
  }
  const ctx = {
    get(name: string) { return services.get(name) },
    locale: { register: vi.fn(() => () => {}) },
    reflect: {
      provide(name: string, value: unknown) {
        services.set(name, value)
        return () => { services.delete(name) }
      },
    },
    slots,
    theme: {
      getTheme: () => ({
        preference: 'light',
        active: { id: 'test-light', colorScheme: 'light', tokens: {} },
        themes: [],
        revision: 1,
      }),
    },
    on: vi.fn(() => () => {}),
    effect(register: () => void | (() => void | Promise<void>)) {
      const dispose = register()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
  }
  window.__DSH_LABEL_STUDIO__ = {
    baseUrl: 'http://127.0.0.1:9090',
    frameBaseUrl: 'http://127.0.0.1:41000',
    frameCapability: 'test-capability',
    inspectionProtocol: 'dsh-label-studio-page/v1',
    currentPageTimeoutMs: 5_000,
    contextOpenRetryMs: 1_000,
    contextCloseTimeoutMs: 1_000,
    eventHistorySize: 256,
    webhookStatus: 'ready',
  }
  apply(ctx as never)
  return {
    slots,
    services,
    async dispose() {
      for (const dispose of disposers.reverse()) await dispose()
    },
  }
}

describe('Label Studio browser assembly', () => {
  it('declares only the services it currently consumes', () => {
    expect(inject).toEqual(['slots', 'locale', 'theme', 'connection'])
  })

  it('provides the compatible layout and the only root with four original children', async () => {
    const b = bench()
    expect(b.services.get('layout')).toBeInstanceOf(LabelStudioLayoutController)
    expect(b.slots.entries('root')).toHaveLength(1)
    expect(b.slots.entries('root')[0]?.component).toBe(LabelStudioRoot)
    expect(b.slots.spec('sidebar')).toEqual({ kind: 'single', scope: 'root' })
    expect(b.slots.spec('conversation')).toEqual({ kind: 'single', scope: 'session-maybe' })
    expect(b.slots.spec('details')).toEqual({ kind: 'single', scope: 'session' })
    expect(b.slots.spec('shell.overlay')).toEqual({ kind: 'list', scope: 'root' })
    expect(b.slots.spec('shell.workbench')).toBeUndefined()
    await b.dispose()
    expect(b.services.get('layout')).toBeUndefined()
    expect(b.slots.entries('root')).toHaveLength(0)
  })

  it('uses one setOpen path for the header action and root close', async () => {
    const b = bench()
    const root = b.slots.entries('root')[0]!
    const actions = {
      setSidebar: vi.fn(), setDetails: vi.fn(), setWorkbench: vi.fn(), toggleSidebar: vi.fn(), setNarrow: vi.fn(),
      openDetails: vi.fn(), closeDetails: vi.fn(), openWorkbench: vi.fn(), closeWorkbench: vi.fn(),
    }
    const rootFace = root.inject!(actions as never) as {
      close: () => void
      hooks: { labelStudioPanel: { getSnapshot: () => { open: boolean } } }
    }
    const action = b.slots.entries('conversation.session.header.actions')[0]!
    expect(action.component).toBe(LabelStudioAction)
    const actionFace = action.inject!() as { toggle: () => void }
    actionFace.toggle()
    expect(rootFace.hooks.labelStudioPanel.getSnapshot().open).toBe(true)
    expect(actions.openWorkbench).toHaveBeenCalledOnce()
    rootFace.close()
    expect(rootFace.hooks.labelStudioPanel.getSnapshot().open).toBe(false)
    expect(actions.closeWorkbench).toHaveBeenCalledOnce()
    await b.dispose()
  })

  it('keeps workbench visibility per Session and defaults a new Session closed', async () => {
    const b = bench()
    const root = b.slots.entries('root')[0]!
    const actions = {
      setSidebar: vi.fn(), setDetails: vi.fn(), setWorkbench: vi.fn(), toggleSidebar: vi.fn(), setNarrow: vi.fn(),
      openDetails: vi.fn(), closeDetails: vi.fn(), openWorkbench: vi.fn(), closeWorkbench: vi.fn(),
    }
    const rootFace = root.inject!(actions as never) as {
      bindSession: (sessionId: string | undefined) => void
      hooks: { labelStudioPanel: { getSnapshot: () => { open: boolean } } }
    }
    const action = b.slots.entries('conversation.session.header.actions')[0]!
    const actionFace = action.inject!() as { toggle: () => void }

    rootFace.bindSession('session-a')
    actionFace.toggle()
    expect(rootFace.hooks.labelStudioPanel.getSnapshot().open).toBe(true)

    rootFace.bindSession('session-b')
    expect(rootFace.hooks.labelStudioPanel.getSnapshot().open).toBe(false)

    rootFace.bindSession('session-a')
    expect(rootFace.hooks.labelStudioPanel.getSnapshot().open).toBe(true)
    rootFace.bindSession('session-b')
    expect(rootFace.hooks.labelStudioPanel.getSnapshot().open).toBe(false)
    expect(actions.closeWorkbench).toHaveBeenCalledTimes(2)
    expect(actions.openWorkbench).toHaveBeenCalledTimes(2)
    await b.dispose()
  })

  it('seeds the Client context with the Host Webhook availability', async () => {
    const b = bench()
    const root = b.slots.entries('root')[0]!
    const rootFace = root.inject!({
      setSidebar: vi.fn(), setDetails: vi.fn(), setWorkbench: vi.fn(), toggleSidebar: vi.fn(), setNarrow: vi.fn(),
      openDetails: vi.fn(), closeDetails: vi.fn(), openWorkbench: vi.fn(), closeWorkbench: vi.fn(),
    } as never) as { hooks: { labelStudioContext: { getSnapshot: () => { webhookStatus: string } } } }
    expect(rootFace.hooks.labelStudioContext.getSnapshot().webhookStatus).toBe('ready')
    await b.dispose()
  })
})
