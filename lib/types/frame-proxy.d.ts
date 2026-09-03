/** Restricted loopback reverse proxy that injects the on-demand iframe bridge. */
import type { LabelStudioInspectionProtocol } from '@deepseek-ai/dsh-label-studio-protocol';
export { LABEL_STUDIO_FRAME_BRIDGE_PATH } from './frame-bridge-script.ts';
/** Construction fields for one isolated iframe proxy. */
export interface LabelStudioFrameProxyOptions {
    readonly upstreamBaseUrl: string;
    readonly inspectionProtocol: LabelStudioInspectionProtocol;
    readonly htmlMaxBytes: number;
}
/** Browser-visible fields created after the operating system assigns a port. */
export interface LabelStudioFrameProxyAddress {
    readonly baseUrl: string;
    readonly origin: string;
    readonly capability: string;
}
/** Owns a fixed-upstream HTTP proxy and all sockets created through it. */
export declare class LabelStudioFrameProxy {
    private readonly options;
    private readonly upstream;
    private readonly capability;
    private readonly sockets;
    private readonly upstreamRequests;
    private server;
    private address;
    private starting;
    private closePromise;
    private closing;
    /** @param options - fixed loopback upstream, protocol, and decoded HTML limit. */
    constructor(options: LabelStudioFrameProxyOptions);
    /** Start once on an operating-system-assigned loopback port. */
    start(): Promise<LabelStudioFrameProxyAddress>;
    /** Stop accepting work and wait until owned requests and sockets are closed. */
    close(): Promise<void>;
    private stop;
    private handle;
    private upstreamHeaders;
    private forward;
    private forwardResponse;
}
//# sourceMappingURL=frame-proxy.d.ts.map