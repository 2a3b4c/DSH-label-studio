/** Authenticated Label Studio REST operations used by model tools. */

import type { CredentialProvider, CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {
  LabelStudioActiveTarget,
  LabelStudioAnnotationId,
  LabelStudioPredictionId,
  LabelStudioProjectId,
  LabelStudioTaskId,
} from '@deepseek-ai/dsh-label-studio-protocol'
import {
  labelStudioAnnotationId,
  labelStudioPredictionId,
  labelStudioProjectId,
  labelStudioTaskId,
} from './context-types.ts'
import type { CreateWebhookInput } from './webhook-registration.ts'
import { LABEL_STUDIO_WEBHOOK_ACTIONS, type LabelStudioWebhookEvent } from './webhook-payload.ts'

type Fetch = typeof globalThis.fetch

/** Project fields accepted by the project-creation operation. */
export interface CreateProjectInput {
  title: string
  labelConfig?: string
  description?: string
}

/** Stable project identity returned to tools. */
export interface CreatedProject {
  id: LabelStudioProjectId
  title: string
}

/** One Label Studio task document. */
export interface LabelStudioTask {
  data: Record<string, unknown>
  predictions?: unknown[]
}

/** Canonical task-import result. */
export interface ImportedTasks {
  taskCount: number
  taskIds: number[]
}

/** Prediction fields accepted by Label Studio's prediction endpoint. */
export interface CreatePredictionInput {
  taskId: number
  result: unknown[]
  modelVersion?: string
  score?: number
}

/** Stable prediction identity returned to tools. */
export interface CreatedPrediction {
  id: number
  taskId: LabelStudioTaskId
  modelVersion?: string
}

/** Verified project fields returned after updating its labeling interface. */
export interface UpdatedProjectLabelConfig {
  readonly id: LabelStudioProjectId
  readonly labelConfig: string
}

/** A dispatched Label Studio mutation whose external commit cannot be determined from its response. */
export class LabelStudioMutationOutcomeUnknownError extends Error {
  /**
   * @param operation - fixed HTTP method and path without credentials or response content.
   */
  constructor(readonly operation: string) {
    super(`label-studio: ${operation} submission status is unknown; verify Label Studio before retrying`)
    this.name = 'LabelStudioMutationOutcomeUnknownError'
  }
}

/** Sanitized non-success response from one Label Studio HTTP operation. */
export class LabelStudioHttpError extends Error {
  /**
   * @param method - fixed request method.
   * @param path - fixed REST path without credentials or response content.
   * @param status - HTTP response status.
   */
  constructor(
    readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    readonly path: string,
    readonly status: number,
  ) {
    super(`label-studio: ${method} ${path} returned ${status}`)
    this.name = 'LabelStudioHttpError'
  }
}

/** Complete annotation fields required by the active-task model view. */
export interface LabelStudioAnnotationView {
  id: LabelStudioAnnotationId
  projectId: LabelStudioProjectId
  taskId: LabelStudioTaskId
  result: JsonValue[]
  updatedAt: string
}

/** Complete prediction fields required by the active-task model view. */
export interface LabelStudioPredictionView {
  id: LabelStudioPredictionId
  projectId: LabelStudioProjectId
  taskId: LabelStudioTaskId
  result: JsonValue[]
  modelVersion?: string
  score?: number
}

/** Authoritative Label Studio task projection returned to the model. */
export interface LabelStudioTaskView {
  id: LabelStudioTaskId
  projectId: LabelStudioProjectId
  data: Record<string, JsonValue>
  annotations: LabelStudioAnnotationView[]
  predictions: LabelStudioPredictionView[]
}

/** Project fields required to interpret one Label Studio task. */
export interface LabelStudioProjectView {
  id: LabelStudioProjectId
  labelConfig: string
  showCollabPredictions: boolean
}

/** Project configuration and task data selected by one live browser context. */
export interface LabelStudioSelectedTaskView {
  project: LabelStudioProjectView
  task: LabelStudioTaskView
}

/** Webhook identity and plugin-owner header returned by Label Studio. */
export interface LabelStudioWebhookRegistration {
  readonly id: number
  readonly projectId: LabelStudioProjectId
  readonly url: string
  readonly ownerId?: string
}

/** REST client that resolves and exchanges its PAT refresh credential once per operation. */
export class LabelStudioApi {
  /**
   * @param baseUrl - normalized Label Studio endpoint without a trailing slash.
   * @param refreshTokenCredential - PAT refresh-token credential reference resolved at operation time.
   * @param credentials - credential provider.
   * @param responseMaxBytes - maximum decoded bytes accepted from each REST response.
   * @param fetcher - HTTP implementation, injectable for tests.
   */
  constructor(
    private readonly baseUrl: string,
    private readonly refreshTokenCredential: CredentialRef,
    private readonly credentials: CredentialProvider,
    private readonly responseMaxBytes: number,
    private readonly fetcher: Fetch = globalThis.fetch,
  ) {}

  /**
   * Create one Label Studio project.
   * @param input - project title and optional Label Studio fields.
   * @param signal - optional caller cancellation.
   * @returns stable identity fields from the created project.
   */
  async createProject(input: CreateProjectInput, signal?: AbortSignal): Promise<CreatedProject> {
    const operation = 'POST /api/projects/'
    const body = await this.request<Record<string, unknown>>('/api/projects/', {
      method: 'POST',
      body: {
        title: input.title,
        ...input.labelConfig === undefined ? {} : { label_config: input.labelConfig },
        ...input.description === undefined ? {} : { description: input.description },
      },
      ...signal === undefined ? {} : { signal },
    })
    return decodeMutationResponse(operation, () => ({
      id: projectIdField(body, 'id'),
      title: stringField(body, 'title'),
    }))
  }

  /**
   * Import JSON tasks into one project.
   * @param projectId - target Label Studio project id.
   * @param tasks - task documents accepted by Label Studio.
   * @param signal - optional caller cancellation.
   * @returns imported task count and ids.
   */
  async importTasks(projectId: number, tasks: readonly LabelStudioTask[], signal?: AbortSignal): Promise<ImportedTasks> {
    const operation = `POST /api/projects/${projectId}/import`
    const body = await this.request<Record<string, unknown>>(`/api/projects/${projectId}/import`, {
      method: 'POST', body: tasks, ...signal === undefined ? {} : { signal },
    })
    return decodeMutationResponse(operation, () => {
      const ids = Array.isArray(body.task_ids)
        ? body.task_ids.map((value, index) => numberValue(value, `task_ids[${index}]`))
        : []
      return { taskCount: numberField(body, 'task_count'), taskIds: ids }
    })
  }

  /**
   * Attach one model prediction to an existing task.
   * @param input - task id, Label Studio result array, and optional model facts.
   * @param signal - optional caller cancellation.
   * @returns stable identity fields from the created prediction.
   */
  async createPrediction(input: CreatePredictionInput, signal?: AbortSignal): Promise<CreatedPrediction> {
    const operation = 'POST /api/predictions/'
    const body = await this.request<Record<string, unknown>>('/api/predictions/', {
      method: 'POST',
      body: {
        task: input.taskId,
        result: input.result,
        ...input.modelVersion === undefined ? {} : { model_version: input.modelVersion },
        ...input.score === undefined ? {} : { score: input.score },
      },
      ...signal === undefined ? {} : { signal },
    })
    return decodeMutationResponse(operation, () => {
      const modelVersion = body.model_version
      return {
        id: numberField(body, 'id'),
        taskId: taskIdField(body, 'task'),
        ...typeof modelVersion === 'string' ? { modelVersion } : {},
      }
    }, prediction => assertRequestedId('task', input.taskId, prediction.taskId))
  }

  /**
   * Replace one project's Label Studio labeling-interface XML.
   * @param projectId - verified target project.
   * @param labelConfig - complete Label Studio labeling-interface XML.
   * @param signal - optional caller cancellation.
   * @returns response fields proven to match the requested update.
   */
  async updateProjectLabelConfig(
    projectId: LabelStudioProjectId,
    labelConfig: string,
    signal?: AbortSignal,
  ): Promise<UpdatedProjectLabelConfig> {
    const operation = `PATCH /api/projects/${projectId}/`
    const body = await this.request<Record<string, unknown>>(`/api/projects/${projectId}/`, {
      method: 'PATCH',
      body: { label_config: labelConfig },
      ...signal === undefined ? {} : { signal },
    })
    return decodeMutationResponse(operation, () => {
      const updated = {
        id: projectIdField(body, 'id'),
        labelConfig: stringField(body, 'label_config'),
      }
      assertRequestedId('project', projectId, updated.id)
      if (updated.labelConfig !== labelConfig) {
        throw new Error('label config response does not match the requested value')
      }
      return updated
    })
  }

  /**
   * Read the project fields needed to interpret task annotations and predictions.
   * @param projectId - validated Label Studio project id.
   * @param signal - optional caller cancellation.
   * @returns authoritative project configuration.
   */
  async getProject(projectId: LabelStudioProjectId, signal?: AbortSignal): Promise<LabelStudioProjectView> {
    const body = await this.request<Record<string, unknown>>(`/api/projects/${projectId}/`, {
      method: 'GET', ...signal === undefined ? {} : { signal },
    })
    const project = {
      id: projectIdField(body, 'id'),
      labelConfig: stringField(body, 'label_config'),
      showCollabPredictions: booleanField(body, 'show_collab_predictions'),
    }
    assertRequestedId('project', projectId, project.id)
    return project
  }

  /**
   * Read one complete task including saved annotations and predictions.
   * @param taskId - validated Label Studio task id.
   * @param signal - optional caller cancellation.
   * @returns authoritative task data and result arrays.
   */
  async getTask(taskId: LabelStudioTaskId, signal?: AbortSignal): Promise<LabelStudioTaskView> {
    const body = await this.request<Record<string, unknown>>(`/api/tasks/${taskId}/`, {
      method: 'GET', ...signal === undefined ? {} : { signal },
    })
    const task = parseTaskView(body)
    assertRequestedId('task', taskId, task.id)
    return task
  }

  /** List every project id visible to the authenticated Label Studio user. */
  async listProjectIds(signal?: AbortSignal): Promise<readonly LabelStudioProjectId[]> {
    const projectIds: LabelStudioProjectId[] = []
    let path: string | undefined = '/api/projects/?page_size=100'
    while (path !== undefined) {
      const body = await this.request<Record<string, unknown>>(path, {
        method: 'GET', ...signal === undefined ? {} : { signal },
      })
      if (!Array.isArray(body.results)) {
        throw new Error('label-studio: response field "results" must be an array')
      }
      projectIds.push(...body.results.map((value, index) =>
        projectIdField(recordValue(value, `results[${index}]`), 'id')))
      path = nextApiPath(body.next, this.baseUrl)
    }
    return projectIds
  }

  /** Create one explicitly configured project Webhook. */
  async createWebhook(input: CreateWebhookInput, signal?: AbortSignal): Promise<LabelStudioWebhookRegistration> {
    const operation = 'POST /api/webhooks/'
    const body = await this.request<Record<string, unknown>>('/api/webhooks/', {
      method: 'POST', body: input, ...signal === undefined ? {} : { signal },
    })
    return decodeMutationResponse(operation, () => parseWebhookRegistration(body), (registration) => {
      if (registration.projectId !== input.project
        || registration.url !== input.url
        || registration.ownerId !== input.headers['X-DSH-Label-Studio-Owner']) {
        throw new Error('created Webhook does not match request')
      }
    })
  }

  /** List action names supported by this Label Studio deployment. */
  async listWebhookActions(signal?: AbortSignal): Promise<ReadonlySet<LabelStudioWebhookEvent['action']>> {
    const body = await this.request<Record<string, unknown>>('/api/webhooks/info/', {
      method: 'GET', ...signal === undefined ? {} : { signal },
    })
    return new Set(LABEL_STUDIO_WEBHOOK_ACTIONS.filter(action => Object.hasOwn(body, action)))
  }

  /** List Webhooks and reduce each record to id, URL, and plugin owner header. */
  async listWebhooks(signal?: AbortSignal): Promise<readonly LabelStudioWebhookRegistration[]> {
    const accessToken = await this.exchangeAccessToken(await this.resolveRefreshCredential(), signal)
    const value = await this.fetchJsonValue('/api/webhooks/', {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      ...signal === undefined ? {} : { signal },
    })
    const values = Array.isArray(value) ? value : webhookResults(value)
    return values.map((value, index) => parseWebhookRegistration(recordValue(value, `results[${index}]`)))
  }

  /** Delete one exact Webhook registration. */
  async deleteWebhook(webhookId: number, signal?: AbortSignal): Promise<void> {
    if (!Number.isSafeInteger(webhookId) || webhookId <= 0) {
      throw new TypeError('label-studio: webhook id must be a positive safe integer')
    }
    const path = `/api/webhooks/${webhookId}/`
    const credential = await this.resolveRefreshCredential()
    const accessToken = await this.exchangeAccessToken(credential, signal)
    if (signal?.aborted === true) throw new Error(`label-studio: DELETE ${path} cancelled before dispatch`)
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
        ...signal === undefined ? {} : { signal },
      })
    } catch {
      throw new LabelStudioMutationOutcomeUnknownError(`DELETE ${path}`)
    }
    if (!response.ok) {
      await cancelBody(response.body)
      throw new LabelStudioHttpError('DELETE', path, response.status)
    }
    try {
      await readBoundedResponse(response, this.responseMaxBytes, `DELETE ${path}`)
    } catch {
      throw new LabelStudioMutationOutcomeUnknownError(`DELETE ${path}`)
    }
  }

  private async request<T>(path: string, request: {
    method: 'GET' | 'POST' | 'PATCH'
    body?: unknown
    signal?: AbortSignal
  }): Promise<T> {
    const accessToken = await this.exchangeAccessToken(await this.resolveRefreshCredential(), request.signal)
    if (request.signal?.aborted === true) {
      throw new Error(`label-studio: ${request.method} ${path} cancelled before dispatch`)
    }
    return this.fetchJsonObject(path, {
      method: request.method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...request.method === 'POST' || request.method === 'PATCH'
          ? { 'Content-Type': 'application/json' }
          : {},
      },
      ...request.body === undefined ? {} : { body: JSON.stringify(request.body) },
      ...request.signal === undefined ? {} : { signal: request.signal },
    }, request.method !== 'GET') as Promise<T>
  }

  private async exchangeAccessToken(refreshToken: string, signal?: AbortSignal): Promise<string> {
    const path = '/api/token/refresh/'
    const value = await this.fetchJsonObject(path, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh: refreshToken }),
      ...signal === undefined ? {} : { signal },
    })
    const access = value.access
    if (typeof access !== 'string' || access.length === 0) {
      throw new Error(`label-studio: POST ${path} response field "access" must be a non-empty string`)
    }
    return access
  }

  private async fetchJsonObject(
    path: string,
    init: RequestInit,
    mutation = false,
  ): Promise<Record<string, unknown>> {
    const value = await this.fetchJsonValue(path, init, mutation)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      if (mutation) throw new LabelStudioMutationOutcomeUnknownError(`${init.method ?? 'GET'} ${path}`)
      throw new Error(`label-studio: ${init.method ?? 'GET'} ${path} must return a JSON object`)
    }
    return value as Record<string, unknown>
  }

  private async fetchJsonValue(
    path: string,
    init: RequestInit,
    mutation = false,
  ): Promise<unknown> {
    const operation = `${init.method ?? 'GET'} ${path}`
    if (init.signal?.aborted === true) {
      throw new Error(`label-studio: ${operation} cancelled before dispatch`)
    }
    let pending: Promise<Response>
    try {
      pending = this.fetcher(`${this.baseUrl}${path}`, init)
    } catch (error) {
      const outcome = isAbort(error, init.signal) ? 'cancelled before dispatch' : 'request failed before dispatch'
      throw new Error(`label-studio: ${operation} ${outcome}`)
    }
    let response: Response
    try {
      response = await pending
    } catch (error) {
      if (mutation) throw new LabelStudioMutationOutcomeUnknownError(operation)
      const outcome = isAbort(error, init.signal) ? 'cancelled' : 'request failed'
      throw new Error(`label-studio: ${operation} ${outcome}`)
    }
    let raw: string
    try {
      raw = await readBoundedResponse(response, this.responseMaxBytes, operation)
    } catch (error) {
      if (mutation && response.ok) throw new LabelStudioMutationOutcomeUnknownError(operation)
      throw error
    }
    if (!response.ok) {
      throw new LabelStudioHttpError(init.method as 'GET' | 'POST' | 'PATCH' | 'DELETE', path, response.status)
    }
    try {
      return JSON.parse(raw) as unknown
    } catch (error) {
      if (mutation) throw new LabelStudioMutationOutcomeUnknownError(operation)
      throw new Error(`label-studio: ${operation} returned invalid JSON`)
    }
  }

  private async resolveRefreshCredential(): Promise<string> {
    const credential = await this.credentials.resolve(this.refreshTokenCredential)
    if (credential === undefined) {
      throw new Error(`label-studio: credential "${String(this.refreshTokenCredential)}" is not configured`)
    }
    return credential.value
  }
}

