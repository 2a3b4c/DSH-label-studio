// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type {
  LabelStudioActiveTarget,
  LabelStudioPageContext,
  LabelStudioSessionContextSnapshot,
} from '@deepseek-ai/dsh-label-studio-protocol'
import { LabelStudioContextController } from '../src/client/context-state.ts'

const lease = {
  leaseId: '10000000-0000-4000-8000-000000000001', generation: 1, expiresAt: 8_000_000_000_000,
}

function context(page: LabelStudioPageContext, revision: number): LabelStudioSessionContextSnapshot {
  return {
    page,
    recentProjects: page.view === 'projects' ? [] : [{
      projectId: page.projectId,
      ...(page.view === 'task' ? { lastTaskId: page.taskId } : {}),
      lastVisitedAt: revision,
      availability: 'available',
    }],
    revision,
    binding: { recentProjects: [], revision: 0 },
  }
}

function harness(records: Record<string, LabelStudioSessionContextSnapshot>) {
  const calls: string[] = []
  let sessionId = ''
  const bridge = {
    currentHost: () => ({ version: 'one' }),
    onHostChanged: () => () => {},
    openLease: vi.fn(async (nextSessionId: string) => {
      sessionId = nextSessionId
      return { lease, replayBaseline: 0, sessionContext: records[sessionId] ?? context({ view: 'projects' }, 0) }
    }),
    closeLease: vi.fn(async () => true),
    waitEvents: vi.fn(() => new Promise(() => {})),
    reserveTarget: vi.fn(async () => {
      calls.push('reserve')
      return { lease, targetRevision: 1, navigationSequence: 1 }
    }),
    publishTarget: vi.fn(async (_lease: unknown, _revision: number, target: LabelStudioActiveTarget) => {
      calls.push('publish')
      return { sessionId: 'session', sourceId: 'source', ...lease, targetRevision: 1, target }
    }),
    commitPage: vi.fn(async (
      _lease: unknown,
      _sequence: number,
      expectedRevision: number,
      page: LabelStudioPageContext,
    ) => {
      calls.push('commit')
      const current = records[sessionId] ?? context({ view: 'projects' }, 0)
      const same = JSON.stringify(current.page) === JSON.stringify(page)
      const committed = context(page, same ? expectedRevision : expectedRevision + 1)
      records[sessionId] = committed
      return committed
    }),
    acknowledgeFocus: vi.fn(),
  }
  const page = {
    setOpen: vi.fn(),
    applyPage: vi.fn(async () => { calls.push('apply') }),
    clearPage: vi.fn(),
    reloadPage: vi.fn(),
  }
  const controller = new LabelStudioContextController(bridge as never, page as never, 'source' as never, {
    contextOpenRetryMs: 1000, contextCloseTimeoutMs: 100, eventHistorySize: 4,
  })
  return { bridge, calls, controller, page }
}

