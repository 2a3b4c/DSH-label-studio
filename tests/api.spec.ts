import { describe, expect, it, vi } from 'vitest'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import {
  LabelStudioApi,
  LabelStudioMutationOutcomeUnknownError,
  validateSelectedTask,
} from '../src/api.ts'
import {
  labelStudioAnnotationId,
  labelStudioPredictionId,
  labelStudioProjectId,
  labelStudioTaskId,
} from '../src/context-types.ts'

const BASE_URL = 'http://127.0.0.1:8080'
const REFRESH_REF = credentialRef('LABEL_STUDIO_PAT')
const DEFAULT_TEST_LIMIT = 4_096
const BODY_SENTINEL = 'RESPONSE_BODY_SENTINEL_DO_NOT_DISCLOSE'
const PAT_SENTINEL = 'PAT_SENTINEL_DO_NOT_DISCLOSE'
const ACCESS_SENTINEL = 'ACCESS_SENTINEL_DO_NOT_DISCLOSE'

type Fetch = typeof globalThis.fetch

function response(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('content-type', 'application/json')
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  })
}

function textResponse(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, { status, headers })
}

function streamingResponse(
  body: string,
  headers: HeadersInit,
  onCancel: () => void,
  status = 200,
): Response {
  const bytes = new TextEncoder().encode(body)
  let emitted = false
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (emitted) return
      emitted = true
      controller.enqueue(bytes)
    },
    cancel() { onCancel() },
  }), { status, headers })
}

function credentials(
  resolve = vi.fn().mockResolvedValue({ value: PAT_SENTINEL, source: 'test' }),
): { provider: CredentialProvider; resolve: typeof resolve } {
  return { provider: { resolve } as unknown as CredentialProvider, resolve }
}

function makeApi(
  fetcher: Fetch,
  provider: CredentialProvider,
  responseMaxBytes = DEFAULT_TEST_LIMIT,
): LabelStudioApi {
  return new LabelStudioApi(BASE_URL, REFRESH_REF, provider, responseMaxBytes, fetcher)
}

