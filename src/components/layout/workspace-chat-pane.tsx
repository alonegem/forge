'use client'

import { useMemo, useEffect, useCallback, useState } from 'react'
import { FolderOpen, Plus, X } from 'lucide-react'
import { ChatView } from '@/components/views/chat-view'
import { CustomSelect } from '@/components/ui/custom-select'
import { useChat } from '@/hooks/use-chat'
import { getModelProviderId } from '@/lib/models'
import { cn } from '@/lib/utils'
import { RightSidebar } from './right-sidebar'
import { ResizeHandle } from '@/components/ui/resize-handle'
import { ForgeFileEditor } from './forge-file-editor'
import type { Session, Workspace } from '@/lib/types'
import type { WorkspacePaneState } from '@/lib/workbench'

interface WorkspaceChatPaneProps {
  pane: WorkspacePaneState
  paneIndex: number
  totalPanes: number
  focused: boolean
  sessions: Session[]
  workspaces: Workspace[]
  settings: Record<string, string>
  updateSettings: (updates: Record<string, string>) => Promise<void>
  onFocus: (paneId: string) => void
  onUpdatePane: (paneId: string, updates: Partial<WorkspacePaneState>) => void
  onClosePane: (paneId: string) => void
  createSession: (opts?: { title?: string; model?: string; workspace?: string }) => Promise<Session>
  updateSession: (id: string, updates: { title?: string; model?: string; status?: 'active' | 'archived' }) => Promise<Session>
  refreshSessions: () => void
  openProjectFolder: (folderPath: string) => Promise<Workspace>
  touchWorkspace: (id: string) => Promise<void>
}

