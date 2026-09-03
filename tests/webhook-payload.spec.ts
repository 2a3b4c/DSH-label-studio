import { describe, expect, it } from 'vitest'
import { LABEL_STUDIO_1_22_WEBHOOKS } from './fixtures/label-studio-1.22-webhooks.ts'
import { parseLabelStudioWebhook } from '../src/webhook-payload.ts'

describe('parseLabelStudioWebhook', () => {
  it('reduces Label Studio 1.22 task, annotation, and project payloads to identifiers', () => {
    expect(parseLabelStudioWebhook(LABEL_STUDIO_1_22_WEBHOOKS.tasksCreated))
      .toEqual({ action: 'TASKS_CREATED', projectId: 2, taskIds: [21] })
    expect(parseLabelStudioWebhook(LABEL_STUDIO_1_22_WEBHOOKS.tasksDeleted))
      .toEqual({ action: 'TASKS_DELETED', projectId: 2, taskIds: [18, 19] })
    expect(parseLabelStudioWebhook(LABEL_STUDIO_1_22_WEBHOOKS.annotationCreated))
      .toEqual({ action: 'ANNOTATION_CREATED', projectId: 2, items: [{ taskId: 21, annotationId: 17 }] })
    expect(parseLabelStudioWebhook(LABEL_STUDIO_1_22_WEBHOOKS.annotationsCreated))
      .toEqual({ action: 'ANNOTATIONS_CREATED', projectId: 2, items: [
        { taskId: 21, annotationId: 30 }, { taskId: 22, annotationId: 31 },
      ] })
    expect(parseLabelStudioWebhook(LABEL_STUDIO_1_22_WEBHOOKS.annotationUpdated))
      .toEqual({ action: 'ANNOTATION_UPDATED', projectId: 2, items: [{ taskId: 21, annotationId: 17 }] })
    expect(parseLabelStudioWebhook(LABEL_STUDIO_1_22_WEBHOOKS.annotationsDeleted))
      .toEqual({ action: 'ANNOTATIONS_DELETED', projectId: 2, annotationIds: [17, 18] })
    expect(parseLabelStudioWebhook(LABEL_STUDIO_1_22_WEBHOOKS.projectCreated))
      .toEqual({ action: 'PROJECT_CREATED', projectId: 2 })
    expect(parseLabelStudioWebhook(LABEL_STUDIO_1_22_WEBHOOKS.projectUpdated))
      .toEqual({ action: 'PROJECT_UPDATED', projectId: 2 })
    expect(parseLabelStudioWebhook(LABEL_STUDIO_1_22_WEBHOOKS.projectDeleted))
      .toEqual({ action: 'PROJECT_DELETED', projectId: 2 })
  })

  it('supports documented singular task and annotation-delete actions', () => {
    expect(parseLabelStudioWebhook({ action: 'TASK_CREATED', task: { id: 7, project: 3 }, project: { id: 3 } }))
      .toEqual({ action: 'TASK_CREATED', projectId: 3, taskIds: [7] })
    expect(parseLabelStudioWebhook({ action: 'TASK_DELETED', task: { id: 7 }, project: { id: 3 } }))
      .toEqual({ action: 'TASK_DELETED', projectId: 3, taskIds: [7] })
    expect(parseLabelStudioWebhook({ action: 'ANNOTATION_DELETED', annotation: { id: 9 }, project: { id: 3 } }))
      .toEqual({ action: 'ANNOTATION_DELETED', projectId: 3, annotationIds: [9] })
  })

  it('does not require or infer task ids for annotation deletion', () => {
    const result = parseLabelStudioWebhook(LABEL_STUDIO_1_22_WEBHOOKS.annotationsDeleted)
    expect(result).not.toHaveProperty('items')
    expect(result).not.toHaveProperty('taskIds')
  })

  it.each([
    null,
    { action: 'UNKNOWN', project: { id: 2 } },
    { action: 'PROJECT_CREATED', project: { id: 0 } },
    { action: 'TASKS_CREATED', tasks: [], project: { id: 2 } },
    { action: 'TASKS_CREATED', tasks: [{ id: 1, project: 3 }], project: { id: 2 } },
    { action: 'ANNOTATIONS_CREATED', annotation: [{ id: 1, task: 4 }], task: [{ id: 5, project: 2 }], project: { id: 2 } },
  ])('rejects malformed or inconsistent payload %#', (payload) => {
    expect(() => parseLabelStudioWebhook(payload)).toThrow('webhook payload')
  })
})
