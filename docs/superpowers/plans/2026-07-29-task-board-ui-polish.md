# Task Board UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine Task Board card hierarchy and simplify Task Detail into a Notion-like continuous document without changing task data or interaction behavior.

**Architecture:** Keep the existing Next.js App Router, client-side Supabase orchestration, task-domain types, and global semantic CSS system. Make small presentational changes in `TaskCard`, remove redundant board creation surfaces and sync copy, then replace decorative Task Detail dividers with spacing; protect each change with focused DOM and CSS contract tests before running full rendered QA.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript 5, Supabase JS 2.110.0, global CSS, Vitest 4.1.10, Testing Library, Playwright for rendered QA

## Global Constraints

- Work only in `/home/yubaifeng/e84381970/projects/triton-board/.worktrees/task-board-ui-polish` on `feat/task-board-ui-polish`.
- Use Node 24.18.0 from `.nvmrc`. In this workspace, run npm through `/tmp/node-v24.18.0-linux-arm64/bin/npm` with that directory first on `PATH`.
- Read and follow `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` before writing code. Keep global CSS imported only from `app/layout.tsx`; do not add or reorder stylesheet imports.
- Before implementation, invoke the `superdesign` skill and complete its existing-UI fidelity gate for the Task Board and Task Detail. Code starts only after the user approves the canvas direction.
- Do not add a package, CSS framework, icon library, font, database migration, API route, or theme token.
- Keep Realtime reconciliation, Quick edit, Owner mutations, Activity, Experiments, Attachments, routing, error handling, and the global `New task` flow unchanged.
- Type must remain visible text. Assigned Type uses existing accent tokens; `No type` uses existing neutral surface/text tokens.
- Owner and updated time share one card footer row. When grouped by Type, Status appears immediately before updated time.
- Remove every per-column `Add task` control and the board sync sentence. Keep the global `New task` control.
- Task Detail hierarchy comes from 40px section spacing and headings. Preserve borders inside tables, inputs, menus, attachment items, and experiment records.
- Use TDD for each implementation task: failing focused test, observed failure, minimal implementation, passing focused test, then commit.
- Preserve unrelated files and generated credentials. Never print `.env.local`, the team password, or Supabase session data.
- Browser plugin classification is `Absent`; rendered validation uses regular Playwright and records that fallback reason.
- Baseline at commit `eb20896`: 54 test files and 1031 tests pass.

## File Structure

### Files modified together

- `components/tasks/TaskCard.tsx` — card heading and footer semantic structure.
- `components/tasks/__tests__/TaskCard.test.tsx` — DOM-order, neutral Type, footer, and Status regression coverage.
- `components/tasks/TaskBoardView.tsx` — Status/Type groups and cards, without per-column creation.
- `components/Board.tsx` — global creation flow and board content, without sync-note derivation or copy.
- `components/__tests__/Board.test.tsx` — global creation, grouping, empty-board, and removed-copy contracts.
- `app/globals.css` — Type treatment, card metadata layout, two-row columns, and divider-free Task Detail rhythm.
- `app/__tests__/workspace-styles.test.ts` — structural CSS contracts for card metadata, columns, and Task Detail spacing.

### No new runtime files

No component, hook, type, route, data adapter, or dependency is added. Temporary Superdesign and Playwright artifacts follow their skills and remain outside runtime source.

---

### Task 1: Put Type Before the Task Title and Consolidate Card Metadata

**Files:**

- Modify: `components/tasks/TaskCard.tsx:129-223`
- Modify: `components/tasks/__tests__/TaskCard.test.tsx:1-214`
- Modify: `app/globals.css:1690-1836`
- Modify: `app/__tests__/workspace-styles.test.ts`

**Interfaces:**

- Consumes: existing `TaskCardProps`, `TaskModel`, `TaskType`, `OwnerAvatar`, `StatusDot`, `relTime`.
- Produces: `.task-card-heading`, `.task-card-type.is-empty`, and `.task-card-meta` DOM/style hooks. The heading stacks Type above Title while the existing menu remains aligned to the Type line. `TaskCardProps` stays unchanged.

