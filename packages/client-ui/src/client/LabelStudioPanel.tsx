import { useEffect, useLayoutEffect, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { LabelStudioPageContext } from '@deepseek-ai/dsh-label-studio-protocol'
import type { LabelStudioContextSnapshot } from './context-state.ts'
import { NS } from './locales.ts'
import type { LabelStudioPanelSnapshot } from './panel-state.ts'
import type { LabelStudioTargetInput } from './page-url.ts'
import css from './LabelStudioPanel.module.css'

/** Props supplied by the replacement root directly. */
export interface LabelStudioPanelProps {
  useLabelStudioPanel: <T>(selector: (snapshot: LabelStudioPanelSnapshot) => T) => T
  useLabelStudioContext: <T>(selector: (snapshot: LabelStudioContextSnapshot) => T) => T
  baseUrl: string
  open: boolean
  width: number
  close: () => void
  reload: () => void
  openExternal: () => void
  confirmApplied: (navigationRevision: number) => void
  attachFrame: (frame: HTMLIFrameElement | null) => void
  selectTarget: (input: LabelStudioTargetInput) => Promise<void>
  selectPage: (page: LabelStudioPageContext) => Promise<void>
  t: TranslateNS<typeof NS>
}

/** Render a restored or explicitly opened iframe and retain it while hidden. */
export function LabelStudioPanel({
  useLabelStudioPanel, useLabelStudioContext, baseUrl, open, width,
  close, reload, openExternal, confirmApplied, attachFrame, selectTarget, selectPage, t,
}: LabelStudioPanelProps) {
  const state = useLabelStudioPanel(snapshot => snapshot)
  const context = useLabelStudioContext(snapshot => snapshot)
  const [projectId, setProjectId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [annotationId, setAnnotationId] = useState('')
  const [inputError, setInputError] = useState<string>()
  const [fullscreen, setFullscreen] = useState(false)
  const recentProjects = context.sessionContext.binding.recentProjects.length > 0
    ? context.sessionContext.binding.recentProjects
    : context.sessionContext.recentProjects
  useEffect(() => {
    if (!open && fullscreen) setFullscreen(false)
  }, [fullscreen, open])
  useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [fullscreen])
  useLayoutEffect(() => {
    if (state.targetUrl !== undefined) confirmApplied(state.navigationRevision)
  }, [confirmApplied, state.navigationRevision, state.targetUrl])
  if (!state.mounted) return null
  return (
    <section
      className={css.panel}
      role="region"
      aria-label={t('panel.title')}
      hidden={!open}
      {...(!open ? { inert: '' } : {})}
      data-fullscreen={fullscreen || undefined}
      style={{ width }}
    >
      <header className={css.header}>
        <div className={css.title}>{t('panel.title')}</div>
        <div className={css.actions}>
          <button
            type="button"
            className={css.iconButton}
            aria-label={t(fullscreen ? 'panel.exitFullscreen' : 'panel.fullscreen')}
            aria-pressed={fullscreen}
            title={t(fullscreen ? 'panel.exitFullscreen' : 'panel.fullscreen')}
            onClick={() => { setFullscreen(current => !current) }}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
              <path
                d={fullscreen
                  ? 'M8 4v4H4M12 4v4h4M8 16v-4H4M12 16v-4h4'
                  : 'M8 4H4v4M12 4h4v4M8 16H4v-4M12 16h4v-4'}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button type="button" className={css.iconButton} aria-label={t('panel.reload')} title={t('panel.reload')} onClick={reload}>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden><path d="M15.5 7A6 6 0 1 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M12.5 4.5h3v3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" className={css.iconButton} aria-label={t('panel.external')} title={t('panel.external')} onClick={openExternal}>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden><path d="M11 4h5v5M16 4l-7 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M15 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
          <button type="button" className={css.iconButton} aria-label={t('panel.close')} title={t('panel.close')} onClick={close}>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden><path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>
      <form
        className={css.targetBar}
        onSubmit={(event) => {
          event.preventDefault()
          setInputError(undefined)
          void selectTarget({ projectId, taskId, ...(annotationId === '' ? {} : { annotationId }) })
            .catch((error: unknown) => { setInputError(error instanceof Error ? error.message : String(error)) })
        }}
      >
        <input aria-label={t('panel.projectId')} value={projectId} onChange={(event) => { setProjectId(event.currentTarget.value) }} />
        <input aria-label={t('panel.taskId')} value={taskId} onChange={(event) => { setTaskId(event.currentTarget.value) }} />
        <input aria-label={t('panel.annotationId')} value={annotationId} onChange={(event) => { setAnnotationId(event.currentTarget.value) }} />
        <button type="submit">{t('panel.navigate')}</button>
        <output aria-live="polite">{inputError ?? context.error ?? t(`status.${context.status}`)}</output>
      </form>
      <div className={css.contextBar}>
        <div className={css.currentPage}>
          {t('panel.currentPage')}: {pageName(context.sessionContext.page, t)}
        </div>
        <div className={css.currentPage}>
          {t('panel.binding')}: {bindingName(context.sessionContext.binding.target, t)}
        </div>
        {context.sessionContext.binding.source !== undefined && <div className={css.currentPage}>
          {t('panel.bindingSource')}: {t(`panel.source.${context.sessionContext.binding.source}`)}
        </div>}
        <div className={css.contextFacts}>
          <span className={css.statusBadge}>
            {t('panel.inspection')}: {t(`panel.inspection.${context.inspectionStatus}`)}
          </span>
          <span className={css.statusBadge}>
            {t('panel.webhook')}: {t(`panel.webhook.${context.webhookStatus}`)}
            {context.webhookUnassigned ? ` · ${t('panel.webhook.unassigned')}` : ''}
          </span>
        </div>
        {recentProjects.length > 0 && <nav
          className={css.recentProjects}
          aria-label={t('panel.recentProjects')}
        >
          {recentProjects.map((project) => {
            const deleted = project.availability === 'deleted'
            const label = `${t('panel.project')} ${String(project.projectId)}${deleted ? ` (${t('panel.deleted')})` : ''}`
            return <button
              key={project.projectId}
              type="button"
              disabled={deleted}
              aria-label={label}
              onClick={() => { void selectPage({ view: 'project', projectId: project.projectId }) }}
            >{label}</button>
          })}
        </nav>}
        <p className={css.bridgeLimitation}>{t('panel.bridgeLimitation')}</p>
      </div>
      <iframe
        ref={attachFrame}
        key={state.reloadRevision}
        className={css.iframe}
        src={state.targetUrl ?? baseUrl}
        title={t('panel.title')}
        allow="clipboard-read; clipboard-write"
      />
    </section>
  )
}

function pageName(page: LabelStudioPageContext, t: TranslateNS<typeof NS>): string {
  if (page.view === 'projects') return t('panel.projects')
  if (page.view === 'project') return `${t('panel.project')} ${String(page.projectId)}`
  const annotation = page.annotationId === undefined ? '' : ` / ${t('panel.annotationId')} ${String(page.annotationId)}`
  return `${t('panel.project')} ${String(page.projectId)} / ${t('panel.taskId')} ${String(page.taskId)}${annotation}`
}

function bindingName(
  target: LabelStudioContextSnapshot['sessionContext']['binding']['target'],
  t: TranslateNS<typeof NS>,
): string {
  if (target === undefined) return t('panel.unbound')
  if (target.kind === 'project') return `${t('panel.project')} ${String(target.projectId)}`
  const annotation = target.annotationId === undefined
    ? ''
    : ` / ${t('panel.annotationId')} ${String(target.annotationId)}`
  return `${t('panel.project')} ${String(target.projectId)} / ${t('panel.taskId')} ${String(target.taskId)}${annotation}`
}
