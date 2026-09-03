import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  LabelStudioBindingCommitOutcome,
  LabelStudioBindingSnapshot,
  LabelStudioBindingTarget,
  LabelStudioPageContext,
} from '@deepseek-ai/dsh-label-studio-protocol'
import { describe, expect, it, vi } from 'vitest'
import type { LabelStudioProjectView, LabelStudioTaskView } from '../src/api.ts'
import {
  LabelStudioOperationContextError,
  LabelStudioOperationContextResolver,
} from '../src/operation-context.ts'
import type { LabelStudioSessionIdentity } from '../src/session-context-spec.ts'
import {
  labelStudioAnnotationId,
  labelStudioProjectId,
  labelStudioTaskId,
} from '../src/context-types.ts'

const identity: LabelStudioSessionIdentity = {
  sessionId: 'session-a' as SessionId,
  createdAt: 100,
}
const project7 = { kind: 'project', projectId: labelStudioProjectId(7) } as const
const task11 = {
  kind: 'task',
  projectId: labelStudioProjectId(7),
  taskId: labelStudioTaskId(11),
} as const

function project(id = 7): LabelStudioProjectView {
  return { id: labelStudioProjectId(id), labelConfig: '<View />', showCollabPredictions: false }
}

function task(id = 11, projectId = 7): LabelStudioTaskView {
  return {
    id: labelStudioTaskId(id),
    projectId: labelStudioProjectId(projectId),
    data: {},
    annotations: [],
    predictions: [],
  }
}

function binding(
  target?: LabelStudioBindingTarget,
  revision = 0,
): LabelStudioBindingSnapshot {
  return target === undefined
    ? { recentProjects: [{ projectId: labelStudioProjectId(99), lastVisitedAt: 1, availability: 'available' }], revision }
    : { target, source: 'tool-result', boundAt: 1, recentProjects: [], revision }
}

function harness(options: {
  binding?: LabelStudioBindingSnapshot
  page?: LabelStudioPageContext
  commit?: LabelStudioBindingCommitOutcome
} = {}) {
  const snapshot = options.binding ?? binding()
  const readBinding = vi.fn(() => snapshot)
  const commitBinding = vi.fn(async () => options.commit ?? ({
    kind: 'committed',
    snapshot: binding(task11, snapshot.revision + 1),
  } satisfies LabelStudioBindingCommitOutcome))
  const request = vi.fn(async () => options.page ?? ({
    view: 'task', projectId: labelStudioProjectId(7), taskId: labelStudioTaskId(11),
  } satisfies LabelStudioPageContext))
  const getProject = vi.fn(async (projectId: ReturnType<typeof labelStudioProjectId>) => project(projectId))
  const getTask = vi.fn(async (taskId: ReturnType<typeof labelStudioTaskId>) => task(taskId))
  const resolver = new LabelStudioOperationContextResolver(
    { readBinding, commitBinding },
    { request },
    { getProject, getTask },
    250,
  )
  return { resolver, readBinding, commitBinding, request, getProject, getTask }
}

