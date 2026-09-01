import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { LabelStudioContextSnapshot } from './context-state.ts';
import { NS } from './locales.ts';
import type { LabelStudioPanelSnapshot } from './panel-state.ts';
import type { LabelStudioTargetInput } from './task-url.ts';
/** Props supplied by the replacement root directly. */
export interface LabelStudioPanelProps {
    useLabelStudioPanel: <T>(selector: (snapshot: LabelStudioPanelSnapshot) => T) => T;
    useLabelStudioContext: <T>(selector: (snapshot: LabelStudioContextSnapshot) => T) => T;
    baseUrl: string;
    open: boolean;
    width: number;
    close: () => void;
    reload: () => void;
    openExternal: () => void;
    confirmApplied: (navigationRevision: number) => void;
    selectTarget: (input: LabelStudioTargetInput) => Promise<void>;
    t: TranslateNS<typeof NS>;
}
/** Render the iframe only after first open and retain it while hidden. */
export declare function LabelStudioPanel({ useLabelStudioPanel, useLabelStudioContext, baseUrl, open, width, close, reload, openExternal, confirmApplied, selectTarget, t, }: LabelStudioPanelProps): import("react").JSX.Element | null;
//# sourceMappingURL=LabelStudioPanel.d.ts.map