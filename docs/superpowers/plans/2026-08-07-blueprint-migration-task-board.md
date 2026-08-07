# Blueprint Migration — Plan 4: Task Board surface reskin

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Reskin the Task **Board** surface to Blueprint — the task cards, board columns, board shell (views toolbar + New task), and the secondary tabular views (Types/Ownership/Team) — and retire their `globals.css` rules. Task detail + dialogs (TaskDetail, AddTaskDrawer, OwnerPicker, TaskProperties) are a separate follow-on plan (Plan 5).

## Design decisions

1. **Introduce the shared Blueprint primitives the Task domain needs**, in `components/ui/blueprint/` (main lacks these): `Button`, `IconButton`, `Menu` (Popover + Menu wrapper), `HTMLSelect`, `Checkbox`. Tag/StatusDot/OwnerAvatar stay as `main`'s existing primitives (custom; migrate later). SegmentedControl is already used (shell).
2. **`TaskCard`**: `.task-card` → Blueprint `Card`; the actions "more" menu → Blueprint `Menu` inside a `Popover` (replaces the custom `.task-actions-menu` + outside-click logic); `.icon-btn` → `IconButton` (with Tooltip); quick-edit `<select>` → `HTMLSelect`; quick-edit checkboxes → `Checkbox`; `.btn`/`.danger-action` → `Button` (intent danger for delete). Keep ALL behavior: optimistic owner writes, status/type patch, delete, focus management, Escape handling.
3. **`TaskBoardView`**: board columns + card list layout — keep the column/list structure (CSS grid/flex layout stays as minimal layout); only the cards + column controls become Blueprint.
4. **Board shell**: `PageHeader` stays; the BOARD_VIEWS switch → `SegmentedControl`; `New task` → `Button intent=primary`; toolbar selects/inputs → `HTMLSelect`/`InputGroup`.
5. **`BoardSecondaryViews`** (Types/Ownership/Team tables): native tables → Blueprint `HTMLTable` (condensed, interactive, border).
6. **CSS retirement:** remove the Task-board component selectors from `globals.css` (`.task-card*`, `.task-actions-menu`, `.task-quick-edit*`, `.icon-btn`, `.btn*`, `.quick-edit-*`, the board-column rules' component styling, the secondary-view table styling). Keep minimal board layout (columns/grid).

**Architecture:** each Task-board component renders Blueprint controls inside its existing layout/logic. Optimistic mutations, realtime, focus/keyboard behavior, and the data layer (`lib/tasks/*`) are untouched. A small residual `globals.css` block provides board layout only.

**Tech Stack:** Next 16, React 19, `@blueprintjs/core@6`, Vitest + @testing-library/react + jsdom.

## Global Constraints

- **Workspace:** worktree `/home/yubaifeng/e84381970/projects/tb-blueprint-migration`, branch `feat/blueprint-migration` (on top of Plans 1–3). Work ONLY here.
- **Node:** `. "$HOME/.config/nvm/nvm.sh" && nvm use 24` before build/test.
- **Preserve behavior:** optimistic owner writes + rollback, status/type patch, delete confirmation flow, focus management (open/escape/restore), keyboard nav, realtime, the data layer. No routing change.
- **Read each component fully before editing** — these are large files with subtle ref/focus logic; preserve it.
- **Commits:** conventional + trailer `Co-Authored-By: Claude <noreply@anthropic.com>`; stage explicitly.
- **Test baseline:** clean (~819 tests). Add zero new failures. Existing Task tests (`Board.test.tsx`, `TaskCard.test.tsx`, etc.) assert behavior — keep passing; update selectors only as needed, never weaken.
- **Verify before done:** `npm run build && npm test`.

## File Structure

Created:
- `components/ui/blueprint/Button.tsx` — `Button` + `IconButton`.
- `components/ui/blueprint/Menu.tsx` — `Popover`+`Menu` wrapper (controlled open, outside-click/escape handled by Blueprint).
- `components/ui/blueprint/Inputs.tsx` — `HTMLSelect`, `Checkbox`.

Modified:
- `components/tasks/TaskCard.tsx`, `components/tasks/TaskBoardView.tsx`, `components/tasks/BoardSecondaryViews.tsx`, `components/Board.tsx`.
- `app/globals.css` — retire Task-board component CSS; keep minimal board layout.
- Affected tests as needed (selector updates only).

---

### Task 1: Shared Blueprint primitives (Button/IconButton, Menu, HTMLSelect/Checkbox)

**Files:** Create `components/ui/blueprint/{Button,Menu,Inputs}.tsx` + tests.
**Interfaces:** Produces `<Button intent? text? icon?>`, `<IconButton icon label …>`; `<Menumenu trigger render items>` (a controlled Popover+Menu); `<HTMLSelect value onChange options>`, `<Checkbox checked onChange label>`.

- [ ] **Step 1: Verify Blueprint APIs** (`Button`, `IconButton`? (may not exist — use `Button minimal`), `Popover`, `Menu`, `MenuItem`, `HTMLSelect`, `Checkbox`) in the installed `@blueprintjs/core`.
- [ ] **Step 2: TDD** each primitive (render + key behavior) — RED → implement thin `"use client"` wrappers → GREEN. For `Menu`, model it as a controlled `<Popover content={<Menu>…<MenuItem/></Menu>}>` with `interactionKind="click"`, `minimal`, `placement="bottom-end"`, rendering the trigger via `renderTarget` or wrapping children.
- [ ] **Step 3:** `npm run build` + focused tests green; commit `feat(ui): add Blueprint Button/Menu/Inputs primitives`.

---

### Task 2: TaskCard reskin

**Files:** Modify `components/tasks/TaskCard.tsx`; `components/tasks/__tests__/TaskCard.test.tsx`.

- [ ] **Step 1: Read full TaskCard + test.** Preserve: optimistic owner writes + rollback (`toggleOwner`, `pendingOwnerWritesRef`, etc.), status/type patch, delete, focus/escape.
- [ ] **Step 2: Swap to Blueprint.** `.task-card` → `Card`; actions menu → the new `Menu` (Blueprint handles outside-click/escape/focus — drop the manual `mousedown` listener + `firstActionRef` if Blueprint covers it, but PRESERVE focus-restore to the trigger); `.icon-btn` → `IconButton` (+Tooltip); quick-edit `<select>` → `HTMLSelect`; checkboxes → `Checkbox`; `.btn`/`.danger-action` → `Button` (danger for delete).
- [ ] **Step 3: Update test selectors** (e.g., button/label queries) without weakening; behavior assertions (patch/delete/owner-toggle) must still pass.
- [ ] **Step 4:** focused test + build; commit `feat(tasks): reskin TaskCard to Blueprint`.

---

### Task 3: TaskBoardView reskin

**Files:** Modify `components/tasks/TaskBoardView.tsx` (read full first).

- [ ] Reskin the column headers + per-column controls (add-task, overflow) to Blueprint (`Button`/`IconButton`/`Menu`); keep the column list/grid LAYOUT (minimal CSS). Cards already Blueprint after Task 2. Preserve group-by logic + drag/position behavior if any. Focused tests + build; commit `feat(tasks): reskin TaskBoardView to Blueprint`.

---

### Task 4: Board shell reskin

**Files:** Modify `components/Board.tsx`.

- [ ] BOARD_VIEWS switch → `SegmentedControl`; `New task` → `Button intent=primary`; toolbar selects/inputs → `HTMLSelect`/`InputGroup`; mutation banners → Blueprint `Callout`. `PageHeader` stays. Preserve data layer, mutations, loading (`WorkspaceSkeleton` stays), empty/error states. Update `Board.test.tsx` selectors only as needed; build + suite; commit `feat(board): reskin Board shell to Blueprint`.

---

### Task 5: BoardSecondaryViews reskin (Types/Ownership/Team)

**Files:** Modify `components/tasks/BoardSecondaryViews.tsx`.

- [ ] Native tables → Blueprint `HTMLTable` (condensed, interactive, border); inline controls → Blueprint primitives; preserve all behavior (type rename/delete/reorder, ownership rows, team roster). Update tests selectors-only; build + suite; commit `feat(tasks): reskin BoardSecondaryViews to Blueprint HTMLTable`.

---

### Task 6: Retire Task-board-scoped CSS

**Files:** Modify `app/globals.css`.

- [ ] Grep the **Task-board-scoped** selectors and delete the ones now replaced by Blueprint components: `.task-card*`, `.task-actions-menu`, `.task-actions-trigger`, `.task-quick-edit*`, `.quick-edit-*`, `.task-card-type/-title/-tags/-foot/-owners/-meta/-menu`, board-column component styling, secondary-view table styling. **Do NOT delete shared selectors** (`.btn`, `.btn.primary`, `.icon-btn`, native `select`/`input` styling) — those are used by Task-detail/dialogs (Plan 5) AND other domains (Experiments, etc.); they retire only in a final global-retire plan after every domain migrates. Grep source before each deletion to confirm the selector is Task-board-only and now-unused. KEEP minimal board layout (columns/grid). Build + suite + grep verification; commit `style: retire Task-board-scoped CSS`.

---

### Task 7: Verify Task-board reskin end-to-end

- [ ] `npm run build && npm test` (green, no new failures); reasoned smoke (cards are BP Cards with Menu actions; board uses SegmentedControl views + New-task Button; secondary views are BP HTMLTables; optimistic owner writes / patch / delete / focus-restore intact; light/dark correct). Report (commit only if a fix needed).

---

## Self-Review

- **Scope:** Task Board surface (TaskCard, TaskBoardView, Board shell, BoardSecondaryViews) + shared primitives + CSS retire ✓. Task detail/dialogs (TaskDetail, TaskProperties, AddTaskDrawer, OwnerPicker) → Plan 5.
- **Behavior preserved:** optimistic writes/rollback, patch, delete, focus/keyboard, realtime, data layer ✓.
- **Risks:** (a) Blueprint `Menu`/`Popover` focus management vs TaskCard's manual focus-restore — verify focus returns to trigger (Task 2 Step 2); (b) CSS retirement must not remove selectors used by Task-detail/dialogs (Plan 5 components still use some shared classes like `.btn`/`.icon-btn` until Plan 5 reskins them) — Task 6 greps source before deleting; KEEP selectors still referenced by Plan-5 components.
