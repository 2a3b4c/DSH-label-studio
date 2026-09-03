// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { LabelStudioPanelController } from '../src/client/panel-state.ts'
import { LabelStudioRoot, type LabelStudioRootProps } from '../src/client/layout/LabelStudioRoot.tsx'
import { createLabelStudioLayoutStore } from '../src/client/layout/store.ts'

let viewport = 2200
let fireResize: (() => void) | undefined
let current: SessionId | undefined = 'session-a' as SessionId
let blank = false
let cancelCount = 0

class Observer {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(): void { fireResize = () => { this.callback([], this) } }
  disconnect(): void { fireResize = undefined }
  unobserve(): void {}
}

function hookOf<T>(source: { subscribe: (listener: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(selector: (value: T) => S): S {
    return selector(useSyncExternalStore(
      listener => source.subscribe(listener),
      () => source.getSnapshot(),
    ))
  }
}

function mountRoot() {
  const layout = createLabelStudioLayoutStore().create()
  const panel = new LabelStudioPanelController('http://127.0.0.1:8080')
  const contextSnapshot = {
    sourceId: 'source' as never, navigationSequence: 0 as never, targetRevision: 0,
    eventRevision: 0, observedEventRevision: 0, bufferedEventCount: 0, status: 'no-session' as const,
    sessionContext: {
      page: { view: 'projects' as const }, recentProjects: [], revision: 0,
      binding: { recentProjects: [], revision: 0 },
    },
    sessionContextStatus: 'idle' as const,
    inspectionStatus: 'idle' as const, webhookStatus: 'disabled' as const, webhookUnassigned: false,
  }
  const context = {
    subscribe: () => () => {},
    getSnapshot: () => contextSnapshot,
  }
  const bindSession = vi.fn()
  panel.setOpen(true)
  layout.actions.openWorkbench()
  const calls: string[] = []
  const useSessions = ((selector: (value: unknown) => unknown) => selector({
    current,
    byId: current === undefined ? {} : { [current]: { id: current, blank } },
  })) as LabelStudioRootProps['useSessions']
  const props = (): LabelStudioRootProps => ({
    useStore: hookOf(layout.store),
    actions: layout.actions,
    useSessions,
    useWorkspaces: ((selector: (value: unknown) => unknown) => selector({})) as LabelStudioRootProps['useWorkspaces'],
    renderSlot: (name) => { calls.push(name); return <div data-slot={name} /> },
    SessionProvider: ({ children, empty }) => current === undefined ? empty?.() : children,
    useLabelStudioPanel: hookOf(panel.store),
    useLabelStudioContext: hookOf(context),
    baseUrl: 'http://127.0.0.1:8080',
    bindSession, confirmApplied: vi.fn(), attachFrame: vi.fn(), selectTarget: vi.fn(), selectPage: vi.fn(),
    close: vi.fn(), reload: vi.fn(), openExternal: vi.fn(), t: key => key,
  })
  const view = render(<LabelStudioRoot {...props()} />)
  return { ...view, layout, panel, calls, bindSession, rerender: () => { view.rerender(<LabelStudioRoot {...props()} />) } }
}

beforeEach(() => {
  vi.useFakeTimers()
  viewport = 2200; current = 'session-a' as SessionId; blank = false; cancelCount = 0
  vi.stubGlobal('ResizeObserver', Observer)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => { callback(0) }, 16) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => { cancelCount += 1; clearTimeout(handle) })
  window.innerWidth = viewport
  Element.prototype.getBoundingClientRect = () => ({
    width: viewport, height: 900, top: 0, right: viewport,
    bottom: 900, left: 0, x: 0, y: 0, toJSON: () => ({}),
  })
  const captured = new WeakSet<Element>()
  Element.prototype.setPointerCapture = function () { captured.add(this) }
  Element.prototype.releasePointerCapture = function () { captured.delete(this) }
  Element.prototype.hasPointerCapture = function () { return captured.has(this) }
})

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Label Studio replacement root', () => {
  it('renders the four original child slots and the panel directly, without a workbench slot', () => {
    const view = mountRoot()
    expect(new Set(view.calls)).toEqual(new Set(['sidebar', 'conversation', 'details', 'shell.overlay']))
    expect(view.container.querySelector('[data-slot="shell.workbench"]')).toBeNull()
    expect(view.container.querySelector('iframe')).not.toBeNull()
    expect(view.container.querySelectorAll('[data-label-studio-root]')).toHaveLength(1)
  })

  it('preserves details through blank or absent selection and closes only on live A to live B', () => {
    const view = mountRoot()
    act(() => { view.layout.actions.openDetails() })
    expect(view.layout.store.getSnapshot().details).toBe(360)
    blank = true; act(view.rerender)
    expect(view.layout.store.getSnapshot().details).toBe(360)
    blank = false; act(view.rerender)
    expect(view.layout.store.getSnapshot().details).toBe(360)
    current = undefined; act(view.rerender)
    expect(view.layout.store.getSnapshot().details).toBe(360)
    current = 'session-a' as SessionId; act(view.rerender)
    expect(view.layout.store.getSnapshot().details).toBe(360)
    current = 'session-b' as SessionId; act(view.rerender)
    expect(view.layout.store.getSnapshot().details).toBe(0)
  })

  it('binds the selected Session from an effect, including absence and replacement', () => {
    const view = mountRoot()
    expect(view.bindSession).toHaveBeenLastCalledWith('session-a')
    current = undefined; act(view.rerender)
    expect(view.bindSession).toHaveBeenLastCalledWith(undefined)
    current = 'session-b' as SessionId; act(view.rerender)
    expect(view.bindSession).toHaveBeenLastCalledWith('session-b')
  })

  it('uses frame ResizeObserver and pointer capture with rAF cancellation', () => {
    const view = mountRoot()
    const root = view.container.querySelector('[data-label-studio-root]') as HTMLElement
    viewport = 1500
    act(() => { fireResize?.(); vi.advanceTimersByTime(20) })
    expect(root.style.gridTemplateColumns).toContain('580px')
    const handle = root.querySelector('[data-side="workbench"]') as HTMLElement
    act(() => { handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: 780, bubbles: true })) })
    expect(root.hasAttribute('data-dragging')).toBe(true)
    act(() => {
      handle.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 700, bubbles: true }))
      handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: 700, bubbles: true }))
    })
    expect(cancelCount).toBe(1)
    expect(root.hasAttribute('data-dragging')).toBe(false)
    expect(view.layout.store.getSnapshot().workbench).toBe(660)
  })
})
