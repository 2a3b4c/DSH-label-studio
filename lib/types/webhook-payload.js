/** Finite Label Studio Webhook payload reduction. */
import { labelStudioAnnotationId, labelStudioProjectId, labelStudioTaskId } from "./context-types.js";
/** Every known single and batch action understood by the finite parser. */
export const LABEL_STUDIO_WEBHOOK_ACTIONS = [
    'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_DELETED',
    'TASK_CREATED', 'TASKS_CREATED', 'TASK_DELETED', 'TASKS_DELETED',
    'ANNOTATION_CREATED', 'ANNOTATIONS_CREATED', 'ANNOTATION_UPDATED',
    'ANNOTATION_DELETED', 'ANNOTATIONS_DELETED',
];
/**
 * Reduce an untrusted Label Studio Webhook JSON value to action and resource ids.
 * @param input - parsed JSON request body.
 * @returns one validated identifier-only event.
 */
export function parseLabelStudioWebhook(input) {
    const body = record(input);
    const action = body.action;
    if (typeof action !== 'string' || !LABEL_STUDIO_WEBHOOK_ACTIONS.includes(action))
        fail();
    const knownAction = action;
    const projectId = id(record(body.project).id, labelStudioProjectId);
    switch (knownAction) {
        case 'PROJECT_CREATED':
        case 'PROJECT_UPDATED':
        case 'PROJECT_DELETED':
            return { action: knownAction, projectId };
        case 'TASK_CREATED':
        case 'TASK_DELETED': {
            const task = record(body.task);
            assertProject(task.project, projectId, action === 'TASK_CREATED');
            return { action: knownAction, projectId, taskIds: [id(task.id, labelStudioTaskId)] };
        }
        case 'TASKS_CREATED':
        case 'TASKS_DELETED': {
            const tasks = nonEmptyRecords(body.tasks);
            const requireProject = action === 'TASKS_CREATED';
            for (const task of tasks)
                assertProject(task.project, projectId, requireProject);
            return { action: knownAction, projectId, taskIds: mapNonEmpty(tasks, task => id(task.id, labelStudioTaskId)) };
        }
        case 'ANNOTATION_CREATED':
        case 'ANNOTATION_UPDATED': {
            const annotation = record(body.annotation);
            const task = record(body.task);
            const taskId = id(annotation.task, labelStudioTaskId);
            if (id(task.id, labelStudioTaskId) !== taskId)
                fail();
            assertProject(task.project, projectId, true);
            return { action: knownAction, projectId, items: [{ taskId, annotationId: id(annotation.id, labelStudioAnnotationId) }] };
        }
        case 'ANNOTATIONS_CREATED': {
            const annotations = nonEmptyRecords(body.annotation);
            const tasks = nonEmptyRecords(body.task);
            if (annotations.length !== tasks.length)
                fail();
            const items = mapNonEmpty(annotations, (annotation, index) => {
                const task = tasks[index];
                const taskId = id(annotation.task, labelStudioTaskId);
                if (id(task.id, labelStudioTaskId) !== taskId)
                    fail();
                assertProject(task.project, projectId, true);
                return { taskId, annotationId: id(annotation.id, labelStudioAnnotationId) };
            });
            return { action: knownAction, projectId, items };
        }
        case 'ANNOTATION_DELETED': {
            const annotation = record(body.annotation);
            return { action: knownAction, projectId, annotationIds: [id(annotation.id, labelStudioAnnotationId)] };
        }
        case 'ANNOTATIONS_DELETED': {
            const annotations = nonEmptyRecords(body.annotations);
            return {
                action: knownAction,
                projectId,
                annotationIds: mapNonEmpty(annotations, annotation => id(annotation.id, labelStudioAnnotationId)),
            };
        }
        default:
            return assertNever(knownAction);
    }
}
function record(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        fail();
    return value;
}
function nonEmptyRecords(value) {
    if (!Array.isArray(value) || value.length === 0)
        fail();
    return [record(value[0]), ...value.slice(1).map(record)];
}
function mapNonEmpty(values, transform) {
    return [transform(values[0], 0), ...values.slice(1).map((value, index) => transform(value, index + 1))];
}
function id(value, brand) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
        fail();
    return brand(value);
}
function assertProject(value, projectId, required) {
    if (value === undefined && !required)
        return;
    if (id(value, labelStudioProjectId) !== projectId)
        fail();
}
function fail() {
    throw new Error('label-studio: invalid webhook payload');
}
function assertNever(value) {
    throw new Error(`label-studio: invalid webhook payload action ${String(value)}`);
}
//# sourceMappingURL=webhook-payload.js.map