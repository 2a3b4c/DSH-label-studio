import { type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client';
/** Replacement-root panel preferences. */
export interface LabelStudioLayoutState {
    sidebar: number;
    details: number;
    workbench: number;
    narrow: boolean;
    narrowExpanded: boolean;
}
/** Replacement-root panel mutations. */
export type LabelStudioLayoutActions = {
    setSidebar: (draft: LabelStudioLayoutState, px: number) => void;
    setDetails: (draft: LabelStudioLayoutState, px: number) => void;
    setWorkbench: (draft: LabelStudioLayoutState, px: number) => void;
    toggleSidebar: (draft: LabelStudioLayoutState) => void;
    setNarrow: (draft: LabelStudioLayoutState, narrow: boolean) => void;
    openDetails: (draft: LabelStudioLayoutState) => void;
    closeDetails: (draft: LabelStudioLayoutState) => void;
    openWorkbench: (draft: LabelStudioLayoutState) => void;
    closeWorkbench: (draft: LabelStudioLayoutState) => void;
};
/**
 * Create page-local layout state for one replacement-root registration.
 * @returns an independent store handle for one replacement-root registration.
 */
export declare function createLabelStudioLayoutStore(): EngineStoreHandle<LabelStudioLayoutState, LabelStudioLayoutActions>;
//# sourceMappingURL=store.d.ts.map