function parseWebhookRegistration(body: Record<string, unknown>): LabelStudioWebhookRegistration {
  const headers = recordValue(body.headers, 'headers')
  const ownerId = headers['X-DSH-Label-Studio-Owner']
  if (ownerId !== undefined && (typeof ownerId !== 'string' || ownerId === '')) {
    throw new Error('label-studio: response field "headers.X-DSH-Label-Studio-Owner" must be a string')
  }
  return {
    id: numberField(body, 'id'),
    projectId: projectIdField(body, 'project'),
    url: stringField(body, 'url'),
    ...ownerId === undefined ? {} : { ownerId },
  }
}

function nextApiPath(value: unknown, baseUrl: string): string | undefined {
  if (value === null) return undefined
  if (typeof value !== 'string') {
    throw new Error('label-studio: response field "next" must be a URL or null')
  }
  const next = new URL(value, baseUrl)
  if (next.origin !== baseUrl) {
    throw new Error('label-studio: response field "next" must use the configured origin')
  }
  return `${next.pathname}${next.search}`
}

function webhookResults(value: unknown): unknown[] {
  const body = recordValue(value, 'webhooks response')
  if (!Array.isArray(body.results)) {
    throw new Error('label-studio: response field "results" must be an array')
  }
  return body.results
}

function decodeMutationResponse<T>(operation: string, decode: () => T, verify?: (value: T) => void): T {
  try {
    const value = decode()
    verify?.(value)
    return value
  } catch {
    throw new LabelStudioMutationOutcomeUnknownError(operation)
  }
}

