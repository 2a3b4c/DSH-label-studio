/** Model-facing Label Studio status, project, task-import, and prediction tools. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { LabelStudioBindingTarget } from '@deepseek-ai/dsh-label-studio-protocol'
import type { LabelStudioApi, LabelStudioSelectedTaskView, LabelStudioTask } from './api.ts'
import { LabelStudioHttpError, validateSelectedTask } from './api.ts'
import {
  labelStudioAnnotationId,
  labelStudioFocusCorrelationId,
  labelStudioProjectId,
  labelStudioTaskId,
} from './context-types.ts'
import type { LabelStudioChangeBroker } from './change-broker.ts'
import type { LabelStudioContextRegistry } from './context-registry.ts'
import type { LabelStudioOperationGate } from './lifecycle.ts'
import type { LabelStudioOperationContextResolver, LabelStudioTargetSelector } from './operation-context.ts'
import type { LabelStudioRuntime } from './runtime.ts'
import type { ResolvedConfig } from './config.ts'
import type { LabelStudioSessionIdentity } from './session-context-spec.ts'
import type { LabelStudioSessionContextStore } from './session-context-store.ts'
import {
  presentActiveTaskCall,
  presentActiveTaskMeta,
  presentCreateActivePredictionCall,
  presentCreatePredictionCall,
  presentCreateProjectCall,
  presentFocusTaskCall,
  presentImportTasksCall,
  presentStatusCall,
  presentUpdateLabelConfigCall,
} from './present.ts'

/**
 * Register all Label Studio model tools for one runtime and REST client.
 * @param ctx - Host context carrying the model tool registry.
 * @param runtime - local service status provider.
 * @param api - authenticated Label Studio REST client.
 * @param contexts - Session context registry reserved for context-aware tools.
 * @param changes - browser event broker reserved for mutation notifications.
 * @param operations - shared package cancellation and quiescence gate.
 * @param resolver - shared explicit, binding, and current-page target resolver.
 * @param bindings - binding revision reader used before target-free project creation.
 * @param policy - model-output byte limit and browser focus deadline owned by the Host configuration.
 * @returns disposer unregistering every tool in reverse order.
 */