describe('LabelStudioOperationContextResolver', () => {
  it('prefers explicit ids and verifies task-to-project association without inspecting the page', async () => {
    const value = harness({ binding: binding(project7, 4) })
    await expect(value.resolver.resolve(identity, 'task', {
      mode: 'explicit',
      projectId: labelStudioProjectId(7),
      taskId: labelStudioTaskId(11),
      annotationId: labelStudioAnnotationId(13),
    }, new AbortController().signal)).resolves.toEqual({
      identity,
      target: { ...task11, annotationId: 13 },
      source: 'explicit',
      expectedBindingRevision: 4,
    })
    expect(value.getTask).toHaveBeenCalledWith(11, expect.any(AbortSignal))
    expect(value.request).not.toHaveBeenCalled()
  })

  it('rejects an explicit project that disagrees with the authoritative task', async () => {
    const value = harness()
    await expect(value.resolver.resolve(identity, 'task', {
      mode: 'explicit', projectId: labelStudioProjectId(8), taskId: labelStudioTaskId(11),
    }, new AbortController().signal)).rejects.toMatchObject({
      name: 'LabelStudioOperationContextError', code: 'binding-target-mismatch',
    })
  })

  it('forces current-page inspection even when a usable binding exists', async () => {
    const value = harness({ binding: binding(project7, 3), page: {
      view: 'task', projectId: labelStudioProjectId(7), taskId: labelStudioTaskId(11),
    } })
    await expect(value.resolver.resolve(identity, 'task', { mode: 'current-page' }, new AbortController().signal))
      .resolves.toMatchObject({ target: task11, source: 'current-page', expectedBindingRevision: 3 })
    expect(value.request).toHaveBeenCalledWith(identity, 250, expect.any(AbortSignal))
  })

  it('uses a sufficient binding and accepts a task target for a project requirement', async () => {
    const value = harness({ binding: binding(task11, 2) })
    await expect(value.resolver.resolve(identity, 'project', { mode: 'binding' }, new AbortController().signal))
      .resolves.toMatchObject({ target: task11, source: 'binding', expectedBindingRevision: 2 })
    expect(value.request).not.toHaveBeenCalled()
  })

  it('falls back once to current-page when the binding is absent or below the required level', async () => {
    const absent = harness({ binding: binding(undefined, 5) })
    await absent.resolver.resolve(identity, 'task', { mode: 'binding' }, new AbortController().signal)
    expect(absent.request).toHaveBeenCalledTimes(1)

    const projectOnly = harness({ binding: binding(project7, 6) })
    await projectOnly.resolver.resolve(identity, 'task', { mode: 'binding' }, new AbortController().signal)
    expect(projectOnly.request).toHaveBeenCalledTimes(1)
  })

  it('never falls back to recent projects and rejects the projects page explicitly', async () => {
    const value = harness({ binding: binding(undefined, 5), page: { view: 'projects' } })
    await expect(value.resolver.resolve(identity, 'project', { mode: 'binding' }, new AbortController().signal))
      .rejects.toEqual(expect.objectContaining<Partial<LabelStudioOperationContextError>>({
        code: 'binding-missing',
      }))
    expect(value.getProject).not.toHaveBeenCalledWith(99, expect.anything())
  })

  it('requires a task target for task operations but permits project targets for project operations', async () => {
    const taskRequirement = harness({ page: { view: 'project', projectId: labelStudioProjectId(7) } })
    await expect(taskRequirement.resolver.resolve(
      identity, 'task', { mode: 'current-page' }, new AbortController().signal,
    )).rejects.toMatchObject({ code: 'binding-target-mismatch' })

    const projectRequirement = harness({ page: { view: 'project', projectId: labelStudioProjectId(7) } })
    await expect(projectRequirement.resolver.resolve(
      identity, 'project', { mode: 'current-page' }, new AbortController().signal,
    )).resolves.toMatchObject({ target: project7 })
  })

  it('passes cancellation to REST verification and leaves binding state untouched', async () => {
    const value = harness({ binding: binding(project7, 8) })
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    value.getProject.mockRejectedValueOnce(controller.signal.reason)
    await expect(value.resolver.resolve(identity, 'project', {
      mode: 'explicit', projectId: labelStudioProjectId(7),
    }, controller.signal)).rejects.toBe(controller.signal.reason)
    expect(value.commitBinding).not.toHaveBeenCalled()
    expect(value.readBinding(identity).revision).toBe(8)
  })

  it('propagates a missing REST target without committing a binding', async () => {
    const value = harness({ binding: binding(project7, 8) })
    const missing = Object.assign(new Error('not found'), { status: 404 })
    value.getProject.mockRejectedValueOnce(missing)
    await expect(value.resolver.resolve(identity, 'project', {
      mode: 'explicit', projectId: labelStudioProjectId(7),
    }, new AbortController().signal)).rejects.toBe(missing)
    expect(value.commitBinding).not.toHaveBeenCalled()
    expect(value.readBinding(identity).revision).toBe(8)
  })

  it('writes only after an explicit successful-result commit', async () => {
    const value = harness({ binding: binding(project7, 4) })
    const resolved = await value.resolver.resolve(identity, 'project', {
      mode: 'explicit', projectId: labelStudioProjectId(7),
    }, new AbortController().signal)
    expect(value.commitBinding).not.toHaveBeenCalled()

    await value.resolver.commitSuccessfulResult(
      identity, resolved.target, 'tool-result', resolved.expectedBindingRevision,
    )
    expect(value.commitBinding).toHaveBeenCalledWith(identity, {
      target: project7, source: 'tool-result', expectedRevision: 4,
    })
  })

  it('returns a CAS conflict without throwing or retrying the successful business operation', async () => {
    const current = binding(project7, 6)
    const conflict = { kind: 'conflict', current } as const
    const value = harness({ binding: binding(task11, 5), commit: conflict })
    await expect(value.resolver.commitSuccessfulResult(identity, task11, 'tool-result', 5))
      .resolves.toEqual(conflict)
    expect(value.commitBinding).toHaveBeenCalledTimes(1)
  })
})
