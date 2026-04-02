export type WorkbenchLayout = 'single' | 'split-vertical' | 'split-horizontal' | 'grid'

export interface WorkspacePaneState {
  paneId: string
  workspaceId: string | null
  sessionId: string | null
  lastSessionByWorkspace: Record<string, string>
  openFiles: string[]
  editingFile: string | null
  rightCollapsed: boolean
  rightWidth: number
  editorWidth: number
  permissionModeOverride: string | null
  thinkingModeOverride: string | null
  reloadSeq: number
}
