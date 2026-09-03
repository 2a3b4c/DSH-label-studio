import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { describe, expect, it, vi } from 'vitest'
import {
  LabelStudioHttpError,
  LabelStudioMutationOutcomeUnknownError,
  type LabelStudioApi,
} from '../src/api.ts'
import { LabelStudioChangeBroker } from '../src/change-broker.ts'
import {
  labelStudioAnnotationId,
  labelStudioContextSourceId,
  labelStudioNavigationSequence,
  labelStudioPredictionId,
  labelStudioProjectId,
  labelStudioTaskId,
} from '../src/context-types.ts'
import { LabelStudioContextRegistry } from '../src/context-registry.ts'
import { LabelStudioOperationGate } from '../src/lifecycle.ts'
import type { LabelStudioRuntime } from '../src/runtime.ts'
import { registerLabelStudioTools } from '../src/tools.ts'
import type { LabelStudioSessionContextStore } from '../src/session-context-store.ts'

const signal = new AbortController().signal

const ACTIVE_SESSION = 'active-session'
const SOURCE_ID = labelStudioContextSourceId('123e4567-e89b-42d3-a456-426614174000')

async function setup(activeTaskMaxBytes = 262_144, clock: () => number = Date.now) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const status = vi.fn().mockResolvedValue({
    available: true, baseUrl: 'http://127.0.0.1:8080', managed: true,
  })
  const runtime = {
    config: { baseUrl: 'http://127.0.0.1:8080' },
    status,
  } as unknown as LabelStudioRuntime
  const createProject = vi.fn().mockResolvedValue({ id: 7, title: 'Images' })
  const importTasks = vi.fn().mockResolvedValue({ taskCount: 2, taskIds: [11, 12] })
  const createPrediction = vi.fn().mockResolvedValue({ id: 19, taskId: 11, modelVersion: 'dsh' })
  const project = {
    id: labelStudioProjectId(7),
    labelConfig: '<View><Choices name="answer" toName="text" /></View>',
    showCollabPredictions: false,
  }
  const task = {
    id: labelStudioTaskId(11),
    projectId: labelStudioProjectId(7),
    data: { text: 'Is this a ship?', image: '/data/a.jpg' },
    annotations: [{
      id: labelStudioAnnotationId(13),
      projectId: labelStudioProjectId(7),
      taskId: labelStudioTaskId(11),
      result: [{ value: { choices: ['yes'] } }],
      updatedAt: '2026-09-01T00:00:00Z',
    }],
    predictions: [{
      id: labelStudioPredictionId(19),
      projectId: labelStudioProjectId(7),
      taskId: labelStudioTaskId(11),
      result: [{ value: { rectanglelabels: ['ship'], original_width: 640 } }],
      modelVersion: 'dsh',
      score: 0.9,
    }],
  }
  const getProject = vi.fn().mockResolvedValue(project)
  const getTask = vi.fn().mockResolvedValue(task)
  const api = {
    createProject,
    importTasks,
    createPrediction,
    getProject,
    getTask,
  } as unknown as LabelStudioApi
  const contexts = new LabelStudioContextRegistry(30_000, clock)
  const sessionContexts = {
    read: vi.fn(() => ({ page: { view: 'projects' }, recentProjects: [], revision: 0 })),
    commit: vi.fn(),
    markProjectDeleted: vi.fn(async () => ({
      page: { view: 'projects' },
      recentProjects: [{ projectId: 7, lastTaskId: 11, lastVisitedAt: 1000, availability: 'deleted' }],
      revision: 2,
    })),
  } as unknown as LabelStudioSessionContextStore
  const changes = new LabelStudioChangeBroker(contexts, 64, sessionContexts)
  const operations = new LabelStudioOperationGate()
  const disposeTools = registerLabelStudioTools(
    ctx,
    runtime,
    api,
    contexts,
    changes,
    operations,
    { activeTaskMaxBytes, focusAckTimeoutMs: 5_000 },
  )
  const activate = () => {
    const opened = contexts.openLease(ACTIVE_SESSION as never, SOURCE_ID, 0)
    const reserved = contexts.reserveBrowserTarget(
      opened.lease.leaseId,
      opened.lease.generation,
      labelStudioNavigationSequence(1),
      0,
    )
    contexts.publishTarget(opened.lease.leaseId, opened.lease.generation, reserved.targetRevision, {
      projectId: labelStudioProjectId(7),
      taskId: labelStudioTaskId(11),
      annotationId: labelStudioAnnotationId(13),
    })
    return opened
  }
  return {
    ctx,
    status,
    createProject,
    importTasks,
    createPrediction,
    getProject,
    getTask,
    project,
    task,
    contexts,
    changes,
    sessionContexts,
    activate,
    operations,
    disposeTools,
  }
}

