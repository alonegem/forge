'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { TitleBar } from './title-bar'
import { LeftSidebar } from './left-sidebar'
import { ProjectModal } from './project-modal'
import { WorkspaceChatPane } from './workspace-chat-pane'
import { ResizeHandle } from '@/components/ui/resize-handle'
import { cn } from '@/lib/utils'
import { ManageView } from '@/components/views/manage-view'
import { ImView } from '@/components/views/im-view'
import { ScheduleView } from '@/components/views/schedule-view'
import { SettingsView } from '@/components/views/settings-view'
import { MarketplaceView } from '@/components/views/marketplace-view'
import { Onboarding } from '@/components/onboarding'
import { ProjectSelection } from '@/components/project-selection'
import { useSessions } from '@/hooks/use-sessions'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { useSettings } from '@/hooks/use-settings'
import { useI18n } from '@/components/providers/i18n-provider'
import { useTheme } from '@/components/providers/theme-provider'
import type { View } from '@/lib/types'
import { GLOBAL_WORKSPACE_ID } from '@/lib/types'
import type { WorkbenchLayout, WorkspacePaneState } from '@/lib/workbench'

const WORKBENCH_STORAGE_KEY = 'forge-workbench-v1'

const INITIAL_PANES: WorkspacePaneState[] = [
  { paneId: 'pane-1', workspaceId: null, sessionId: null, lastSessionByWorkspace: {}, openFiles: [], editingFile: null, rightCollapsed: false, rightWidth: 260, editorWidth: 420, permissionModeOverride: null, thinkingModeOverride: null, reloadSeq: 0 },
]

