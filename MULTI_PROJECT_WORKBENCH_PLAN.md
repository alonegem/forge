# Multi-Project Workbench Plan

## Goal

Upgrade Forge from a single-workspace desktop chat app into a multi-pane workbench where multiple projects can stay open in one window at the same time.

Each pane should own a complete, independent project context:

- chat session
- model selection
- permission mode
- thinking mode
- file tree
- editor / preview state
- tool log / agent status

The target user experience is similar to an IDE with split editor groups, except each pane is a full AI workspace.

## Product Outcome

In one window, a user should be able to:

- open project A in pane A
- open project B in pane B
- chat with both projects independently
- view streaming output in both panes
- inspect different files in each pane
- keep per-project model / permission / thinking settings separate

Example:

- pane A: project A, model A, confirm permissions, thinking A
- pane B: project B, model B, full access, thinking B

## Architecture Direction

Do not continue extending the current single-active-workspace layout with more global state.

Instead:

1. Keep `AppLayout` as the top-level shell.
2. Introduce a new workbench layer that manages multiple panes.
3. Move workspace-specific state from global singletons into pane instances.

## State Model

### New Top-Level Workbench State

Introduce a workbench state container:

```ts
type WorkbenchLayout = 'single' | 'split-vertical' | 'split-horizontal' | 'grid'

type WorkspacePaneState = {
  paneId: string
  workspaceId: string | null
  sessionId: string | null

  permissionModeOverride: string | null
  thinkingModeOverride: string | null

  editingFile: string | null
  previewTarget: string | null

  fileTreeCollapsed: boolean
  rightSidebarCollapsed: boolean
  activeAuxTab: 'files' | 'tools' | 'agent'
}

type WorkbenchState = {
  layout: WorkbenchLayout
  panes: WorkspacePaneState[]
  activePaneId: string | null
}
```

### State Ownership

Global state should only keep:

- theme
- locale
- top-level navigation
- settings
- IM configuration
- template marketplace
- workbench layout container

Pane state must own:

- active workspace
- active session
- active model
- active permission mode
- active thinking mode
- open file / preview target
- tool log and streaming state

## Persistence Model

### Session-Level Persistence

Persist these into `sessions`:

- `model`
- `permission_mode`
- `thinking_mode`

This makes each chat session self-contained.

### Workspace-Level Defaults

Add a workspace-level default settings store, for example:

```sql
CREATE TABLE workspace_settings (
  workspace_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (workspace_id, key)
)
```

Suggested keys:

- `default_model`
- `default_permission_mode`
- `default_thinking_mode`

New sessions created inside a workspace should inherit these defaults.

## UI Structure

### Current Problem

The current layout assumes one global active workspace and one global active session. Changing project context replaces the whole central experience.

### Target Structure

Refactor UI into:

- `AppLayout`
- `WorkbenchView`
- `WorkspacePane`
- `PaneToolbar`
- `PaneChatArea`
- `PaneFileArea`
- `PaneEditorArea`

### Pane Contents

Each `WorkspacePane` should contain:

- pane header with workspace name
- pane session selector
- pane model picker
- pane permission mode picker
- pane thinking mode picker
- pane-local file tree
- pane-local chat area
- pane-local editor / preview tabs
- pane-local tool / agent status panel

## Component Refactor Plan

### Phase 1: Introduce Workbench Container

Refactor `src/components/layout/app-layout.tsx` so it no longer directly owns single-workspace state.

Move from:

- one `activeWorkspaceId`
- one `activeSessionId`
- one `editingFile`
- one `sessionPermMode`
- one `sessionThinkMode`

To:

- one `WorkbenchState`
- multiple `WorkspacePaneState`

### Phase 2: Pane-Scoped Chat

`useChat(sessionId)` is already close to pane-safe because it is session-driven.

Needed change:

- instantiate one `useChat()` per pane
- avoid using a single global chat stream owner

### Phase 3: Pane-Scoped File + Editor State

Current single-file editing behavior must be moved into pane state:

- each pane owns its own selected file
- each pane owns its own editor tabs
- each pane owns its own preview target

### Phase 4: Pane-Scoped Tool Log

Tool and streaming output must remain local to the pane/session that triggered them.

Do not allow:

- mixed tool logs
- shared streaming indicators
- shared "thinking" or "permission request" state across panes

## Module Classification

### Global

- settings
- theme / locale
- IM channel configuration
- top-level navigation
- template marketplace

### Workspace / Pane Local

- sessions
- model selection
- permission mode
- thinking mode
- file tree
- editor tabs
- preview
- tool log
- agent status

### Workspace-Level but Not Pane-UI-Specific

- cron tasks
- workspace defaults
- `.claude` files and rules

## IM and Scheduled Tasks

### IM

IM should remain globally configured.

Reason:

- it is an app-wide bridge system
- channel credentials should not be duplicated per pane

However, message routing should continue to bind into specific workspace/session targets.

Future improvement:

- replace global bridge defaults with channel-level or rule-level defaults

### Scheduled Tasks

Scheduled tasks are already mostly workspace-scoped because tasks store `workspace_id`.

This makes them naturally compatible with pane-based workspace views.

Exception:

- heartbeat remains a global/special-case task

## Suggested Implementation Order

### Step 1

Create `WorkbenchView` and `WorkspacePaneState`.

Do not add split panes yet. First remove the single-active-workspace assumption.

### Step 2

Convert central chat state to pane-scoped state.

### Step 3

Convert file tree + editor state to pane-scoped state.

### Step 4

Add split layout support:

- split vertical
- split horizontal
- optional grid later

### Step 5

Add workspace-level default model / permission / thinking settings.

## Risks

### State Coupling

The existing app has many assumptions that only one workspace/session is active. These assumptions must be found and moved into pane-local ownership.

### Streaming Concurrency

Multiple panes may stream simultaneously. Tool output, permission prompts, and "thinking" state must be session-bound.

### File/Editor Independence

Independent editor stacks per pane are mandatory. Reusing one global editor will break the workbench model.

## Immediate Next Build Slice

The first implementation slice should only do this:

1. introduce `WorkbenchView`
2. replace single global workspace/session state with pane state
3. allow two panes in split-vertical mode
4. let each pane independently select workspace + session

Do not try to finish advanced editor behavior in the first slice.

## Success Criteria

This redesign is successful when:

- switching pane A does not affect pane B
- pane A and pane B can stream different chat responses simultaneously
- each pane keeps its own model / permission / thinking settings
- each pane shows a different workspace file tree
- each pane can keep a different file open in the editor / preview area
