/** Compatible public layout face plus package-private workbench actions. */
export class LabelStudioLayoutController {
    #panels;
    /**
     * Attach the bound actions owned by the mounted replacement root.
     * @param actions - bound actions owned by the current root registration.
     */
    attachPanels(actions) { this.#panels = actions; }
    /** Toggle the original sidebar surface. */
    toggleSidebar() { this.#require().toggleSidebar(); }
    /** Open the original details surface. */
    openDetails() { this.#require().openDetails(); }
    /** Close the original details surface. */
    closeDetails() { this.#require().closeDetails(); }
    /** Open the package-private Label Studio track. */
    openWorkbench() { this.#require().openWorkbench(); }
    /** Close the package-private Label Studio track. */
    closeWorkbench() { this.#require().closeWorkbench(); }
    #require() {
        if (this.#panels === undefined) {
            throw new Error('label-studio layout: panel actions not wired (root entry not mounted)');
        }
        return this.#panels;
    }
}
//# sourceMappingURL=service.js.map