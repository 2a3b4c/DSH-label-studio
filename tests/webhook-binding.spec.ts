import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it, vi } from 'vitest'
import { labelStudioAnnotationId, labelStudioProjectId, labelStudioTaskId } from '../src/context-types.ts'
import { LabelStudioWebhookBindingCoordinator } from '../src/webhook-binding.ts'

const A = 'session-a' as SessionId
const B = 'session-b' as SessionId

function harness() {
  const bindings = [
    { sessionId: A, binding: { target: { kind: 'project' as const, projectId: labelStudioProjectId(2) }, source: 'tool-result' as const, boundAt: 1, recentProjects: [], revision: 1 } },
    { sessionId: B, binding: { target: { kind: 'task' as const, projectId: labelStudioProjectId(2), taskId: labelStudioTaskId(21) }, source: 'tool-result' as const, boundAt: 1, recentProjects: [], revision: 1 } },
  ]
  const store = {
    listBindings: vi.fn(() => bindings),
    readBinding: vi.fn(() => ({ recentProjects: [], revision: 0 })),
    commitBinding: vi.fn(async (_identity, request) => ({
      kind: 'committed' as const,
      snapshot: { target: request.target, source: request.source, boundAt: 2, recentProjects: [], revision: 1 },
    })),
    reconcileProjectDeleted: vi.fn(async () => [{ sessionId: A, before: bindings[0]!.binding, after: { recentProjects: [], revision: 2 } }]),
    reconcileTasksDeleted: vi.fn(async () => [{ sessionId: B, before: bindings[1]!.binding, after: { target: { kind: 'project', projectId: 2 }, source: 'webhook', boundAt: 2, recentProjects: [], revision: 2 } }]),
  }
  const broker = {
    publishBindingChanged: vi.fn(),
    publishWebhookUnassigned: vi.fn(),
  }
  return { bindings, store, broker, coordinator: new LabelStudioWebhookBindingCoordinator(store, broker) }
}

describe('LabelStudioWebhookBindingCoordinator', () => {
  it('only matches existing project/task bindings and never writes for creation events', async () => {
    const value = harness()
    await expect(value.coordinator.accept({ action: 'TASKS_CREATED', projectId: labelStudioProjectId(2), taskIds: [labelStudioTaskId(99)] }))
      .resolves.toEqual({ kind: 'matched-existing', sessionIds: [A, B] })
    await expect(value.coordinator.accept({ action: 'ANNOTATION_CREATED', projectId: labelStudioProjectId(2), items: [{ taskId: labelStudioTaskId(21), annotationId: 7 as never }] }))
      .resolves.toEqual({ kind: 'matched-existing', sessionIds: [B] })
    expect(value.store.reconcileProjectDeleted).not.toHaveBeenCalled()
    expect(value.store.reconcileTasksDeleted).not.toHaveBeenCalled()
  })

  it('reports an event without an existing exact binding as unassigned without identifiers', async () => {
    const value = harness()
    await expect(value.coordinator.accept({ action: 'PROJECT_CREATED', projectId: labelStudioProjectId(9) }))
      .resolves.toEqual({ kind: 'unassigned', reason: 'no-matching-binding' })
    expect(value.broker.publishWebhookUnassigned).toHaveBeenCalledWith()
  })

  it('binds an annotation to the only live Session whose inspected iframe shows the exact task', async () => {
    const value = harness()
    value.bindings.splice(0)
    const identities = new Map([
      [A, { sessionId: A, createdAt: 10 }],
      [B, { sessionId: B, createdAt: 20 }],
    ])
    const currentPages = {
      request: vi.fn(async (identity: { sessionId: SessionId }) => identity.sessionId === A
        ? { view: 'task' as const, projectId: labelStudioProjectId(2), taskId: labelStudioTaskId(21) }
        : { view: 'project' as const, projectId: labelStudioProjectId(3) }),
    }
    const coordinator = new LabelStudioWebhookBindingCoordinator(value.store, value.broker, {
      sessionIds: () => [A, B],
      resolveIdentity: async sessionId => identities.get(sessionId)!,
      currentPages,
      timeoutMs: 100,
    })

    await expect(coordinator.accept({
      action: 'ANNOTATION_CREATED',
      projectId: labelStudioProjectId(2),
      items: [{ taskId: labelStudioTaskId(21), annotationId: labelStudioAnnotationId(7) }],
    })).resolves.toEqual({ kind: 'bound-from-live-page', sessionId: A })
    expect(value.store.commitBinding).toHaveBeenCalledWith(identities.get(A), {
      expectedRevision: 0,
      target: {
        kind: 'task', projectId: labelStudioProjectId(2), taskId: labelStudioTaskId(21),
        annotationId: labelStudioAnnotationId(7),
      },
      source: 'webhook',
    })
    expect(value.broker.publishBindingChanged).toHaveBeenCalledWith(A, expect.objectContaining({
      target: expect.objectContaining({ projectId: 2, taskId: 21, annotationId: 7 }),
      source: 'webhook',
    }))
  })

  it('does not guess when more than one live iframe shows the annotated task', async () => {
    const value = harness()
    value.bindings.splice(0)
    const coordinator = new LabelStudioWebhookBindingCoordinator(value.store, value.broker, {
      sessionIds: () => [A, B],
      resolveIdentity: async sessionId => ({ sessionId, createdAt: sessionId === A ? 10 : 20 }),
      currentPages: {
        request: vi.fn(async () => ({
          view: 'task' as const, projectId: labelStudioProjectId(2), taskId: labelStudioTaskId(21),
        })),
      },
      timeoutMs: 100,
    })

    await expect(coordinator.accept({
      action: 'ANNOTATION_CREATED',
      projectId: labelStudioProjectId(2),
      items: [{ taskId: labelStudioTaskId(21), annotationId: labelStudioAnnotationId(7) }],
    })).resolves.toEqual({ kind: 'unassigned', reason: 'no-matching-binding' })
    expect(value.store.commitBinding).not.toHaveBeenCalled()
  })

  it('reconciles project and task deletion and publishes complete changed bindings', async () => {
    const project = harness()
    await expect(project.coordinator.accept({ action: 'PROJECT_DELETED', projectId: labelStudioProjectId(2) }))
      .resolves.toEqual({ kind: 'reconciled-deletion', affectedSessionIds: [A] })
    expect(project.broker.publishBindingChanged).toHaveBeenCalledWith(A, { recentProjects: [], revision: 2 })

    const task = harness()
    await expect(task.coordinator.accept({ action: 'TASKS_DELETED', projectId: labelStudioProjectId(2), taskIds: [labelStudioTaskId(21)] }))
      .resolves.toEqual({ kind: 'reconciled-deletion', affectedSessionIds: [B] })
    expect(task.store.reconcileTasksDeleted).toHaveBeenCalledWith(2, [21])
  })

  it('does not alter bindings for annotation deletion', async () => {
    const value = harness()
    await expect(value.coordinator.accept({ action: 'ANNOTATIONS_DELETED', projectId: labelStudioProjectId(2), annotationIds: [7 as never] }))
      .resolves.toEqual({ kind: 'reconciled-deletion', affectedSessionIds: [] })
    expect(value.store.reconcileProjectDeleted).not.toHaveBeenCalled()
    expect(value.store.reconcileTasksDeleted).not.toHaveBeenCalled()
  })
})