export function registerLabelStudioTools(
  ctx: Context,
  runtime: LabelStudioRuntime,
  api: LabelStudioApi,
  contexts: LabelStudioContextRegistry,
  changes: LabelStudioChangeBroker,
  operations: LabelStudioOperationGate,
  resolver: LabelStudioOperationContextResolver,
  bindings: Pick<LabelStudioSessionContextStore, 'readBinding'>,
  policy: Pick<ResolvedConfig, 'activeTaskMaxBytes' | 'focusAckTimeoutMs'> & {
    readonly ensureWebhook?: (signal: AbortSignal) => Promise<void>
  },
): () => void {
  const disposers: Array<() => void> = []
  disposers.push(ctx.tools.register(defineTool({
    name: 'label_studio_status',
    description:
      'Check whether the configured local Label Studio service is reachable and whether this DSH plugin started it. '
      + 'Call this before project, task-import, or prediction operations when availability is uncertain.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          available: { type: 'boolean', required: true },
          baseUrl: { type: 'string', required: true },
          managed: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.available
          ? `Label Studio is available at ${value.baseUrl}${value.managed ? ' (managed by DSH).' : '.'}`
          : `Label Studio is unavailable at ${value.baseUrl}.`,
      }],
    },
    execute: (_args, exec) => operations.run(exec.signal, async (signal) => {
      const status = await runtime.status(signal)
      if (status.available && policy.ensureWebhook !== undefined) await policy.ensureWebhook(signal)
      return status
    }),
    presentCall: presentStatusCall,
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'label_studio_create_project',
    description:
      'Create a Label Studio project through the authenticated REST API. Supply Label Studio XML in label_config '
      + 'when the project must be immediately ready for annotation. The successful project becomes this DSH '
      + 'Session binding. Returns the project id and browser URL.',
    parameters: {
      title: { type: 'string', required: true, description: 'Project title.' },
      label_config: { type: 'string', description: 'Optional Label Studio labeling-interface XML.' },
      description: { type: 'string', description: 'Optional project description.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'number', required: true },
          title: { type: 'string', required: true },
          webUrl: { type: 'string', required: true },
          warning: { type: 'string', enum: ['binding-conflict'] },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Created Label Studio project ${value.id} (${value.title}): ${value.webUrl}${bindingWarningSuffix(value.warning)}`,
      }],
    },
    async execute(args, exec) {
      return operations.run(exec.signal, async (signal) => {
        const identity = requireSessionIdentity(exec.agent, 'project creation')
        const expectedBindingRevision = bindings.readBinding(identity).revision
        await requireAvailable(runtime, signal)
        const project = await api.createProject({
          title: args.title,
          ...args.label_config === undefined ? {} : { labelConfig: args.label_config },
          ...args.description === undefined ? {} : { description: args.description },
        }, signal)
        const target = { kind: 'project', projectId: labelStudioProjectId(project.id) } as const
        const warning = await commitWarning(resolver, identity, target, expectedBindingRevision)
        return {
          ...project,
          webUrl: `${runtime.config.baseUrl}/projects/${project.id}/data`,
          ...warning,
        }
      })
    },
    presentCall: presentCreateProjectCall,
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'label_studio_import_tasks',
    description:
      'Import JSON tasks into an existing Label Studio project. Supply project_id for an explicit target, set '
      + 'current_page when the user refers to the visible iframe, or omit both to use this DSH Session binding. '
      + 'Each task data object must match the project label configuration.',
    parameters: {
      project_id: { type: 'number', description: 'Optional explicit Label Studio project id.' },
      current_page: { type: 'boolean', description: 'Inspect the visible iframe instead of reusing the Session binding.' },
      tasks: { type: 'json', required: true, description: 'JSON array of Label Studio task objects.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          projectId: { type: 'number', required: true },
          taskCount: { type: 'number', required: true },
          taskIds: { type: 'array', required: true, items: { type: 'number' } },
          warning: { type: 'string', enum: ['binding-conflict'] },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Imported ${value.taskCount} tasks into Label Studio project ${value.projectId}.${bindingWarningSuffix(value.warning)}`,
      }],
    },
    async execute(args, exec) {
      return operations.run(exec.signal, async (signal) => {
        const identity = requireSessionIdentity(exec.agent, 'task import')
        const tasks = parseTasks(args.tasks)
        await requireAvailable(runtime, signal)
        const context = await resolver.resolve(
          identity,
          'project',
          projectSelector(args.project_id, args.current_page),
          signal,
        )
        const target = { kind: 'project', projectId: context.target.projectId } as const
        const imported = await api.importTasks(target.projectId, tasks, signal)
        const warning = await commitWarning(
          resolver, identity, target, context.expectedBindingRevision,
        )
        return { projectId: target.projectId, ...imported, ...warning }
      })
    },
    presentCall: presentImportTasksCall,
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'label_studio_create_prediction',
    description:
      'Create a pre-annotation prediction for one Label Studio task. Supply task_id and optional project_id for an '
      + 'explicit target, set current_page when the user refers to the visible iframe, or omit ids to reuse this '
      + 'DSH Session task binding. This never updates a saved annotation.',
    parameters: {
      task_id: { type: 'number', description: 'Optional explicit Label Studio task id.' },
      project_id: { type: 'number', description: 'Optional explicit project used to verify task ownership.' },
      current_page: { type: 'boolean', description: 'Inspect the visible iframe instead of reusing the Session binding.' },
      result: { type: 'json', required: true, description: 'JSON array of Label Studio prediction result objects.' },
      model_version: { type: 'string', description: 'Optional model or workflow version recorded with the prediction.' },
      score: { type: 'number', description: 'Optional prediction score.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'number', required: true },
          taskId: { type: 'number', required: true },
          modelVersion: { type: 'string' },
          warning: { type: 'string', enum: ['binding-conflict'] },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Created Label Studio prediction ${value.id} for task ${value.taskId}.${bindingWarningSuffix(value.warning)}`,
      }],
    },
    async execute(args, exec) {
      return operations.run(exec.signal, async (signal) => {
        const identity = requireSessionIdentity(exec.agent, 'prediction creation')
        const result = parseArray(args.result, 'result')
        await requireAvailable(runtime, signal)
        const context = await resolver.resolve(
          identity,
          'task',
          taskSelector(args.project_id, args.task_id, args.current_page),
          signal,
        )
        const target = requireTaskTarget(context.target)
        const prediction = await api.createPrediction({
          taskId: target.taskId,
          result,
          ...args.model_version === undefined ? {} : { modelVersion: args.model_version },
          ...args.score === undefined ? {} : { score: args.score },
        }, signal)
        const warning = await commitWarning(
          resolver, identity, target, context.expectedBindingRevision,
        )
        return { ...prediction, ...warning }
      })
    },
    presentCall: presentCreatePredictionCall,
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'label_studio_create_active_prediction',
    description:
      'Create a pre-annotation prediction for this DSH Session task binding. Set current_page when the user refers '
      + 'to the visible iframe; otherwise an absent task binding triggers one on-demand inspection. Supply result '
      + 'explicitly using the project label configuration. This never updates a saved annotation.',
    parameters: {
      current_page: { type: 'boolean', description: 'Force one inspection of the visible Label Studio iframe.' },
      result: {
        type: 'json',
        required: true,
        description: 'Explicit JSON array of Label Studio prediction result objects for the active task.',
      },
      model_version: { type: 'string', description: 'Optional model or workflow version recorded with the prediction.' },
      score: { type: 'number', description: 'Optional prediction score.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'number', required: true },
          projectId: { type: 'number', required: true },
          taskId: { type: 'number', required: true },
          modelVersion: { type: 'string' },
          eventRevision: { type: 'number', required: true },
          warning: { type: 'string', enum: ['binding-conflict'] },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Created Label Studio prediction ${value.id} for active task ${value.taskId} in project ${value.projectId}.${bindingWarningSuffix(value.warning)}`,
      }],
    },
    async execute(args, exec) {
      return operations.run(exec.signal, async (signal) => {
        const identity = requireSessionIdentity(exec.agent, 'active prediction creation')
        const result = parseArray(args.result, 'result')
        const context = await resolver.resolve(
          identity,
          'task',
          args.current_page === true ? { mode: 'current-page' } : { mode: 'binding' },
          signal,
        )
        const target = requireTaskTarget(context.target)
        const prediction = await api.createPrediction({
          taskId: target.taskId,
          result,
          ...args.model_version === undefined ? {} : { modelVersion: args.model_version },
          ...args.score === undefined ? {} : { score: args.score },
        }, signal)
        const warning = await commitWarning(
          resolver, identity, target, context.expectedBindingRevision,
        )
        const event = changes.publishTaskChanged(identity.sessionId, target.taskId, 'prediction-created')
        return {
          id: prediction.id,
          projectId: target.projectId,
          taskId: prediction.taskId,
          ...prediction.modelVersion === undefined ? {} : { modelVersion: prediction.modelVersion },
          eventRevision: event.eventRevision,
          ...warning,
        }
      })
    },
    presentCall: presentCreateActivePredictionCall,
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'label_studio_focus_task',
    description:
      'Navigate the Label Studio workbench for this DSH Session to a project task and optional saved annotation. '
      + 'The tool verifies the task-project association first and binds the task only after the browser applies '
      + 'the URL. The embedded page may still be loading.',
    parameters: {
      project_id: { type: 'number', required: true, description: 'Target Label Studio project id.' },
      task_id: { type: 'number', required: true, description: 'Target Label Studio task id.' },
      annotation_id: { type: 'number', description: 'Optional saved Label Studio annotation id.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          projectId: { type: 'number', required: true },
          taskId: { type: 'number', required: true },
          annotationId: { type: 'number' },
          targetRevision: { type: 'number', required: true },
          warning: { type: 'string', enum: ['binding-conflict'] },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Label Studio workbench applied the URL for task ${value.taskId} in project ${value.projectId}; page loading was not checked.${bindingWarningSuffix(value.warning)}`,
      }],
    },
    async execute(args, exec) {
      return operations.run(exec.signal, async (signal) => {
        const identity = requireSessionIdentity(exec.agent, 'task focus')
        const leaseBinding = contexts.getLease(identity.sessionId)
        if (leaseBinding === undefined) {
          throw new Error('label-studio: this Session has no live Label Studio browser lease')
        }
        const context = await resolver.resolve(identity, 'task', {
          mode: 'explicit',
          projectId: labelStudioProjectId(args.project_id),
          taskId: labelStudioTaskId(args.task_id),
          ...args.annotation_id === undefined ? {} : { annotationId: labelStudioAnnotationId(args.annotation_id) },
        }, signal)
        const target = requireTaskTarget(context.target)
        const browserTarget = {
          projectId: target.projectId,
          taskId: target.taskId,
          ...target.annotationId === undefined ? {} : { annotationId: target.annotationId },
        }
        const correlationId = labelStudioFocusCorrelationId(randomUUID())
        const reservation = contexts.reserveFocusTarget(
          leaseBinding.lease.leaseId,
          leaseBinding.lease.generation,
          correlationId,
        )
        const committed = await changes.requestFocus(
          identity,
          correlationId,
          reservation,
          browserTarget,
          policy.focusAckTimeoutMs,
          signal,
        )
        const committedTarget = {
          kind: 'task',
          projectId: committed.target.projectId,
          taskId: committed.target.taskId,
          ...committed.target.annotationId === undefined ? {} : { annotationId: committed.target.annotationId },
        } as const
        const warning = await commitWarning(
          resolver, identity, committedTarget, context.expectedBindingRevision,
        )
        return {
          projectId: committed.target.projectId,
          taskId: committed.target.taskId,
          ...committed.target.annotationId === undefined
            ? {}
            : { annotationId: committed.target.annotationId },
          targetRevision: committed.targetRevision,
          ...warning,
        }
      })
    },
    presentCall: presentFocusTaskCall,
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'label_studio_update_label_config',
    description:
      'Replace one Label Studio project labeling interface. Supply project_id for an explicit target, set '
      + 'current_page when the user refers to the visible iframe, or omit both to use this DSH Session binding. '
      + 'Only label_config is sent to Label Studio.',
    parameters: {
      label_config: { type: 'string', required: true, description: 'Complete Label Studio labeling-interface XML.' },
      project_id: { type: 'number', description: 'Optional explicit Label Studio project id.' },
      current_page: { type: 'boolean', description: 'Inspect the visible iframe instead of reusing the Session binding.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          projectId: { type: 'number', required: true },
          labelConfig: { type: 'string', required: true },
          warning: { type: 'string', enum: ['binding-conflict'] },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Updated the label config for Label Studio project ${value.projectId}.${bindingWarningSuffix(value.warning)}`,
      }],
    },
    async execute(args, exec) {
      return operations.run(exec.signal, async (signal) => {
        const identity = requireSessionIdentity(exec.agent, 'label-config update')
        await requireAvailable(runtime, signal)
        const context = await resolver.resolve(
          identity,
          'project',
          projectSelector(args.project_id, args.current_page),
          signal,
        )
        const target = { kind: 'project', projectId: context.target.projectId } as const
        const updated = await api.updateProjectLabelConfig(target.projectId, args.label_config, signal)
        const warning = await commitWarning(
          resolver, identity, target, context.expectedBindingRevision,
        )
        return { projectId: updated.id, labelConfig: updated.labelConfig, ...warning }
      })
    },
    presentCall: presentUpdateLabelConfigCall,
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'label_studio_get_active_task',
    description:
      'Read the project labeling configuration, task data, saved annotations, and predictions for the current '
      + 'DSH Session task binding. Set current_page when the user explicitly refers to the visible iframe; an '
      + 'absent task binding otherwise triggers one on-demand inspection.',
    parameters: {
      current_page: { type: 'boolean', description: 'Force one inspection of the visible Label Studio iframe.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          project: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              id: { type: 'number', required: true },
              labelConfig: { type: 'string', required: true },
              showCollabPredictions: { type: 'boolean', required: true },
            },
          },
          task: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              id: { type: 'number', required: true },
              projectId: { type: 'number', required: true },
              data: { type: 'json', required: true },
              annotations: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'number', required: true },
                    projectId: { type: 'number', required: true },
                    taskId: { type: 'number', required: true },
                    result: { type: 'array', required: true, items: { type: 'json' } },
                    updatedAt: { type: 'string', required: true },
                  },
                },
              },
              predictions: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'number', required: true },
                    projectId: { type: 'number', required: true },
                    taskId: { type: 'number', required: true },
                    result: { type: 'array', required: true, items: { type: 'json' } },
                    modelVersion: { type: 'string' },
                    score: { type: 'number' },
                  },
                },
              },
            },
          },
          warning: { type: 'string', enum: ['binding-conflict'] },
        },
      },
      render: (_args, value) => activeTaskBlocks(value, policy.activeTaskMaxBytes),
      presentationMeta: (_args, value) =>
        presentActiveTaskMeta(value as LabelStudioSelectedTaskView),
    },
    async execute(args, exec) {
      return operations.run(exec.signal, async (signal) => {
        const identity = requireSessionIdentity(exec.agent, 'active-task read')
        const context = await resolver.resolve(
          identity,
          'task',
          args.current_page === true ? { mode: 'current-page' } : { mode: 'binding' },
          signal,
        )
        const target = requireTaskTarget(context.target)
        let project
        try {
          project = await api.getProject(target.projectId, signal)
        } catch (error) {
          if (isMissingProjectResponse(error, target.projectId)) {
            await changes.markProjectDeleted(
              identity,
              target.projectId,
            )
          }
          throw error
        }
        const task = await api.getTask(target.taskId, signal)
        const selected = validateSelectedTask(target, project, task)
        const warning = await commitWarning(
          resolver, identity, target, context.expectedBindingRevision,
        )
        return { ...selected, ...warning }
      })
    },
    presentCall: presentActiveTaskCall,
  })))
  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}

