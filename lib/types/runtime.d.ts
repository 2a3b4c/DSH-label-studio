/** Managed local Label Studio process and readiness probe. */
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import type { ResolvedConfig } from './config.ts';
/** Health facts safe to expose through the model tool. */
export interface LabelStudioStatus {
    available: boolean;
    baseUrl: string;
    managed: boolean;
}
type Fetch = typeof globalThis.fetch;
/** Owns at most one Label Studio process started by this plugin instance. */
export declare class LabelStudioRuntime {
    private readonly subprocess;
    readonly config: ResolvedConfig;
    private readonly fetcher;
    private handle;
    /**
     * @param subprocess - execution-world process provider.
     * @param config - resolved launcher and endpoint facts.
     * @param fetcher - HTTP implementation, injectable for deterministic tests.
     */
    constructor(subprocess: SubprocessRuntime, config: ResolvedConfig, fetcher?: Fetch);
    /** Probe, optionally spawn, and wait until Label Studio is ready. */
    start(): Promise<void>;
    /**
     * Read the unauthenticated Label Studio health endpoint.
     * @param signal - optional caller cancellation.
     * @returns current availability and process ownership.
     */
    status(signal?: AbortSignal): Promise<LabelStudioStatus>;
    /** Terminate and join only the process this instance started. */
    dispose(): Promise<void>;
    private stopOwnedProcess;
    private resolveLaunchArgv;
    private snapshot;
    private waitForNextProbe;
    private diagnostics;
}
export {};
//# sourceMappingURL=runtime.d.ts.map