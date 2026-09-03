import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import {
  clampWidth, DETAILS_DEFAULT, DETAILS_MAX, DETAILS_MIN, SIDEBAR_DEFAULT,
  SIDEBAR_MAX, SIDEBAR_MIN, WORKBENCH_DEFAULT, WORKBENCH_MAX, WORKBENCH_MIN,
} from './columns.ts'

/** Replacement-root panel preferences. */
export interface LabelStudioLayoutState {
  sidebar: number
  details: number
  workbench: number
  narrow: boolean
  narrowExpanded: boolean
}

/** Replacement-root panel mutations. */
export type LabelStudioLayoutActions = {
  setSidebar: (draft: LabelStudioLayoutState, px: number) => void
  setDetails: (draft: LabelStudioLayoutState, px: number) => void
  setWorkbench: (draft: LabelStudioLayoutState, px: number) => void
  toggleSidebar: (draft: LabelStudioLayoutState) => void
  setNarrow: (draft: LabelStudioLayoutState, narrow: boolean) => void
  openDetails: (draft: LabelStudioLayoutState) => void
  closeDetails: (draft: LabelStudioLayoutState) => void
  openWorkbench: (draft: LabelStudioLayoutState) => void
  closeWorkbench: (draft: LabelStudioLayoutState) => void
}

/**
 * Create page-local layout state for one replacement-root registration.
 * @returns an independent store handle for one replacement-root registration.
 */
export function createLabelStudioLayoutStore(): EngineStoreHandle<LabelStudioLayoutState, LabelStudioLayoutActions> {
  return defineStore({
    init: (): LabelStudioLayoutState => ({ sidebar: SIDEBAR_DEFAULT, details: 0, workbench: 0, narrow: false, narrowExpanded: false }),
    actions: {
      setSidebar: (draft, px) => { draft.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX) },
      setDetails: (draft, px) => { draft.details = clampWidth(px, DETAILS_MIN, DETAILS_MAX) },
      setWorkbench: (draft, px) => { draft.workbench = clampWidth(px, WORKBENCH_MIN, WORKBENCH_MAX) },
      toggleSidebar: (draft) => {
        if (draft.narrow) draft.narrowExpanded = !draft.narrowExpanded
        else draft.sidebar = draft.sidebar === 0 ? SIDEBAR_DEFAULT : 0
      },
      setNarrow: (draft, narrow) => {
        if (draft.narrow === narrow) return
        draft.narrow = narrow
        draft.narrowExpanded = false
      },
      openDetails: (draft) => { if (draft.details === 0) draft.details = DETAILS_DEFAULT },
      closeDetails: (draft) => { draft.details = 0 },
      openWorkbench: (draft) => { if (draft.workbench === 0) draft.workbench = WORKBENCH_DEFAULT },
      closeWorkbench: (draft) => { draft.workbench = 0 },
    },
  })
}