async function readBoundedResponse(response: Response, maxBytes: number, operation: string): Promise<string> {
  const declared = response.headers.get('content-length')?.trim()
  if (declared !== undefined && /^\d+$/.test(declared) && BigInt(declared) > BigInt(maxBytes)) {
    await cancelBody(response.body)
    throw responseTooLarge(operation, maxBytes, response.status)
  }
  if (response.body === null) return ''

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    let item: ReadableStreamReadResult<Uint8Array>
    try {
      item = await reader.read()
    } catch (error) {
      await cancelReader(reader)
      const outcome = isAbort(error) ? 'cancelled while reading its response' : 'response read failed'
      throw new Error(`label-studio: ${operation} ${outcome} (status ${response.status})`)
    }
    if (item.done) break
    total += item.value.byteLength
    if (total > maxBytes) {
      await cancelReader(reader)
      throw responseTooLarge(operation, maxBytes, response.status)
    }
    chunks.push(item.value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

function responseTooLarge(operation: string, maxBytes: number, status: number): Error {
  return new Error(`label-studio: ${operation} response exceeded ${maxBytes} bytes (status ${status})`)
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (body === null) return
  try {
    await body.cancel()
  } catch (cancelError) {
    void cancelError
  }
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel()
  } catch (cancelError) {
    void cancelError
  }
}

function isAbort(error: unknown, signal?: AbortSignal | null): boolean {
  return signal?.aborted === true
    || (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
}

function numberField(value: Record<string, unknown>, field: string): number {
  return numberValue(value[field], field)
}

function numberValue(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`label-studio: response field "${field}" must be an integer`)
  }
  return value
}