- [ ] **Step 1: Write failing DOM-order and footer tests**

Add `within` to the Testing Library import in
`components/tasks/__tests__/TaskCard.test.tsx`, then add these tests inside the
existing `describe("TaskCard", ...)` block:

```tsx
it("places Type above the title and keeps freshness in the footer", () => {
  render(
    <TaskCard
      task={task}
      type={taskType}
      types={[taskType]}
      members={members}
      showStatus
      onPatch={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
    />,
  );

  const card = screen.getByRole("article");
  const heading = card.querySelector(".task-card-heading");
  const typeLabel = within(card).getByText("Kernel");
  const title = within(card).getByRole("link", {
    name: "Validate NPU kernels",
  });
  expect(Array.from(heading?.children ?? [])).toEqual([typeLabel, title]);

  const footer = card.querySelector(".task-card-foot");
  const metadata = card.querySelector(".task-card-meta");
  const updated = within(card).getByText(/^Updated /);
  expect(footer?.contains(metadata)).toBe(true);
  expect(metadata?.contains(updated)).toBe(true);
  expect(within(metadata as HTMLElement).getByText("To do")).toBeDefined();
});

it("renders an unassigned Type with the neutral treatment hook", () => {
  render(
    <TaskCard
      task={{ ...task, typeId: null }}
      type={null}
      types={[taskType]}
      members={members}
      showStatus={false}
      onPatch={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
    />,
  );

  expect(screen.getByText("No type").classList.contains("is-empty")).toBe(true);
});
```

- [ ] **Step 2: Write failing CSS contracts**

Add this test to `app/__tests__/workspace-styles.test.ts`:

```ts
it("uses a compact two-line Type-first heading and one metadata row", () => {
  const heading = ruleBody(globals, ".task-card-heading");
  expect(heading).toMatch(/display\s*:\s*grid/);
  expect(heading).toMatch(/min-width\s*:\s*0/);
  expect(heading).toMatch(/gap\s*:\s*4px/);

  const type = ruleBody(globals, ".task-card-type");
  expect(type).toMatch(
    /max-width\s*:\s*min\(112px,\s*40%\)/,
  );
  expect(type).toMatch(/font-variant-caps\s*:\s*all-small-caps/);
  expect(type).toMatch(/background\s*:\s*var\(--accent-subtle\)/);
  expect(type).toMatch(/text-overflow\s*:\s*ellipsis/);

  const emptyType = ruleBody(globals, ".task-card-type.is-empty");
  expect(emptyType).toMatch(/background\s*:\s*var\(--surface-hover\)/);
  expect(emptyType).toMatch(/color\s*:\s*var\(--text-tertiary\)/);

  const metadata = ruleBody(globals, ".task-card-meta");
  expect(metadata).toMatch(/display\s*:\s*flex/);
  expect(metadata).toMatch(/margin-left\s*:\s*auto/);
  expect(metadata).toMatch(/flex\s*:\s*0\s+0\s+auto/);

  const updated = ruleBody(globals, ".task-card-updated");
  expect(updated).toMatch(/margin\s*:\s*0/);
  expect(updated).toMatch(/white-space\s*:\s*nowrap/);
});
```

- [ ] **Step 3: Run the focused tests and observe failure**

Run:

```bash
env PATH=/tmp/node-v24.18.0-linux-arm64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /tmp/node-v24.18.0-linux-arm64/bin/npm test -- components/tasks/__tests__/TaskCard.test.tsx app/__tests__/workspace-styles.test.ts
```

Expected: FAIL because `.task-card-heading`, `.task-card-meta`, and
`.task-card-type.is-empty` do not exist, and updated time is outside the footer.

- [ ] **Step 4: Implement the Type-first heading and shared footer**

Replace the heading portion in `TaskCard.tsx` with:

