/** Parent-page half of the one-shot Label Studio iframe inspection protocol. */
import type { LabelStudioInspectPageEvent, LabelStudioInspectPageResponse, LabelStudioLeaseSnapshot } from '@deepseek-ai/dsh-label-studio-protocol';
type InspectionOutcome = LabelStudioInspectPageResponse['outcome'];
type InspectionStatus = 'ready' | 'unsupported' | 'unavailable';
/** Minimal RPC operation required by the iframe bridge. */
export interface LabelStudioInspectionRpc {
    commitInspection(lease: LabelStudioLeaseSnapshot, inspectionId: LabelStudioInspectPageEvent['inspectionId'], outcome: InspectionOutcome, signal?: AbortSignal): Promise<{
        readonly accepted: true;
    }>;
}
/** Validates iframe responses and submits exactly one matching Host receipt. */
export declare class LabelStudioCurrentPageBridge {
    private readonly rpc;
    private readonly frame;
    private readonly frameOrigin;
    private readonly protocol;
    private readonly capability;
    private readonly clock;
    private pending;
    private disposed;
    /**
     * @param rpc - typed Connection RPC caller.
     * @param frame - current iframe window supplier.
     * @param frameOrigin - exact isolated proxy origin.
     * @param protocol - fixed parent/iframe protocol.
     * @param capability - ephemeral proxy capability.
     * @param clock - epoch-millisecond clock for deterministic deadlines.
     */
    constructor(rpc: LabelStudioInspectionRpc, frame: () => WindowProxy | undefined, frameOrigin: string, protocol: LabelStudioInspectPageResponse['protocol'], capability: string, clock?: () => number);
    /**
     * Inspect the current iframe once and forward its exact structured outcome.
     * @param event - Host request from the Session event stream.
     * @param lease - current browser lease.
     * @param signal - current Session/Connection generation cancellation.
     * @returns final inspection status after the Host accepts the response.
     */
    inspect(event: LabelStudioInspectPageEvent, lease: LabelStudioLeaseSnapshot, signal: AbortSignal): Promise<InspectionStatus>;
    /** Cancel the current Session or Connection generation. */
    cancel(): void;
    /** Remove listeners and permanently reject later work. */
    dispose(): void;
    private readonly onMessage;
    private rejectPending;
    private takePending;
}
export {};
//# sourceMappingURL=current-page-bridge.d.ts.map