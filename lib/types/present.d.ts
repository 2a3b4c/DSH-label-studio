/** Pure Label Studio tool-card projections. */
import type { ToolCallView } from '@deepseek-ai/dsh-tools';
import type { LabelStudioSelectedTaskView } from './api.ts';
/**
 * Present a Label Studio status probe.
 * @returns generic read card for the status operation.
 */
export declare function presentStatusCall(): ToolCallView;
/**
 * Present a Label Studio project creation request.
 * @param args - project title supplied to the tool.
 * @returns generic execution card for project creation.
 */
export declare function presentCreateProjectCall(args: {
    title: string;
}): ToolCallView;
/**
 * Present a Label Studio task import request.
 * @param args - target project and unvalidated task payload.
 * @returns generic execution card containing the import count.
 */
export declare function presentImportTasksCall(args: {
    project_id?: number;
    current_page?: boolean;
    tasks: unknown;
}): ToolCallView;
/**
 * Present a Label Studio prediction creation request.
 * @param args - target task id.
 * @returns generic execution card for prediction creation.
 */
export declare function presentCreatePredictionCall(args: {
    task_id?: number;
}): ToolCallView;
/**
 * Present a Label Studio labeling-interface update without exposing its XML.
 * @param args - optional target project and omitted label configuration content.
 * @returns generic execution card with no filesystem locations.
 */
export declare function presentUpdateLabelConfigCall(args: {
    project_id?: number;
    label_config: string;
}): ToolCallView;
/**
 * Present a prediction request for the current Session's active Label Studio task.
 * @param _args - explicit result and optional model metadata supplied to the tool.
 * @returns generic execution card with no filesystem locations.
 */
export declare function presentCreateActivePredictionCall(_args: {
    result: unknown;
    current_page?: boolean;
    model_version?: string;
    score?: number;
}): ToolCallView;
/**
 * Present a request to navigate the current Session's Label Studio workbench.
 * @param args - project, task, and optional annotation identifiers supplied to the tool.
 * @returns generic execution card with no filesystem locations.
 */
export declare function presentFocusTaskCall(args: {
    project_id: number;
    task_id: number;
    annotation_id?: number;
}): ToolCallView;
/**
 * Present a read of the current Session's committed Label Studio task.
 * @returns generic read card with no filesystem locations.
 */
export declare function presentActiveTaskCall(): ToolCallView;
/** Short UI metadata for a complete active-task model result. */
export interface ActiveTaskPresentationMeta {
    [key: string]: number;
    projectId: number;
    taskId: number;
    annotationCount: number;
    predictionCount: number;
}
/**
 * Project non-sensitive identifiers from a complete active-task result.
 * @param value - validated project and task returned by the Host REST client.
 * @returns short identifiers and collection counts without task or result content.
 */
export declare function presentActiveTaskMeta(value: LabelStudioSelectedTaskView): ActiveTaskPresentationMeta;
//# sourceMappingURL=present.d.ts.map