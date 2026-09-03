import { describe, expect, it } from 'vitest'
import {
  clampWidth, computeLabelStudioColumns, DETAILS_DEFAULT, DETAILS_MIN,
  SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT, WORKBENCH_DEFAULT, WORKBENCH_MIN,
} from '../src/client/layout/columns.ts'

describe('Label Studio column solver', () => {
  it('rounds and clamps drag preferences', () => {
    expect(clampWidth(100.4, 264, 420)).toBe(264)
    expect(clampWidth(9999, 264, 420)).toBe(420)
  })

  it('keeps all preferred tracks when they fit', () => {
    expect(computeLabelStudioColumns(2200, SIDEBAR_DEFAULT, DETAILS_DEFAULT, WORKBENCH_DEFAULT)).toEqual({
      sidebar: 280, conversation: 840, details: 360, workbench: 720,
    })
  })

  it('concedes details before the workbench and restores preferences after widening', () => {
    expect(computeLabelStudioColumns(1700, SIDEBAR_DEFAULT, DETAILS_DEFAULT, WORKBENCH_DEFAULT)).toEqual({
      sidebar: 280, conversation: 700, details: 0, workbench: 720,
    })
    expect(computeLabelStudioColumns(1500, SIDEBAR_DEFAULT, DETAILS_DEFAULT, WORKBENCH_DEFAULT)).toEqual({
      sidebar: 280, conversation: 640, details: 0, workbench: 580,
    })
    expect(computeLabelStudioColumns(2200, SIDEBAR_DEFAULT, DETAILS_DEFAULT, WORKBENCH_DEFAULT).details).toBe(DETAILS_DEFAULT)
  })

  it('allows the rendered workbench below its drag floor only as the final narrow fallback', () => {
    expect(computeLabelStudioColumns(900, 0, 0, WORKBENCH_DEFAULT)).toEqual({
      sidebar: SIDEBAR_COLLAPSED, conversation: 640, details: 0, workbench: 204,
    })
    expect(WORKBENCH_MIN).toBe(480)
    expect(DETAILS_MIN).toBe(300)
  })
})
