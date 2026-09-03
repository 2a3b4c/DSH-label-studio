import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { LabelStudioPageContext } from '@deepseek-ai/dsh-label-studio-protocol'
import { buildLabelStudioPageUrl } from './page-url.ts'

/** Browser-local panel facts. */
export interface LabelStudioPanelSnapshot {
  open: boolean
  mounted: boolean
  reloadRevision: number
  navigationRevision: number
  targetUrl?: string
}

/** Owns one browser page's workbench visibility and iframe identity. */
export class LabelStudioPanelController {
  /** Observable browser-local panel state. */
  readonly store: SnapshotStore<LabelStudioPanelSnapshot> = createSnapshotStore({
    open: false, mounted: false, reloadRevision: 0, navigationRevision: 0,
  })
  private readonly pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>()
  /** @param baseUrl - Host-validated neutral Label Studio page. */
  constructor(private readonly baseUrl: string) {}
  /**
   * Set workbench visibility while permanently latching the first mount.
   * @param open - requested visibility; the first open permanently latches mounted.
   */
  setOpen(open: boolean): void {
    const current = this.store.getSnapshot()
    const mounted = current.mounted || open
    if (current.open === open && current.mounted === mounted) return
    this.store.set({ ...current, open, mounted })
  }
  /** Hide the workbench without unmounting a previously created iframe. */
  close(): void { this.setOpen(false) }
  /** Replace the iframe element while retaining visibility state. */
  reload(): void {
    const current = this.store.getSnapshot()
    this.store.set({ ...current, reloadRevision: current.reloadRevision + 1 })
  }

  /**
   * Stage a controlled page URL and wait until React commits the matching iframe src.
   * @param page - structured Label Studio page.
   * @returns promise resolved by {@link confirmApplied}.
   */
  applyPage(page: LabelStudioPageContext): Promise<void> {
    this.rejectPending('label-studio panel: navigation superseded')
    const current = this.store.getSnapshot()
    const navigationRevision = current.navigationRevision + 1
    this.store.set({
      ...current,
      navigationRevision,
      targetUrl: buildLabelStudioPageUrl(this.baseUrl, page),
    })
    return new Promise<void>((resolve, reject) => {
      this.pending.set(navigationRevision, { resolve, reject })
    })
  }

  /**
   * Confirm that React committed one staged URL to the iframe node.
   * @param navigationRevision - revision observed by the panel layout effect.
   */
  confirmApplied(navigationRevision: number): void {
    const pending = this.pending.get(navigationRevision)
    if (pending === undefined) return
    this.pending.delete(navigationRevision)
    pending.resolve()
  }

  /** Clear the controlled URL and reject every uncommitted navigation. */
  clearPage(): void {
    this.rejectPending('label-studio panel: navigation cleared')
    const current = this.store.getSnapshot()
    this.store.set({
      open: current.open,
      mounted: current.mounted,
      reloadRevision: current.reloadRevision,
      navigationRevision: current.navigationRevision + 1,
    })
  }

  /** Reload only a currently controlled page. */
  reloadPage(): void {
    if (this.store.getSnapshot().targetUrl !== undefined) this.reload()
  }

  /** Open the controlled target, or the neutral endpoint, outside the dock. */
  openExternal(): void {
    window.open(this.store.getSnapshot().targetUrl ?? this.baseUrl, '_blank', 'noopener,noreferrer')
  }

  /** Reject outstanding DOM confirmations during plugin teardown. */
  dispose(): void { this.rejectPending('label-studio panel: disposed') }

  private rejectPending(message: string): void {
    for (const pending of this.pending.values()) pending.reject(new Error(message))
    this.pending.clear()
  }
}