function stringField(value: Record<string, unknown>, field: string): string {
  const fieldValue = value[field]
  if (typeof fieldValue !== 'string') {
    throw new Error(`label-studio: response field "${field}" must be a string`)
  }
  return fieldValue
}

function booleanField(value: Record<string, unknown>, field: string): boolean {
  const fieldValue = value[field]
  if (typeof fieldValue !== 'boolean') {
    throw new Error(`label-studio: response field "${field}" must be a boolean`)
  }
  return fieldValue
}

function jsonRecordField(value: Record<string, unknown>, field: string): Record<string, JsonValue> {
  const fieldValue = value[field]
  if (typeof fieldValue !== 'object' || fieldValue === null || Array.isArray(fieldValue)) {
    throw new Error(`label-studio: response field "${field}" must be a JSON object`)
  }
  return fieldValue as Record<string, JsonValue>
}

function projectIdField(value: Record<string, unknown>, field: string): LabelStudioProjectId {
  return labelStudioProjectId(numberField(value, field))
}

function taskIdField(value: Record<string, unknown>, field: string): LabelStudioTaskId {
  return labelStudioTaskId(numberField(value, field))
}

function assertRequestedId(kind: 'project' | 'task', requested: number, received: number): void {
  if (requested !== received) {
    throw new Error(`label-studio: requested ${kind} ${requested} but received ${kind} ${received}`)
  }
}