```tsx
<div className="task-card-head">
  <div className="task-card-heading">
    <span
      className={`task-card-type ${type ? "" : "is-empty"}`}
      title={type?.name ?? "No type"}
    >
      {type?.name ?? "No type"}
    </span>
    <Link href={`/task/${task.id}`} className="task-card-title">
      {task.title}
    </Link>
  </div>
  <div className="task-card-menu" ref={actionsRef}>
    <button
      ref={triggerRef}
      type="button"
      className="icon-btn task-actions-trigger"
      aria-label={`Actions for ${task.title}`}
      aria-expanded={menuOpen}
      aria-controls={actionsId}
      onClick={() => setMenuOpen((current) => !current)}
    >
      <Icon name="more" size={18} />
    </button>
    {menuOpen ? (
      <div
        id={actionsId}
        className="task-actions-menu"
        role="group"
        aria-label={`Actions for ${task.title}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeActionsAndRestoreFocus();
          }
        }}
      >
        <button
          ref={firstActionRef}
          type="button"
          aria-label={`Quick edit ${task.title}`}
          onClick={() => {
            setEditing(true);
            setMenuOpen(false);
          }}
        >
          Quick edit
        </button>
        <button
          type="button"
          className="danger-action"
          aria-label={`Delete ${task.title}`}
          onClick={() => void deleteFromActions()}
        >
          Delete
        </button>
      </div>
    ) : null}
  </div>
</div>
```

Remove the old standalone `.task-card-type` element. Replace the footer and
standalone timestamp with:

```tsx
<div className="task-card-foot">
  <div className="task-card-owners">
    {task.owners.map((owner) => {
      const member = members.find((item) => item.name === owner);
      return (
        <OwnerAvatar
          key={owner}
          name={owner}
          initials={member?.initials}
          size={26}
        />
      );
    })}
    {task.owners.length === 0 ? (
      <span className="no-owner">No owner yet</span>
    ) : null}
  </div>
  <div className="task-card-meta">
    {showStatus ? (
      <StatusDot status={task.status} label={statusLabel(task.status)} />
    ) : null}
    <time className="task-card-updated" dateTime={task.updated_at}>
      Updated {relTime(task.updated_at)}
    </time>
  </div>
