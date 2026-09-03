// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LabelStudioPanel } from '../src/client/LabelStudioPanel.tsx'
import { LabelStudioPanelController } from '../src/client/panel-state.ts'

const t = (key: string) => ({
  'panel.title': 'Label Studio 标注工作台', 'panel.reload': '重新加载',
  'panel.fullscreen': '全屏标注', 'panel.exitFullscreen': '退出全屏',
  'panel.external': '在新窗口打开', 'panel.close': '关闭工作台',
  'panel.projectId': '项目 ID', 'panel.taskId': '任务 ID',
  'panel.annotationId': '标注 ID（可选）', 'panel.navigate': '定位',
  'panel.openLocator': '打开定位', 'panel.closeLocator': '关闭定位',
  'panel.contextDetails': '查看会话上下文', 'panel.bound': '已绑定',
  'panel.pageDiffers': '页面未绑定', 'panel.syncStatus': '同步状态',
  'panel.currentPage': '当前位置', 'panel.projects': '项目列表',
  'panel.recentProjects': '最近项目', 'panel.project': '项目',
  'panel.deleted': '已删除',
  'panel.binding': '当前绑定', 'panel.unbound': '未绑定',
  'panel.bindingSource': '绑定来源', 'panel.source.tool-result': '工具结果',
  'panel.source.webhook': 'Webhook', 'panel.source.current-page': '按需检查',
  'panel.inspection': '页面检查', 'panel.inspection.idle': '未请求',
  'panel.inspection.inspecting': '检查中', 'panel.inspection.ready': '已就绪',
  'panel.inspection.timeout': '已超时', 'panel.inspection.unsupported': '页面不支持',
  'panel.inspection.unavailable': '不可用', 'panel.webhook': 'Webhook',
  'panel.webhook.disabled': '已关闭', 'panel.webhook.ready': '已就绪',
  'panel.webhook.unavailable': '不可用', 'panel.webhook.unassigned': '事件未匹配当前会话',
  'panel.bridgeLimitation': '仅同步插件控制的导航，无法观察页面内任意点击或未保存草稿。',
}[key] ?? key)

const sessionContext = {
  page: { view: 'project' as const, projectId: 228 as never },
  recentProjects: [
    { projectId: 228 as never, lastVisitedAt: 2, availability: 'available' as const },
    { projectId: 486 as never, lastVisitedAt: 1, availability: 'deleted' as const },
  ],
  revision: 2,
  binding: { recentProjects: [], revision: 0 },
}

const contextSnapshot = {
  sourceId: 'source' as never, navigationSequence: 0 as never, targetRevision: 0,
  eventRevision: 0, observedEventRevision: 0, bufferedEventCount: 0, status: 'no-session' as const,
  sessionContext, sessionContextStatus: 'ready' as const,
  inspectionStatus: 'idle' as const, webhookStatus: 'ready' as const, webhookUnassigned: false,
}

function mount(
  controller: LabelStudioPanelController,
  close = vi.fn(), reload = vi.fn(), openExternal = vi.fn(), selectPage = vi.fn(),
  context = contextSnapshot,
) {
  const useLabelStudioPanel = <T,>(selector: (value: ReturnType<typeof controller.store.getSnapshot>) => T): T =>
    selector(useSyncExternalStore(
      listener => controller.store.subscribe(listener),
      () => controller.store.getSnapshot(),
    ))
  return {
    close, reload, openExternal, selectPage, useLabelStudioPanel,
    ...render(<LabelStudioPanel
      useLabelStudioPanel={useLabelStudioPanel as never}
      useLabelStudioContext={selector => selector(context)}
      baseUrl="http://127.0.0.1:8080"
      open={controller.store.getSnapshot().open}
      width={720}
      close={close}
      reload={reload}
      openExternal={openExternal}
      confirmApplied={(revision) => { controller.confirmApplied(revision) }}
      attachFrame={(frame) => { controller.attachFrame(frame) }}
      selectTarget={vi.fn()}
      selectPage={selectPage}
      t={t}
    />),
  }
}