async function errorText(promise: Promise<unknown>): Promise<string> {
  let caught: unknown
  try {
    await promise
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(Error)
  return String(caught)
}

const BUSINESS_CASES = [
  {
    name: 'project creation',
    path: '/api/projects/',
    invoke: (api: LabelStudioApi) => api.createProject({ title: 'Images' }),
  },
  {
    name: 'task import',
    path: '/api/projects/7/import',
    invoke: (api: LabelStudioApi) => api.importTasks(7, [{ data: { image: '/data/a.jpg' } }]),
  },
  {
    name: 'prediction creation',
    path: '/api/predictions/',
    invoke: (api: LabelStudioApi) => api.createPrediction({ taskId: 11, result: [] }),
  },
] as const

describe('LabelStudioApi', () => {
  it('lists supported actions and owner-reduced Webhook registrations', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({ PROJECT_CREATED: {}, TASKS_CREATED: {}, UNKNOWN: {} }))
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response([
        {
          id: 5, project: 7, url: 'http://127.0.0.1:3000/hook', headers: { 'X-DSH-Label-Studio-Owner': 'owner-a', Secret: 'not returned' },
        },
        { id: 6, project: 8, url: 'http://user/hook', headers: {} },
      ]))
    const api = makeApi(fetch as Fetch, credentials().provider)

    await expect(api.listWebhookActions()).resolves.toEqual(new Set(['PROJECT_CREATED', 'TASKS_CREATED']))
    await expect(api.listWebhooks()).resolves.toEqual([
      { id: 5, projectId: 7, url: 'http://127.0.0.1:3000/hook', ownerId: 'owner-a' },
      { id: 6, projectId: 8, url: 'http://user/hook' },
    ])
  })

  it('lists every project id from the paginated Label Studio response', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({ count: 3, next: 'http://127.0.0.1:8080/api/projects/?page=2&page_size=2', results: [{ id: 7 }, { id: 8 }] }))
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({ count: 3, next: null, results: [{ id: 9 }] }))
    const api = makeApi(fetch as Fetch, credentials().provider)

    await expect(api.listProjectIds()).resolves.toEqual([7, 8, 9])
    expect(fetch.mock.calls[1]?.[0]).toBe('http://127.0.0.1:8080/api/projects/?page_size=100')
    expect(fetch.mock.calls[3]?.[0]).toBe('http://127.0.0.1:8080/api/projects/?page=2&page_size=2')
  })

  it('creates and deletes exact Webhook registrations through authenticated REST calls', async () => {
    const input = {
      url: 'http://127.0.0.1:3000/hook',
      actions: ['ANNOTATION_CREATED'] as const,
      headers: { 'X-DSH-Label-Studio-Owner': 'owner-a', 'X-DSH-Label-Studio-Webhook': 'secret' },
      is_active: true as const,
      project: 7,
      send_for_all_actions: false as const,
      send_payload: true as const,
    }
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({ id: 5, project: 7, url: input.url, headers: input.headers }))
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const api = makeApi(fetch as Fetch, credentials().provider)

    await expect(api.createWebhook(input)).resolves.toEqual({ id: 5, projectId: 7, url: input.url, ownerId: 'owner-a' })
    await expect(api.deleteWebhook(5)).resolves.toBeUndefined()
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify(input) })
    expect(fetch.mock.calls[3]?.[1]).toMatchObject({ method: 'DELETE' })
  })

  it('classifies an unknown Webhook delete outcome for reconciliation', async () => {
    const api = makeApi(vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockRejectedValueOnce(new TypeError('connection reset')) as Fetch, credentials().provider)
    await expect(api.deleteWebhook(5)).rejects.toBeInstanceOf(LabelStudioMutationOutcomeUnknownError)
  })

  it('reads and validates complete project and task views with GET requests', async () => {
    const auth = credentials()
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({
        id: 7,
        label_config: '<View><Choices name="answer" toName="text" /></View>',
        show_collab_predictions: false,
      }))
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({
        id: 11,
        project: 7,
        data: { text: 'Is this a ship?', image: '/data/a.jpg' },
        annotations: [{
          id: 13, project: 7, task: 11, result: [{ value: { choices: ['yes'] } }], updated_at: '2026-09-01T00:00:00Z',
        }],
        predictions: [{
          id: 19, project: 7, task: 11, result: [{ value: { rectanglelabels: ['ship'], original_width: 640 } }], model_version: 'dsh', score: 0.9,
        }],
      }))
    const api = makeApi(fetch as Fetch, auth.provider)

    await expect(api.getProject(labelStudioProjectId(7))).resolves.toEqual({
      id: 7,
      labelConfig: '<View><Choices name="answer" toName="text" /></View>',
      showCollabPredictions: false,
    })
    await expect(api.getTask(labelStudioTaskId(11))).resolves.toEqual({
      id: 11,
      projectId: 7,
      data: { text: 'Is this a ship?', image: '/data/a.jpg' },
      annotations: [{
        id: 13, projectId: 7, taskId: 11, result: [{ value: { choices: ['yes'] } }], updatedAt: '2026-09-01T00:00:00Z',
      }],
      predictions: [{
        id: 19, projectId: 7, taskId: 11, result: [{ value: { rectanglelabels: ['ship'], original_width: 640 } }], modelVersion: 'dsh', score: 0.9,
      }],
    })
    expect(fetch.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ method: 'GET' }))
    expect(fetch.mock.calls[3]?.[1]).toEqual(expect.objectContaining({ method: 'GET' }))
    expect(new Headers((fetch.mock.calls[1]?.[1] as RequestInit).headers).get('authorization'))
      .toBe(`Bearer ${ACCESS_SENTINEL}`)
  })

  it('reports a sanitized typed 404 for a missing project', async () => {
    const api = makeApi(vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({ detail: BODY_SENTINEL }, 404))
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({ detail: BODY_SENTINEL }, 404)) as Fetch, credentials().provider)

    await expect(api.getProject(labelStudioProjectId(7))).rejects.toMatchObject({
      name: 'LabelStudioHttpError',
      method: 'GET',
      path: '/api/projects/7/',
      status: 404,
    })
    const error = await errorText(api.getProject(labelStudioProjectId(7)))
    expect(error).not.toContain(BODY_SENTINEL)
    expect(error).not.toContain(PAT_SENTINEL)
    expect(error).not.toContain(ACCESS_SENTINEL)
  })

  it('rejects project and task responses whose ids do not match the requested resource', async () => {
    const api = makeApi(vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({
        id: 8, label_config: '<View />', show_collab_predictions: false,
      }))
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({
        id: 12, project: 7, data: {}, annotations: [], predictions: [],
      })) as Fetch, credentials().provider)

    await expect(api.getProject(labelStudioProjectId(7))).rejects.toThrow('requested project 7')
    await expect(api.getTask(labelStudioTaskId(11))).rejects.toThrow('requested task 11')
  })

  it('updates only label_config and verifies the returned project fields', async () => {
    const labelConfig = '<View><Text name="text" value="$text" /></View>'
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({ id: 7, label_config: labelConfig }))
    const api = makeApi(fetch as Fetch, credentials().provider)

    await expect(api.updateProjectLabelConfig(labelStudioProjectId(7), labelConfig))
      .resolves.toEqual({ id: 7, labelConfig })
    expect(fetch.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ label_config: labelConfig }),
    }))
  })

  it.each([
    { id: 8, label_config: '<View />' },
    { id: 7, label_config: '<View />' },
  ])('treats an unverifiable label-config update as an unknown mutation outcome', async (body) => {
    const expected = '<View><Text name="text" value="$text" /></View>'
    const api = makeApi(vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response(body)) as Fetch, credentials().provider)
    await expect(api.updateProjectLabelConfig(labelStudioProjectId(7), expected))
      .rejects.toBeInstanceOf(LabelStudioMutationOutcomeUnknownError)
  })

  it('treats a prediction response for another task as an unknown mutation outcome', async () => {
    const api = makeApi(vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({ id: 19, task: 12 })) as Fetch, credentials().provider)
    await expect(api.createPrediction({ taskId: 11, result: [] }))
      .rejects.toBeInstanceOf(LabelStudioMutationOutcomeUnknownError)
  })

  it.each([
    { field: 'data', body: { id: 11, project: 7, data: [], annotations: [], predictions: [] } },
    { field: 'annotations', body: { id: 11, project: 7, data: {}, annotations: {}, predictions: [] } },
    { field: 'annotations[0].result', body: { id: 11, project: 7, data: {}, annotations: [{ id: 13, project: 7, task: 11, updated_at: 'now' }], predictions: [] } },
    { field: 'predictions[0].score', body: { id: 11, project: 7, data: {}, annotations: [], predictions: [{ id: 19, project: 7, task: 11, result: [], score: 'high' }] } },
  ])('rejects an invalid task response field: $field', async ({ field, body }) => {
    const api = makeApi(vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response(body)) as Fetch, credentials().provider)
    await expect(api.getTask(labelStudioTaskId(11))).rejects.toThrow(field)
  })

  it('rejects mismatched selected-task relationships and annotation stubs', () => {
    const project = { id: labelStudioProjectId(7), labelConfig: '<View />', showCollabPredictions: true }
    const task = {
      id: labelStudioTaskId(11), projectId: labelStudioProjectId(7), data: {}, annotations: [{
        id: labelStudioAnnotationId(13), projectId: labelStudioProjectId(7), taskId: labelStudioTaskId(11), result: [], updatedAt: 'now',
      }], predictions: [{
        id: labelStudioPredictionId(19), projectId: labelStudioProjectId(7), taskId: labelStudioTaskId(11), result: [],
      }],
    }
    const active = { projectId: labelStudioProjectId(7), taskId: labelStudioTaskId(11), annotationId: labelStudioAnnotationId(13) }
    expect(validateSelectedTask(active, project, task)).toEqual({ project, task })
    expect(() => validateSelectedTask({ ...active, projectId: labelStudioProjectId(8) }, project, task))
      .toThrow('project')
    expect(() => validateSelectedTask(active, project, {
      ...task, predictions: [{ ...task.predictions[0]!, taskId: labelStudioTaskId(12) }],
    })).toThrow('prediction')
    expect(() => validateSelectedTask({ ...active, annotationId: labelStudioAnnotationId(14) }, project, task))
      .toThrow('annotation')
  })
  it('sends the PAT only in the refresh body and the access token only as business Bearer auth', async () => {
    const auth = credentials()
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({ id: 7, title: 'Images' }, 201))
    const api = makeApi(fetch as Fetch, auth.provider)

    await expect(api.createProject({ title: 'Images', labelConfig: '<View />' }))
      .resolves.toEqual({ id: 7, title: 'Images' })
    expect(auth.resolve).toHaveBeenCalledWith(REFRESH_REF)

    const [refreshUrl, refreshRequest] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(refreshUrl).toBe(`${BASE_URL}/api/token/refresh/`)
    expect(refreshRequest).toEqual(expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ refresh: PAT_SENTINEL }),
    }))
    expect(new Headers(refreshRequest.headers).has('authorization')).toBe(false)

    const [businessUrl, businessRequest] = fetch.mock.calls[1] as unknown as [string, RequestInit]
    expect(businessUrl).toBe(`${BASE_URL}/api/projects/`)
    expect(businessRequest).toEqual(expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: 'Images', label_config: '<View />' }),
    }))
    expect(new Headers(businessRequest.headers).get('authorization'))
      .toBe(`Bearer ${ACCESS_SENTINEL}`)
  })

  it('re-resolves and re-exchanges the credential for every business operation', async () => {
    const resolve = vi.fn()
      .mockResolvedValueOnce({ value: 'pat-one', source: 'test' })
      .mockResolvedValueOnce({ value: 'pat-two', source: 'test' })
      .mockResolvedValueOnce({ value: 'pat-three', source: 'test' })
    const auth = credentials(resolve)
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ access: 'access-one' }))
      .mockResolvedValueOnce(response({ id: 7, title: 'Images' }, 201))
      .mockResolvedValueOnce(response({ access: 'access-two' }))
      .mockResolvedValueOnce(response({ task_count: 1, task_ids: [11] }, 201))
      .mockResolvedValueOnce(response({ access: 'access-three' }))
      .mockResolvedValueOnce(response({ id: 19, task: 11 }, 201))
    const api = makeApi(fetch as Fetch, auth.provider)

    await api.createProject({ title: 'Images' })
    await api.importTasks(7, [{ data: { image: '/data/a.jpg' } }])
    await api.createPrediction({ taskId: 11, result: [] })

    expect(resolve).toHaveBeenCalledTimes(3)
    expect(resolve).toHaveBeenNthCalledWith(1, REFRESH_REF)
    expect(resolve).toHaveBeenNthCalledWith(2, REFRESH_REF)
    expect(resolve).toHaveBeenNthCalledWith(3, REFRESH_REF)
    expect(fetch).toHaveBeenCalledTimes(6)
    const businessRequests = fetch.mock.calls
      .map(call => call as unknown as [string, RequestInit])
      .filter(([, init]) => new Headers(init.headers).has('authorization'))
    expect(businessRequests.map(([url, init]) => ({ method: init.method, url }))).toEqual([
      { method: 'POST', url: `${BASE_URL}/api/projects/` },
      { method: 'POST', url: `${BASE_URL}/api/projects/7/import` },
      { method: 'POST', url: `${BASE_URL}/api/predictions/` },
    ])
    expect(businessRequests.some(([url, init]) =>
      init.method === 'PATCH' || url.includes('/api/annotations/'))).toBe(false)
    expect(Object.getOwnPropertyNames(LabelStudioApi.prototype)).not.toContain('updateAnnotation')
  })

  it('does not dispatch a mutation after cancellation becomes observable', async () => {
    const controller = new AbortController()
    const fetch = vi.fn().mockImplementationOnce(async () => {
      controller.abort()
      return response({ access: ACCESS_SENTINEL })
    })
    const api = makeApi(fetch as Fetch, credentials().provider)
    const error = await errorText(api.createPrediction({ taskId: 11, result: [] }, controller.signal))
    expect(error).toContain('cancelled before dispatch')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('classifies a dispatched prediction without a valid success response as outcome unknown', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockRejectedValueOnce(new DOMException(BODY_SENTINEL, 'AbortError'))
    const api = makeApi(fetch as Fetch, credentials().provider)
    let caught: unknown
    try {
      await api.createPrediction({ taskId: 11, result: [] })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(LabelStudioMutationOutcomeUnknownError)
    expect(String(caught)).toContain('submission status is unknown')
    expect(String(caught)).not.toContain(BODY_SENTINEL)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    {
      name: 'project creation',
      response: { title: 'Images' },
      invoke: (api: LabelStudioApi) => api.createProject({ title: 'Images' }),
    },
    {
      name: 'task import',
      response: { task_ids: [11] },
      invoke: (api: LabelStudioApi) => api.importTasks(7, [{ data: { image: '/data/a.jpg' } }]),
    },
    {
      name: 'prediction creation',
      response: { task: 11 },
      invoke: (api: LabelStudioApi) => api.createPrediction({ taskId: 11, result: [] }),
    },
  ])('classifies an invalid successful $name response as outcome unknown', async ({ response: body, invoke }) => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response(body, 201))
    const api = makeApi(fetch as Fetch, credentials().provider)
    await expect(invoke(api)).rejects.toBeInstanceOf(LabelStudioMutationOutcomeUnknownError)
  })

  it('reports only the credential reference when it is unconfigured', async () => {
    const auth = credentials(vi.fn().mockResolvedValue(undefined))
    const api = makeApi(vi.fn() as Fetch, auth.provider)

    const error = await errorText(api.createProject({ title: 'Images' }))
    expect(error).toBe('Error: label-studio: credential "LABEL_STUDIO_PAT" is not configured')
    expect(error).not.toContain(PAT_SENTINEL)
  })

  it('redacts both tokens and the response body from refresh failures', async () => {
    const auth = credentials()
    const fetch = vi.fn().mockResolvedValue(response({ detail: BODY_SENTINEL }, 401))
    const api = makeApi(fetch as Fetch, auth.provider)

    const error = await errorText(api.createProject({ title: 'Images' }))
    expect(error).toContain('POST /api/token/refresh/ returned 401')
    expect(error).not.toContain(BODY_SENTINEL)
    expect(error).not.toContain(PAT_SENTINEL)
    expect(error).not.toContain(ACCESS_SENTINEL)
  })

  it('rejects an empty access token without disclosing the refresh body', async () => {
    const auth = credentials()
    const fetch = vi.fn().mockResolvedValue(response({ access: '', detail: BODY_SENTINEL }))
    const api = makeApi(fetch as Fetch, auth.provider)

    const error = await errorText(api.createProject({ title: 'Images' }))
    expect(error).toContain('POST /api/token/refresh/ response field "access"')
    expect(error).not.toContain(BODY_SENTINEL)
    expect(error).not.toContain(PAT_SENTINEL)
  })

  it.each(BUSINESS_CASES)('redacts response bodies and tokens from $name failures', async ({ path, invoke }) => {
    const auth = credentials()
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ access: ACCESS_SENTINEL }))
      .mockResolvedValueOnce(response({ detail: BODY_SENTINEL }, 422))
    const api = makeApi(fetch as Fetch, auth.provider)

    const error = await errorText(invoke(api))
    expect(error).toContain(`POST ${path} returned 422`)
    expect(error).not.toContain(BODY_SENTINEL)
    expect(error).not.toContain(PAT_SENTINEL)
    expect(error).not.toContain(ACCESS_SENTINEL)
  })

  it.each([
    { name: 'refresh', responses: [textResponse(`not-json-${BODY_SENTINEL}`)] },
    {
      name: 'business',
      responses: [response({ access: ACCESS_SENTINEL }), textResponse(`not-json-${BODY_SENTINEL}`)],
    },
  ])('redacts invalid JSON from the $name response', async ({ name, responses }) => {
    const auth = credentials()
    const fetch = vi.fn()
    for (const item of responses) fetch.mockResolvedValueOnce(item)
    const api = makeApi(fetch as Fetch, auth.provider)

    const error = await errorText(api.createProject({ title: 'Images' }))
    expect(error).toContain(name === 'refresh' ? 'returned invalid JSON' : 'submission status is unknown')
    expect(error).not.toContain(BODY_SENTINEL)
    expect(error).not.toContain(PAT_SENTINEL)
    expect(error).not.toContain(ACCESS_SENTINEL)
  })

  it.each([
    { name: 'refresh', responses: [] },
    { name: 'business', responses: [response({ access: ACCESS_SENTINEL })] },
  ])('redacts transport and cancellation error details from $name', async ({ name, responses }) => {
    const auth = credentials()
    const fetch = vi.fn()
    for (const item of responses) fetch.mockResolvedValueOnce(item)
    fetch.mockRejectedValueOnce(new DOMException(
      `${BODY_SENTINEL}:${PAT_SENTINEL}:${ACCESS_SENTINEL}`,
      'AbortError',
    ))
    const api = makeApi(fetch as Fetch, auth.provider)

    const error = await errorText(api.createProject({ title: 'Images' }))
    expect(error).toContain(name === 'refresh' ? '/api/token/refresh/' : '/api/projects/')
    expect(error).toContain(name === 'refresh' ? 'cancelled' : 'submission status is unknown')
    expect(error).not.toContain(BODY_SENTINEL)
    expect(error).not.toContain(PAT_SENTINEL)
    expect(error).not.toContain(ACCESS_SENTINEL)
  })

  it('rejects an oversized declared refresh response before decoding it', async () => {
    let cancelled = false
    const auth = credentials()
    const refresh = streamingResponse(
      JSON.stringify({ access: ACCESS_SENTINEL }),
      { 'content-length': '33' },
      () => { cancelled = true },
    )
    const api = makeApi(vi.fn().mockResolvedValue(refresh) as Fetch, auth.provider, 32)

    const error = await errorText(api.createProject({ title: 'Images' }))
    expect(error).toContain('POST /api/token/refresh/ response exceeded 32 bytes')
    expect(error).not.toContain(PAT_SENTINEL)
    expect(error).not.toContain(ACCESS_SENTINEL)
    expect(cancelled).toBe(true)
  })

  it.each([
    { name: 'without a length header', headers: {} },
    { name: 'with chunked transfer', headers: { 'transfer-encoding': 'chunked' } },
    { name: 'with a lying smaller length', headers: { 'content-length': '1' } },
    { name: 'after compressed expansion', headers: { 'content-encoding': 'gzip', 'content-length': '8' } },
  ])('counts the actual decoded refresh stream $name', async ({ headers }) => {
    let cancelled = false
    const auth = credentials()
    const refresh = streamingResponse(
      JSON.stringify({ access: `${ACCESS_SENTINEL}-${'x'.repeat(64)}` }),
      headers,
      () => { cancelled = true },
    )
    const api = makeApi(vi.fn().mockResolvedValue(refresh) as Fetch, auth.provider, 32)

    const error = await errorText(api.createProject({ title: 'Images' }))
    expect(error).toContain('POST /api/token/refresh/ response exceeded 32 bytes')
    expect(error).not.toContain(ACCESS_SENTINEL)
    expect(cancelled).toBe(true)
  })

  it.each(BUSINESS_CASES)('rejects an oversized declared $name response before decoding it', async ({ invoke }) => {
    let cancelled = false
    const auth = credentials()
    const business = streamingResponse(
      JSON.stringify({ detail: BODY_SENTINEL }),
      { 'content-length': '65' },
      () => { cancelled = true },
      422,
    )
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ access: 'ok' }))
      .mockResolvedValueOnce(business)
    const api = makeApi(fetch as Fetch, auth.provider, 64)

    const error = await errorText(invoke(api))
    expect(error).toContain('response exceeded 64 bytes')
    expect(error).not.toContain(BODY_SENTINEL)
    expect(cancelled).toBe(true)
  })

  it.each(BUSINESS_CASES)('bounds the actual decoded $name response stream', async ({ invoke }) => {
    let cancelled = false
    const auth = credentials()
    const business = streamingResponse(
      JSON.stringify({ detail: `${BODY_SENTINEL}-${'x'.repeat(64)}` }),
      {},
      () => { cancelled = true },
      422,
    )
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ access: 'ok' }))
      .mockResolvedValueOnce(business)
    const api = makeApi(fetch as Fetch, auth.provider, 48)

    const error = await errorText(invoke(api))
    expect(error).toContain('response exceeded 48 bytes')
    expect(error).not.toContain(BODY_SENTINEL)
    expect(cancelled).toBe(true)
  })
})
