/** Pure Label Studio tool-card projections. */
/**
 * Present a Label Studio status probe.
 * @returns generic read card for the status operation.
 */
export function presentStatusCall() {
    return { card: 'generic', title: 'Check Label Studio', kind: 'read' };
}
/**
 * Present a Label Studio project creation request.
 * @param args - project title supplied to the tool.
 * @returns generic execution card for project creation.
 */
export function presentCreateProjectCall(args) {
    return { card: 'generic', title: `Create Label Studio project: ${args.title}`, kind: 'execute' };
}
/**
 * Present a Label Studio task import request.
 * @param args - target project and unvalidated task payload.
 * @returns generic execution card containing the import count.
 */
export function presentImportTasksCall(args) {
    const count = Array.isArray(args.tasks) ? args.tasks.length : 0;
    const target = args.project_id === undefined ? 'selected Label Studio project' : `Label Studio project ${args.project_id}`;
    return { card: 'generic', title: `Import ${count} tasks into ${target}`, kind: 'execute' };
}
/**
 * Present a Label Studio prediction creation request.
 * @param args - target task id.
 * @returns generic execution card for prediction creation.
 */
export function presentCreatePredictionCall(args) {
    return {
        card: 'generic',
        title: args.task_id === undefined
            ? 'Create prediction for selected Label Studio task'
            : `Create prediction for Label Studio task ${args.task_id}`,
        kind: 'execute',
    };
}
/**
 * Present a Label Studio labeling-interface update without exposing its XML.
 * @param args - optional target project and omitted label configuration content.
 * @returns generic execution card with no filesystem locations.
 */
export function presentUpdateLabelConfigCall(args) {
    return {
        card: 'generic',
        title: args.project_id === undefined
            ? 'Update bound Label Studio project label config'
            : `Update Label Studio project ${args.project_id} label config`,
        kind: 'execute',
        locations: [],
    };
}
/**
 * Present a prediction request for the current Session's active Label Studio task.
 * @param _args - explicit result and optional model metadata supplied to the tool.
 * @returns generic execution card with no filesystem locations.
 */
export function presentCreateActivePredictionCall(_args) {
    return {
        card: 'generic',
        title: 'Create prediction for active Label Studio task',
        kind: 'execute',
        locations: [],
    };
}
/**
 * Present a request to navigate the current Session's Label Studio workbench.
 * @param args - project, task, and optional annotation identifiers supplied to the tool.
 * @returns generic execution card with no filesystem locations.
 */
export function presentFocusTaskCall(args) {
    return {
        card: 'generic',
        title: `Open Label Studio task ${args.task_id}`,
        kind: 'execute',
        locations: [],
    };
}
/**
 * Present a read of the current Session's committed Label Studio task.
 * @returns generic read card with no filesystem locations.
 */
export function presentActiveTaskCall() {
    return {
        card: 'generic',
        title: 'Read active Label Studio task',
        kind: 'read',
        locations: [],
    };
}
/**
 * Project non-sensitive identifiers from a complete active-task result.
 * @param value - validated project and task returned by the Host REST client.
 * @returns short identifiers and collection counts without task or result content.
 */
export function presentActiveTaskMeta(value) {
    return {
        projectId: value.project.id,
        taskId: value.task.id,
        annotationCount: value.task.annotations.length,
        predictionCount: value.task.predictions.length,
    };
}
//# sourceMappingURL=present.js.map