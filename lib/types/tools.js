/** Model-facing Label Studio status, project, task-import, and prediction tools. */
import { randomUUID } from 'node:crypto';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { LabelStudioHttpError, validateSelectedTask } from "./api.js";
import { labelStudioAnnotationId, labelStudioFocusCorrelationId, labelStudioProjectId, labelStudioTaskId, } from "./context-types.js";
import { presentActiveTaskCall, presentActiveTaskMeta, presentCreateActivePredictionCall, presentCreatePredictionCall, presentCreateProjectCall, presentFocusTaskCall, presentImportTasksCall, presentStatusCall, } from "./present.js";
/**
 * Register all Label Studio model tools for one runtime and REST client.
 * @param ctx - Host context carrying the model tool registry.
 * @param runtime - local service status provider.
 * @param api - authenticated Label Studio REST client.
 * @param contexts - Session context registry reserved for context-aware tools.
 * @param changes - browser event broker reserved for mutation notifications.
 * @param operations - shared package cancellation and quiescence gate.
 * @param policy - model-output byte limit and browser focus deadline owned by the Host configuration.
 * @returns disposer unregistering every tool in reverse order.
 */
export function registerLabelStudioTools(ctx, runtime, api, contexts, changes, operations, policy) {
    const disposers = [];
    disposers.push(ctx.tools.register(defineTool({
        name: 'label_studio_status',
        description: 'Check whether the configured local Label Studio service is reachable and whether this DSH plugin started it. '
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
        execute: (_args, exec) => operations.run(exec.signal, signal => runtime.status(signal)),
        presentCall: presentStatusCall,
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'label_studio_create_project',
        description: 'Create a Label Studio project through the authenticated REST API. Supply Label Studio XML in label_config '
            + 'when the project must be immediately ready for annotation. Returns the project id and browser URL.',
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
                },
            },
            render: (_args, value) => [{
                    type: 'text', text: `Created Label Studio project ${value.id} (${value.title}): ${value.webUrl}`,
                }],
        },
        async execute(args, exec) {
            return operations.run(exec.signal, async (signal) => {
                await requireAvailable(runtime, signal);
                const project = await api.createProject({
                    title: args.title,
                    ...args.label_config === undefined ? {} : { labelConfig: args.label_config },
                    ...args.description === undefined ? {} : { description: args.description },
                }, signal);
                return {
                    ...project,
                    webUrl: `${runtime.config.baseUrl}/projects/${project.id}/data`,
                };
            });
        },
        presentCall: presentCreateProjectCall,
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'label_studio_import_tasks',
        description: 'Import JSON tasks into an existing Label Studio project. Each task must contain a data object whose keys '
            + 'match the project label configuration. Returns the accepted task ids when Label Studio supplies them.',
        parameters: {
            project_id: { type: 'number', required: true, description: 'Target Label Studio project id.' },
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
                },
            },
            render: (_args, value) => [{
                    type: 'text', text: `Imported ${value.taskCount} tasks into Label Studio project ${value.projectId}.`,
                }],
        },
        async execute(args, exec) {
            return operations.run(exec.signal, async (signal) => {
                const tasks = parseTasks(args.tasks);
                await requireAvailable(runtime, signal);
                const imported = await api.importTasks(args.project_id, tasks, signal);
                return { projectId: args.project_id, ...imported };
            });
        },
        presentCall: presentImportTasksCall,
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'label_studio_create_prediction',
        description: 'Create a pre-annotation prediction for one existing Label Studio task. result must use the project labeling '
            + 'configuration names and Label Studio prediction result format. This never updates a saved annotation. '
            + 'Returns the prediction and task ids.',
        parameters: {
            task_id: { type: 'number', required: true, description: 'Existing Label Studio task id.' },
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
                },
            },
            render: (_args, value) => [{
                    type: 'text', text: `Created Label Studio prediction ${value.id} for task ${value.taskId}.`,
                }],
        },
        async execute(args, exec) {
            return operations.run(exec.signal, async (signal) => {
                const result = parseArray(args.result, 'result');
                await requireAvailable(runtime, signal);
                return api.createPrediction({
                    taskId: args.task_id,
                    result,
                    ...args.model_version === undefined ? {} : { modelVersion: args.model_version },
                    ...args.score === undefined ? {} : { score: args.score },
                }, signal);
            });
        },
        presentCall: presentCreatePredictionCall,
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'label_studio_create_active_prediction',
        description: 'Create a pre-annotation prediction for the current Label Studio workbench task. Supply result explicitly '
            + 'using the project label configuration; do not infer it from saved annotations. The tool validates the '
            + 'task association, rejects a target changed before dispatch, and marks the active page for refresh after '
            + 'Label Studio confirms creation. It never updates a saved annotation.',
        parameters: {
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
                },
            },
            render: (_args, value) => [{
                    type: 'text',
                    text: `Created Label Studio prediction ${value.id} for active task ${value.taskId} in project ${value.projectId}.`,
                }],
        },
        async execute(args, exec) {
            return operations.run(exec.signal, async (signal) => {
                if (exec.agent === undefined) {
                    throw new Error('label-studio: active prediction creation requires a DSH Session');
                }
                const active = contexts.getLive(exec.agent.id);
                if (active === undefined) {
                    throw new Error('label-studio: this Session has no live active task');
                }
                const result = parseArray(args.result, 'result');
                const task = await api.getTask(active.target.taskId, signal);
                if (task.id !== active.target.taskId || task.projectId !== active.target.projectId) {
                    throw new Error('label-studio: active task project association does not match Label Studio');
                }
                const current = contexts.getLive(exec.agent.id);
                if (current === undefined
                    || current.leaseId !== active.leaseId
                    || current.generation !== active.generation
                    || current.targetRevision !== active.targetRevision) {
                    throw new Error('label-studio: active task changed before prediction dispatch');
                }
                const prediction = await api.createPrediction({
                    taskId: active.target.taskId,
                    result,
                    ...args.model_version === undefined ? {} : { modelVersion: args.model_version },
                    ...args.score === undefined ? {} : { score: args.score },
                }, signal);
                if (prediction.taskId !== active.target.taskId) {
                    throw new Error('label-studio: created prediction task does not match the active task');
                }
                const event = changes.publishTaskChanged(exec.agent.id, active.target.taskId, 'prediction-created');
                return {
                    id: prediction.id,
                    projectId: active.target.projectId,
                    taskId: prediction.taskId,
                    ...prediction.modelVersion === undefined ? {} : { modelVersion: prediction.modelVersion },
                    eventRevision: event.eventRevision,
                };
            });
        },
        presentCall: presentCreateActivePredictionCall,
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'label_studio_focus_task',
        description: 'Navigate the Label Studio workbench for this DSH Session to a project task and optional saved annotation. '
            + 'Returns only after the browser applies the task URL; the embedded page may still be loading.',
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
                },
            },
            render: (_args, value) => [{
                    type: 'text',
                    text: `Label Studio workbench applied the URL for task ${value.taskId} in project ${value.projectId}; page loading was not checked.`,
                }],
        },
        async execute(args, exec) {
            return operations.run(exec.signal, async (signal) => {
                if (exec.agent === undefined) {
                    throw new Error('label-studio: task focus requires a DSH Session');
                }
                const binding = contexts.getLease(exec.agent.id);
                if (binding === undefined) {
                    throw new Error('label-studio: this Session has no live Label Studio browser lease');
                }
                const target = {
                    projectId: labelStudioProjectId(args.project_id),
                    taskId: labelStudioTaskId(args.task_id),
                    ...args.annotation_id === undefined
                        ? {}
                        : { annotationId: labelStudioAnnotationId(args.annotation_id) },
                };
                const correlationId = labelStudioFocusCorrelationId(randomUUID());
                const reservation = contexts.reserveFocusTarget(binding.lease.leaseId, binding.lease.generation, correlationId);
                const committed = await changes.requestFocus({ sessionId: exec.agent.id, createdAt: exec.agent.session.header.createdAt }, correlationId, reservation, target, policy.focusAckTimeoutMs, signal);
                return {
                    projectId: committed.target.projectId,
                    taskId: committed.target.taskId,
                    ...committed.target.annotationId === undefined
                        ? {}
                        : { annotationId: committed.target.annotationId },
                    targetRevision: committed.targetRevision,
                };
            });
        },
        presentCall: presentFocusTaskCall,
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'label_studio_get_active_task',
        description: 'Read the project labeling configuration, task data, saved annotations, and predictions for the current '
            + 'DSH Session active in the Label Studio workbench. Takes no task id because the live browser lease owns it.',
        parameters: {},
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
                },
            },
            render: (_args, value) => activeTaskBlocks(value, policy.activeTaskMaxBytes),
            presentationMeta: (_args, value) => presentActiveTaskMeta(value),
        },
        async execute(_args, exec) {
            return operations.run(exec.signal, async (signal) => {
                if (exec.agent === undefined) {
                    throw new Error('label-studio: active-task reads require a DSH Session');
                }
                const active = contexts.getLive(exec.agent.id);
                if (active === undefined) {
                    throw new Error('label-studio: this Session has no live active task');
                }
                let project;
                try {
                    project = await api.getProject(active.target.projectId, signal);
                }
                catch (error) {
                    if (isMissingProjectResponse(error, active.target.projectId)) {
                        await changes.markProjectDeleted({ sessionId: exec.agent.id, createdAt: exec.agent.session.header.createdAt }, active.target.projectId);
                    }
                    throw error;
                }
                const task = await api.getTask(active.target.taskId, signal);
                return validateSelectedTask(active.target, project, task);
            });
        },
        presentCall: presentActiveTaskCall,
    })));
    return () => {
        for (const dispose of disposers.reverse())
            dispose();
    };
}
function activeTaskBlocks(value, maxBytes) {
    const blocks = [{ type: 'text', text: JSON.stringify(value, null, 2) }];
    const bytes = new TextEncoder().encode(JSON.stringify(blocks)).byteLength;
    if (bytes > maxBytes) {
        throw new Error(`label-studio: active task result exceeds activeTaskMaxBytes (${bytes} > ${maxBytes})`);
    }
    return blocks;
}
async function requireAvailable(runtime, signal) {
    const status = await runtime.status(signal);
    if (!status.available)
        throw new Error(`label-studio: service is unavailable at ${status.baseUrl}`);
}
function parseTasks(value) {
    const values = parseArray(value, 'tasks');
    return values.map((task, index) => {
        if (!isRecord(task) || !isRecord(task.data)) {
            throw new Error(`label-studio: tasks[${index}] must be an object with a data object`);
        }
        const predictions = task.predictions;
        if (predictions !== undefined && !Array.isArray(predictions)) {
            throw new Error(`label-studio: tasks[${index}].predictions must be an array when present`);
        }
        return {
            data: task.data,
            ...predictions === undefined ? {} : { predictions },
        };
    });
}
function parseArray(value, field) {
    if (!Array.isArray(value))
        throw new Error(`label-studio: ${field} must be a JSON array`);
    return value;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isMissingProjectResponse(error, projectId) {
    return (error instanceof LabelStudioHttpError || isRecord(error))
        && error.name === 'LabelStudioHttpError'
        && error.method === 'GET'
        && error.path === `/api/projects/${projectId}/`
        && error.status === 404;
}
//# sourceMappingURL=tools.js.map