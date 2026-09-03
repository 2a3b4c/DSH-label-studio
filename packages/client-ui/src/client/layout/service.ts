import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { createLabelStudioLayoutStore } from './store.ts'

/** Bound mutations for the replacement root. */
export type LabelStudioPanelActions = BoundActions<ReturnType<typeof createLabelStudioLayoutStore>>

/** Compatible public layout face plus package-private workbench actions. */
export class LabelStudioLayoutController {
  #panels: LabelStudioPanelActions | undefined

  /**
   * Attach the bound actions owned by the mounted replacement root.
   * @param actions - bound actions owned by the current root registration.
   */
  attachPanels(actions: LabelStudioPanelActions): void { this.#panels = actions }
  /** Toggle the original sidebar surface. */
  toggleSidebar(): void { this.#require().toggleSidebar() }
  /** Open the original details surface. */
  openDetails(): void { this.#require().openDetails() }
  /** Close the original details surface. */
  closeDetails(): void { this.#require().closeDetails() }
  /** Open the package-private Label Studio track. */
  openWorkbench(): void { this.#require().openWorkbench() }
  /** Close the package-private Label Studio track. */
  closeWorkbench(): void { this.#require().closeWorkbench() }

  #require(): LabelStudioPanelActions {
    if (this.#panels === undefined) {
      throw new Error('label-studio layout: panel actions not wired (root entry not mounted)')
    }
    return this.#panels
  }
}