export function WorkspaceChatPane({
  pane,
  paneIndex,
  totalPanes,
  focused,
  sessions,
  workspaces,
  settings,
  updateSettings,
  onFocus,
  onUpdatePane,
  onClosePane,
  createSession,
  updateSession,
  refreshSessions,
  openProjectFolder,
  touchWorkspace,
}: WorkspaceChatPaneProps) {
  const { messages, streaming, isThinking, error, sendMessage, loadMessages, stopStreaming, clearMessages, sendPermissionDecision } = useChat(pane.sessionId)

  const workspaceOptions = useMemo(
    () => [
      { value: '', label: 'Select Project' },
      ...workspaces.map((ws) => ({ value: ws.id, label: ws.name })),
    ],
    [workspaces],
  )

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === pane.workspaceId) || null,
    [workspaces, pane.workspaceId],
  )

  const workspaceSessions = useMemo(
    () => sessions.filter((session) => session.workspace === pane.workspaceId),
    [sessions, pane.workspaceId],
  )

  const sessionOptions = useMemo(
    () => [
      { value: '', label: 'Select Session' },
      ...workspaceSessions.map((session) => ({ value: session.id, label: session.title })),
    ],
    [workspaceSessions],
  )

  const activeSession = useMemo(
    () => workspaceSessions.find((session) => session.id === pane.sessionId) || null,
    [workspaceSessions, pane.sessionId],
  )
  const [editorClosing, setEditorClosing] = useState(false)

  const workspaceDefaultModel = pane.workspaceId
    ? settings[`workspace:${pane.workspaceId}:default_model`] || settings.default_model || 'claude-sonnet-4-6'
    : settings.default_model || 'claude-sonnet-4-6'
  const workspaceDefaultPermission = pane.workspaceId
    ? settings[`workspace:${pane.workspaceId}:default_permission_mode`] || settings.desktop_permission_mode || 'confirm'
    : settings.desktop_permission_mode || 'confirm'
  const workspaceDefaultThinking = pane.workspaceId
    ? settings[`workspace:${pane.workspaceId}:default_thinking_mode`] || settings.thinking_mode || 'auto'
    : settings.thinking_mode || 'auto'

  useEffect(() => {
    if (!pane.workspaceId) {
      if (pane.sessionId) onUpdatePane(pane.paneId, { sessionId: null })
      return
    }

    if (workspaceSessions.length === 0) {
      if (pane.sessionId) onUpdatePane(pane.paneId, { sessionId: null })
      return
    }

    const rememberedSessionId = pane.lastSessionByWorkspace[pane.workspaceId]
    const rememberedSession = rememberedSessionId
      ? workspaceSessions.find((session) => session.id === rememberedSessionId)
      : null

    if (!pane.sessionId || !workspaceSessions.some((session) => session.id === pane.sessionId)) {
      onUpdatePane(pane.paneId, { sessionId: rememberedSession?.id || workspaceSessions[0].id })
    }
  }, [pane.lastSessionByWorkspace, pane.workspaceId, pane.sessionId, pane.paneId, workspaceSessions, onUpdatePane])

  useEffect(() => {
    if (!pane.workspaceId || !pane.sessionId) return
    if (pane.lastSessionByWorkspace[pane.workspaceId] === pane.sessionId) return
    onUpdatePane(pane.paneId, {
      lastSessionByWorkspace: {
        ...pane.lastSessionByWorkspace,
        [pane.workspaceId]: pane.sessionId,
      },
    })
  }, [onUpdatePane, pane.lastSessionByWorkspace, pane.paneId, pane.sessionId, pane.workspaceId])

  useEffect(() => {
    if (pane.sessionId) {
      loadMessages(pane.sessionId)
    } else {
      clearMessages()
    }
  }, [pane.sessionId, pane.reloadSeq, loadMessages, clearMessages])

  const providerThinkingDefault = useMemo(() => {
    const model = activeSession?.model || settings.default_model || 'claude-sonnet-4-6'
    const providerType = getModelProviderId(model) || 'anthropic'
    const raw = settings[`thinking_mode_${providerType}`] || settings.thinking_mode || 'auto'
    const legacy: Record<string, string> = { adaptive: 'auto', enabled: 'max', disabled: 'off' }
    return legacy[raw] || raw
  }, [activeSession?.model, settings])

  const handleWorkspaceChange = useCallback(async (workspaceId: string) => {
    onFocus(pane.paneId)
    onUpdatePane(pane.paneId, {
      workspaceId: workspaceId || null,
      sessionId: null,
      openFiles: [],
      editingFile: null,
      permissionModeOverride: null,
      thinkingModeOverride: null,
    })
    if (workspaceId) await touchWorkspace(workspaceId)
  }, [onFocus, pane.paneId, onUpdatePane, touchWorkspace])

  const handleOpenProjectFolder = useCallback(async () => {
    const folderPath = await window.electronAPI?.openDirectoryDialog()
    if (!folderPath) return
    const workspace = await openProjectFolder(folderPath)
    onFocus(pane.paneId)
    onUpdatePane(pane.paneId, {
      workspaceId: workspace.id,
      sessionId: null,
      openFiles: [],
      editingFile: null,
      permissionModeOverride: null,
      thinkingModeOverride: null,
    })
  }, [onFocus, openProjectFolder, onUpdatePane, pane.paneId])

  const handleNewSession = useCallback(async () => {
    if (!pane.workspaceId) return
    const session = await createSession({
      workspace: pane.workspaceId,
      model: workspaceDefaultModel,
    })
    onFocus(pane.paneId)
    onUpdatePane(pane.paneId, {
      sessionId: session.id,
      lastSessionByWorkspace: {
        ...pane.lastSessionByWorkspace,
        [pane.workspaceId]: session.id,
      },
      openFiles: [],
      editingFile: null,
    })
  }, [createSession, onFocus, onUpdatePane, pane.lastSessionByWorkspace, pane.paneId, pane.workspaceId, workspaceDefaultModel])

  const handleSendMessage = useCallback(async (content: string, _permissionMode?: string, _thinkingMode?: string, attachments?: Array<{ name: string; filename: string; mimeType: string; tier: string }>) => {
    const effectivePermMode = pane.permissionModeOverride || workspaceDefaultPermission
    const effectiveThinkMode = pane.thinkingModeOverride || providerThinkingDefault || workspaceDefaultThinking
    await sendMessage(content, effectivePermMode, effectiveThinkMode, attachments)
    refreshSessions()
  }, [pane.permissionModeOverride, pane.thinkingModeOverride, providerThinkingDefault, refreshSessions, sendMessage, workspaceDefaultPermission, workspaceDefaultThinking])

  const handleRenameSession = useCallback(async (title: string) => {
    if (!pane.sessionId) return
    await updateSession(pane.sessionId, { title })
    refreshSessions()
  }, [pane.sessionId, refreshSessions, updateSession])

  const handleClearSession = useCallback(async () => {
    if (!pane.sessionId) return
    await fetch(`/api/sessions/${pane.sessionId}/clear`, { method: 'POST' })
    clearMessages()
  }, [clearMessages, pane.sessionId])

  const handlePermissionModeChange = useCallback((mode: string) => {
    onUpdatePane(pane.paneId, { permissionModeOverride: mode })
    if (pane.workspaceId) {
      void updateSettings({ [`workspace:${pane.workspaceId}:default_permission_mode`]: mode })
    }
  }, [onUpdatePane, pane.paneId, pane.workspaceId, updateSettings])

  const handleThinkingModeChange = useCallback((mode: string) => {
    onUpdatePane(pane.paneId, { thinkingModeOverride: mode })
    if (pane.workspaceId) {
      void updateSettings({ [`workspace:${pane.workspaceId}:default_thinking_mode`]: mode })
    }
  }, [onUpdatePane, pane.paneId, pane.workspaceId, updateSettings])

  const handleModelChange = useCallback(async (model: string) => {
    if (!pane.sessionId) return
    await updateSession(pane.sessionId, { model })
    if (pane.workspaceId) {
      await updateSettings({ [`workspace:${pane.workspaceId}:default_model`]: model })
    }
    refreshSessions()
  }, [pane.sessionId, pane.workspaceId, refreshSessions, updateSession, updateSettings])

  const handleOpenFile = useCallback((filename: string) => {
    const openFiles = pane.openFiles.includes(filename)
      ? pane.openFiles
      : [...pane.openFiles, filename]
    onUpdatePane(pane.paneId, { openFiles, editingFile: filename })
  }, [onUpdatePane, pane.openFiles, pane.paneId])

  const handleCloseEditor = useCallback(() => {
    setEditorClosing(true)
    setTimeout(() => {
      const remainingFiles = pane.openFiles.filter((file) => file !== pane.editingFile)
      const nextActiveFile = remainingFiles[remainingFiles.length - 1] || null
      onUpdatePane(pane.paneId, { openFiles: remainingFiles, editingFile: nextActiveFile })
      setEditorClosing(false)
    }, 200)
  }, [onUpdatePane, pane.editingFile, pane.openFiles, pane.paneId])

  const handleSelectEditorTab = useCallback((filename: string) => {
    onUpdatePane(pane.paneId, { editingFile: filename })
  }, [onUpdatePane, pane.paneId])

  const handleCloseEditorTab = useCallback((filename: string) => {
    const remainingFiles = pane.openFiles.filter((file) => file !== filename)
    const nextActiveFile = pane.editingFile === filename
      ? (remainingFiles[remainingFiles.length - 1] || null)
      : pane.editingFile
    onUpdatePane(pane.paneId, { openFiles: remainingFiles, editingFile: nextActiveFile })
  }, [onUpdatePane, pane.editingFile, pane.openFiles, pane.paneId])

  const handleRightResize = useCallback((delta: number) => {
    onUpdatePane(pane.paneId, {
      rightWidth: Math.max(220, Math.min(420, pane.rightWidth - delta)),
    })
  }, [onUpdatePane, pane.paneId, pane.rightWidth])

  const handleEditorResize = useCallback((delta: number) => {
    onUpdatePane(pane.paneId, {
      editorWidth: Math.max(320, Math.min(640, pane.editorWidth - delta)),
    })
  }, [onUpdatePane, pane.editorWidth, pane.paneId])

  return (
    <div
      className={cn(
        'flex h-full flex-col min-w-0 rounded-xl overflow-hidden bg-page',
      )}
      onMouseDown={() => onFocus(pane.paneId)}
    >
      <div
        className={cn(
          'flex items-center justify-between px-3 py-1.5 border-b transition-colors',
          focused
            ? 'border-[#6366F1]/70 bg-[#6366F1]/25'
            : 'border-subtle bg-elevated/50',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('text-[11px] font-medium truncate', focused ? 'text-primary' : 'text-secondary')}>
            Pane {paneIndex + 1}{activeWorkspace ? ` · ${activeWorkspace.name}` : ''}
          </div>
        </div>
        {totalPanes > 1 && (
          <button
            onClick={() => onClosePane(pane.paneId)}
            className={cn(
              'p-1 rounded-md transition-colors',
              focused ? 'hover:bg-indigo/10' : 'hover:bg-surface-hover',
            )}
            title="Close Pane"
          >
            <X size={14} className={cn(focused ? 'text-secondary' : 'text-tertiary')} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-subtle bg-surface">
        <div className="min-w-[180px]">
          <CustomSelect
            value={pane.workspaceId || ''}
            onChange={handleWorkspaceChange}
            options={workspaceOptions}
            size="sm"
          />
        </div>
        <button
          onClick={handleOpenProjectFolder}
          className="h-9 px-3 rounded-lg border border-subtle text-[12px] font-medium text-secondary hover:bg-surface-hover transition-colors"
          title="Open Project Folder"
        >
          <FolderOpen size={14} />
        </button>
        <div className="min-w-[200px] flex-1">
          <CustomSelect
            value={pane.sessionId || ''}
            onChange={(value) => onUpdatePane(pane.paneId, { sessionId: value || null })}
            options={sessionOptions}
            size="sm"
          />
        </div>
        <button
          onClick={handleNewSession}
          disabled={!pane.workspaceId}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-indigo text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-40"
        >
          <Plus size={14} />
          New Session
        </button>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 min-w-0">
          <ChatView
            session={activeSession}
            messages={messages}
            streaming={streaming}
            isThinking={isThinking}
            error={error}
            workspaceName={activeWorkspace?.name || ''}
            workspaceId={pane.workspaceId}
            permissionMode={pane.permissionModeOverride || workspaceDefaultPermission}
            thinkingMode={pane.thinkingModeOverride || providerThinkingDefault || workspaceDefaultThinking}
            onSendMessage={handleSendMessage}
            onStopStreaming={stopStreaming}
            onNewSession={handleNewSession}
            onPermissionDecision={sendPermissionDecision}
            onModelChange={handleModelChange}
            onPermissionModeChange={handlePermissionModeChange}
            onThinkingModeChange={handleThinkingModeChange}
            onRenameSession={handleRenameSession}
            onClearSession={handleClearSession}
          />
        </div>

        {pane.editingFile && pane.workspaceId && activeWorkspace && (
          <>
            {!editorClosing && <ResizeHandle direction="horizontal" onResize={handleEditorResize} />}
            <div className="flex flex-col min-h-0" style={{ width: editorClosing ? 0 : pane.editorWidth }}>
              <div className="flex items-center gap-1 px-2 py-1 border-l border-subtle border-b bg-surface min-w-0 overflow-x-auto">
                {pane.openFiles.map((filename) => {
                  const label = filename.split('/').pop() || filename
                  const active = pane.editingFile === filename
                  return (
                    <div
                      key={filename}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded-md text-[12px] min-w-0',
                        active ? 'bg-elevated text-primary' : 'text-secondary hover:bg-surface-hover'
                      )}
                    >
                      <button
                        onClick={() => handleSelectEditorTab(filename)}
                        className="truncate"
                        title={filename}
                      >
                        {label}
                      </button>
                      <button
                        onClick={() => handleCloseEditorTab(filename)}
                        className="shrink-0 text-tertiary hover:text-primary"
                        title="Close tab"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
              <div className="flex-1 min-h-0">
                <ForgeFileEditor
                  filename={pane.editingFile}
                  workspaceId={pane.workspaceId}
                  workspacePath={activeWorkspace.path}
                  onClose={handleCloseEditor}
                  width={editorClosing ? 0 : pane.editorWidth}
                  closing={editorClosing}
                />
              </div>
            </div>
          </>
        )}

        {pane.workspaceId && activeWorkspace && (
          <>
            {!pane.rightCollapsed && <ResizeHandle direction="horizontal" onResize={handleRightResize} />}
            <RightSidebar
              collapsed={pane.rightCollapsed}
              onToggleCollapse={() => onUpdatePane(pane.paneId, { rightCollapsed: !pane.rightCollapsed })}
              workspaceId={pane.workspaceId}
              workspaceName={activeWorkspace.name}
              workspacePath={activeWorkspace.path}
              onOpenFile={handleOpenFile}
              activeFile={pane.editingFile}
              width={pane.rightWidth}
            />
          </>
        )}
      </div>
    </div>
  )
}
