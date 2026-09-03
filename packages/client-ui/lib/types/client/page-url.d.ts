/** Structured Label Studio page URL construction and browser input parsing. */
import type { LabelStudioActiveTarget, LabelStudioPageContext } from '@deepseek-ai/dsh-label-studio-protocol';
/** Untrusted strings entered in the workbench task controls. */
export interface LabelStudioTargetInput {
    readonly projectId: string;
    readonly taskId: string;
    readonly annotationId?: string;
}
/**
 * Parse task controls into a structured task page.
 * @param input - untrusted browser input strings.
 * @returns validated task page.
 */
export declare function parseLabelStudioTargetInput(input: LabelStudioTargetInput): Extract<LabelStudioPageContext, {
    view: 'task';
}>;
/**
 * Build one same-origin Label Studio page URL from validated structured ids.
 * @param baseUrl - Host-validated Label Studio origin.
 * @param page - controlled projects, project, or task page.
 * @returns absolute same-origin URL.
 */
export declare function buildLabelStudioPageUrl(baseUrl: string, page: LabelStudioPageContext): string;
/**
 * Convert a task page to the active-target fields used by the Host lease registry.
 * @param page - validated task page.
 * @returns active target without its page discriminant.
 */
export declare function targetOfPage(page: Extract<LabelStudioPageContext, {
    view: 'task';
}>): LabelStudioActiveTarget;
//# sourceMappingURL=page-url.d.ts.map