function parseTaskView(body: Record<string, unknown>): LabelStudioTaskView {
  const annotations = body.annotations
  if (!Array.isArray(annotations)) {
    throw new Error('label-studio: response field "annotations" must be an array')
  }
  const predictions = body.predictions
  if (!Array.isArray(predictions)) {
    throw new Error('label-studio: response field "predictions" must be an array')
  }
  return {
    id: taskIdField(body, 'id'),
    projectId: projectIdField(body, 'project'),
    data: jsonRecordField(body, 'data'),
    annotations: annotations.map((value, index) => parseAnnotation(value, index)),
    predictions: predictions.map((value, index) => parsePrediction(value, index)),
  }
}

function parseAnnotation(value: unknown, index: number): LabelStudioAnnotationView {
  const field = `annotations[${index}]`
  const body = recordValue(value, field)
  return {
    id: labelStudioAnnotationId(numberFieldAt(body, 'id', `${field}.id`)),
    projectId: labelStudioProjectId(numberFieldAt(body, 'project', `${field}.project`)),
    taskId: labelStudioTaskId(numberFieldAt(body, 'task', `${field}.task`)),
    result: jsonArrayFieldAt(body, 'result', `${field}.result`),
    updatedAt: stringFieldAt(body, 'updated_at', `${field}.updated_at`),
  }
}

