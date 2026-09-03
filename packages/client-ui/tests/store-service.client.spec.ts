// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { DETAILS_DEFAULT, SIDEBAR_DEFAULT, WORKBENCH_DEFAULT } from '../src/client/layout/columns.ts'
import { LabelStudioLayoutController, type LabelStudioPanelActions } from '../src/client/layout/service.ts'
import { createLabelStudioLayoutStore } from '../src/client/layout/store.ts'

describe('replacement layout store', () => {
  it('starts with only the sidebar open and creates independent instances', () => {
    const a = createLabelStudioLayoutStore().create()
    const b = createLabelStudioLayoutStore().create()
    expect(a.store.getSnapshot()).toEqual({ sidebar: SIDEBAR_DEFAULT, details: 0, workbench: 0, narrow: false, narrowExpanded: false })
    a.actions.openWorkbench()
    expect(a.store.getSnapshot().workbench).toBe(WORKBENCH_DEFAULT)
    expect(b.store.getSnapshot().workbench).toBe(0)
  })

  it('implements panel open, close, clamp, and narrow sidebar semantics', () => {
    const { store, actions } = createLabelStudioLayoutStore().create()
    actions.openDetails(); actions.openWorkbench()
    expect(store.getSnapshot()).toMatchObject({ details: DETAILS_DEFAULT, workbench: WORKBENCH_DEFAULT })
    actions.setWorkbench(1)
    expect(store.getSnapshot().workbench).toBe(480)
    actions.closeWorkbench(); actions.closeDetails()
    expect(store.getSnapshot()).toMatchObject({ details: 0, workbench: 0 })
    actions.setNarrow(true); actions.toggleSidebar()
    expect(store.getSnapshot()).toMatchObject({ sidebar: SIDEBAR_DEFAULT, narrow: true, narrowExpanded: true })
  })
})

function panels(): LabelStudioPanelActions {
  return {
    setSidebar: vi.fn(), setDetails: vi.fn(), setWorkbench: vi.fn(), toggleSidebar: vi.fn(), setNarrow: vi.fn(),
    openDetails: vi.fn(), closeDetails: vi.fn(), openWorkbench: vi.fn(), closeWorkbench: vi.fn(),
  }
}

describe('compatible layout controller', () => {
  it('fails before root wiring, then forwards public and private actions', () => {
    const controller = new LabelStudioLayoutController()
    expect(() => { controller.toggleSidebar() }).toThrow(/panel actions not wired/)
    const actions = panels()
    controller.attachPanels(actions)
    controller.toggleSidebar(); controller.openDetails(); controller.closeDetails(); controller.openWorkbench(); controller.closeWorkbench()
    expect(actions.toggleSidebar).toHaveBeenCalledOnce()
    expect(actions.openDetails).toHaveBeenCalledOnce()
    expect(actions.closeDetails).toHaveBeenCalledOnce()
    expect(actions.openWorkbench).toHaveBeenCalledOnce()
    expect(actions.closeWorkbench).toHaveBeenCalledOnce()
  })
})
