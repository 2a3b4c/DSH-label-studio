// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { LabelStudioPanelController } from '../src/client/panel-state.ts'

describe('Label Studio panel keep-alive state', () => {
  it('does not mount before first open, then latches mounted across close', () => {
    const controller = new LabelStudioPanelController('http://127.0.0.1:8080')
    expect(controller.store.getSnapshot()).toEqual({
      open: false, mounted: false, reloadRevision: 0, navigationRevision: 0,
    })
    controller.setOpen(true)
    expect(controller.store.getSnapshot()).toMatchObject({ open: true, mounted: true, reloadRevision: 0 })
    controller.close()
    expect(controller.store.getSnapshot()).toMatchObject({ open: false, mounted: true, reloadRevision: 0 })
    controller.reload()
    expect(controller.store.getSnapshot().reloadRevision).toBe(1)
  })

  it('resolves target application only after the matching DOM revision is confirmed', async () => {
    const controller = new LabelStudioPanelController('http://127.0.0.1:8080')
    let settled = false
    const applied = controller.applyPage({ view: 'task', projectId: 228, taskId: 486 } as never)
      .then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    const snapshot = controller.store.getSnapshot()
    expect(snapshot.targetUrl).toBe('http://127.0.0.1:8080/projects/228/data?task=486')
    controller.confirmApplied(snapshot.navigationRevision)
    await applied
    expect(settled).toBe(true)
    controller.clearPage()
    expect(controller.store.getSnapshot().targetUrl).toBeUndefined()
  })
})
