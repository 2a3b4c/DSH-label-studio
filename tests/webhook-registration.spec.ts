import { describe, expect, it, vi } from 'vitest'
import { LabelStudioMutationOutcomeUnknownError } from '../src/api.ts'
import {
  LABEL_STUDIO_WEBHOOK_OWNER_HEADER,
  LABEL_STUDIO_WEBHOOK_SECRET_HEADER,
  LabelStudioWebhookRegistrar,
} from '../src/webhook-registration.ts'

const OWNER = '123e4567-e89b-42d3-a456-426614174000'
const ACTIONS = new Set([
  'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_DELETED',
  'TASKS_CREATED', 'TASKS_DELETED', 'ANNOTATION_CREATED',
  'ANNOTATIONS_CREATED', 'ANNOTATION_UPDATED', 'ANNOTATIONS_DELETED',
] as const)

function harness(overrides: Record<string, unknown> = {}) {
  const api = {
    listProjectIds: vi.fn(async () => [2, 3]),
    listWebhookActions: vi.fn(async () => ACTIONS),
    listWebhooks: vi.fn(async () => []),
    createWebhook: vi.fn(async (input: { project: number; url: string; headers: Record<string, string> }) => ({ id: input.project + 10, projectId: input.project, url: input.url, ownerId: input.headers[LABEL_STUDIO_WEBHOOK_OWNER_HEADER]! })),
    deleteWebhook: vi.fn(async () => {}),
    ...overrides,
  }
  const store = { ensureWebhookOwnerId: vi.fn(async () => OWNER) }
  return { api, store, registrar: new LabelStudioWebhookRegistrar(api as never, store, () => OWNER) }
}

describe('LabelStudioWebhookRegistrar', () => {
  it('creates one project Webhook per existing project with separate owner and secret headers', async () => {
    const value = harness()
    await expect(value.registrar.ensureInstalled('http://127.0.0.1:3000/hook', new Uint8Array([1, 2, 3]), new AbortController().signal))
      .resolves.toHaveLength(2)
    expect(value.api.createWebhook).toHaveBeenCalledTimes(2)
    expect(value.api.createWebhook).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:3000/hook',
      actions: [
        'PROJECT_UPDATED', 'TASKS_CREATED', 'TASKS_DELETED', 'ANNOTATION_CREATED',
        'ANNOTATIONS_CREATED', 'ANNOTATION_UPDATED', 'ANNOTATIONS_DELETED',
      ],
      is_active: true,
      project: 2,
      send_for_all_actions: false,
      send_payload: true,
      headers: expect.objectContaining({ [LABEL_STUDIO_WEBHOOK_OWNER_HEADER]: OWNER }),
    }), expect.any(AbortSignal))
    const headers = value.api.createWebhook.mock.calls[0]![0].headers
    expect(headers[LABEL_STUDIO_WEBHOOK_SECRET_HEADER]).toBeTruthy()
    expect(headers[LABEL_STUDIO_WEBHOOK_SECRET_HEADER]).not.toBe(OWNER)
  })

  it('removes only stale registrations with the exact durable owner', async () => {
    const listWebhooks = vi.fn(async () => [
      { id: 1, projectId: 2, url: 'http://same/hook', ownerId: OWNER },
      { id: 2, projectId: 2, url: 'http://same/hook', ownerId: '223e4567-e89b-42d3-a456-426614174000' },
    ])
    const value = harness({ listWebhooks })
    await value.registrar.ensureInstalled('http://same/hook', new Uint8Array([1]), new AbortController().signal)
    expect(value.api.deleteWebhook).toHaveBeenCalledTimes(1)
    expect(value.api.deleteWebhook).toHaveBeenCalledWith(1, expect.any(AbortSignal))
  })

  it('fails when one semantic action category is unsupported', async () => {
    const actions = new Set(ACTIONS)
    actions.delete('TASKS_DELETED')
    const value = harness({ listWebhookActions: vi.fn(async () => actions) })
    await expect(value.registrar.ensureInstalled('http://same/hook', new Uint8Array([1]), new AbortController().signal))
      .rejects.toThrow('task deletion')
    expect(value.api.createWebhook).not.toHaveBeenCalled()
  })

  it('re-lists after an unknown create result and adopts the exact owner registration', async () => {
    const createWebhook = vi.fn().mockRejectedValue(new LabelStudioMutationOutcomeUnknownError('POST /api/webhooks/'))
    const listWebhooks = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 12, projectId: 2, url: 'http://same/hook', ownerId: OWNER },
        { id: 13, projectId: 3, url: 'http://same/hook', ownerId: OWNER },
      ])
    const value = harness({ createWebhook, listWebhooks })
    await expect(value.registrar.ensureInstalled('http://same/hook', new Uint8Array([1]), new AbortController().signal))
      .resolves.toHaveLength(2)
  })

  it('re-lists after an unknown stale-delete result and continues when the id is absent', async () => {
    const listWebhooks = vi.fn()
      .mockResolvedValueOnce([{ id: 3, projectId: 2, url: 'http://old/hook', ownerId: OWNER }])
      .mockResolvedValueOnce([])
    const deleteWebhook = vi.fn().mockRejectedValueOnce(
      new LabelStudioMutationOutcomeUnknownError('DELETE /api/webhooks/3/'),
    )
    const value = harness({ listWebhooks, deleteWebhook })
    await expect(value.registrar.ensureInstalled('http://same/hook', new Uint8Array([1]), new AbortController().signal))
      .resolves.toHaveLength(2)
    expect(value.api.createWebhook).toHaveBeenCalledTimes(2)
  })

  it('deletes only the installed registration on normal disposal', async () => {
    const value = harness()
    await value.registrar.ensureInstalled('http://same/hook', new Uint8Array([1]), new AbortController().signal)
    await value.registrar.dispose()
    expect(value.api.deleteWebhook).toHaveBeenCalledWith(12, expect.any(AbortSignal))
    expect(value.api.deleteWebhook).toHaveBeenCalledWith(13, expect.any(AbortSignal))
  })
})
