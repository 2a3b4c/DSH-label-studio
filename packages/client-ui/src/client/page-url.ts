/** Structured Label Studio page URL construction and browser input parsing. */

import type {
  LabelStudioActiveTarget,
  LabelStudioAnnotationId,
  LabelStudioPageContext,
  LabelStudioProjectId,
  LabelStudioTaskId,
} from '@deepseek-ai/dsh-label-studio-protocol'

/** Untrusted strings entered in the workbench task controls. */
export interface LabelStudioTargetInput {
  readonly projectId: string
  readonly taskId: string
  readonly annotationId?: string
}

function positiveId(value: string, field: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`label-studio client: ${field} must be a positive integer`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`label-studio client: ${field} must be a positive safe integer`)
  }
  return parsed
}

function assertId(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`label-studio client: ${field} must be a positive safe integer`)
  }
}

function baseOrigin(baseUrl: string): URL {
  const base = new URL(baseUrl)
  const loopback = base.hostname === '127.0.0.1' || base.hostname === 'localhost' || base.hostname === '[::1]'
  if (!loopback || !['http:', 'https:'].includes(base.protocol)) {
    throw new Error('label-studio client: baseUrl must be a loopback HTTP(S) origin')
  }
  if (base.username !== '' || base.password !== '' || base.pathname !== '/'
    || base.search !== '' || base.hash !== '') {
    throw new Error('label-studio client: baseUrl must contain only a loopback origin')
  }
  return base
}

/**
 * Parse task controls into a structured task page.
 * @param input - untrusted browser input strings.
 * @returns validated task page.
 */
export function parseLabelStudioTargetInput(
  input: LabelStudioTargetInput,
): Extract<LabelStudioPageContext, { view: 'task' }> {
  const projectId = positiveId(input.projectId, 'projectId') as LabelStudioProjectId
  const taskId = positiveId(input.taskId, 'taskId') as LabelStudioTaskId
  const annotation = input.annotationId?.trim()
  return {
    view: 'task',
    projectId,
    taskId,
    ...(annotation === undefined || annotation === ''
      ? {}
      : { annotationId: positiveId(annotation, 'annotationId') as LabelStudioAnnotationId }),
  }
}

/**
 * Build one same-origin Label Studio page URL from validated structured ids.
 * @param baseUrl - Host-validated Label Studio origin.
 * @param page - controlled projects, project, or task page.
 * @returns absolute same-origin URL.
 */
export function buildLabelStudioPageUrl(baseUrl: string, page: LabelStudioPageContext): string {
  const base = baseOrigin(baseUrl)
  if (page.view === 'projects') return base.href
  assertId(page.projectId, 'projectId')
  const url = new URL(`/projects/${String(page.projectId)}/data`, base.origin)
  if (page.view === 'project') return url.href
  assertId(page.taskId, 'taskId')
  url.searchParams.set('task', String(page.taskId))
  if (page.annotationId !== undefined) {
    assertId(page.annotationId, 'annotationId')
    url.searchParams.set('annotation', String(page.annotationId))
  }
  return url.href
}

/**
 * Convert a task page to the active-target fields used by the Host lease registry.
 * @param page - validated task page.
 * @returns active target without its page discriminant.
 */
export function targetOfPage(
  page: Extract<LabelStudioPageContext, { view: 'task' }>,
): LabelStudioActiveTarget {
  return {
    projectId: page.projectId,
    taskId: page.taskId,
    ...(page.annotationId === undefined ? {} : { annotationId: page.annotationId }),
  }
}
