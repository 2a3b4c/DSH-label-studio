/** Body attribute used by existing Harness dark-theme selectors. */
export const DARK_ATTRIBUTE = 'data-ds-dark-theme';
/** Applies resolved theme facts and retracts only writes owned by this instance. */
export class LabelStudioThemePresenter {
    appliedTokens = [];
    themeColorMeta;
    constructor() {
        this.themeColorMeta = document.createElement('meta');
        this.themeColorMeta.name = 'theme-color';
    }
    /**
     * Project the resolved theme onto the document.
     * @param snapshot - resolved active theme.
     */
    apply(snapshot) {
        const scheme = snapshot.active.colorScheme;
        document.documentElement.style.colorScheme = scheme;
        if (scheme === 'dark')
            document.body.setAttribute(DARK_ATTRIBUTE, '');
        else
            document.body.removeAttribute(DARK_ATTRIBUTE);
        for (const name of this.appliedTokens)
            document.body.style.removeProperty(name);
        this.appliedTokens = [];
        for (const [name, value] of Object.entries(snapshot.active.tokens)) {
            document.body.style.setProperty(name, value);
            this.appliedTokens.push(name);
        }
        this.themeColorMeta.content = getComputedStyle(document.body).backgroundColor;
        if (!this.themeColorMeta.isConnected)
            document.head.append(this.themeColorMeta);
    }
    /** Retract this presenter's scheme, token, attribute, and metadata writes. */
    dispose() {
        document.documentElement.style.removeProperty('color-scheme');
        document.body.removeAttribute(DARK_ATTRIBUTE);
        for (const name of this.appliedTokens)
            document.body.style.removeProperty(name);
        this.appliedTokens = [];
        this.themeColorMeta.remove();
    }
}
//# sourceMappingURL=theme-presenter.js.map