describe('Label Studio Session page context', () => {
  it('restores independent A and B pages and returns to A after switching A to B to A', async () => {
    const project = context({ view: 'project', projectId: 11 as never }, 3)
    const task = context({ view: 'task', projectId: 22 as never, taskId: 220 as never }, 7)
    const { controller, page } = harness({ a: project, b: task })

    controller.bindSession('a' as never)
    await vi.waitFor(() => { expect(page.applyPage).toHaveBeenLastCalledWith(project.page) })
    expect(controller.store.getSnapshot()).toMatchObject({ sessionContext: project, sessionContextStatus: 'ready' })
    controller.bindSession('b' as never)
    await vi.waitFor(() => { expect(page.applyPage).toHaveBeenLastCalledWith(task.page) })
    expect(controller.store.getSnapshot()).toMatchObject({ sessionContext: task, sessionContextStatus: 'ready' })
    controller.bindSession('a' as never)
    await vi.waitFor(() => { expect(page.applyPage).toHaveBeenLastCalledWith(project.page) })
    expect(controller.store.getSnapshot()).toMatchObject({ sessionContext: project })
  })

  it('restores a Webhook task binding when the older durable page is still the project list', async () => {
    const stored = {
      ...context({ view: 'projects' }, 0),
      binding: {
        target: {
          kind: 'task' as const,
          projectId: 236 as never,
          taskId: 487 as never,
          annotationId: 67 as never,
        },
        source: 'webhook' as const,
        boundAt: 10,
        recentProjects: [],
        revision: 1,
      },
    }
    const { controller, page } = harness({ a: stored })

    controller.bindSession('a' as never)

    await vi.waitFor(() => {
      expect(page.applyPage).toHaveBeenLastCalledWith({
        view: 'task', projectId: 236, taskId: 487, annotationId: 67,
      })
    })
  })

  it('does not mutate a binding when the iframe location changes without an inspection event', async () => {
    const stored = {
      ...context({ view: 'project', projectId: 11 as never }, 3),
      binding: {
        target: { kind: 'project' as const, projectId: 11 as never },
        source: 'tool-result' as const, boundAt: 3, recentProjects: [], revision: 1,
      },
    }
    const { controller } = harness({ a: stored })
    controller.bindSession('a' as never)
    await vi.waitFor(() => { expect(controller.store.getSnapshot().sessionContextStatus).toBe('ready') })
    window.history.pushState({}, '', '/projects/99/data?task=999')
    await Promise.resolve()
    expect(controller.store.getSnapshot().sessionContext.binding).toEqual(stored.binding)
  })

  it('commits task selection in reserve, apply, publish, commit order', async () => {
    const { calls, controller } = harness({ a: context({ view: 'projects' }, 0) })
    controller.bindSession('a' as never)
    await vi.waitFor(() => { expect(controller.store.getSnapshot().sessionContextStatus).toBe('ready') })
    calls.length = 0
    await controller.selectPage({ view: 'task', projectId: 11 as never, taskId: 110 as never })
    expect(calls).toEqual(['reserve', 'apply', 'publish', 'commit'])
    expect(controller.store.getSnapshot()).toMatchObject({
      sessionContext: { page: { view: 'task', projectId: 11, taskId: 110 }, revision: 1 },
      sessionContextStatus: 'ready',
    })
  })

  it('applies project pages before committing them and does not reserve a task target', async () => {
    const { bridge, calls, controller } = harness({ a: context({ view: 'projects' }, 0) })
    controller.bindSession('a' as never)
    await vi.waitFor(() => { expect(controller.store.getSnapshot().sessionContextStatus).toBe('ready') })
    calls.length = 0
    await controller.selectPage({ view: 'project', projectId: 11 as never })
    expect(calls).toEqual(['apply', 'commit'])
    expect(bridge.reserveTarget).not.toHaveBeenCalled()
  })

  it('fences an old page application after the selected Session changes', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const { bridge, controller, page } = harness({
      a: context({ view: 'project', projectId: 11 as never }, 3),
      b: context({ view: 'project', projectId: 22 as never }, 4),
    })
    page.applyPage.mockImplementationOnce(() => pending)
    controller.bindSession('a' as never)
    await vi.waitFor(() => { expect(page.applyPage).toHaveBeenCalledOnce() })
    controller.bindSession('b' as never)
    release()
    await vi.waitFor(() => { expect(page.applyPage).toHaveBeenCalledTimes(2) })
    expect(bridge.commitPage).not.toHaveBeenCalled()
    expect(controller.store.getSnapshot().sessionId).toBe('b')
  })

  it.each([
    ['session-context-conflict', 'conflict'],
    ['session-context-unavailable', 'unavailable'],
  ] as const)('exposes %s without replacing the last durable snapshot', async (code, status) => {
    const original = context({ view: 'projects' }, 0)
    const { bridge, controller } = harness({ a: original })
    controller.bindSession('a' as never)
    await vi.waitFor(() => { expect(controller.store.getSnapshot().sessionContextStatus).toBe('ready') })
    bridge.commitPage.mockRejectedValueOnce(Object.assign(new Error(code), {
      kind: 'plugin', error: { code, message: code, details: {} },
    }))
    await expect(controller.selectPage({ view: 'project', projectId: 11 as never })).rejects.toThrow(code)
    expect(controller.store.getSnapshot()).toMatchObject({
      sessionContext: original,
      sessionContextStatus: status,
    })
  })

  it('classifies an unknown page commit as unavailable and retries through lease restoration', async () => {
    const { bridge, controller } = harness({ a: context({ view: 'projects' }, 0) })
    controller.bindSession('a' as never)
    await vi.waitFor(() => { expect(controller.store.getSnapshot().sessionContextStatus).toBe('ready') })
    bridge.commitPage.mockRejectedValueOnce(Object.assign(new Error('lost'), { kind: 'transport-unknown' }))
    await expect(controller.selectPage({ view: 'project', projectId: 11 as never })).rejects.toThrow('lost')
    expect(controller.store.getSnapshot().sessionContextStatus).toBe('unavailable')
    controller.retrySessionContext()
    await vi.waitFor(() => { expect(bridge.openLease).toHaveBeenCalledTimes(2) })
  })
})
