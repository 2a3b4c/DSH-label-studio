import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { NS } from './locales.ts';
import type { LabelStudioPanelSnapshot } from './panel-state.ts';
/** Header-action props after slot injection. */
export interface LabelStudioActionProps {
    useLabelStudioPanel: <T>(selector: (snapshot: LabelStudioPanelSnapshot) => T) => T;
    toggle: () => void;
    t: TranslateNS<typeof NS>;
    hooks?: {
        labelStudioPanel: SnapshotStore<LabelStudioPanelSnapshot>;
    };
}
/** Render the Session-header workbench toggle. */
export declare function LabelStudioAction({ useLabelStudioPanel, toggle, t }: LabelStudioActionProps): import("react").JSX.Element;
//# sourceMappingURL=LabelStudioAction.d.ts.map