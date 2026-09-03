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
    const recentProjects = context.sessionContext.binding.recentProjects.length > 0
        ? context.sessionContext.binding.recentProjects
        : context.sessionContext.recentProjects;
    useEffect(() => {
        if (!open && fullscreen)
            setFullscreen(false);
    }, [fullscreen, open]);
    useEffect(() => {
        if (!fullscreen)
            return;
        const onKeyDown = (event) => {
            if (event.key === 'Escape')
                setFullscreen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => { window.removeEventListener('keydown', onKeyDown); };
    }, [fullscreen]);
    useLayoutEffect(() => {
        if (state.targetUrl !== undefined)
            confirmApplied(state.navigationRevision);
    }, [confirmApplied, state.navigationRevision, state.targetUrl]);
    if (!state.mounted)
        return null;
    return (_jsxs("section", { className: css.panel, role: "region", "aria-label": t('panel.title'), hidden: !open, ...(!open ? { inert: '' } : {}), "data-fullscreen": fullscreen || undefined, style: { width }, children: [_jsxs("header", { className: css.header, children: [_jsx("div", { className: css.title, children: t('panel.title') }), _jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", className: css.iconButton, "aria-label": t(fullscreen ? 'panel.exitFullscreen' : 'panel.fullscreen'), "aria-pressed": fullscreen, title: t(fullscreen ? 'panel.exitFullscreen' : 'panel.fullscreen'), onClick: () => { setFullscreen(current => !current); }, children: _jsx("svg", { viewBox: "0 0 20 20", width: "16", height: "16", "aria-hidden": true, children: _jsx("path", { d: fullscreen
                                            ? 'M8 4v4H4M12 4v4h4M8 16v-4H4M12 16v-4h4'
                                            : 'M8 4H4v4M12 4h4v4M8 16H4v-4M12 16h4v-4', fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) }) }), _jsx("button", { type: "button", className: css.iconButton, "aria-label": t('panel.reload'), title: t('panel.reload'), onClick: reload, children: _jsxs("svg", { viewBox: "0 0 20 20", width: "16", height: "16", "aria-hidden": true, children: [_jsx("path", { d: "M15.5 7A6 6 0 1 0 16 12", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }), _jsx("path", { d: "M12.5 4.5h3v3", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })] }) }), _jsx("button", { type: "button", className: css.iconButton, "aria-label": t('panel.external'), title: t('panel.external'), onClick: openExternal, children: _jsxs("svg", { viewBox: "0 0 20 20", width: "16", height: "16", "aria-hidden": true, children: [_jsx("path", { d: "M11 4h5v5M16 4l-7 7", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }), _jsx("path", { d: "M15 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4", fill: "none", stroke: "currentColor", strokeWidth: "1.5" })] }) }), _jsx("button", { type: "button", className: css.iconButton, "aria-label": t('panel.close'), title: t('panel.close'), onClick: close, children: _jsx("svg", { viewBox: "0 0 20 20", width: "16", height: "16", "aria-hidden": true, children: _jsx("path", { d: "M5 5l10 10M15 5 5 15", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }) }) })] })] }), _jsxs("form", { className: css.targetBar, onSubmit: (event) => {
                    event.preventDefault();
                    setInputError(undefined);
                    void selectTarget({ projectId, taskId, ...(annotationId === '' ? {} : { annotationId }) })
                        .catch((error) => { setInputError(error instanceof Error ? error.message : String(error)); });
                }, children: [_jsx("input", { "aria-label": t('panel.projectId'), value: projectId, onChange: (event) => { setProjectId(event.currentTarget.value); } }), _jsx("input", { "aria-label": t('panel.taskId'), value: taskId, onChange: (event) => { setTaskId(event.currentTarget.value); } }), _jsx("input", { "aria-label": t('panel.annotationId'), value: annotationId, onChange: (event) => { setAnnotationId(event.currentTarget.value); } }), _jsx("button", { type: "submit", children: t('panel.navigate') }), _jsx("output", { "aria-live": "polite", children: inputError ?? context.error ?? t(`status.${context.status}`) })] }), _jsxs("div", { className: css.contextBar, children: [_jsxs("div", { className: css.currentPage, children: [t('panel.currentPage'), ": ", pageName(context.sessionContext.page, t)] }), _jsxs("div", { className: css.currentPage, children: [t('panel.binding'), ": ", bindingName(context.sessionContext.binding.target, t)] }), context.sessionContext.binding.source !== undefined && _jsxs("div", { className: css.currentPage, children: [t('panel.bindingSource'), ": ", t(`panel.source.${context.sessionContext.binding.source}`)] }), _jsxs("div", { className: css.contextFacts, children: [_jsxs("span", { className: css.statusBadge, children: [t('panel.inspection'), ": ", t(`panel.inspection.${context.inspectionStatus}`)] }), _jsxs("span", { className: css.statusBadge, children: [t('panel.webhook'), ": ", t(`panel.webhook.${context.webhookStatus}`), context.webhookUnassigned ? ` · ${t('panel.webhook.unassigned')}` : ''] })] }), recentProjects.length > 0 && _jsx("nav", { className: css.recentProjects, "aria-label": t('panel.recentProjects'), children: recentProjects.map((project) => {
                            const deleted = project.availability === 'deleted';
                            const label = `${t('panel.project')} ${String(project.projectId)}${deleted ? ` (${t('panel.deleted')})` : ''}`;
                            return _jsx("button", { type: "button", disabled: deleted, "aria-label": label, onClick: () => { void selectPage({ view: 'project', projectId: project.projectId }); }, children: label }, project.projectId);
                        }) }), _jsx("p", { className: css.bridgeLimitation, children: t('panel.bridgeLimitation') })] }), _jsx("iframe", { ref: attachFrame, className: css.iframe, src: state.targetUrl ?? baseUrl, title: t('panel.title'), allow: "clipboard-read; clipboard-write" }, state.reloadRevision)] }));
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
//# sourceMappingURL=LabelStudioPanel.js.map