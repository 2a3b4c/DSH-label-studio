import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type { LabelStudioPanelSnapshot } from './panel-state.ts'

/** Header-action props after slot injection. */
export interface LabelStudioActionProps {
  useLabelStudioPanel: <T>(selector: (snapshot: LabelStudioPanelSnapshot) => T) => T
  toggle: () => void
  t: TranslateNS<typeof NS>
  hooks?: { labelStudioPanel: SnapshotStore<LabelStudioPanelSnapshot> }
}

/** Render the Session-header workbench toggle. */
export function LabelStudioAction({ useLabelStudioPanel, toggle, t }: LabelStudioActionProps) {
  const open = useLabelStudioPanel(snapshot => snapshot.open)
  const label = t(open ? 'action.close' : 'action.open')
  return <button type="button" aria-label={label} aria-pressed={open} title={label} onClick={toggle}>Label Studio</button>
}
