import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client';
/** Body attribute used by existing Harness dark-theme selectors. */
export declare const DARK_ATTRIBUTE = "data-ds-dark-theme";
/** Applies resolved theme facts and retracts only writes owned by this instance. */
export declare class LabelStudioThemePresenter {
    private appliedTokens;
    private readonly themeColorMeta;
    constructor();
    /**
     * Project the resolved theme onto the document.
     * @param snapshot - resolved active theme.
     */
    apply(snapshot: ThemeSnapshot): void;
    /** Retract this presenter's scheme, token, attribute, and metadata writes. */
    dispose(): void;
}
//# sourceMappingURL=theme-presenter.d.ts.map