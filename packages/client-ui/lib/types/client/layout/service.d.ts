import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots';
import type { createLabelStudioLayoutStore } from './store.ts';
/** Bound mutations for the replacement root. */
export type LabelStudioPanelActions = BoundActions<ReturnType<typeof createLabelStudioLayoutStore>>;
/** Compatible public layout face plus package-private workbench actions. */
export declare class LabelStudioLayoutController {
    #private;
    /**
     * Attach the bound actions owned by the mounted replacement root.
     * @param actions - bound actions owned by the current root registration.
     */
    attachPanels(actions: LabelStudioPanelActions): void;
    /** Toggle the original sidebar surface. */
    toggleSidebar(): void;
    /** Open the original details surface. */
    openDetails(): void;
    /** Close the original details surface. */
    closeDetails(): void;
    /** Open the package-private Label Studio track. */
    openWorkbench(): void;
    /** Close the package-private Label Studio track. */
    closeWorkbench(): void;
}
//# sourceMappingURL=service.d.ts.map