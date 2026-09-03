/** Dictionary namespace owned by the Label Studio browser plugin. */
export declare const NS = "labelStudio";
/** Simplified Chinese dictionary and key source. */
export declare const zh: {
    readonly 'action.open': "打开 Label Studio";
    readonly 'action.close': "关闭 Label Studio";
    readonly 'panel.title': "Label Studio 标注工作台";
    readonly 'panel.fullscreen': "全屏标注";
    readonly 'panel.exitFullscreen': "退出全屏";
    readonly 'panel.reload': "重新加载";
    readonly 'panel.external': "在新窗口打开";
    readonly 'panel.close': "关闭工作台";
    readonly 'panel.projectId': "项目 ID";
    readonly 'panel.taskId': "任务 ID";
    readonly 'panel.annotationId': "标注 ID（可选）";
    readonly 'panel.navigate': "定位";
    readonly 'panel.currentPage': "当前位置";
    readonly 'panel.projects': "项目列表";
    readonly 'panel.recentProjects': "最近项目";
    readonly 'panel.project': "项目";
    readonly 'panel.deleted': "已删除";
    readonly 'panel.bridgeLimitation': "仅同步插件控制的导航，无法观察页面内任意点击或未保存草稿。";
    readonly 'status.no-session': "未选择 DSH 会话";
    readonly 'status.no-task': "未选择任务";
    readonly 'status.leasing': "正在建立页面租约";
    readonly 'status.lease-active': "页面租约已连接";
    readonly 'status.lease-conflict': "另一标签页正在控制此会话";
    readonly 'status.lease-expired': "页面租约已过期";
    readonly 'status.syncing': "正在同步目标";
    readonly 'status.reconciling': "正在核对未知结果";
    readonly 'status.synced': "目标已同步";
    readonly 'status.error': "同步失败";
};
/** Label Studio dictionary keys. */
export type LabelStudioKey = keyof typeof zh;
/** English dictionary. */
export declare const en: Record<LabelStudioKey, string>;
//# sourceMappingURL=locales.d.ts.map