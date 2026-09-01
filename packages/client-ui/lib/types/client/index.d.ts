/** Browser assembly for the Label Studio replacement root. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { type LabelStudioPanelSnapshot } from './panel-state.ts';
import { type LabelStudioContextSnapshot } from './context-state.ts';
import { type LabelStudioTargetInput } from './task-url.ts';
import { type LabelStudioKey } from './locales.ts';
export { LabelStudioLayoutController } from './layout/service.ts';
export { isLabelStudioBridgeFailure, isLabelStudioPluginFailure, isLabelStudioTransportUnknown, LabelStudioContextBridge, } from './context-bridge.ts';
export type { LabelStudioBridgeFailure } from './context-bridge.ts';
export type { LabelStudioControlledPage, LabelStudioContextSnapshot, LabelStudioSyncStatus, } from './context-state.ts';
export { LabelStudioContextController } from './context-state.ts';
export { buildLabelStudioTaskUrl, parseLabelStudioTargetInput } from './task-url.ts';
export type { LabelStudioTargetInput } from './task-url.ts';
export type { LabelStudioPanelSnapshot } from './panel-state.ts';
export type { LabelStudioKey } from './locales.ts';
declare global {
    interface Window {
        /** Host-validated Label Studio browser endpoint. */
        __DSH_LABEL_STUDIO__?: {
            baseUrl: string;
            contextOpenRetryMs: number;
            contextCloseTimeoutMs: number;
            eventHistorySize: number;
        };
    }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Label Studio workbench copy. */
        labelStudio: LabelStudioKey;
    }
}
/** Injected facts for the Session-header toggle. */
export interface LabelStudioActionInjected {
    hooks: {
        labelStudioPanel: SnapshotStore<LabelStudioPanelSnapshot>;
    };
    toggle: () => void;
}
/** Injected facts consumed by the replacement root and its direct panel child. */
export interface LabelStudioRootInjected {
    hooks: {
        labelStudioPanel: SnapshotStore<LabelStudioPanelSnapshot>;
        labelStudioContext: SnapshotStore<LabelStudioContextSnapshot>;
    };
    baseUrl: string;
    bindSession: (sessionId: SessionId | undefined) => void;
    confirmApplied: (navigationRevision: number) => void;
    selectTarget: (input: LabelStudioTargetInput) => Promise<void>;
    close: () => void;
    reload: () => void;
    openExternal: () => void;
}
export declare const inject: string[];
/**
 * Provide the compatible layout, replace the root, and add one Session action.
 * @param ctx - browser root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map
