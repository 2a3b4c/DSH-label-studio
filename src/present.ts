/** Pure Label Studio tool-card projections. */

import type { ToolCallView } from '@deepseek-ai/dsh-tools'
import type { LabelStudioSelectedTaskView } from './api.ts'

/**
 * Present a Label Studio status probe.
 * @returns generic read card for the status operation.
 */
export function presentStatusCall(): ToolCallView {
  return { card: 'generic', title: 'Check Label Studio', kind: 'read' }
}

/**
 * Present a Label Studio project creation request.
 * @param args - project title supplied to the tool.
 * @returns generic execution card for project creation.
 */
export function presentCreateProjectCall(args: { title: string }): ToolCallView {
  return { card: 'generic', title: `Create Label Studio project: ${args.title}`, kind: 'execute' }
}

/**
 * Present a Label Studio task import request.
 * @param args - target project and unvalidated task payload.
 * @returns generic execution card containing the import count.
 */
export function presentImportTasksCall(args: { project_id: number; tasks: unknown }): ToolCallView {
  const count = Array.isArray(args.tasks) ? args.tasks.length : 0
  return { card: 'generic', title: `Import ${count} tasks into Label Studio project ${args.project_id}`, kind: 'execute' }
}

/**
 * Present a Label Studio prediction creation request.
 * @param args - target task id.
 * @returns generic execution card for prediction creation.
 */
export function presentCreatePredictionCall(args: { task_id: number }): ToolCallView {
  return { card: 'generic', title: `Create prediction for Label Studio task ${args.task_id}`, kind: 'execute' }
}

/**
 * Present a prediction request for the current Session's active Label Studio task.
 * @param _args - explicit result and optional model metadata supplied to the tool.
 * @returns generic execution card with no filesystem locations.
 */
export function presentCreateActivePredictionCall(_args: {
  result: unknown
  model_version?: string
  score?: number
}): ToolCallView {
  return {
    card: 'generic',
    title: 'Create prediction for active Label Studio task',
    kind: 'execute',
    locations: [],
  }
}

/**
 * Present a request to navigate the current Session's Label Studio workbench.
 * @param args - project, task, and optional annotation identifiers supplied to the tool.
 * @returns generic execution card with no filesystem locations.
 */
export function presentFocusTaskCall(args: {
  project_id: number
  task_id: number
  annotation_id?: number
}): ToolCallView {
  return {
    card: 'generic',
    title: `Open Label Studio task ${args.task_id}`,
    kind: 'execute',
    locations: [],
  }
}

/**
 * Present a read of the current Session's committed Label Studio task.
 * @returns generic read card with no filesystem locations.
 */
export function presentActiveTaskCall(): ToolCallView {
  return {
    card: 'generic',
    title: 'Read active Label Studio task',
    kind: 'read',
    locations: [],
  }
}

/** Short UI metadata for a complete active-task model result. */
export interface ActiveTaskPresentationMeta {
  [key: string]: number
  projectId: number
  taskId: number
  annotationCount: number
  predictionCount: number
}

/**
 * Project non-sensitive identifiers from a complete active-task result.
 * @param value - validated project and task returned by the Host REST client.
 * @returns short identifiers and collection counts without task or result content.
 */
export function presentActiveTaskMeta(value: LabelStudioSelectedTaskView): ActiveTaskPresentationMeta {
  return {
    projectId: value.project.id,
    taskId: value.task.id,
    annotationCount: value.task.annotations.length,
    predictionCount: value.task.predictions.length,
  }
}