async function call(
  ctx: Context,
  name: string,
  args: unknown,
  sessionId?: string,
  callSignal: AbortSignal = signal,
) {
  return ctx.tools.execute({
    callId: `call-${name}` as never,
    name,
    arguments: args,
    signal: callSignal,
    ...sessionId === undefined ? {} : {
      agent: { id: sessionId, session: { header: { createdAt: 0 } } } as never,
    },
  })
}

function firstToolText(result: unknown): string {
  if (typeof result !== 'object' || result === null || !('content' in result)) {
    throw new Error('tool result has no content')
  }
  const content = result.content
  if (!Array.isArray(content) || typeof content[0] !== 'object' || content[0] === null) {
    throw new Error('tool result has no first content item')
  }
  const item = content[0] as Record<string, unknown>
  if (typeof item.text !== 'string') throw new Error('first tool content item has no text')
  return item.text
}

describe('Label Studio tools', () => {
  it('registers status, project, import, prediction, focus, active-task, and active-prediction tools', async () => {
    const { ctx } = await setup()
    const names = ctx.tools.schemas().map(schema => schema.name).sort()
    expect(names).toEqual([
      'label_studio_create_active_prediction',
      'label_studio_create_prediction',
      'label_studio_create_project',
      'label_studio_focus_task',
      'label_studio_get_active_task',
      'label_studio_import_tasks',
      'label_studio_status',
    ])
    expect(names).not.toContain('label_studio_update_active_annotation')
  })

  it('requires an owning agent and a live committed target', async () => {
    const { ctx, getProject, getTask } = await setup()
    const withoutAgent = await call(ctx, 'label_studio_get_active_task', {})
    const withoutTarget = await call(ctx, 'label_studio_get_active_task', {}, ACTIVE_SESSION)
    expect(withoutAgent.isError).toBe(true)
    expect(firstToolText(withoutAgent)).toContain('Session')
    expect(withoutTarget.isError).toBe(true)
    expect(firstToolText(withoutTarget)).toContain('active task')
    expect(getProject).not.toHaveBeenCalled()
    expect(getTask).not.toHaveBeenCalled()
  })

  it('does not fall back to an expired target', async () => {
    let now = 0
    const { ctx, activate, getProject, getTask } = await setup(262_144, () => now)
    activate()
    now = 30_000
    const result = await call(ctx, 'label_studio_get_active_task', {}, ACTIVE_SESSION)
    expect(result.isError).toBe(true)
    expect(getProject).not.toHaveBeenCalled()
    expect(getTask).not.toHaveBeenCalled()
  })

  it('reads authoritative project and task JSON into the model result', async () => {
    const { ctx, activate, getProject, getTask, project, task } = await setup()
    activate()
    const result = await call(ctx, 'label_studio_get_active_task', {}, ACTIVE_SESSION)
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({ project, task })
    expect(getProject).toHaveBeenCalledWith(labelStudioProjectId(7), expect.any(AbortSignal))
    expect(getTask).toHaveBeenCalledWith(labelStudioTaskId(11), expect.any(AbortSignal))
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ project, task }, null, 2) }])
    expect(result.meta).toEqual({ projectId: 7, taskId: 11, annotationCount: 1, predictionCount: 1 })
  })

  it('marks a missing active project deleted and retires its live lease', async () => {
    const { ctx, activate, contexts, getProject, getTask, sessionContexts } = await setup()
    activate()
    getProject.mockRejectedValueOnce(new LabelStudioHttpError('GET', '/api/projects/7/', 404))

    const result = await call(ctx, 'label_studio_get_active_task', {}, ACTIVE_SESSION)

    expect(result.isError).toBe(true)
    expect(firstToolText(result)).toContain('404')
    expect(getProject).toHaveBeenCalledOnce()
    expect(sessionContexts.markProjectDeleted).toHaveBeenCalledWith(
      { sessionId: ACTIVE_SESSION, createdAt: 0 },
      labelStudioProjectId(7),
    )
    expect(contexts.getLease(ACTIVE_SESSION as never)).toBeUndefined()
    expect(getTask).not.toHaveBeenCalled()
  })

  it('fails instead of truncating an oversized model result', async () => {
    const { ctx, activate } = await setup(64)
    activate()
    const result = await call(ctx, 'label_studio_get_active_task', {}, ACTIVE_SESSION)
    expect(result.isError).toBe(true)
    expect(firstToolText(result)).toContain('activeTaskMaxBytes')
    expect(JSON.stringify(result.content)).not.toContain('Is this a ship?')
  })

  it('returns canonical status and project identities', async () => {
    const { ctx, status: statusSpy, createProject } = await setup()
    const status = await call(ctx, 'label_studio_status', {})
    expect(status.value).toEqual({
      available: true, baseUrl: 'http://127.0.0.1:8080', managed: true,
    })

    const project = await call(ctx, 'label_studio_create_project', {
      title: 'Images', label_config: '<View />', description: 'Course data',
    })
    expect(project.value).toEqual({
      id: 7, title: 'Images', webUrl: 'http://127.0.0.1:8080/projects/7/data',
    })
    expect(statusSpy).toHaveBeenCalledWith(expect.any(AbortSignal))
    expect(createProject).toHaveBeenCalledWith({
      title: 'Images', labelConfig: '<View />', description: 'Course data',
    }, expect.any(AbortSignal))
  })

  it('imports tasks and creates nested prediction results', async () => {
    const { ctx, importTasks, createPrediction } = await setup()
    const tasks = [{ data: { image: '/data/a.jpg' } }]
    const imported = await call(ctx, 'label_studio_import_tasks', { project_id: 7, tasks })
    expect(imported.value).toEqual({ projectId: 7, taskCount: 2, taskIds: [11, 12] })
    expect(importTasks).toHaveBeenCalledWith(7, tasks, expect.any(AbortSignal))

    const result = [{ from_name: 'label', to_name: 'image', type: 'rectanglelabels', value: { rectanglelabels: ['ship'] } }]
    const prediction = await call(ctx, 'label_studio_create_prediction', {
      task_id: 11, result, model_version: 'dsh', score: 0.9,
    })
    expect(prediction.value).toEqual({ id: 19, taskId: 11, modelVersion: 'dsh' })
    expect(createPrediction).toHaveBeenCalledWith({
      taskId: 11, result, modelVersion: 'dsh', score: 0.9,
    }, expect.any(AbortSignal))
  })

  it('rejects non-array task and prediction JSON before the API call', async () => {
    const { ctx, importTasks, createPrediction } = await setup()
    const imported = await call(ctx, 'label_studio_import_tasks', { project_id: 7, tasks: {} })
    const predicted = await call(ctx, 'label_studio_create_prediction', { task_id: 11, result: {} })
    expect(imported.isError).toBe(true)
    expect(predicted.isError).toBe(true)
    expect(importTasks).not.toHaveBeenCalled()
    expect(createPrediction).not.toHaveBeenCalled()
  })

  it('requires an owning Session and its live committed target for active prediction', async () => {
    const { ctx, getTask, createPrediction, changes } = await setup()
    const withoutAgent = await call(ctx, 'label_studio_create_active_prediction', { result: [] })
    const withoutTarget = await call(
      ctx,
      'label_studio_create_active_prediction',
      { result: [] },
      ACTIVE_SESSION,
    )
    expect(withoutAgent.isError).toBe(true)
    expect(firstToolText(withoutAgent)).toContain('Session')
    expect(withoutTarget.isError).toBe(true)
    expect(firstToolText(withoutTarget)).toContain('active task')
    expect(getTask).not.toHaveBeenCalled()
    expect(createPrediction).not.toHaveBeenCalled()
    expect(changes.latestRevision(ACTIVE_SESSION as never)).toBe(0)
  })

  it('validates the active task association, creates a prediction, and then publishes one refresh event', async () => {
    const { ctx, activate, getProject, getTask, createPrediction, changes } = await setup()
    activate()
    const resultPayload = [
      { from_name: 'answer', to_name: 'text', type: 'choices', value: { choices: ['yes'] } },
      { from_name: 'reason', to_name: 'text', type: 'textarea', value: { text: ['A ship is visible.'] } },
    ]
    const result = await call(ctx, 'label_studio_create_active_prediction', {
      result: resultPayload,
      model_version: 'dsh',
      score: 0.9,
    }, ACTIVE_SESSION)
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      id: 19,
      projectId: 7,
      taskId: 11,
      modelVersion: 'dsh',
      eventRevision: 1,
    })
    expect(result.content).toEqual([{
      type: 'text',
      text: 'Created Label Studio prediction 19 for active task 11 in project 7.',
    }])
    expect(getProject).not.toHaveBeenCalled()
    expect(getTask).toHaveBeenCalledWith(labelStudioTaskId(11), expect.any(AbortSignal))
    expect(createPrediction).toHaveBeenCalledWith({
      taskId: 11,
      result: resultPayload,
      modelVersion: 'dsh',
      score: 0.9,
    }, expect.any(AbortSignal))
    await expect(changes.wait(
      ACTIVE_SESSION as never,
      0,
      1_000,
      new AbortController().signal,
    )).resolves.toMatchObject({
      latestRevision: 1,
      events: [{ kind: 'task-changed', eventRevision: 1, taskId: 11, reason: 'prediction-created' }],
    })
  })

  it.each([
    {
      name: 'Choices and TextArea',
      result: [
        { from_name: 'answer', to_name: 'text', type: 'choices', value: { choices: ['yes'] } },
        { from_name: 'reason', to_name: 'text', type: 'textarea', value: { text: ['Visible hull.'] } },
      ],
    },
    {
      name: 'image rectangle geometry',
      result: [{
        from_name: 'label',
        to_name: 'image',
        type: 'rectanglelabels',
        original_width: 1280,
        original_height: 720,
        image_rotation: 0,
        value: { x: 10, y: 20, width: 30, height: 40, rectanglelabels: ['ship'] },
      }],
    },
  ])('passes an explicit $name result without inferring from annotations', async ({ result }) => {
    const { ctx, activate, createPrediction } = await setup()
    activate()
    await expect(call(
      ctx,
      'label_studio_create_active_prediction',
      { result },
      ACTIVE_SESSION,
    )).resolves.toMatchObject({ isError: false })
    expect(createPrediction).toHaveBeenCalledWith({ taskId: 11, result }, expect.any(AbortSignal))
  })

  it('rejects a mismatched task project before prediction dispatch', async () => {
    const { ctx, activate, task, getTask, createPrediction, changes } = await setup()
    activate()
    getTask.mockResolvedValueOnce({ ...task, projectId: labelStudioProjectId(8) })
    const result = await call(
      ctx,
      'label_studio_create_active_prediction',
      { result: [] },
      ACTIVE_SESSION,
    )
    expect(result.isError).toBe(true)
    expect(firstToolText(result)).toContain('project')
    expect(createPrediction).not.toHaveBeenCalled()
    expect(changes.latestRevision(ACTIVE_SESSION as never)).toBe(0)
  })

  it('does not dispatch after the active target changes during task validation', async () => {
    const { ctx, activate, contexts, task, getTask, createPrediction, changes } = await setup()
    const { lease } = activate()
    let resolveTask!: (value: typeof task) => void
    getTask.mockImplementationOnce(() => new Promise((resolve) => { resolveTask = resolve }))
    const pending = call(
      ctx,
      'label_studio_create_active_prediction',
      { result: [] },
      ACTIVE_SESSION,
    )
    await vi.waitFor(() => { expect(getTask).toHaveBeenCalledOnce() })
    const next = contexts.reserveBrowserTarget(
      lease.leaseId,
      lease.generation,
      labelStudioNavigationSequence(2),
      1,
    )
    contexts.publishTarget(lease.leaseId, lease.generation, next.targetRevision, {
      projectId: labelStudioProjectId(7),
      taskId: labelStudioTaskId(12),
    })
    resolveTask(task)
    const result = await pending
    expect(result.isError).toBe(true)
    expect(firstToolText(result)).toContain('active task changed')
    expect(createPrediction).not.toHaveBeenCalled()
    expect(changes.latestRevision(ACTIVE_SESSION as never)).toBe(0)
  })

  it.each([
    new Error('label-studio: POST /api/predictions/ returned 422'),
    new LabelStudioMutationOutcomeUnknownError('POST /api/predictions/'),
  ])('does not publish or retry after prediction failure: %s', async (failure) => {
    const { ctx, activate, createPrediction, changes } = await setup()
    activate()
    createPrediction.mockRejectedValueOnce(failure)
    const result = await call(
      ctx,
      'label_studio_create_active_prediction',
      { result: [{ type: 'unsupported' }] },
      ACTIVE_SESSION,
    )
    expect(result.isError).toBe(true)
    expect(createPrediction).toHaveBeenCalledOnce()
    expect(changes.latestRevision(ACTIVE_SESSION as never)).toBe(0)
  })

  it('keeps a successful prediction successful after a browser long poll disconnects', async () => {
    const { ctx, activate, createPrediction, changes } = await setup()
    activate()
    const disconnected = new AbortController()
    const wait = changes.wait(ACTIVE_SESSION as never, 0, 1_000, disconnected.signal)
    disconnected.abort(new Error('browser disconnected'))
    await expect(wait).rejects.toThrow('browser disconnected')
    const result = await call(
      ctx,
      'label_studio_create_active_prediction',
      { result: [] },
      ACTIVE_SESSION,
    )
    expect(result.isError).toBe(false)
    expect(createPrediction).toHaveBeenCalledOnce()
    expect(changes.latestRevision(ACTIVE_SESSION as never)).toBe(1)
  })

  it('does not dispatch when already cancelled and drains a dispatched unknown outcome', async () => {
    const before = await setup()
    before.activate()
    const alreadyCancelled = new AbortController()
    alreadyCancelled.abort(new Error('cancel before dispatch'))
    const cancelled = await call(
      before.ctx,
      'label_studio_create_active_prediction',
      { result: [] },
      ACTIVE_SESSION,
      alreadyCancelled.signal,
    )
    expect(cancelled.isError).toBe(true)
    expect(before.createPrediction).not.toHaveBeenCalled()
    expect(before.changes.latestRevision(ACTIVE_SESSION as never)).toBe(0)

    const after = await setup()
    after.activate()
    let rejectDispatch!: (error: unknown) => void
    after.createPrediction.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectDispatch = reject
    }))
    const pending = call(
      after.ctx,
      'label_studio_create_active_prediction',
      { result: [] },
      ACTIVE_SESSION,
    )
    await vi.waitFor(() => { expect(after.createPrediction).toHaveBeenCalledOnce() })
    after.operations.beginClose()
    let drained = false
    const drain = after.operations.drain().then(() => { drained = true })
    await Promise.resolve()
    expect(drained).toBe(false)
    rejectDispatch(new LabelStudioMutationOutcomeUnknownError('POST /api/predictions/'))
    expect((await pending).isError).toBe(true)
    await drain
    expect(drained).toBe(true)
    expect(after.createPrediction).toHaveBeenCalledOnce()
    expect(after.changes.latestRevision(ACTIVE_SESSION as never)).toBe(0)
  })

  it('runs every execution through the shared gate and unregisters all tools', async () => {
    const { ctx, operations, disposeTools, status } = await setup()
    operations.beginClose()
    const result = await call(ctx, 'label_studio_status', {})
    expect(result.isError).toBe(true)
    expect(status).not.toHaveBeenCalled()
    disposeTools()
    expect(ctx.tools.schemas()).toEqual([])
  })
})