function activeTaskBlocks(value: unknown, maxBytes: number): Array<{ type: 'text'; text: string }> {
  const blocks = [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
  const bytes = new TextEncoder().encode(JSON.stringify(blocks)).byteLength
  if (bytes > maxBytes) {
    throw new Error(`label-studio: active task result exceeds activeTaskMaxBytes (${bytes} > ${maxBytes})`)
  }
  return blocks
}

function bindingWarningSuffix(warning: 'binding-conflict' | undefined): string {
  return warning === undefined
    ? ''
    : ' Warning: the business operation succeeded, but a newer Session binding was kept (binding-conflict).'
}

function requireSessionIdentity(
  agent: {
    readonly id: LabelStudioSessionIdentity['sessionId']
    readonly session: { readonly header: { readonly createdAt: number } }
  } | undefined,
  operation: string,
): LabelStudioSessionIdentity {
  if (agent === undefined) throw new Error(`label-studio: ${operation} requires a DSH Session`)
  return { sessionId: agent.id, createdAt: agent.session.header.createdAt }
}

function projectSelector(projectId: number | undefined, currentPage: boolean | undefined): LabelStudioTargetSelector {
  if (projectId !== undefined) return { mode: 'explicit', projectId: labelStudioProjectId(projectId) }
  return currentPage === true ? { mode: 'current-page' } : { mode: 'binding' }
}

function taskSelector(
  projectId: number | undefined,
  taskId: number | undefined,
  currentPage: boolean | undefined,
): LabelStudioTargetSelector {
  if (projectId !== undefined || taskId !== undefined) {
    return {
      mode: 'explicit',
      ...(projectId === undefined ? {} : { projectId: labelStudioProjectId(projectId) }),
      ...(taskId === undefined ? {} : { taskId: labelStudioTaskId(taskId) }),
    }
  }
  return currentPage === true ? { mode: 'current-page' } : { mode: 'binding' }
}

function requireTaskTarget(target: LabelStudioBindingTarget): Extract<LabelStudioBindingTarget, { kind: 'task' }> {
  if (target.kind !== 'task') throw new Error('label-studio: resolved target does not identify a task')
  return target
}

async function commitWarning(
  resolver: LabelStudioOperationContextResolver,
  identity: LabelStudioSessionIdentity,
  target: LabelStudioBindingTarget,
  expectedBindingRevision: number,
): Promise<{ warning?: never } | { warning: 'binding-conflict' }> {
  const outcome = await resolver.commitSuccessfulResult(
    identity, target, 'tool-result', expectedBindingRevision,
  )
  return outcome.kind === 'conflict' ? { warning: 'binding-conflict' } : {}
}

async function requireAvailable(runtime: LabelStudioRuntime, signal: AbortSignal): Promise<void> {
  const status = await runtime.status(signal)
  if (!status.available) throw new Error(`label-studio: service is unavailable at ${status.baseUrl}`)
}

function parseTasks(value: unknown): LabelStudioTask[] {
  const values = parseArray(value, 'tasks')
  return values.map((task, index) => {
    if (!isRecord(task) || !isRecord(task.data)) {
      throw new Error(`label-studio: tasks[${index}] must be an object with a data object`)
    }
    const predictions = task.predictions
    if (predictions !== undefined && !Array.isArray(predictions)) {
      throw new Error(`label-studio: tasks[${index}].predictions must be an array when present`)
    }
    return {
      data: task.data,
      ...predictions === undefined ? {} : { predictions },
    }
  })
}

function parseArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`label-studio: ${field} must be a JSON array`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingProjectResponse(error: unknown, projectId: number): boolean {
  return (error instanceof LabelStudioHttpError || isRecord(error))
    && error.name === 'LabelStudioHttpError'
    && error.method === 'GET'
    && error.path === `/api/projects/${projectId}/`
    && error.status === 404
}
