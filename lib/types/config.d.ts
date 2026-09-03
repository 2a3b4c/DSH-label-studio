/** Label Studio plugin configuration and explicit default resolution. */
import z from '@deepseek-ai/schemastery';
import { type CredentialRef } from '@deepseek-ai/dsh-credentials';
export { DEFAULT_LABEL_STUDIO_BASE_URL } from './shared.ts';
/** Supported ownership policy for an unavailable Label Studio endpoint. */
export type LabelStudioLaunchMode = 'python' | 'external';
/** Default launcher used by the installable Bundle and repository example. */
export declare const DEFAULT_LABEL_STUDIO_LAUNCH_MODE: LabelStudioLaunchMode;
/** Default global Python command resolved by the subprocess provider. */
export declare const DEFAULT_PYTHON_EXECUTABLE = "python";
/** Default PAT refresh-token credential reference for authenticated REST operations. */
export declare const DEFAULT_REFRESH_TOKEN_CREDENTIAL = "LABEL_STUDIO_PAT";
/** Default maximum decoded byte length of one Label Studio REST response. */
export declare const DEFAULT_REST_RESPONSE_MAX_BYTES = 8388608;
/** Default maximum serialized ContentBlock bytes returned by the active-task tool. */
export declare const DEFAULT_ACTIVE_TASK_MAX_BYTES = 262144;
/** Default deadline for a browser to apply and acknowledge one focus request. */
export declare const DEFAULT_FOCUS_ACK_TIMEOUT_MS = 5000;
/** Default readiness deadline for a cold Label Studio database migration. */
export declare const DEFAULT_STARTUP_TIMEOUT_MS = 120000;
/** Default TERM-to-KILL grace for the managed Label Studio process tree. */
export declare const DEFAULT_SHUTDOWN_GRACE_MS = 5000;
/** Default lifetime renewed by successful browser event waits. */
export declare const DEFAULT_CONTEXT_LEASE_TTL_MS = 30000;
/** Default maximum duration of one browser event long poll. */
export declare const DEFAULT_EVENT_WAIT_TIMEOUT_MS = 25000;
/** Default retained browser event count per DSH Session. */
export declare const DEFAULT_EVENT_HISTORY_SIZE = 64;
/** Default interval before retrying an open whose dispatch result is unknown. */
export declare const DEFAULT_CONTEXT_OPEN_RETRY_MS = 1000;
/** Default abort deadline for best-effort browser lease closure. */
export declare const DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS = 1000;
/** Default number of recently visited projects retained for each Session. */
export declare const DEFAULT_RECENT_PROJECT_LIMIT = 10;
/** User-configurable Label Studio plugin fields. */
export interface Config {
    /** Loopback HTTP(S) endpoint rendered in the browser and used by REST tools. */
    baseUrl?: string;
    /** Launcher used when the endpoint is unavailable; external mode never spawns. */
    launchMode?: LabelStudioLaunchMode;
    /** Bare or absolute Python executable whose environment contains Label Studio. */
    pythonExecutable?: string;
    /** PAT refresh-token credential reference resolved for every authenticated REST operation. */
    refreshTokenCredential?: string;
    /** Positive readiness deadline after spawning Label Studio. */
    startupTimeoutMs?: number;
    /** Positive process-tree termination grace. */
    shutdownGraceMs?: number;
    /** Positive safe-integer limit applied to every decoded REST response body. */
    restResponseMaxBytes?: number;
    /** Positive safe-integer limit applied to the active-task model ContentBlock array. */
    activeTaskMaxBytes?: number;
    /** Positive safe-integer deadline for browser focus acknowledgement. */
    focusAckTimeoutMs?: number;
    /** Positive browser context lease lifetime. */
    contextLeaseTtlMs?: number;
    /** Positive long-poll timeout shorter than the lease lifetime. */
    eventWaitTimeoutMs?: number;
    /** Positive bounded event history length per Session. */
    eventHistorySize?: number;
    /** Positive safe-integer delay before retrying an uncertain lease open. */
    contextOpenRetryMs?: number;
    /** Positive safe-integer limit for best-effort browser lease closure. */
    contextCloseTimeoutMs?: number;
    /** Maximum recently visited Label Studio projects retained for each Session. */
    recentProjectLimit?: number;
}
/** Schemastery projection used by Cordis loaders and configuration UIs. */
export declare const Config: z<Config>;
/** Fully validated facts captured by one plugin instance. */
export interface ResolvedConfig {
    baseUrl: string;
    launchMode: LabelStudioLaunchMode;
    pythonExecutable: string;
    refreshTokenCredential: CredentialRef;
    startupTimeoutMs: number;
    shutdownGraceMs: number;
    restResponseMaxBytes: number;
    activeTaskMaxBytes: number;
    focusAckTimeoutMs: number;
    contextLeaseTtlMs: number;
    eventWaitTimeoutMs: number;
    eventHistorySize: number;
    contextOpenRetryMs: number;
    contextCloseTimeoutMs: number;
    recentProjectLimit: number;
}
/**
 * Resolve every launcher and API default at the package boundary.
 * @param config - raw Cordis plugin configuration.
 * @returns validated immutable runtime facts.
 */
export declare function resolveConfig(config: Config): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map