afterEach(cleanup)

describe('Label Studio keep-alive panel', () => {
  it('creates no iframe before first open', () => {
    const view = mount(new LabelStudioPanelController('http://127.0.0.1:8080'))
    expect(view.container.querySelector('iframe')).toBeNull()
  })

  it('retains the iframe after close while the section is hidden and inert', () => {
    const controller = new LabelStudioPanelController('http://127.0.0.1:8080')
    controller.setOpen(true)
    const view = mount(controller)
    const frame = view.getByTitle('Label Studio 标注工作台')
    expect(frame).toBeTruthy()
    controller.close()
    view.rerender(<LabelStudioPanel
      baseUrl="http://127.0.0.1:8080"
      useLabelStudioPanel={view.useLabelStudioPanel}
      useLabelStudioContext={selector => selector(contextSnapshot)}
      open={false} width={0} close={view.close} reload={view.reload} openExternal={view.openExternal} t={t}
      confirmApplied={(revision) => { controller.confirmApplied(revision) }} selectTarget={vi.fn()}
      attachFrame={(frame) => { controller.attachFrame(frame) }}
      selectPage={view.selectPage}
    />)
    const section = view.container.querySelector('section')
    expect(view.container.querySelector('iframe')).toBe(frame)
    expect(section?.hidden).toBe(true)
    expect(section?.hasAttribute('inert')).toBe(true)
  })

  it('wires reload, external, and close controls', () => {
    const controller = new LabelStudioPanelController('http://127.0.0.1:8080'); controller.setOpen(true)
    const view = mount(controller)
    fireEvent.click(view.getByRole('button', { name: '重新加载' }))
    fireEvent.click(view.getByRole('button', { name: '在新窗口打开' }))
    fireEvent.click(view.getByRole('button', { name: '关闭工作台' }))
    expect(view.reload).toHaveBeenCalledOnce(); expect(view.openExternal).toHaveBeenCalledOnce(); expect(view.close).toHaveBeenCalledOnce()
  })

  it('enters fullscreen and exits with Escape', () => {
    const controller = new LabelStudioPanelController('http://127.0.0.1:8080'); controller.setOpen(true)
    const view = mount(controller)
    const section = view.container.querySelector('section')
    const fullscreen = view.getByRole('button', { name: '全屏标注' })
    fireEvent.click(fullscreen)
    expect(section?.hasAttribute('data-fullscreen')).toBe(true)
    expect(view.getByRole('button', { name: '退出全屏' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(section?.hasAttribute('data-fullscreen')).toBe(false)
  })

  it('does not claim saved state or expose direct annotation mutation controls', () => {
    const controller = new LabelStudioPanelController('http://127.0.0.1:8080'); controller.setOpen(true)
    const view = mount(controller)
    expect(view.queryByRole('button', { name: /保存确认|直接修改|更新标注/ })).toBeNull()
    expect(view.container.textContent).not.toContain('已保存确认')
  })

  it('keeps the locator and context details collapsed until requested', () => {
    const controller = new LabelStudioPanelController('http://127.0.0.1:8080'); controller.setOpen(true)
    const view = mount(controller)
    const header = view.container.querySelector('header')
    expect(header?.contains(view.getByRole('button', { name: '查看会话上下文' }))).toBe(true)
    expect(header?.contains(view.getByRole('button', { name: '打开定位' }))).toBe(true)
    expect(view.queryByLabelText('项目 ID')).toBeNull()
    expect(view.queryByText('当前位置: 项目 228')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: '打开定位' }))
    expect(view.getByLabelText('项目 ID')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: '查看会话上下文' }))
    expect(view.getByRole('region', { name: '查看会话上下文' }).textContent).toContain('当前位置项目 228')
  })

  it('shows the committed page, selects available history, disables deleted history, and states the Bridge limit', () => {
    const controller = new LabelStudioPanelController('http://127.0.0.1:8080'); controller.setOpen(true)
    const view = mount(controller)
    fireEvent.click(view.getByRole('button', { name: '查看会话上下文' }))
    const available = view.getByRole('button', { name: '项目 228' })
    const deleted = view.getByRole('button', { name: '项目 486 (已删除)' }) as HTMLButtonElement
    fireEvent.click(available)
    expect(view.selectPage).toHaveBeenCalledWith({ view: 'project', projectId: 228 })
    expect(deleted.disabled).toBe(true)
    expect(view.getByText('仅同步插件控制的导航，无法观察页面内任意点击或未保存草稿。')).toBeTruthy()
  })

  it('shows an unbound Session and ready integration statuses', () => {
    const controller = new LabelStudioPanelController('http://127.0.0.1:8080'); controller.setOpen(true)
    const view = mount(controller)
    expect(view.getByText('项目 228 · 未绑定')).toBeTruthy()
    expect(view.getByLabelText('页面检查: 未请求')).toBeTruthy()
    expect(view.getByLabelText('Webhook: 已就绪')).toBeTruthy()
    expect(view.queryByText('当前绑定: 未绑定')).toBeNull()
  })

  it('shows a task binding, source, recent binding projects, deletion, and degraded statuses', () => {
    const controller = new LabelStudioPanelController('http://127.0.0.1:8080'); controller.setOpen(true)
    const binding = {
      target: { kind: 'task' as const, projectId: 236 as never, taskId: 487 as never, annotationId: 67 as never },
      source: 'webhook' as const,
      boundAt: 10,
      recentProjects: [
        { projectId: 236 as never, lastTaskId: 487 as never, lastVisitedAt: 10, availability: 'available' as const },
        { projectId: 99 as never, lastVisitedAt: 9, availability: 'deleted' as const },
      ],
      revision: 1,
    }
    const view = mount(controller, vi.fn(), vi.fn(), vi.fn(), vi.fn(), {
      ...contextSnapshot,
      sessionContext: {
        ...sessionContext,
        page: { view: 'task' as const, projectId: 236 as never, taskId: 487 as never, annotationId: 67 as never },
        binding,
      },
      inspectionStatus: 'unsupported',
      webhookStatus: 'unavailable',
      webhookUnassigned: true,
    })
    expect(view.getByText('项目 236 / 任务 ID 487 / 标注 ID（可选） 67 · 已绑定')).toBeTruthy()
    expect(view.getByText('页面不支持')).toBeTruthy()
    expect(view.getByText('不可用 · 事件未匹配当前会话')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: '查看会话上下文' }))
    const details = view.getByRole('region', { name: '查看会话上下文' })
    expect(details.textContent).toContain('当前绑定项目 236 / 任务 ID 487 / 标注 ID（可选） 67')
    expect(details.textContent).toContain('绑定来源Webhook')
    expect(view.getByRole('button', { name: '项目 236' })).toBeTruthy()
    expect((view.getByRole('button', { name: '项目 99 (已删除)' }) as HTMLButtonElement).disabled).toBe(true)
    expect(details.textContent).toContain('页面检查页面不支持')
    expect(details.textContent).toContain('Webhook不可用 · 事件未匹配当前会话')
  })

  it('confirms the controlled target only after its iframe src commits', async () => {
    const controller = new LabelStudioPanelController('http://127.0.0.1:8080')
    controller.setOpen(true)
    const applied = controller.applyPage({ view: 'task', projectId: 228, taskId: 486 } as never)
    const confirmApplied = vi.spyOn(controller, 'confirmApplied')
    const view = mount(controller)
    expect(view.getByTitle('Label Studio 标注工作台').getAttribute('src'))
      .toBe('http://127.0.0.1:8080/projects/228/data?task=486')
    await applied
    expect(confirmApplied).toHaveBeenCalledWith(controller.store.getSnapshot().navigationRevision)
  })
})
