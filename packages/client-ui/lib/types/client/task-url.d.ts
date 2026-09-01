/** Controlled-task URL construction and browser input parsing. */
import type { LabelStudioActiveTarget } from 'dsh-label-studio-workbench/protocol';
/** Untrusted strings entered in the workbench target controls. */
export interface LabelStudioTargetInput {
    readonly projectId: string;
    readonly taskId: string;
    readonly annotationId?: string;
}
/**
 * Parse the workbench target controls into branded protocol identifiers.
 * @param input - untrusted browser input strings.
 * @returns validated controlled target.
 */
export declare function parseLabelStudioTargetInput(input: LabelStudioTargetInput): LabelStudioActiveTarget;
/**
 * Build the Label Studio 1.22 controlled-task route verified by Task 3.
 * @param baseUrl - Host-validated Label Studio endpoint.
 * @param target - validated project, task, and optional annotation ids.
 * @returns same-origin project data URL selecting the task.
 */
export declare function buildLabelStudioTaskUrl(baseUrl: string, target: Pick<LabelStudioActiveTarget, 'projectId' | 'taskId' | 'annotationId'>): string;
//# sourceMappingURL=task-url.d.ts.map