</div>
```

Update the matching rules in `app/globals.css`:

```css
.task-card-heading {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 4px;
}
.task-card-type {
  max-width: min(112px, 40%);
  flex: 0 1 auto;
  overflow: hidden;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent-subtle);
  color: var(--accent-foreground);
  font-family: var(--sans);
  font-size: 11px;
  font-variant-caps: all-small-caps;
  font-weight: 650;
  letter-spacing: 0.065em;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-card-type.is-empty {
  background: var(--surface-hover);
  color: var(--text-tertiary);
}
.task-card-meta {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
}
.task-card-updated {
  display: block;
  margin: 0;
  color: var(--text-tertiary);
  font-family: var(--mono);
  font-size: 10px;
  white-space: nowrap;
}
```

Keep `.task-card-title { min-width: 0; flex: 1; }`, Owner overlap, hover,
focus, quick-edit, and action-menu rules unchanged. Because the menu remains a
sibling of `.task-card-heading` inside `.task-card-head`, it stays right-aligned
with the Type line while the title occupies the second line.

- [ ] **Step 5: Run focused tests**

Run the same command from Step 3.

Expected: both test files PASS with no TaskCard accessibility or focus
regressions.

- [ ] **Step 6: Commit Task Card changes**

```bash
git add components/tasks/TaskCard.tsx components/tasks/__tests__/TaskCard.test.tsx app/globals.css app/__tests__/workspace-styles.test.ts
git commit -m "feat: refine task card metadata"
```

---

### Task 2: Remove Per-Column Creation and Board Sync Copy

**Files:**

- Modify: `components/tasks/TaskBoardView.tsx:1-128`
- Modify: `components/Board.tsx:1-690`
- Modify: `components/__tests__/Board.test.tsx`
- Modify: `app/globals.css:1837-1985`
- Modify: `app/__tests__/workspace-styles.test.ts`

**Interfaces:**

- Consumes: the existing global `New task` button and `AddTaskDrawer` defaults.
- Produces: `TaskBoardViewProps` without `onOpenCreate`; task columns with two grid rows (`header`, `cards`).

- [ ] **Step 1: Replace column-default tests with the global creation contract**

Replace the current Board test named
`"groups by Status or Type, including No type, and carries column defaults"`
with:

```tsx
it("groups by Status or Type and keeps one global creation entry point", async () => {
  await renderLoadedBoard();

  expect(screen.queryByRole("button", { name: /^Add task to / })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "New task" }));
  expect(screen.getByRole("dialog", { name: "Create task" })).toBeDefined();
  expect(screen.getByLabelText("Status")).toHaveProperty("value", "todo");
  expect(screen.getByLabelText("Type")).toHaveProperty("value", "");
  fireEvent.click(screen.getByRole("button", { name: "Close create task" }));

  fireEvent.change(screen.getByLabelText("Group by"), {
    target: { value: "type" },
  });
  expect(screen.getByRole("heading", { name: "Kernel" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Research" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "No type" })).toBeDefined();
  expect(
    screen.getByRole("link", { name: "Triage shared failures" })
      .closest(".task-card")?.textContent,
  ).toContain("Blocked");
  expect(screen.queryByRole("button", { name: /^Add task to / })).toBeNull();
});
```

In the test named `"uses the exact generic Status columns and four approved
views"`, add:

```tsx
expect(screen.getByRole("button", { name: "New task" })).toBeDefined();
expect(screen.queryByText(/Live updates enabled/i)).toBeNull();
expect(screen.queryByText(/authoritative rows refreshed/i)).toBeNull();
```

In `"renders concise empty states for Types, Ownership, and Team"`, replace:

```tsx
await screen.findByRole("button", { name: "Add task to To do" });
```

with:

```tsx
await screen.findByRole("heading", { name: "To do" });
expect(screen.getByRole("button", { name: "New task" })).toBeDefined();
```

- [ ] **Step 2: Add failing two-row column CSS contracts**

In the existing style test
`"pins the desktop Task Board and gives every column a hidden independent
scrollbar"`, change the column assertion to:

```ts
expect(column).toMatch(
  /grid-template-rows\s*:\s*auto\s+minmax\(0,\s*1fr\)/,
);
expect(column).not.toMatch(
  /grid-template-rows\s*:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/,
);
expect(globals).not.toMatch(/\.column-add-task\s*\{/);
expect(globals).not.toMatch(/\.board-sync-note\s*\{/);
```

- [ ] **Step 3: Run focused tests and observe failure**

Run:

```bash
env PATH=/tmp/node-v24.18.0-linux-arm64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /tmp/node-v24.18.0-linux-arm64/bin/npm test -- components/__tests__/Board.test.tsx app/__tests__/workspace-styles.test.ts
```

Expected: FAIL because per-column buttons and sync copy still render, the
column grid still reserves a footer row, and their CSS rules still exist.

- [ ] **Step 4: Remove the redundant board interfaces and markup**

In `TaskBoardView.tsx`:

- Remove `onOpenCreate` from `TaskBoardViewProps`.
- Remove it from the component destructuring.
- Delete the complete `<button className="column-add-task">` block.
- Keep `Status` imported because `TaskGroup.status` still uses it.

The resulting prop interface is:

```ts
export interface TaskBoardViewProps {
  tasks: TaskModel[];
  types: TaskType[];
  members: Member[];
  groupBy: GroupBy;
  onPatchTask(id: string, patch: TaskPatch): Promise<void>;
  onDeleteTask(id: string): Promise<void>;
}
```

In `Board.tsx`:

- Remove `useMemo` from the React import.
- Delete the `lastUpdated` memo.
- Delete the `onOpenCreate` prop passed to `TaskBoardView`.
- Delete the complete `board-sync-note` paragraph.
- Keep `createDefaults`, because the global `New task` button resets it to
  `{}` before opening `AddTaskDrawer`.

- [ ] **Step 5: Remove obsolete CSS and use a two-row desktop column**

In `app/globals.css`:

- Delete `.column-add-task`, its hover rule, and its child-span rule.
- Delete `.board-sync-note`.
- Remove `.board-sync-note` from desktop flex selectors and delete its desktop
  margin rule.
- Change the desktop task-column layout to:

```css
.board-page[data-view="board"] .task-column {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
```

- [ ] **Step 6: Run focused tests**

Run the same command from Step 3.

Expected: both files PASS; Status/Type grouping and global `New task` continue
to work.

- [ ] **Step 7: Commit board simplification**

```bash
git add components/tasks/TaskBoardView.tsx components/Board.tsx components/__tests__/Board.test.tsx app/globals.css app/__tests__/workspace-styles.test.ts
git commit -m "refactor: simplify task creation surfaces"
```

---

### Task 3: Replace Task Detail Dividers with Notion-Like Spacing

**Files:**

- Modify: `app/globals.css:2490-2640`
- Modify: `app/__tests__/workspace-styles.test.ts`
- Test: `components/__tests__/TaskDetail.test.tsx`

**Interfaces:**

- Consumes: existing `.task-properties`, `.task-property`,
  `.task-detail-page .record-section`, and
  `.task-detail-page .task-experiments-section` markup.
- Produces: the same Task Detail landmarks and controls with border-free
  property/section layout and a fixed 40px section rhythm.

- [ ] **Step 1: Add a failing divider-free Task Detail style test**

Add this test to `app/__tests__/workspace-styles.test.ts`:

```ts
it("uses whitespace instead of decorative Task Detail dividers", () => {
  const properties = ruleBody(globals, ".task-properties");
  expect(properties).toMatch(/border\s*:\s*0/);
  expect(properties).not.toMatch(/border-block\s*:\s*1px/);

  const property = ruleBody(globals, ".task-property");
  expect(property).toMatch(/border\s*:\s*0/);
  expect(property).not.toMatch(/border-bottom\s*:\s*1px/);

  const sections = ruleBody(
    globals,
    ".task-detail-page .record-section,\n"
      + ".task-detail-page .task-experiments-section",
  );
  expect(sections).toMatch(/margin\s*:\s*40px\s+0\s+0/);
  expect(sections).toMatch(/padding\s*:\s*0/);
  expect(sections).toMatch(/border\s*:\s*0/);

  expect(ruleBody(globals, ".task-detail-page .attachment-gallery"))
    .toMatch(/border-top\s*:\s*0/);
});
```

- [ ] **Step 2: Run style and Task Detail tests and observe failure**

Run:

```bash
env PATH=/tmp/node-v24.18.0-linux-arm64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /tmp/node-v24.18.0-linux-arm64/bin/npm test -- app/__tests__/workspace-styles.test.ts components/__tests__/TaskDetail.test.tsx
```

Expected: the CSS contract test FAILS on property and section borders; existing
Task Detail behavior tests remain green.

- [ ] **Step 3: Implement the continuous document rhythm**

Change the relevant `app/globals.css` rules to:

```css
.task-properties {
  width: min(880px, 100%);
  max-width: none;
  margin: 18px auto 0;
  padding: 0;
  border: 0;
}
.task-property {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  align-items: center;
  gap: 18px;
  min-width: 0;
  min-height: 48px;
  margin: 0;
  padding: 7px 2px;
  border: 0;
}
.task-detail-page .record-section,
.task-detail-page .task-experiments-section {
  margin: 40px 0 0;
  padding: 0;
  border: 0;
}
```

Delete the now-redundant `.task-property:last-child` rule. Keep property
control hover/focus styles, section heading styles, attachment-gallery reset,
experiment table borders, and mobile label/value columns unchanged.

- [ ] **Step 4: Run focused tests**

Run the same command from Step 2.

Expected: style and Task Detail test files PASS.

- [ ] **Step 5: Commit Task Detail styling**

```bash
git add app/globals.css app/__tests__/workspace-styles.test.ts
git commit -m "style: soften task detail dividers"
```

---

### Task 4: Full Verification and Rendered QA

**Files:**

- Verify: all files changed in Tasks 1–3
- Temporary only: `/tmp/task-board-ui-polish-qa.*`
- No committed screenshot, trace, report, or Playwright dependency

**Interfaces:**

- Consumes: completed UI changes and the existing authenticated local app.
- Produces: test/build evidence plus desktop/mobile, light/dark, and interaction evidence.

- [ ] **Step 1: Run the React/Next.js review skill**

Invoke `build-web-apps:react-best-practices` after the TSX edits. Apply only
findings relevant to changed code. If it requires a correction, add a focused
regression test, rerun the owning task’s focused command, and commit with:

```bash
git commit -am "fix: address task board UI review"
```

- [ ] **Step 2: Run the full test suite**

Run:

```bash
env PATH=/tmp/node-v24.18.0-linux-arm64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /tmp/node-v24.18.0-linux-arm64/bin/npm test
```

Expected: 54 test files and at least 1031 tests PASS with zero failures.

- [ ] **Step 3: Run the production build**

Run:

```bash
env PATH=/tmp/node-v24.18.0-linux-arm64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /tmp/node-v24.18.0-linux-arm64/bin/npm run build
```

Expected: Next.js 16.2.10 completes a production build with `/` and
`/task/[id]` emitted and no CSS-order or TypeScript error.

- [ ] **Step 4: Start the exact local target**

If this worktree has no `.env.local`, create an untracked symlink to the
existing root file without reading or printing it:

```bash
ln -s ../../.env.local .env.local
```

Start:

```bash
env PATH=/tmp/node-v24.18.0-linux-arm64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /tmp/node-v24.18.0-linux-arm64/bin/npm run dev -- --hostname 127.0.0.1 --port 3000
```

The flow under test is: `/` → inspect two-line Type-first cards and open global
`New task` → close the drawer → open one task → inspect divider-free Task
Detail.

- [ ] **Step 5: Run frontend rendered QA**

Invoke `build-web-apps:frontend-testing-debugging`. Record
`Browser plugin not available`, then use regular Playwright without adding a
repository dependency.

At `1440×1000` and `390×844`, verify:

- page URL/title and meaningful board content;
- no Next.js error overlay;
- no relevant console error or warning;
- assigned Type is before its title and `No type` is neutral;
- Owner and updated time share a row without overlap;
- Type-grouped cards show Status before updated time;
- no per-column `Add task` and no sync sentence;
- global `New task` opens and closes the existing drawer;
- Task Detail property rows and Description/Experiments/Attachments use
  whitespace rather than horizontal rules;
- internal tables, fields, menus, and attachment items keep their borders;
- light and dark themes both remain readable;
- long titles/types and mobile cards do not clip or cause page-level
  horizontal scroll.

Save screenshots only under `/tmp`. If no authenticated browser session is
available, do not request, log, or invent the team password; report the
authenticated rendered flow as the remaining blocker and retain automated
test/build evidence.

- [ ] **Step 6: Run completion verification**

Invoke `superpowers:verification-before-completion`, then run:

```bash
git diff --check
git status --short --branch
git log --oneline dashboard/main..HEAD
```

Expected: no whitespace errors; only intentional commits are ahead of
`dashboard/main`; runtime source has no uncommitted changes. The untracked
`.env.local` symlink is ignored by the repository.

- [ ] **Step 7: Report**

Report:

- user-visible card, board, and detail changes;
- focused/full test and build results;
- URL, viewports, Browser-plugin fallback, console/overlay checks, and exact
  interaction exercised;
- screenshot paths or displayed evidence;
- any remaining authenticated-session limitation;
- changed-file links and commit list.
