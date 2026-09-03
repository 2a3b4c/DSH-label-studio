/** Reduced fixtures captured from Label Studio 1.22.0 webhook serializers. */
export const LABEL_STUDIO_1_22_WEBHOOKS = {
  tasksCreated: {
    action: 'TASKS_CREATED',
    tasks: [{ id: 21, project: 2, data: { text: 'not retained' } }],
    project: { id: 2, title: 'Images' },
  },
  tasksDeleted: {
    action: 'TASKS_DELETED',
    tasks: [{ id: 18 }, { id: 19 }],
    project: { id: 2, title: 'Images' },
  },
  annotationCreated: {
    action: 'ANNOTATION_CREATED',
    annotation: { id: 17, task: 21, result: [{ value: { choices: ['ship'] } }] },
    task: { id: 21, project: 2 },
    project: { id: 2 },
  },
  annotationsCreated: {
    action: 'ANNOTATIONS_CREATED',
    annotation: [{ id: 30, task: 21 }, { id: 31, task: 22 }],
    task: [{ id: 21, project: 2 }, { id: 22, project: 2 }],
    project: { id: 2 },
  },
  annotationUpdated: {
    action: 'ANNOTATION_UPDATED',
    annotation: { id: 17, task: 21, result: [] },
    task: { id: 21, project: 2 },
    project: { id: 2 },
  },
  annotationsDeleted: {
    action: 'ANNOTATIONS_DELETED',
    annotations: [{ id: 17 }, { id: 18 }],
    project: { id: 2 },
  },
  projectCreated: { action: 'PROJECT_CREATED', project: { id: 2, title: 'Images' } },
  projectUpdated: { action: 'PROJECT_UPDATED', project: { id: 2, title: 'Renamed' } },
  projectDeleted: { action: 'PROJECT_DELETED', project: { id: 2 } },
} as const
