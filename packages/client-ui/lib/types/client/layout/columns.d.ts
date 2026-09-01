/** Resolved widths for the Label Studio replacement root. */
export interface LabelStudioColumns {
    sidebar: number;
    conversation: number;
    details: number;
    workbench: number;
}
/** Minimum width that preserves the conversation surface. */
export declare const CONVERSATION_MIN = 640;
/** Minimum user-resizable sidebar width. */
export declare const SIDEBAR_MIN = 264;
/** Maximum user-resizable sidebar width. */
export declare const SIDEBAR_MAX = 420;
/** Initial expanded sidebar width. */
export declare const SIDEBAR_DEFAULT = 280;
/** Width of the collapsed sidebar rail. */
export declare const SIDEBAR_COLLAPSED = 56;
/** Viewport width that activates narrow sidebar behavior. */
export declare const SIDEBAR_AUTO_COLLAPSE = 1024;
/** Minimum visible details width. */
export declare const DETAILS_MIN = 300;
/** Maximum user-resizable details width. */
export declare const DETAILS_MAX = 520;
/** Width restored when details opens. */
export declare const DETAILS_DEFAULT = 360;
/** Minimum user-resizable Label Studio workbench width. */
export declare const WORKBENCH_MIN = 480;
/** Maximum user-resizable Label Studio workbench width. */
export declare const WORKBENCH_MAX = 1200;
/** Width restored when the Label Studio workbench opens. */
export declare const WORKBENCH_DEFAULT = 720;
/**
 * Clamp and round a panel width.
 * @param px - requested width in CSS pixels.
 * @param min - inclusive lower limit.
 * @param max - inclusive upper limit.
 * @returns the rounded width inside the requested range.
 */
export declare function clampWidth(px: number, min: number, max: number): number;
/**
 * Resolve the four replacement-root tracks without mutating preferences.
 * @param viewport - available root width.
 * @param sidebar - sidebar preference, where zero means the compact rail.
 * @param details - details preference, where zero means closed.
 * @param workbench - workbench preference, where zero means closed.
 * @returns rendered widths after the details-then-workbench concession chain.
 */
export declare function computeLabelStudioColumns(viewport: number, sidebar: number, details: number, workbench: number): LabelStudioColumns;
//# sourceMappingURL=columns.d.ts.map