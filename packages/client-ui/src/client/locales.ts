/** Dictionary namespace owned by the Label Studio browser plugin. */
export const NS = 'labelStudio'

/** Simplified Chinese dictionary and key source. */
export const zh = {
  'action.open': '打开 Label Studio',
  'action.close': '关闭 Label Studio',
  'panel.title': 'Label Studio 标注工作台',
  'panel.fullscreen': '全屏标注',
  'panel.exitFullscreen': '退出全屏',
  'panel.reload': '重新加载',
  'panel.external': '在新窗口打开',
  'panel.close': '关闭工作台',
  'panel.projectId': '项目 ID',
  'panel.taskId': '任务 ID',
  'panel.annotationId': '标注 ID（可选）',
  'panel.navigate': '定位',
  'panel.currentPage': '当前位置',
  'panel.projects': '项目列表',
  'panel.recentProjects': '最近项目',
  'panel.project': '项目',
  'panel.deleted': '已删除',
  'panel.bridgeLimitation': '仅同步插件控制的导航，无法观察页面内任意点击或未保存草稿。',
  'status.no-session': '未选择 DSH 会话',
  'status.no-task': '未选择任务',
  'status.leasing': '正在建立页面租约',
  'status.lease-active': '页面租约已连接',
  'status.lease-conflict': '另一标签页正在控制此会话',
  'status.lease-expired': '页面租约已过期',
  'status.syncing': '正在同步目标',
  'status.reconciling': '正在核对未知结果',
  'status.synced': '目标已同步',
  'status.error': '同步失败',
} as const

/** Label Studio dictionary keys. */
export type LabelStudioKey = keyof typeof zh

/** English dictionary. */
export const en: Record<LabelStudioKey, string> = {
  'action.open': 'Open Label Studio',
  'action.close': 'Close Label Studio',
  'panel.title': 'Label Studio annotation workbench',
  'panel.fullscreen': 'Enter fullscreen',
  'panel.exitFullscreen': 'Exit fullscreen',
  'panel.reload': 'Reload',
  'panel.external': 'Open in a new window',
  'panel.close': 'Close workbench',
  'panel.projectId': 'Project ID',
  'panel.taskId': 'Task ID',
  'panel.annotationId': 'Annotation ID (optional)',
  'panel.navigate': 'Go',
  'panel.currentPage': 'Current page',
  'panel.projects': 'Projects',
  'panel.recentProjects': 'Recent projects',
  'panel.project': 'Project',
  'panel.deleted': 'deleted',
  'panel.bridgeLimitation': 'Only plugin-controlled navigation is synchronized. Arbitrary iframe clicks and unsaved drafts are not observed.',
  'status.no-session': 'No DSH Session selected',
  'status.no-task': 'No task selected',
  'status.leasing': 'Opening page lease',
  'status.lease-active': 'Page lease connected',
  'status.lease-conflict': 'Another tab controls this Session',
  'status.lease-expired': 'Page lease expired',
  'status.syncing': 'Synchronizing target',
  'status.reconciling': 'Reconciling unknown result',
  'status.synced': 'Target synchronized',
  'status.error': 'Synchronization failed',
}
