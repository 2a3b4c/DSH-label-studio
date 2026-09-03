import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type { LabelStudioBindingSnapshot, LabelStudioBindingTarget } from '@deepseek-ai/dsh-label-studio-protocol'
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
import { LabelStudioOperationContextResolver } from '../src/operation-context.ts'
import type { LabelStudioRuntime } from '../src/runtime.ts'
import { registerLabelStudioTools } from '../src/tools.ts'
import type { LabelStudioSessionContextStore } from '../src/session-context-store.ts'

const signal = new AbortController().signal

const ACTIVE_SESSION = 'active-session'
const SOURCE_ID = labelStudioContextSourceId('123e4567-e89b-42d3-a456-426614174000')

async function setup(
  activeTaskMaxBytes = 262_144,
  clock: () => number = Date.now,
  ensureWebhook = vi.fn(async () => {}),
) {
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
  const updateProjectLabelConfig = vi.fn().mockResolvedValue({
    id: labelStudioProjectId(7), labelConfig: '<View><Text name="text" value="$text" /></View>',
  })
  const api = {
    createProject,
    importTasks,
    createPrediction,
    updateProjectLabelConfig,
    getProject,
    getTask,
  } as unknown as LabelStudioApi
  const contexts = new LabelStudioContextRegistry(30_000, clock)
  let binding: LabelStudioBindingSnapshot = { recentProjects: [], revision: 0 }
  const readBinding = vi.fn(() => binding)
  const commitBinding = vi.fn(async (_identity, request: {
    expectedRevision: number
    target: LabelStudioBindingTarget
    source: 'tool-result' | 'current-page' | 'webhook'
  }) => {
    if (request.expectedRevision !== binding.revision) return { kind: 'conflict' as const, current: binding }
    binding = {
      target: request.target,
      source: request.source,
      boundAt: 1,
      recentProjects: [],
      revision: binding.revision + 1,
    }
    return { kind: 'committed' as const, snapshot: binding }
  })
  const sessionContexts = {
    read: vi.fn(() => ({ page: { view: 'projects' }, recentProjects: [], revision: 0 })),
    readBinding,
    commitBinding,
    commit: vi.fn(),
    markProjectDeleted: vi.fn(async () => ({
      page: { view: 'projects' },
      recentProjects: [{ projectId: 7, lastTaskId: 11, lastVisitedAt: 1000, availability: 'deleted' }],
      revision: 2,
    })),
  } as unknown as LabelStudioSessionContextStore
  const requestCurrentPage = vi.fn().mockResolvedValue({
    view: 'task', projectId: labelStudioProjectId(7), taskId: labelStudioTaskId(11),
  })
  const resolver = new LabelStudioOperationContextResolver(
    sessionContexts,
    { request: requestCurrentPage },
    api,
    5_000,
  )
  const changes = new LabelStudioChangeBroker(contexts, 64, sessionContexts)
  const operations = new LabelStudioOperationGate()
  const disposeTools = registerLabelStudioTools(
    ctx,
    runtime,
    api,
    contexts,
    changes,
    operations,
    resolver,
    sessionContexts,
    { activeTaskMaxBytes, focusAckTimeoutMs: 5_000, ensureWebhook },
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
    binding = {
      target: { kind: 'task', projectId: labelStudioProjectId(7), taskId: labelStudioTaskId(11), annotationId: labelStudioAnnotationId(13) },
      source: 'current-page',
      boundAt: 1,
      recentProjects: [],
      revision: 1,
    }
    return opened
  }
  return {
    ctx,
    status,
    createProject,
    importTasks,
    createPrediction,
    updateProjectLabelConfig,
    getProject,
    getTask,
    project,
    task,
    contexts,
    changes,
    sessionContexts,
    resolver,
    requestCurrentPage,
    commitBinding,
    setBinding(target: LabelStudioBindingTarget | undefined, revision = 0) {
      binding = target === undefined
        ? { recentProjects: [], revision }
        : { target, source: 'tool-result', boundAt: 1, recentProjects: [], revision }
    },
    activate,
    operations,
    disposeTools,
    ensureWebhook,
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
      'label_studio_update_label_config',
    ])
    expect(names).not.toContain('label_studio_update_active_annotation')
  })

  it('commits the created project only after the project API succeeds', async () => {
    const { ctx, commitBinding, createProject } = await setup()
    const result = await call(ctx, 'label_studio_create_project', { title: 'Images' }, ACTIVE_SESSION)
    expect(result.isError).toBe(false)
    expect(createProject).toHaveBeenCalledOnce()
    expect(commitBinding).toHaveBeenCalledWith(
      { sessionId: ACTIVE_SESSION, createdAt: 0 },
      { expectedRevision: 0, target: { kind: 'project', projectId: 7 }, source: 'tool-result' },
    )
  })

  it('keeps one Session binding through create, import, template, and current-task prediction', async () => {
    const value = await setup()
    const labelConfig = '<View><Text name="text" value="$text" /></View>'

    await expect(call(value.ctx, 'label_studio_create_project', { title: 'Course acceptance' }, ACTIVE_SESSION))
      .resolves.toMatchObject({ isError: false })
    await expect(call(value.ctx, 'label_studio_import_tasks', {
      tasks: [{ data: { text: 'Is this a ship?' } }],
    }, ACTIVE_SESSION)).resolves.toMatchObject({ isError: false })
    await expect(call(value.ctx, 'label_studio_update_label_config', {
      label_config: labelConfig,
    }, ACTIVE_SESSION)).resolves.toMatchObject({ isError: false })
    await expect(call(value.ctx, 'label_studio_create_prediction', {
      current_page: true,
      result: [{ from_name: 'answer', to_name: 'text', type: 'choices', value: { choices: ['yes'] } }],
    }, ACTIVE_SESSION)).resolves.toMatchObject({ isError: false })

    expect(value.createProject).toHaveBeenCalledOnce()
    expect(value.importTasks).toHaveBeenCalledOnce()
    expect(value.updateProjectLabelConfig).toHaveBeenCalledOnce()
    expect(value.createPrediction).toHaveBeenCalledOnce()
    expect(value.requestCurrentPage).toHaveBeenCalledOnce()
    expect(value.commitBinding).toHaveBeenCalledTimes(4)
    expect(value.sessionContexts.readBinding()).toMatchObject({
      target: { kind: 'task', projectId: 7, taskId: 11 },
      source: 'tool-result',
      revision: 4,
    })
  })

  it('resolves import targets from explicit ids, bindings, or the requested current page', async () => {
    const explicit = await setup()
    await call(explicit.ctx, 'label_studio_import_tasks', {
      project_id: 7, tasks: [{ data: { text: 'a' } }],
    }, ACTIVE_SESSION)
    expect(explicit.commitBinding).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      target: { kind: 'project', projectId: 7 },
    }))

    const bound = await setup()
    bound.setBinding({ kind: 'project', projectId: labelStudioProjectId(7) }, 2)
    const boundResult = await call(bound.ctx, 'label_studio_import_tasks', {
      tasks: [{ data: { text: 'b' } }],
    }, ACTIVE_SESSION)
    expect(boundResult.isError).toBe(false)
    expect(bound.commitBinding).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      expectedRevision: 2, target: { kind: 'project', projectId: 7 },
    }))

    const current = await setup()
    current.setBinding({ kind: 'project', projectId: labelStudioProjectId(8) }, 4)
    const currentResult = await call(current.ctx, 'label_studio_import_tasks', {
      current_page: true, tasks: [{ data: { text: 'c' } }],
    }, ACTIVE_SESSION)
    expect(currentResult.isError).toBe(false)
    expect(current.requestCurrentPage).toHaveBeenCalledOnce()
    expect(current.commitBinding).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      target: { kind: 'project', projectId: 7 },
    }))
  })

  it('resolves prediction targets and commits the verified task after mutation success', async () => {
    const value = await setup()
    const result = await call(value.ctx, 'label_studio_create_prediction', {
      project_id: 7, task_id: 11, result: [],
    }, ACTIVE_SESSION)
    expect(result.isError).toBe(false)
    expect(value.createPrediction).toHaveBeenCalledOnce()
    expect(value.commitBinding).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      target: { kind: 'task', projectId: 7, taskId: 11 },
    }))
  })

  it('reads through an on-demand current page and commits the successfully read task', async () => {
    const value = await setup()
    const result = await call(value.ctx, 'label_studio_get_active_task', {}, ACTIVE_SESSION)
    expect(result.isError).toBe(false)
    expect(value.requestCurrentPage).toHaveBeenCalledOnce()
    expect(value.commitBinding).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      target: { kind: 'task', projectId: 7, taskId: 11 },
    }))
  })

  it('updates only label_config and binds the verified project', async () => {
    const value = await setup()
    const labelConfig = '<View><Text name="text" value="$text" /></View>'
    const result = await call(value.ctx, 'label_studio_update_label_config', {
      project_id: 7, label_config: labelConfig,
    }, ACTIVE_SESSION)
    expect(result.value).toEqual({ projectId: 7, labelConfig })
    expect(value.updateProjectLabelConfig).toHaveBeenCalledWith(7, labelConfig, expect.any(AbortSignal))
    expect(value.commitBinding).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      target: { kind: 'project', projectId: 7 },
    }))
  })

  it.each([
    { tool: 'label_studio_create_project', args: { title: 'Images' }, api: 'createProject' },
    { tool: 'label_studio_import_tasks', args: { project_id: 7, tasks: [{ data: { text: 'a' } }] }, api: 'importTasks' },
    { tool: 'label_studio_create_prediction', args: { project_id: 7, task_id: 11, result: [] }, api: 'createPrediction' },
    { tool: 'label_studio_create_active_prediction', args: { result: [] }, api: 'createPrediction' },
    {
      tool: 'label_studio_update_label_config',
      args: { project_id: 7, label_config: '<View><Text name="text" value="$text" /></View>' },
      api: 'updateProjectLabelConfig',
    },
  ] as const)('keeps successful $tool output when the binding CAS conflicts', async ({ tool, args, api }) => {
    const value = await setup()
    value.commitBinding.mockResolvedValueOnce({
      kind: 'conflict',
      current: {
        target: { kind: 'project', projectId: labelStudioProjectId(8) },
        source: 'tool-result', boundAt: 2, recentProjects: [], revision: 1,
      },
    })
    const result = await call(value.ctx, tool, args, ACTIVE_SESSION)
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ warning: 'binding-conflict' })
    expect(firstToolText(result)).toContain('binding-conflict')
    expect(value[api]).toHaveBeenCalledOnce()
    expect(value.commitBinding).toHaveBeenCalledOnce()
  })

  it.each([
    new Error('label-studio: POST /api/projects/7/import returned 422'),
    new LabelStudioMutationOutcomeUnknownError('POST /api/projects/7/import'),
  ])('does not bind or retry an import whose outcome is unsuccessful or unknown: %s', async (failure) => {
    const value = await setup()
    value.importTasks.mockRejectedValueOnce(failure)
    const result = await call(value.ctx, 'label_studio_import_tasks', {
      project_id: 7, tasks: [{ data: { text: 'a' } }],
    }, ACTIVE_SESSION)
    expect(result.isError).toBe(true)
    expect(value.importTasks).toHaveBeenCalledOnce()
    expect(value.commitBinding).not.toHaveBeenCalled()
  })

  it('does not bind a project when project creation has no verified success result', async () => {
    const value = await setup()
    value.createProject.mockRejectedValueOnce(new LabelStudioMutationOutcomeUnknownError('POST /api/projects/'))
    const result = await call(value.ctx, 'label_studio_create_project', { title: 'Images' }, ACTIVE_SESSION)
    expect(result.isError).toBe(true)
    expect(value.createProject).toHaveBeenCalledOnce()
    expect(value.commitBinding).not.toHaveBeenCalled()
  })

  it('uses binding and current-page selectors for prediction and template operations', async () => {
    const bound = await setup()
    bound.setBinding({ kind: 'task', projectId: labelStudioProjectId(7), taskId: labelStudioTaskId(11) }, 3)
    await expect(call(bound.ctx, 'label_studio_create_prediction', { result: [] }, ACTIVE_SESSION))
      .resolves.toMatchObject({ isError: false })
    expect(bound.requestCurrentPage).not.toHaveBeenCalled()

    const current = await setup()
    await expect(call(current.ctx, 'label_studio_update_label_config', {
      current_page: true,
      label_config: '<View><Text name="text" value="$text" /></View>',
    }, ACTIVE_SESSION)).resolves.toMatchObject({ isError: false })
    expect(current.requestCurrentPage).toHaveBeenCalledOnce()
  })

  it('rejects an explicit prediction project mismatch before mutation dispatch', async () => {
    const value = await setup()
    value.getTask.mockResolvedValueOnce({ ...value.task, projectId: labelStudioProjectId(8) })
    const result = await call(value.ctx, 'label_studio_create_prediction', {
      project_id: 7, task_id: 11, result: [],
    }, ACTIVE_SESSION)
    expect(result.isError).toBe(true)
    expect(value.createPrediction).not.toHaveBeenCalled()
    expect(value.commitBinding).not.toHaveBeenCalled()
  })

  it('requires an owning agent and falls back to one current-page inspection without a binding', async () => {
    const { ctx, getProject, getTask, requestCurrentPage } = await setup()
    const withoutAgent = await call(ctx, 'label_studio_get_active_task', {})
    const withoutTarget = await call(ctx, 'label_studio_get_active_task', {}, ACTIVE_SESSION)
    expect(withoutAgent.isError).toBe(true)
    expect(firstToolText(withoutAgent)).toContain('Session')
    expect(withoutTarget.isError).toBe(false)
    expect(requestCurrentPage).toHaveBeenCalledOnce()
    expect(getProject).toHaveBeenCalledOnce()
    expect(getTask).toHaveBeenCalledTimes(2)
  })

  it('keeps using the durable binding after its browser lease expires', async () => {
    let now = 0
    const { ctx, activate, getProject, getTask, requestCurrentPage } = await setup(262_144, () => now)
    activate()
    now = 30_000
    const result = await call(ctx, 'label_studio_get_active_task', {}, ACTIVE_SESSION)
    expect(result.isError).toBe(false)
    expect(requestCurrentPage).not.toHaveBeenCalled()
    expect(getProject).toHaveBeenCalledOnce()
    expect(getTask).toHaveBeenCalledTimes(2)
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
    expect(getTask).toHaveBeenCalledOnce()
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
    }, ACTIVE_SESSION)
    expect(project.value).toEqual({
      id: 7, title: 'Images', webUrl: 'http://127.0.0.1:8080/projects/7/data',
    })
    expect(statusSpy).toHaveBeenCalledWith(expect.any(AbortSignal))
    expect(createProject).toHaveBeenCalledWith({
      title: 'Images', labelConfig: '<View />', description: 'Course data',
    }, expect.any(AbortSignal))
  })

  it('uses the existing status tool as the one-shot optional Webhook recovery entry', async () => {
    const ensureWebhook = vi.fn(async () => {})
    const { ctx } = await setup(262_144, Date.now, ensureWebhook)
    await call(ctx, 'label_studio_status', {})
    expect(ensureWebhook).toHaveBeenCalledOnce()
    expect(ensureWebhook).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('imports tasks and creates nested prediction results', async () => {
    const { ctx, importTasks, createPrediction } = await setup()
    const tasks = [{ data: { image: '/data/a.jpg' } }]
    const imported = await call(ctx, 'label_studio_import_tasks', { project_id: 7, tasks }, ACTIVE_SESSION)
    expect(imported.value).toEqual({ projectId: 7, taskCount: 2, taskIds: [11, 12] })
    expect(importTasks).toHaveBeenCalledWith(7, tasks, expect.any(AbortSignal))

    const result = [{ from_name: 'label', to_name: 'image', type: 'rectanglelabels', value: { rectanglelabels: ['ship'] } }]
    const prediction = await call(ctx, 'label_studio_create_prediction', {
      task_id: 11, result, model_version: 'dsh', score: 0.9,
    }, ACTIVE_SESSION)
    expect(prediction.value).toEqual({ id: 19, taskId: 11, modelVersion: 'dsh' })
    expect(createPrediction).toHaveBeenCalledWith({
      taskId: 11, result, modelVersion: 'dsh', score: 0.9,
    }, expect.any(AbortSignal))
  })

  it('rejects non-array task and prediction JSON before the API call', async () => {
    const { ctx, importTasks, createPrediction } = await setup()
    const imported = await call(ctx, 'label_studio_import_tasks', { project_id: 7, tasks: {} }, ACTIVE_SESSION)
    const predicted = await call(ctx, 'label_studio_create_prediction', { task_id: 11, result: {} }, ACTIVE_SESSION)
    expect(imported.isError).toBe(true)
    expect(predicted.isError).toBe(true)
    expect(importTasks).not.toHaveBeenCalled()
    expect(createPrediction).not.toHaveBeenCalled()
  })

  it('requires an owning Session and falls back to the current page for active prediction', async () => {
    const { ctx, getTask, createPrediction, changes, requestCurrentPage } = await setup()
    const withoutAgent = await call(ctx, 'label_studio_create_active_prediction', { result: [] })
    const withoutTarget = await call(
      ctx,
      'label_studio_create_active_prediction',
      { result: [] },
      ACTIVE_SESSION,
    )
    expect(withoutAgent.isError).toBe(true)
    expect(firstToolText(withoutAgent)).toContain('Session')
    expect(withoutTarget.isError).toBe(false)
    expect(requestCurrentPage).toHaveBeenCalledOnce()
    expect(getTask).toHaveBeenCalledOnce()
    expect(createPrediction).toHaveBeenCalledOnce()
    expect(changes.latestRevision(ACTIVE_SESSION as never)).toBe(1)
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

  it('keeps an active prediction successful when its post-mutation binding commit conflicts', async () => {
    const { ctx, activate, commitBinding, createPrediction, changes } = await setup()
    activate()
    commitBinding.mockResolvedValueOnce({
      kind: 'conflict',
      current: {
        target: { kind: 'project', projectId: labelStudioProjectId(8) },
        source: 'tool-result', boundAt: 2, recentProjects: [], revision: 2,
      },
    })
    const result = await call(
      ctx, 'label_studio_create_active_prediction', { result: [] }, ACTIVE_SESSION,
    )
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ id: 19, warning: 'binding-conflict' })
    expect(createPrediction).toHaveBeenCalledOnce()
    expect(commitBinding).toHaveBeenCalledOnce()
    expect(changes.latestRevision(ACTIVE_SESSION as never)).toBe(1)
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
