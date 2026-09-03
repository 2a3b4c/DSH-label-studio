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
    readonly 'panel.binding': "当前绑定";
    readonly 'panel.unbound': "未绑定";
    readonly 'panel.bindingSource': "绑定来源";
    readonly 'panel.source.tool-result': "工具结果";
    readonly 'panel.source.webhook': "Webhook";
    readonly 'panel.source.current-page': "按需检查";
    readonly 'panel.inspection': "页面检查";
    readonly 'panel.inspection.idle': "未请求";
    readonly 'panel.inspection.inspecting': "检查中";
    readonly 'panel.inspection.ready': "已就绪";
    readonly 'panel.inspection.timeout': "已超时";
    readonly 'panel.inspection.unsupported': "页面不支持";
    readonly 'panel.inspection.unavailable': "不可用";
    readonly 'panel.webhook': "Webhook";
    readonly 'panel.webhook.disabled': "已关闭";
    readonly 'panel.webhook.ready': "已就绪";
    readonly 'panel.webhook.unavailable': "不可用";
    readonly 'panel.webhook.unassigned': "事件未匹配当前会话";
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