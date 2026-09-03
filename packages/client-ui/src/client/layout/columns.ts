/** Resolved widths for the Label Studio replacement root. */
export interface LabelStudioColumns {
  sidebar: number
  conversation: number
  details: number
  workbench: number
}

/** Minimum width that preserves the conversation surface. */
export const CONVERSATION_MIN = 640
/** Minimum user-resizable sidebar width. */
export const SIDEBAR_MIN = 264
/** Maximum user-resizable sidebar width. */
export const SIDEBAR_MAX = 420
/** Initial expanded sidebar width. */
export const SIDEBAR_DEFAULT = 280
/** Width of the collapsed sidebar rail. */
export const SIDEBAR_COLLAPSED = 56
/** Viewport width that activates narrow sidebar behavior. */
export const SIDEBAR_AUTO_COLLAPSE = 1024
/** Minimum visible details width. */
export const DETAILS_MIN = 300
/** Maximum user-resizable details width. */
export const DETAILS_MAX = 520
/** Width restored when details opens. */
export const DETAILS_DEFAULT = 360
/** Minimum user-resizable Label Studio workbench width. */
export const WORKBENCH_MIN = 480
/** Maximum user-resizable Label Studio workbench width. */
export const WORKBENCH_MAX = 1200
/** Width restored when the Label Studio workbench opens. */
export const WORKBENCH_DEFAULT = 720

/**
 * Clamp and round a panel width.
 * @param px - requested width in CSS pixels.
 * @param min - inclusive lower limit.
 * @param max - inclusive upper limit.
 * @returns the rounded width inside the requested range.
 */
export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)))
}

/**
 * Resolve the four replacement-root tracks without mutating preferences.
 * @param viewport - available root width.
 * @param sidebar - sidebar preference, where zero means the compact rail.
 * @param details - details preference, where zero means closed.
 * @param workbench - workbench preference, where zero means closed.
 * @returns rendered widths after the details-then-workbench concession chain.
 */
export function computeLabelStudioColumns(
  viewport: number,
  sidebar: number,
  details: number,
  workbench: number,
): LabelStudioColumns {
  const s = sidebar === 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const d = details === 0 ? 0 : clampWidth(details, DETAILS_MIN, DETAILS_MAX)
  const w = workbench === 0 ? 0 : clampWidth(workbench, WORKBENCH_MIN, WORKBENCH_MAX)

  if (s + d + w + CONVERSATION_MIN <= viewport) {
    return { sidebar: s, conversation: viewport - s - d - w, details: d, workbench: w }
  }

  const availableDetails = viewport - s - w - CONVERSATION_MIN
  if (d > 0 && availableDetails >= DETAILS_MIN) {
    return { sidebar: s, conversation: CONVERSATION_MIN, details: availableDetails, workbench: w }
  }

  if (s + w + CONVERSATION_MIN <= viewport) {
    return { sidebar: s, conversation: viewport - s - w, details: 0, workbench: w }
  }

  const availableWorkbench = viewport - s - CONVERSATION_MIN
  if (w > 0 && availableWorkbench >= WORKBENCH_MIN) {
    return { sidebar: s, conversation: CONVERSATION_MIN, details: 0, workbench: availableWorkbench }
  }

  const resolvedWorkbench = w === 0 ? 0 : Math.max(0, availableWorkbench)
  return {
    sidebar: s,
    conversation: Math.max(0, viewport - s - resolvedWorkbench),
    details: 0,
    workbench: resolvedWorkbench,
  }
}
