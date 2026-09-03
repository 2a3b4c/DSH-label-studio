import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type { LabelStudioPageCommit, LabelStudioSessionContextSnapshot } from '@deepseek-ai/dsh-label-studio-protocol'
import { describe, expect, it, vi } from 'vitest'
import type { LabelStudioApi } from '../src/api.ts'
import { LabelStudioChangeBroker } from '../src/change-broker.ts'
import {
  labelStudioAnnotationId,
  labelStudioContextSourceId,
  labelStudioProjectId,
  labelStudioTaskId,
} from '../src/context-types.ts'
import { LabelStudioContextRegistry } from '../src/context-registry.ts'
import { LabelStudioOperationGate } from '../src/lifecycle.ts'
import type { LabelStudioRuntime } from '../src/runtime.ts'
import type { LabelStudioSessionIdentity } from '../src/session-context-spec.ts'
import type { LabelStudioSessionContextStore } from '../src/session-context-store.ts'
import { registerLabelStudioTools } from '../src/tools.ts'

const SESSION = 'focus-session'
const SOURCE = labelStudioContextSourceId('123e4567-e89b-42d3-a456-426614174001')
const CREATED_AT = 100

function contextStore(): LabelStudioSessionContextStore {
  let snapshot: LabelStudioSessionContextSnapshot = {
    page: { view: 'projects' }, recentProjects: [], revision: 0,
  }
  return {
    read: vi.fn(() => snapshot),
    commit: vi.fn(async (_identity: LabelStudioSessionIdentity, request: LabelStudioPageCommit) => {
      snapshot = { page: request.page, recentProjects: [], revision: snapshot.revision + 1 }
      return snapshot
    }),
  } as unknown as LabelStudioSessionContextStore
}

async function setup(focusAckTimeoutMs = 1_000) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const contexts = new LabelStudioContextRegistry(30_000)
  const changes = new LabelStudioChangeBroker(contexts, 64, contextStore())
  const operations = new LabelStudioOperationGate()
  const getProject = vi.fn()
  const getTask = vi.fn()
  const api = {
    getProject,
    getTask,
  } as unknown as LabelStudioApi
  const runtime = {
    config: { baseUrl: 'http://127.0.0.1:8080' },
    status: vi.fn(),
  } as unknown as LabelStudioRuntime
  const disposeTools = registerLabelStudioTools(
    ctx,
    runtime,
    api,
    contexts,
    changes,
    operations,
    { activeTaskMaxBytes: 262_144, focusAckTimeoutMs },
  )
  const open = () => contexts.openLease(SESSION as never, SOURCE, changes.latestRevision(SESSION as never))
  return { ctx, contexts, changes, operations, getProject, getTask, disposeTools, open }
}

function call(ctx: Context, args: unknown, controller = new AbortController(), sessionId?: string) {
  return ctx.tools.execute({
    callId: 'call-focus' as never,
    name: 'label_studio_focus_task',
    arguments: args,
    signal: controller.signal,
    ...sessionId === undefined ? {} : {
      agent: { id: sessionId, session: { header: { id: sessionId, createdAt: CREATED_AT } } } as never,
    },
  })
}

async function nextFocus(changes: LabelStudioChangeBroker) {
  const batch = await changes.wait(SESSION as never, 0, 1_000, new AbortController().signal)
  const event = batch.events.find(candidate => candidate.kind === 'focus-task')
  if (event?.kind !== 'focus-task') throw new Error('focus event was not published')
  return event
}

