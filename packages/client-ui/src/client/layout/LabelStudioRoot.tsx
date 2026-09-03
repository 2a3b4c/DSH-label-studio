import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import { LabelStudioPanel } from '../LabelStudioPanel.tsx'
import type { LabelStudioRootInjected } from '../index.ts'
import { NS } from '../locales.ts'
import { computeLabelStudioColumns, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT } from './columns.ts'
import type { createLabelStudioLayoutStore } from './store.ts'
import css from './LabelStudioRoot.module.css'

/** Testable replacement-root props assembled by the slot runtime. */
export type LabelStudioRootProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'conversation' | 'details' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createLabelStudioLayoutStore>>
  & PropsLocale<typeof NS>
  & InjectFace<LabelStudioRootInjected>

interface SessionSelection {
  current?: SessionId
  byId: Partial<Record<SessionId, { blank: boolean }>>
}

interface DragHandleProps {
  side: 'sidebar' | 'details' | 'workbench'
  left: number
  onStart: () => void
  onDrag: (dx: number) => void
  onEnd: () => void
}

function DragHandle({ side, left, onStart, onDrag, onEnd }: DragHandleProps) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart, onDrag, onEnd })
  callbacks.current = { onStart, onDrag, onEnd }

  const pointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = event.clientX
    latest.current = event.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const pointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    latest.current = event.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const pointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    latest.current = event.clientX
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return <div
    className={css.handle}
    data-side={side}
    data-dragging={dragging || undefined}
    style={{ left }}
    onPointerDown={pointerDown}
    onPointerMove={pointerMove}
    onPointerUp={pointerUp}
  />
}

/** Render the original four child slots and the package-private workbench in one root. */
export function LabelStudioRoot({
  useStore, actions, useSessions, renderSlot, SessionProvider, useLabelStudioPanel, useLabelStudioContext,
  baseUrl, bindSession, confirmApplied, attachFrame, selectTarget, selectPage, close, reload, openExternal, t,
}: LabelStudioRootProps) {
  const panels = useStore(state => state)
  const selectedSession = useSessions(unknownState => (unknownState as SessionSelection).current)
  const liveSession = useSessions((unknownState) => {
    const state = unknownState as SessionSelection
    const id = state.current
    return id !== undefined && state.byId[id]?.blank === false ? id : undefined
  })
  const lastLiveSession = useRef(liveSession)
  useEffect(() => { bindSession(selectedSession) }, [bindSession, selectedSession])
  useLayoutEffect(() => {
    if (liveSession === undefined) return
    if (lastLiveSession.current !== undefined && lastLiveSession.current !== liveSession) actions.closeDetails()
    lastLiveSession.current = liveSession
  }, [actions, liveSession])

  const rootRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)
  useEffect(() => {
    const element = rootRef.current
    if (element === null) return
    let frame: number | null = null
    const observer = new ResizeObserver(() => {
      frame ??= requestAnimationFrame(() => {
        frame = null
        const width = element.getBoundingClientRect().width
        if (width > 0) setViewport(width)
      })
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])

  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  useEffect(() => { actions.setNarrow(narrow) }, [actions, narrow])
  const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0
  const sidebarPreference = sidebarCollapsed ? 0 : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  const columns = computeLabelStudioColumns(
    viewport,
    sidebarPreference,
    liveSession === undefined ? 0 : panels.details,
    panels.workbench,
  )
  const columnsRef = useRef(columns)
  columnsRef.current = columns
  const sidebarBase = useRef(0)
  const detailsBase = useRef(0)
  const workbenchBase = useRef(0)
  const [dragging, setDragging] = useState(false)
  const endDrag = useCallback(() => { setDragging(false) }, [])

  return <div
    ref={rootRef}
    className={css.frame}
    data-label-studio-root
    data-details-collapsed={columns.details === 0 || undefined}
    data-workbench-collapsed={columns.workbench === 0 || undefined}
    data-sidebar-collapsed={sidebarCollapsed || undefined}
    data-dragging={dragging || undefined}
    style={{ gridTemplateColumns: `${columns.sidebar}px minmax(0, 1fr) ${columns.details}px ${columns.workbench}px` }}
  >
    <div className={css.sidebarCol}>{renderSlot('sidebar', { collapsed: sidebarCollapsed, width: columns.sidebar })}</div>
    <div className={css.conversationCol}>{renderSlot('conversation', {})}</div>
        <div className={css.detailsCol}>
          <SessionProvider>{renderSlot('details', {})}</SessionProvider>
        </div>
    <LabelStudioPanel
      useLabelStudioPanel={useLabelStudioPanel}
      useLabelStudioContext={useLabelStudioContext}
      baseUrl={baseUrl}
      open={panels.workbench > 0}
      width={columns.workbench}
      close={close}
      reload={reload}
      openExternal={openExternal}
      confirmApplied={confirmApplied}
      attachFrame={attachFrame}
      selectTarget={selectTarget}
      selectPage={selectPage}
      t={t}
    />
    <div className={css.overlayLayer} data-shell-overlay>{renderSlot('shell.overlay', {})}</div>
    {!sidebarCollapsed && <DragHandle
      side="sidebar" left={columns.sidebar}
      onStart={() => { sidebarBase.current = columnsRef.current.sidebar; setDragging(true) }}
      onDrag={(dx) => { actions.setSidebar(sidebarBase.current + dx) }} onEnd={endDrag}
    />}
    {columns.details > 0 && <DragHandle
      side="details" left={viewport - columns.workbench - columns.details}
      onStart={() => { detailsBase.current = columnsRef.current.details; setDragging(true) }}
      onDrag={(dx) => { actions.setDetails(detailsBase.current - dx) }} onEnd={endDrag}
    />}
    {columns.workbench > 0 && <DragHandle
      side="workbench" left={viewport - columns.workbench}
      onStart={() => { workbenchBase.current = columnsRef.current.workbench; setDragging(true) }}
      onDrag={(dx) => { actions.setWorkbench(workbenchBase.current - dx) }} onEnd={endDrag}
    />}
  </div>
}
