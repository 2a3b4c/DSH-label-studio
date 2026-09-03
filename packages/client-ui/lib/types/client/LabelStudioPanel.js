import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useState } from 'react';
import css from './LabelStudioPanel.module.css';
/** Render a restored or explicitly opened iframe and retain it while hidden. */
export function LabelStudioPanel({ useLabelStudioPanel, useLabelStudioContext, baseUrl, open, width, close, reload, openExternal, confirmApplied, attachFrame, selectTarget, selectPage, t, }) {
    const state = useLabelStudioPanel(snapshot => snapshot);
    const context = useLabelStudioContext(snapshot => snapshot);
    const [projectId, setProjectId] = useState('');
    const [taskId, setTaskId] = useState('');
    const [annotationId, setAnnotationId] = useState('');
    const [inputError, setInputError] = useState();
    const [fullscreen, setFullscreen] = useState(false);
    const [locatorOpen, setLocatorOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const recentProjects = context.sessionContext.binding.recentProjects.length > 0
        ? context.sessionContext.binding.recentProjects
        : context.sessionContext.recentProjects;
    const bindingTarget = context.sessionContext.binding.target;
    const bindingMatches = bindingTarget !== undefined
        && pageMatchesBinding(context.sessionContext.page, bindingTarget);
    const bindingStatus = bindingTarget === undefined
        ? t('panel.unbound')
        : bindingMatches ? t('panel.bound') : t('panel.pageDiffers');
    const inspectionLabel = t(`panel.inspection.${context.inspectionStatus}`);
    const webhookLabel = `${t(`panel.webhook.${context.webhookStatus}`)}${context.webhookUnassigned ? ` · ${t('panel.webhook.unassigned')}` : ''}`;
    const inspectionAttention = !['idle', 'ready'].includes(context.inspectionStatus);
    const webhookAttention = context.webhookStatus !== 'ready' || context.webhookUnassigned;
    useEffect(() => {
        if (!open) {
            if (fullscreen)
                setFullscreen(false);
            if (locatorOpen)
                setLocatorOpen(false);
            if (detailsOpen)
                setDetailsOpen(false);
        }
    }, [detailsOpen, fullscreen, locatorOpen, open]);
    useEffect(() => {
        if (!fullscreen && !locatorOpen && !detailsOpen)
            return;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setLocatorOpen(false);
                setDetailsOpen(false);
                setFullscreen(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => { window.removeEventListener('keydown', onKeyDown); };
    }, [detailsOpen, fullscreen, locatorOpen]);
    useLayoutEffect(() => {
        if (state.targetUrl !== undefined)
            confirmApplied(state.navigationRevision);
    }, [confirmApplied, state.navigationRevision, state.targetUrl]);
    if (!state.mounted)
        return null;
    return (_jsxs("section", { className: css.panel, role: "region", "aria-label": t('panel.title'), hidden: !open, ...(!open ? { inert: '' } : {}), "data-fullscreen": fullscreen || undefined, style: { flexBasis: width }, children: [_jsxs("header", { className: css.header, children: [_jsx("div", { className: css.title, children: t('panel.title') }), _jsxs("div", { className: css.compactBar, children: [_jsxs("button", { type: "button", className: css.contextSummary, "aria-label": t('panel.contextDetails'), "aria-expanded": detailsOpen, onClick: () => {
                                    setDetailsOpen(current => !current);
                                    setLocatorOpen(false);
                                }, children: [_jsx("span", { className: css.statusDot, "data-tone": bindingTarget === undefined ? 'muted' : bindingMatches ? 'good' : 'warning' }), _jsxs("span", { className: css.summaryText, children: [pageName(context.sessionContext.page, t), " \u00B7 ", bindingStatus] }), _jsx("svg", { className: css.chevron, viewBox: "0 0 16 16", width: "14", height: "14", "aria-hidden": true, children: _jsx("path", { d: "m5 6 3 3 3-3", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) })] }), _jsxs("div", { className: css.compactActions, children: [_jsxs("span", { className: css.healthIndicator, "data-tone": inspectionTone(context.inspectionStatus), "aria-label": `${t('panel.inspection')}: ${inspectionLabel}`, title: `${t('panel.inspection')}: ${inspectionLabel}`, children: [_jsx("span", { className: css.statusDot }), inspectionAttention && _jsx("span", { children: inspectionLabel })] }), _jsxs("span", { className: css.healthIndicator, "data-tone": webhookAttention ? 'warning' : 'good', "aria-label": `${t('panel.webhook')}: ${webhookLabel}`, title: `${t('panel.webhook')}: ${webhookLabel}`, children: [_jsx("span", { className: css.statusDot }), webhookAttention && _jsx("span", { children: webhookLabel })] }), _jsxs("button", { type: "button", className: css.locatorButton, "aria-label": locatorOpen ? t('panel.closeLocator') : t('panel.openLocator'), "aria-expanded": locatorOpen, onClick: () => {
                                            setLocatorOpen(current => !current);
                                            setDetailsOpen(false);
                                            setInputError(undefined);
                                        }, children: [_jsxs("svg", { viewBox: "0 0 16 16", width: "14", height: "14", "aria-hidden": true, children: [_jsx("circle", { cx: "8", cy: "8", r: "2.5", fill: "none", stroke: "currentColor", strokeWidth: "1.4" }), _jsx("path", { d: "M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2", fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" })] }), t('panel.navigate')] })] }), locatorOpen && _jsxs("form", { className: `${css.popover} ${css.locatorPopover}`, "aria-label": t('panel.openLocator'), onSubmit: (event) => {
                                    event.preventDefault();
                                    setInputError(undefined);
                                    void selectTarget({ projectId, taskId, ...(annotationId === '' ? {} : { annotationId }) })
                                        .then(() => { setLocatorOpen(false); })
                                        .catch((error) => { setInputError(error instanceof Error ? error.message : String(error)); });
                                }, children: [_jsxs("label", { children: [_jsx("span", { children: t('panel.projectId') }), _jsx("input", { "aria-label": t('panel.projectId'), value: projectId, onChange: (event) => { setProjectId(event.currentTarget.value); } })] }), _jsxs("label", { children: [_jsx("span", { children: t('panel.taskId') }), _jsx("input", { "aria-label": t('panel.taskId'), value: taskId, onChange: (event) => { setTaskId(event.currentTarget.value); } })] }), _jsxs("label", { children: [_jsx("span", { children: t('panel.annotationId') }), _jsx("input", { "aria-label": t('panel.annotationId'), value: annotationId, onChange: (event) => { setAnnotationId(event.currentTarget.value); } })] }), _jsx("button", { type: "submit", children: t('panel.navigate') }), (inputError ?? context.error) !== undefined && _jsx("output", { "aria-live": "polite", children: inputError ?? context.error })] }), detailsOpen && _jsxs("div", { className: `${css.popover} ${css.contextPopover}`, role: "region", "aria-label": t('panel.contextDetails'), children: [_jsxs("div", { className: css.detailRow, children: [_jsx("span", { children: t('panel.currentPage') }), _jsx("strong", { children: pageName(context.sessionContext.page, t) })] }), _jsxs("div", { className: css.detailRow, children: [_jsx("span", { children: t('panel.binding') }), _jsx("strong", { children: bindingName(bindingTarget, t) })] }), context.sessionContext.binding.source !== undefined && _jsxs("div", { className: css.detailRow, children: [_jsx("span", { children: t('panel.bindingSource') }), _jsx("strong", { children: t(`panel.source.${context.sessionContext.binding.source}`) })] }), _jsxs("div", { className: css.detailRow, children: [_jsx("span", { children: t('panel.syncStatus') }), _jsx("strong", { children: t(`status.${context.status}`) })] }), _jsxs("div", { className: css.detailRow, children: [_jsx("span", { children: t('panel.inspection') }), _jsx("strong", { children: inspectionLabel })] }), _jsxs("div", { className: css.detailRow, children: [_jsx("span", { children: t('panel.webhook') }), _jsx("strong", { children: webhookLabel })] }), recentProjects.length > 0 && _jsx("nav", { className: css.recentProjects, "aria-label": t('panel.recentProjects'), children: recentProjects.map((project) => {
                                            const deleted = project.availability === 'deleted';
                                            const label = `${t('panel.project')} ${String(project.projectId)}${deleted ? ` (${t('panel.deleted')})` : ''}`;
                                            return _jsx("button", { type: "button", disabled: deleted, "aria-label": label, onClick: () => { void selectPage({ view: 'project', projectId: project.projectId }); }, children: label }, project.projectId);
                                        }) }), _jsx("p", { className: css.bridgeLimitation, children: t('panel.bridgeLimitation') })] })] }), _jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", className: css.iconButton, "aria-label": t(fullscreen ? 'panel.exitFullscreen' : 'panel.fullscreen'), "aria-pressed": fullscreen, title: t(fullscreen ? 'panel.exitFullscreen' : 'panel.fullscreen'), onClick: () => { setFullscreen(current => !current); }, children: _jsx("svg", { viewBox: "0 0 20 20", width: "16", height: "16", "aria-hidden": true, children: _jsx("path", { d: fullscreen
                                            ? 'M8 4v4H4M12 4v4h4M8 16v-4H4M12 16v-4h4'
                                            : 'M8 4H4v4M12 4h4v4M8 16H4v-4M12 16h4v-4', fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) }) }), _jsx("button", { type: "button", className: css.iconButton, "aria-label": t('panel.reload'), title: t('panel.reload'), onClick: reload, children: _jsxs("svg", { viewBox: "0 0 20 20", width: "16", height: "16", "aria-hidden": true, children: [_jsx("path", { d: "M15.5 7A6 6 0 1 0 16 12", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }), _jsx("path", { d: "M12.5 4.5h3v3", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })] }) }), _jsx("button", { type: "button", className: css.iconButton, "aria-label": t('panel.external'), title: t('panel.external'), onClick: openExternal, children: _jsxs("svg", { viewBox: "0 0 20 20", width: "16", height: "16", "aria-hidden": true, children: [_jsx("path", { d: "M11 4h5v5M16 4l-7 7", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }), _jsx("path", { d: "M15 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4", fill: "none", stroke: "currentColor", strokeWidth: "1.5" })] }) }), _jsx("button", { type: "button", className: css.iconButton, "aria-label": t('panel.close'), title: t('panel.close'), onClick: close, children: _jsx("svg", { viewBox: "0 0 20 20", width: "16", height: "16", "aria-hidden": true, children: _jsx("path", { d: "M5 5l10 10M15 5 5 15", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }) }) })] })] }), _jsx("iframe", { ref: attachFrame, className: css.iframe, src: state.targetUrl ?? baseUrl, title: t('panel.title'), allow: "clipboard-read; clipboard-write" }, state.reloadRevision)] }));
}
function pageName(page, t) {
    if (page.view === 'projects')
        return t('panel.projects');
    if (page.view === 'project')
        return `${t('panel.project')} ${String(page.projectId)}`;
    const annotation = page.annotationId === undefined ? '' : ` / ${t('panel.annotationId')} ${String(page.annotationId)}`;
    return `${t('panel.project')} ${String(page.projectId)} / ${t('panel.taskId')} ${String(page.taskId)}${annotation}`;
}
function bindingName(target, t) {
    if (target === undefined)
        return t('panel.unbound');
    if (target.kind === 'project')
        return `${t('panel.project')} ${String(target.projectId)}`;
    const annotation = target.annotationId === undefined
        ? ''
        : ` / ${t('panel.annotationId')} ${String(target.annotationId)}`;
    return `${t('panel.project')} ${String(target.projectId)} / ${t('panel.taskId')} ${String(target.taskId)}${annotation}`;
}
function pageMatchesBinding(page, target) {
    if (target.kind === 'project')
        return page.view === 'project' && page.projectId === target.projectId;
    return page.view === 'task'
        && page.projectId === target.projectId
        && page.taskId === target.taskId
        && page.annotationId === target.annotationId;
}
function inspectionTone(status) {
    if (status === 'ready')
        return 'good';
    if (status === 'idle')
        return 'muted';
    return 'warning';
}
//# sourceMappingURL=LabelStudioPanel.js.map