function parsePrediction(value: unknown, index: number): LabelStudioPredictionView {
  const field = `predictions[${index}]`
  const body = recordValue(value, field)
  const modelVersion = optionalStringField(body, 'model_version', `${field}.model_version`)
  const score = optionalFiniteNumberField(body, 'score', `${field}.score`)
  return {
    id: labelStudioPredictionId(numberFieldAt(body, 'id', `${field}.id`)),
    projectId: labelStudioProjectId(numberFieldAt(body, 'project', `${field}.project`)),
    taskId: labelStudioTaskId(numberFieldAt(body, 'task', `${field}.task`)),
    result: jsonArrayFieldAt(body, 'result', `${field}.result`),
    ...modelVersion === undefined ? {} : { modelVersion },
    ...score === undefined ? {} : { score },
  }
}

function recordValue(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`label-studio: response field "${field}" must be a JSON object`)
  }
  return value as Record<string, unknown>
}

function numberFieldAt(value: Record<string, unknown>, key: string, field: string): number {
  return numberValue(value[key], field)
}

function stringFieldAt(value: Record<string, unknown>, key: string, field: string): string {
  const fieldValue = value[key]
  if (typeof fieldValue !== 'string') {
    throw new Error(`label-studio: response field "${field}" must be a string`)
  }
  return fieldValue
}