export function AppLayout() {
  const [activeView, setActiveView] = useState<View>('chat')
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [workbenchLayout, setWorkbenchLayout] = useState<WorkbenchLayout>('split-vertical')
  const [chatPanes, setChatPanes] = useState<WorkspacePaneState[]>(INITIAL_PANES)
  const [activePaneId, setActivePaneId] = useState<string>('pane-1')
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)
  const [leftWidth, setLeftWidth] = useState(240)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const hasRestoredWorkbenchRef = useRef(false)

  const { settings, loading: settingsLoading, updateSettings } = useSettings()
  const { setLocale } = useI18n()
  const { setTheme } = useTheme()
  const { workspaces, openProjectFolder, removeProject, touchWorkspace, refreshWorkspaces } = useWorkspaces()

  // Onboarding check: only on initial settings load, never re-triggered by language/theme changes
  useEffect(() => {
    if (!settingsLoading && showOnboarding === null) {
      setShowOnboarding(settings.onboarding_completed !== 'true')
    }
  }, [settingsLoading, settings.onboarding_completed, showOnboarding])

  // Apply language and theme from settings (safe to re-run on changes)
  useEffect(() => {
    if (!settingsLoading) {
      if (settings.language === 'zh' || settings.language === 'en') {
        setLocale(settings.language)
      }
      if (settings.theme === 'dark' || settings.theme === 'light' || settings.theme === 'system') {
        setTheme(settings.theme)
      }
    }
  }, [settingsLoading, settings.language, settings.theme, setLocale, setTheme])

  // NOTE: We intentionally do NOT auto-select a workspace on startup.
  // The user must explicitly choose a project from the ProjectSelection page.
  // This aligns with Cursor/VS Code behavior where each launch starts with project selection.

  const { sessions, loading: sessionsLoading, createSession, updateSession, deleteSession, refreshSessions } = useSessions()

  // Apply font settings as CSS variables
  const fontVars = useMemo(() => {
    const size = settings.font_size || '14'
    return {
      '--forge-font-size': `${size}px`,
    } as React.CSSProperties
  }, [settings.font_size])

  // Apply code theme as data attribute on <html> so Shiki can read it
  useEffect(() => {
    const codeTheme = settings.code_theme || 'github-dark'
    document.documentElement.setAttribute('data-code-theme', codeTheme)
  }, [settings.code_theme])

  // Prevent Electron's default drag-and-drop behavior (navigating to the dropped file).
  // Uses the capture phase so component-level handlers in the bubble phase still get the events.
  // Component handlers call e.stopPropagation() to prevent this from interfering.
  useEffect(() => {
    const preventDrag = (e: DragEvent) => { e.preventDefault() }
    const preventDrop = (e: DragEvent) => {
      // Only prevent if no component handler has already stopped propagation
      if (!e.defaultPrevented) e.preventDefault()
    }
    document.addEventListener('dragover', preventDrag)
    document.addEventListener('drop', preventDrop)
    return () => {
      document.removeEventListener('dragover', preventDrag)
      document.removeEventListener('drop', preventDrop)
    }
  }, [])

  useEffect(() => {
    if (hasRestoredWorkbenchRef.current) return
    hasRestoredWorkbenchRef.current = true
    try {
      const raw = window.localStorage.getItem(WORKBENCH_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        activeView?: View
        leftCollapsed?: boolean
        leftWidth?: number
        workbenchLayout?: WorkbenchLayout
        activePaneId?: string
        panes?: Array<Partial<WorkspacePaneState>>
      }

      if (parsed.activeView) setActiveView(parsed.activeView)
      if (typeof parsed.leftCollapsed === 'boolean') setLeftCollapsed(parsed.leftCollapsed)
      if (typeof parsed.leftWidth === 'number') setLeftWidth(parsed.leftWidth)
      if (parsed.workbenchLayout) setWorkbenchLayout(parsed.workbenchLayout)

      if (Array.isArray(parsed.panes) && parsed.panes.length > 0) {
        const restoredPanes: WorkspacePaneState[] = parsed.panes.slice(0, 4).map((pane, index) => ({
          paneId: pane.paneId || `pane-restored-${index + 1}`,
          workspaceId: pane.workspaceId || null,
          sessionId: pane.sessionId || null,
          lastSessionByWorkspace: pane.lastSessionByWorkspace || {},
          openFiles: pane.openFiles || [],
          editingFile: pane.editingFile || null,
          rightCollapsed: typeof pane.rightCollapsed === 'boolean' ? pane.rightCollapsed : false,
          rightWidth: typeof pane.rightWidth === 'number' ? pane.rightWidth : 260,
          editorWidth: typeof pane.editorWidth === 'number' ? pane.editorWidth : 420,
          permissionModeOverride: pane.permissionModeOverride || null,
          thinkingModeOverride: pane.thinkingModeOverride || null,
          reloadSeq: 0,
        }))
        setChatPanes(restoredPanes)
        const restoredActivePaneId = parsed.activePaneId && restoredPanes.some((pane) => pane.paneId === parsed.activePaneId)
          ? parsed.activePaneId
          : restoredPanes[0].paneId
        setActivePaneId(restoredActivePaneId)
      }
    } catch {
      // ignore invalid persisted state
    }
  }, [])

  useEffect(() => {
    if (workspaces.length === 0) return
    setChatPanes((prev) => prev.map((pane, index) => {
      if (pane.workspaceId && workspaces.some((workspace) => workspace.id === pane.workspaceId)) {
        return pane
      }
      const fallbackWorkspace = workspaces[index]?.id || (index === 0 ? workspaces[0]?.id : null) || null
      return {
        ...pane,
        workspaceId: fallbackWorkspace,
        sessionId: null,
        openFiles: [],
        permissionModeOverride: null,
        thinkingModeOverride: null,
      }
    }))
  }, [workspaces])

  useEffect(() => {
    if (!hasRestoredWorkbenchRef.current) return
    try {
      window.localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify({
        activeView,
        leftCollapsed,
        leftWidth,
        workbenchLayout,
        activePaneId,
        panes: chatPanes.map((pane) => ({
          paneId: pane.paneId,
          workspaceId: pane.workspaceId,
          sessionId: pane.sessionId,
          lastSessionByWorkspace: pane.lastSessionByWorkspace,
          openFiles: pane.openFiles,
          editingFile: pane.editingFile,
          rightCollapsed: pane.rightCollapsed,
          rightWidth: pane.rightWidth,
          editorWidth: pane.editorWidth,
          permissionModeOverride: pane.permissionModeOverride,
          thinkingModeOverride: pane.thinkingModeOverride,
        })),
      }))
    } catch {
      // ignore storage failures
    }
  }, [activePaneId, activeView, chatPanes, leftCollapsed, leftWidth, workbenchLayout])

  const updatePane = useCallback((paneId: string, updates: Partial<WorkspacePaneState>) => {
    setChatPanes((prev) => prev.map((pane) => pane.paneId === paneId ? { ...pane, ...updates } : pane))
  }, [])

  const createEmptyPane = useCallback((): WorkspacePaneState => ({
    paneId: `pane-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId: null,
    sessionId: null,
    lastSessionByWorkspace: {},
    openFiles: [],
    editingFile: null,
    rightCollapsed: false,
    rightWidth: 260,
    editorWidth: 420,
    permissionModeOverride: null,
    thinkingModeOverride: null,
    reloadSeq: 0,
  }), [])

  const handleAddPane = useCallback(() => {
    if (chatPanes.length >= 4) return
    const newPane = createEmptyPane()
    setChatPanes((prev) => [...prev, newPane])
    setActivePaneId(newPane.paneId)
    setActiveView('chat')
  }, [chatPanes.length, createEmptyPane])

  const handleClosePane = useCallback((paneId: string) => {
    setChatPanes((prev) => {
      if (prev.length === 1) return prev
      const next = prev.filter((pane) => pane.paneId !== paneId)
      if (activePaneId === paneId) {
        setActivePaneId(next[0]?.paneId || 'pane-1')
      }
      return next
    })
  }, [activePaneId])

  const activePane = useMemo(
    () => chatPanes.find((pane) => pane.paneId === activePaneId) || chatPanes[0],
    [activePaneId, chatPanes],
  )

  const visiblePanes = useMemo(
    () => workbenchLayout === 'single' ? (activePane ? [activePane] : []) : chatPanes,
    [activePane, chatPanes, workbenchLayout],
  )

  const activeWorkspaceId = activePane?.workspaceId || null
  const activeSessionId = activePane?.sessionId || null

  const filteredSessions = useMemo(
    () => sessions.filter((session) => session.workspace === activeWorkspaceId),
    [sessions, activeWorkspaceId],
  )

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null

  const handleNewSession = useCallback(async () => {
    if (!activePane?.workspaceId) return
    const session = await createSession({
      workspace: activePane.workspaceId,
      model: settings.default_model || 'claude-sonnet-4-6',
    })
    updatePane(activePane.paneId, { sessionId: session.id, openFiles: [], editingFile: null })
    setActiveView('chat')
  }, [activePane, createSession, settings.default_model, updatePane])

  const handleSelectSession = useCallback((id: string) => {
    if (!activePane) return
    updatePane(activePane.paneId, { sessionId: id })
    setActiveView('chat')
  }, [activePane, updatePane])

  // Listen for session navigation from Schedule view (View Session links)
  useEffect(() => {
    const handler = (e: Event) => {
      const { sessionId } = (e as CustomEvent).detail || {}
      if (sessionId) {
        const session = sessions.find((s) => s.id === sessionId)
        if (session && activePane) {
          updatePane(activePane.paneId, { workspaceId: session.workspace, sessionId, openFiles: [], editingFile: null })
        }
        setActiveView('chat')
      }
    }
    window.addEventListener('forge:navigate-session', handler)
    return () => window.removeEventListener('forge:navigate-session', handler)
  }, [activePane, sessions, updatePane])

  // Refresh session list when scheduled tasks create new sessions
  useEffect(() => {
    const handler = () => { refreshSessions() }
    window.addEventListener('forge:sessions-changed', handler)
    return () => window.removeEventListener('forge:sessions-changed', handler)
  }, [refreshSessions])

  // SSE listener for real-time IM Bridge → Desktop sync
  useEffect(() => {
    let eventSource: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let unmounted = false

    const connect = () => {
      if (unmounted) return
      eventSource = new EventSource('/api/im-events')

      eventSource.addEventListener('im:message', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as { sessionId?: string; workspaceId?: string }
          refreshSessions()
          if (data.sessionId) {
            setChatPanes((prev) => prev.map((pane) =>
              pane.sessionId === data.sessionId ? { ...pane, reloadSeq: pane.reloadSeq + 1 } : pane
            ))
          }
        } catch { /* ignore malformed */ }
      })

      eventSource.addEventListener('im:command', () => {
        refreshSessions()
      })

      eventSource.addEventListener('im:session-changed', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as { sessionId?: string; workspaceId?: string }
          refreshSessions()
          if (data.sessionId && activePane) {
            updatePane(activePane.paneId, {
              workspaceId: data.workspaceId || activePane.workspaceId,
              sessionId: data.sessionId,
              openFiles: [],
              editingFile: null,
              reloadSeq: activePane.reloadSeq + 1,
            })
          }
        } catch { /* ignore malformed */ }
      })

      eventSource.onerror = () => {
        eventSource?.close()
        eventSource = null
        if (!unmounted) {
          reconnectTimer = setTimeout(connect, 3000)
        }
      }
    }

    connect()

    return () => {
      unmounted = true
      eventSource?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [activePane, refreshSessions, updatePane])

  // Listen for slash command navigation events from ChatView
  useEffect(() => {
    const handler = (e: Event) => {
      const { command } = (e as CustomEvent).detail || {}
      switch (command) {
        case 'memory':
          if (activePane) {
            updatePane(activePane.paneId, {
              editingFile: '.claude/MEMORY.md',
              openFiles: Array.from(new Set([...activePane.openFiles, '.claude/MEMORY.md'])),
            })
          }
          break
        case 'init':
          if (activePane) {
            updatePane(activePane.paneId, {
              editingFile: '.claude/CLAUDE.md',
              openFiles: Array.from(new Set([...activePane.openFiles, '.claude/CLAUDE.md'])),
            })
          }
          break
        case 'workspace':
          setProjectModalOpen(true)
          break
      }
    }
    window.addEventListener('forge:slash-command', handler)
    return () => window.removeEventListener('forge:slash-command', handler)
  }, [activePane, updatePane])

  // Listen for session reload events (after compact)
  useEffect(() => {
    const handler = (e: Event) => {
      const { sessionId } = (e as CustomEvent).detail || {}
      if (sessionId) {
        setChatPanes((prev) => prev.map((pane) =>
          pane.sessionId === sessionId ? { ...pane, reloadSeq: pane.reloadSeq + 1 } : pane
        ))
      }
    }
    window.addEventListener('forge:session-reload', handler)
    return () => window.removeEventListener('forge:session-reload', handler)
  }, [])

  const handleRenameSession = useCallback(async (id: string, title: string) => {
    await updateSession(id, { title })
  }, [updateSession])

  const handleDeleteSession = useCallback(async (id: string) => {
    await deleteSession(id)
    setChatPanes((prev) => prev.map((pane) =>
      pane.sessionId === id ? { ...pane, sessionId: null } : pane
    ))
  }, [deleteSession])

  const handleSwitchWorkspace = useCallback((wsId: string) => {
    if (!activePane) return
    updatePane(activePane.paneId, {
      workspaceId: wsId,
      sessionId: null,
      openFiles: [],
      editingFile: null,
      permissionModeOverride: null,
      thinkingModeOverride: null,
    })
    touchWorkspace(wsId)
  }, [activePane, touchWorkspace, updatePane])

  const handleOpenProjectFolder = useCallback(async () => {
    const folderPath = await window.electronAPI?.openDirectoryDialog()
    if (!folderPath) return

    const ws = await openProjectFolder(folderPath)
    if (activePane) {
      updatePane(activePane.paneId, {
        workspaceId: ws.id,
        sessionId: null,
        openFiles: [],
        editingFile: null,
        permissionModeOverride: null,
        thinkingModeOverride: null,
      })
    }
  }, [activePane, openProjectFolder, updatePane])

  const handleRemoveProject = useCallback(async (id: string) => {
    await removeProject(id)
    const remaining = workspaces.find((workspace) => workspace.id !== id)
    setChatPanes((prev) => prev.map((pane) =>
      pane.workspaceId === id
        ? {
            ...pane,
            workspaceId: remaining?.id || null,
            sessionId: null,
            openFiles: [],
            editingFile: null,
            permissionModeOverride: null,
            thinkingModeOverride: null,
          }
        : pane
    ))
  }, [removeProject, workspaces])

  // Refs to track current panel widths (avoids stale closures in resize handlers)
  const leftWidthRef = useRef(leftWidth)
  const leftCollapsedRef = useRef(leftCollapsed)
  useEffect(() => { leftWidthRef.current = leftWidth }, [leftWidth])
  useEffect(() => { leftCollapsedRef.current = leftCollapsed }, [leftCollapsed])

  // Panel resize handlers — dynamic max ensures chat area keeps ≥360px
  const handleLeftResize = useCallback((delta: number) => {
    setLeftWidth(w => {
      const rw = 0
      const maxLeft = window.innerWidth - rw - 360 - 12
      return Math.max(180, Math.min(maxLeft, w + delta))
    })
  }, [])
  // Wait for settings to load before deciding
  if (showOnboarding === null) {
    return <div className="flex items-center justify-center h-screen bg-page" />
  }

  if (showOnboarding) {
    return <Onboarding onComplete={(wsId) => {
      setShowOnboarding(false)
      if (wsId) {
        updatePane('pane-1', { workspaceId: wsId })
        void refreshWorkspaces()
      }
    }} />
  }

  if (workspaces.length === 0 && !chatPanes.some((pane) => pane.workspaceId)) {
    return <ProjectSelection
      workspaces={workspaces}
      onSelectWorkspace={(id) => {
        updatePane('pane-1', { workspaceId: id })
        setActivePaneId('pane-1')
        touchWorkspace(id)
      }}
      onOpenFolder={async () => {
        const folderPath = await window.electronAPI?.openDirectoryDialog()
        if (!folderPath) return
        const ws = await openProjectFolder(folderPath)
        updatePane('pane-1', { workspaceId: ws.id })
        setActivePaneId('pane-1')
      }}
      onRemoveWorkspace={async (id) => {
        await removeProject(id)
        await refreshWorkspaces()
      }}
    />
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={fontVars}>
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar
          activeView={activeView}
          onViewChange={setActiveView}
          collapsed={leftCollapsed}
          onToggleCollapse={() => setLeftCollapsed(!leftCollapsed)}
          sessions={filteredSessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          sessionsLoading={sessionsLoading}
          activeWorkspace={activeWorkspace}
          onOpenProjectModal={() => setProjectModalOpen(true)}
          width={leftWidth}
        />

        {!leftCollapsed && (
          <ResizeHandle direction="horizontal" onResize={handleLeftResize} />
        )}

        {/* Main content area — Chat (or other views) + optional editor panel */}
        <main className="flex-1 overflow-hidden bg-page flex min-w-[360px]">
          <div className="flex-1 shrink-0 overflow-hidden min-w-[360px]">
            <div key={activeView} className="h-full animate-fade-in">
              {activeView === 'chat' && (
                <div className="flex h-full w-full flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1">
                      {([
                        { id: 'single', label: 'Single' },
                        { id: 'split-vertical', label: 'Split V' },
                        { id: 'split-horizontal', label: 'Split H' },
                        { id: 'grid', label: 'Grid' },
                      ] as const).map((option) => (
                        <button
                          key={option.id}
                          onClick={() => setWorkbenchLayout(option.id)}
                          className={cn(
                            'h-8 px-3 rounded-lg border text-[12px] font-medium transition-colors',
                            workbenchLayout === option.id
                              ? 'border-indigo bg-indigo/10 text-indigo'
                              : 'border-subtle text-secondary hover:bg-surface-hover'
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={handleAddPane}
                      disabled={chatPanes.length >= 4}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-subtle text-[12px] font-medium text-secondary hover:bg-surface-hover transition-colors disabled:opacity-40"
                    >
                      + Add Pane
                    </button>
                  </div>
                  <div
                    className={cn(
                      'flex-1 min-h-0 w-full gap-3',
                      workbenchLayout === 'single' && 'flex',
                      workbenchLayout === 'split-vertical' && 'flex',
                      workbenchLayout === 'split-horizontal' && 'flex flex-col',
                      workbenchLayout === 'grid' && 'grid h-full grid-cols-2 auto-rows-fr'
                    )}
                  >
                    {visiblePanes.map((pane, index) => (
                      <div
                        key={pane.paneId}
                        className={cn(
                          'min-w-0 min-h-0',
                          workbenchLayout === 'single' && 'flex-1 basis-0 h-full',
                          workbenchLayout === 'split-vertical' && 'flex-1 basis-0 h-full',
                          workbenchLayout === 'split-horizontal' && 'flex-1 basis-0 min-h-0',
                          workbenchLayout === 'grid' && 'min-h-0 h-full'
                        )}
                      >
                        <WorkspaceChatPane
                          pane={pane}
                          paneIndex={index}
                          totalPanes={visiblePanes.length}
                          focused={pane.paneId === activePaneId}
                          sessions={sessions}
                          workspaces={workspaces}
                          settings={settings}
                          updateSettings={updateSettings}
                          onFocus={setActivePaneId}
                          onUpdatePane={updatePane}
                          onClosePane={handleClosePane}
                          createSession={createSession}
                          updateSession={updateSession}
                          refreshSessions={refreshSessions}
                          openProjectFolder={openProjectFolder}
                          touchWorkspace={touchWorkspace}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeView === 'manage' && (
                <ManageView
                  workspaceId={GLOBAL_WORKSPACE_ID}
                  workspacePath="~/.claude"
                />
              )}
              {activeView === 'im' && <ImView />}
              {activeView === 'schedule' && <ScheduleView workspaceId={activeWorkspaceId || ''} />}
              {activeView === 'marketplace' && (
                <MarketplaceView
                  onUseTemplate={(workspaceId, sessionId) => {
                    if (activePane) {
                      updatePane(activePane.paneId, { workspaceId, sessionId, openFiles: [], editingFile: null })
                    }
                    setActiveView('chat')
                    refreshSessions()
                    refreshWorkspaces()
                  }}
                />
              )}
              {activeView === 'settings' && <SettingsView />}
            </div>
          </div>
        </main>
      </div>

      <ProjectModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        sessions={sessions}
        onSwitchWorkspace={handleSwitchWorkspace}
        onOpenProjectFolder={handleOpenProjectFolder}
        onRemoveProject={handleRemoveProject}
        onRefresh={refreshWorkspaces}
      />
    </div>
  )
}