describe('label_studio_focus_task', () => {
  it('requires an owning Session and a live browser lease', async () => {
    const { ctx } = await setup()
    const withoutAgent = await call(ctx, { project_id: 228, task_id: 486 })
    const withoutLease = await call(ctx, { project_id: 228, task_id: 486 }, new AbortController(), SESSION)
    expect(withoutAgent.isError).toBe(true)
    expect(withoutAgent.content[0]?.type === 'text' ? withoutAgent.content[0].text : '').toContain('Session')
    expect(withoutLease.isError).toBe(true)
    expect(withoutLease.content[0]?.type === 'text' ? withoutLease.content[0].text : '').toContain('browser')
  })

  it('waits for the matching browser ACK before returning canonical output', async () => {
    const { ctx, contexts, changes, getProject, getTask, open } = await setup()
    const { lease } = open()
    const pending = call(ctx, { project_id: 228, task_id: 486, annotation_id: 731 }, new AbortController(), SESSION)
    const event = await nextFocus(changes)
    expect(event).toMatchObject({
      target: { projectId: 228, taskId: 486, annotationId: 731 },
      targetRevision: 1,
      committed: false,
    })
    expect(contexts.getLive(SESSION as never)).toBeUndefined()
    await changes.acknowledgeFocus(
      lease.leaseId, lease.generation, event.correlationId, event.targetRevision, event.target,
    )
    const result = await pending
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({ projectId: 228, taskId: 486, annotationId: 731, targetRevision: 1 })
    expect(result.content).toEqual([{
      type: 'text',
      text: 'Label Studio workbench applied the URL for task 486 in project 228; page loading was not checked.',
    }])
    expect(getProject).not.toHaveBeenCalled()
    expect(getTask).not.toHaveBeenCalled()
  })

  it('clears the old target while focus is pending and makes it readable only after ACK', async () => {
    const { ctx, contexts, changes, open } = await setup()
    const { lease } = open()
    const browserReservation = contexts.reserveBrowserTarget(lease.leaseId, lease.generation, 1 as never, 0)
    contexts.publishTarget(lease.leaseId, lease.generation, browserReservation.targetRevision, {
      projectId: labelStudioProjectId(1), taskId: labelStudioTaskId(2),
    })
    const pending = call(ctx, { project_id: 228, task_id: 486 }, new AbortController(), SESSION)
    const event = await nextFocus(changes)
    expect(contexts.getLive(SESSION as never)).toBeUndefined()
    const readWhilePending = await ctx.tools.execute({
      callId: 'read-pending' as never,
      name: 'label_studio_get_active_task',
      arguments: {},
      signal: new AbortController().signal,
      agent: { id: SESSION } as never,
    })
    expect(readWhilePending.isError).toBe(true)
    await changes.acknowledgeFocus(
      lease.leaseId, lease.generation, event.correlationId, event.targetRevision, event.target,
    )
    await expect(pending).resolves.toMatchObject({ isError: false })
    expect(contexts.getLive(SESSION as never)?.target).toEqual({ projectId: 228, taskId: 486 })
  })

  it('rejects timeout, cancellation, and lease loss with no committed target', async () => {
    const timed = await setup(1)
    timed.open()
    const timedResult = await call(
      timed.ctx, { project_id: 228, task_id: 486 }, new AbortController(), SESSION,
    )
    expect(timedResult.isError).toBe(true)
    expect(timed.contexts.getLive(SESSION as never)).toBeUndefined()

    const cancelled = await setup()
    cancelled.open()
    const controller = new AbortController()
    const cancelledCall = call(cancelled.ctx, { project_id: 228, task_id: 486 }, controller, SESSION)
    await nextFocus(cancelled.changes)
    controller.abort(new Error('cancel focus tool'))
    expect((await cancelledCall).isError).toBe(true)
    expect(cancelled.contexts.getLive(SESSION as never)).toBeUndefined()

    const closed = await setup()
    const { lease } = closed.open()
    const closedCall = call(closed.ctx, { project_id: 228, task_id: 486 }, new AbortController(), SESSION)
    await nextFocus(closed.changes)
    closed.contexts.closeLease(lease.leaseId, lease.generation)
    expect((await closedCall).isError).toBe(true)
    expect(closed.contexts.getLive(SESSION as never)).toBeUndefined()
  })

  it('aborts pending focus before the shared operation gate drains', async () => {
    const { ctx, changes, operations, open } = await setup()
    open()
    const pending = call(ctx, { project_id: 228, task_id: 486 }, new AbortController(), SESSION)
    await nextFocus(changes)
    operations.beginClose()
    await operations.drain()
    expect((await pending).isError).toBe(true)
  })

  it('rejects invalid identifiers before reserving browser state', async () => {
    const { ctx, contexts, changes, open } = await setup()
    open()
    const result = await call(ctx, { project_id: 0, task_id: 486 }, new AbortController(), SESSION)
    expect(result.isError).toBe(true)
    expect(contexts.getLease(SESSION as never)?.context).toEqual({ phase: 'vacant', targetRevision: 0 })
    expect(changes.latestRevision(SESSION as never)).toBe(0)
  })

  it('accepts an optional annotation id without requiring one', async () => {
    const { ctx, changes, contexts, open } = await setup()
    const { lease } = open()
    const pending = call(ctx, {
      project_id: labelStudioProjectId(228),
      task_id: labelStudioTaskId(486),
      annotation_id: labelStudioAnnotationId(731),
    }, new AbortController(), SESSION)
    const event = await nextFocus(changes)
    await changes.acknowledgeFocus(
      lease.leaseId, lease.generation, event.correlationId, event.targetRevision, event.target,
    )
    await expect(pending).resolves.toMatchObject({ isError: false })
    expect(contexts.getLive(SESSION as never)?.target.annotationId).toBe(731)
  })
})
