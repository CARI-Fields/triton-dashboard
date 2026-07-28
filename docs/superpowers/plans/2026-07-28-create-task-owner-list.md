# Create Task Owner List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Create Task owners one per row and truncate names that exceed the available drawer width.

**Architecture:** Keep the existing `AddTaskDrawer` checkbox-label interaction and data flow. Add one dedicated name element for styling and change only the Owner field's layout rules in the shared workspace stylesheet; no member or task schema changes are required.

**Tech Stack:** Next.js 16.2.10, React 19, TypeScript, CSS, Vitest, Testing Library, Node 24.18.0.

## Global Constraints

- Scope is limited to the Owner field in `AddTaskDrawer`.
- Keep multi-owner selection, selected styling, dark theme, focus behavior, and narrow 44px targets unchanged.
- Show exactly one Owner per row.
- Keep each name on one line and truncate overflow with an ellipsis.
- Preserve the complete name in both the checkbox accessible name and a native tooltip.
- Do not add dependencies or modify database/schema code.

---

### Task 1: Create Task Owner Rows

**Files:**

- Modify: `components/tasks/AddTaskDrawer.tsx:379-409`
- Modify: `components/tasks/__tests__/AddTaskDrawer.test.tsx`
- Modify: `app/globals.css:1987-2012`
- Modify: `app/__tests__/workspace-styles.test.ts`

**Interfaces:**

- Consumes: `Member.name`, `Member.initials`, the existing
  `draft.owners: string[]`, and `updateDraft("owners", string[])`.
- Produces: `.owner-option-name`, a single-column `.owner-options` grid, and
  unchanged checkbox-based multi-owner selection.

- [ ] **Step 1: Write the failing component test**

Add a deliberately long member and assert that the complete name is retained
in the checkbox and the dedicated name element:

```tsx
it("preserves the full accessible name for a visually truncatable Owner", () => {
  const longName = "Alexandria Cassandra Montgomery-Wellington";
  render(
    <AddTaskDrawer
      open
      types={types}
      members={[{
        id: "member-long",
        name: longName,
        initials: "AM",
        position: 0,
        created_at: "2026-07-28T00:00:00.000Z",
      }]}
      onClose={vi.fn()}
      onCreate={vi.fn().mockResolvedValue(undefined)}
      onCreateType={vi.fn().mockResolvedValue("type-kernel")}
    />,
  );

  const checkbox = screen.getByRole("checkbox", { name: longName });
  const name = checkbox.closest(".owner-option")
    ?.querySelector(".owner-option-name");
  expect(name?.textContent).toBe(longName);
  expect(name?.getAttribute("title")).toBe(longName);
});
```

- [ ] **Step 2: Write the failing CSS contract test**

Add a workspace style contract that describes the final cascade:

```ts
it("renders Create Task owners one per row and ellipsizes long names", () => {
  expect(ruleBody(globals, ".owner-options")).toMatch(
    /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/,
  );
  expect(ruleBody(globals, ".owner-option")).toMatch(/width\s*:\s*100%/);
  expect(ruleBody(globals, ".owner-option input")).toMatch(
    /flex\s*:\s*0\s+0\s+auto/,
  );
  expect(ruleBody(globals, ".owner-option .owner-avatar")).toMatch(
    /flex\s*:\s*0\s+0\s+auto/,
  );

  const name = ruleBody(globals, ".owner-option-name");
  expect(name).toMatch(/flex\s*:\s*1\s+1\s+auto/);
  expect(name).toMatch(/min-width\s*:\s*0/);
  expect(name).toMatch(/overflow\s*:\s*hidden/);
  expect(name).toMatch(/text-overflow\s*:\s*ellipsis/);
  expect(name).toMatch(/white-space\s*:\s*nowrap/);
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
export NVM_DIR="/home/yubaifeng/.config/nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24.18.0
npx vitest run components/tasks/__tests__/AddTaskDrawer.test.tsx app/__tests__/workspace-styles.test.ts
```

Expected: the component test fails because `.owner-option-name` does not exist,
and the style test fails because the Owner grid still has two columns and no
ellipsis rule.

- [ ] **Step 4: Implement the minimal component markup**

Replace the unclassified name span in `AddTaskDrawer`:

```tsx
<span className="owner-option-name" title={member.name}>
  {member.name}
</span>
```

Keep the existing checkbox `aria-label={member.name}` and selection handler
unchanged.

- [ ] **Step 5: Implement the minimal layout rules**

Update the existing Owner rules in `app/globals.css`:

```css
.owner-options {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
}
.owner-option {
  display: flex;
  width: 100%;
  min-width: 0;
}
.owner-option input,
.owner-option .owner-avatar {
  flex: 0 0 auto;
}
.owner-option-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Retain the existing padding, border, selected state, colors, typography, and
checkbox sizing declarations.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run components/tasks/__tests__/AddTaskDrawer.test.tsx app/__tests__/workspace-styles.test.ts
```

Expected: both test files pass, including existing multi-owner submission
coverage.

- [ ] **Step 7: Run the full automated verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all tests pass, the Next.js production build exits `0`, and
`git diff --check` prints no output.

- [ ] **Step 8: Verify the rendered drawer**

Using a temporary local Supabase fixture with the owner name
`Alexandria Cassandra Montgomery-Wellington`, open Create Task and verify:

```text
Desktop Light: one full-width Owner row; no second column.
Desktop Dark: selected/unselected semantics remain readable.
390px Dark: row and drawer do not create root horizontal overflow.
Long name: one line with visible ellipsis.
Hover/focus: full name remains available through title/accessible name.
Interaction: clicking the row still toggles the checkbox.
```

Capture one desktop and one 390px screenshot and inspect both at original
resolution.

- [ ] **Step 9: Commit**

```bash
git add \
  components/tasks/AddTaskDrawer.tsx \
  components/tasks/__tests__/AddTaskDrawer.test.tsx \
  app/globals.css \
  app/__tests__/workspace-styles.test.ts
git commit -m "fix: stack create task owners"
```
