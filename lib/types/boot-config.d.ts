/** Host-injected browser endpoint for the Label Studio iframe. */
/** Browser-visible non-secret synchronization configuration. */
export interface LabelStudioBootConfig {
    readonly baseUrl: string;
    readonly frameBaseUrl: string;
    readonly frameCapability: string;
    readonly inspectionProtocol: 'dsh-label-studio-page/v1';
    readonly currentPageTimeoutMs: number;
    readonly contextOpenRetryMs: number;
    readonly contextCloseTimeoutMs: number;
    readonly eventHistorySize: number;
    readonly webhookStatus?: 'disabled' | 'ready' | 'unavailable';
}
/**
 * Insert the browser endpoint before the application module starts.
 * @param html - raw application index HTML.
 * @param config - validated browser synchronization fields.
 * @returns HTML containing the boot assignment.
 */
export declare function injectLabelStudioBootConfig(html: string, config: LabelStudioBootConfig): string;
//# sourceMappingURL=boot-config.d.ts.map