function jsonArrayFieldAt(value: Record<string, unknown>, key: string, field: string): JsonValue[] {
  const fieldValue = value[key]
  if (!Array.isArray(fieldValue)) {
    throw new Error(`label-studio: response field "${field}" must be an array`)
  }
  return fieldValue as JsonValue[]
}

function optionalStringField(value: Record<string, unknown>, key: string, field: string): string | undefined {
  const fieldValue = value[key]
  if (fieldValue === undefined || fieldValue === null) return undefined
  if (typeof fieldValue !== 'string') {
    throw new Error(`label-studio: response field "${field}" must be a string when present`)
  }
  return fieldValue
}

function optionalFiniteNumberField(value: Record<string, unknown>, key: string, field: string): number | undefined {
  const fieldValue = value[key]
  if (fieldValue === undefined || fieldValue === null) return undefined
  if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) {
    throw new Error(`label-studio: response field "${field}" must be a finite number when present`)
  }
  return fieldValue
}

/**
 * Verify that REST project, task, annotation, and prediction ids match the live browser target.
 * @param active - committed identifiers owned by the current Session lease.
 * @param project - authoritative project REST projection.
 * @param task - authoritative task REST projection.
 * @returns the validated project and task pair.
 */
export function validateSelectedTask(
  active: LabelStudioActiveTarget,
  project: LabelStudioProjectView,
  task: LabelStudioTaskView,
): LabelStudioSelectedTaskView {
  if (project.id !== active.projectId || task.projectId !== project.id) {
    throw new Error('label-studio: active project does not match the REST project and task')
  }
  if (task.id !== active.taskId) {
    throw new Error('label-studio: active task does not match the REST task')
  }
  for (const annotation of task.annotations) {
    if (annotation.projectId !== project.id || annotation.taskId !== task.id) {
      throw new Error('label-studio: annotation does not belong to the active project and task')
    }
  }
  for (const prediction of task.predictions) {
    if (prediction.projectId !== project.id || prediction.taskId !== task.id) {
      throw new Error('label-studio: prediction does not belong to the active project and task')
    }
  }
  if (active.annotationId !== undefined
    && !task.annotations.some(annotation => annotation.id === active.annotationId)) {
    throw new Error('label-studio: active annotation does not belong to the REST task')
  }
  return { project, task }
}
