# Owner Picker and Fixed Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace expanded Owner lists with one shared selected-only picker, rename the light appearance to Default, and make the desktop content column the only page-level vertical scroller.

**Architecture:** A controlled client-side `OwnerPicker` owns only disclosure, focus, and create-form state; `Board` and `TaskDetail` retain Supabase writes and pass back authoritative `Member` rows. Existing Create Task draft state and Task Detail Owner coordination remain the source of selected names. Global shell CSS establishes a viewport-height desktop grid with an independently scrolling `.app-content`, while the existing mobile media query restores document scrolling.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4 client components, TypeScript, Supabase JS 2.110.0, Vitest 4.1.10, Testing Library, global CSS.

## Global Constraints

- Use Node.js `24.18.0`; do not install or update dependencies.
- Read and follow `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`, and `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`.
- The visible light-theme copy becomes `Default` / `Default theme`, but the internal value, root attribute, color scheme, and storage value remain `light`.
- Create Task and Task Detail render selected Owners only when the picker is closed.
- `Add owner` supports choosing an unselected Team member or creating a Team member and immediately selecting it.
- Member names are trimmed and matched case-insensitively before insert.
- Do not change the database schema, Team view layout, Dark theme tokens, or mobile navigation design.
- Preserve Task Detail's cumulative optimistic Owner coordinator, failure rollback, and activity logging.
- Use existing global CSS import order; do not introduce component CSS imports or a new styling dependency.
- Follow strict RED → GREEN TDD for every production change.

---

### Task 1: Shared Member Identity Helpers and Owner Picker

**Files:**
- Create: `lib/members.ts`
- Create: `components/tasks/OwnerPicker.tsx`
- Create: `components/tasks/__tests__/OwnerPicker.test.tsx`
- Modify: `app/globals.css`
- Modify: `app/__tests__/workspace-styles.test.ts`

**Interfaces:**
- Consumes: `Member` from `lib/types.ts` and `OwnerAvatar` from `components/ui/OwnerAvatar.tsx`.
- Produces:

```ts
export function memberNameKey(value: string): string;
export function findMemberByName(
  members: Member[],
  value: string,
): Member | undefined;
export function initialsFromName(name: string): string;

export interface OwnerPickerProps {
  members: Member[];
  owners: string[];
  onChange: (owners: string[]) => void;
  onCreateOwner: (name: string) => Promise<Member>;
  disabled?: boolean;
}
```

- `OwnerPicker` remains a Client Component boundary because it owns state,
  effects, focus, and pointer/keyboard handlers.

- [ ] **Step 1: Write failing helper and picker behavior tests**

Create `components/tasks/__tests__/OwnerPicker.test.tsx` with literal Team fixtures and
a controlled harness:

```tsx
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OwnerPicker from "@/components/tasks/OwnerPicker";
import {
  findMemberByName,
  initialsFromName,
  memberNameKey,
} from "@/lib/members";
import type { Member } from "@/lib/types";

const maya: Member = {
  id: "member-maya",
  name: "Maya",
  initials: "MY",
  position: 0,
  created_at: "2026-07-28T00:00:00.000Z",
};
const theo: Member = {
  ...maya,
  id: "member-theo",
  name: "Theo",
  initials: "TK",
  position: 1,
};

function Harness({
  initialOwners = ["Maya"],
  onCreateOwner = vi.fn().mockResolvedValue({
    ...theo,
    id: "member-nova",
    name: "Nova",
    initials: "N",
  }),
  onChange = vi.fn(),
}: {
  initialOwners?: string[];
  onCreateOwner?: (name: string) => Promise<Member>;
  onChange?: (owners: string[]) => void;
}) {
  const [owners, setOwners] = useState(initialOwners);
  return (
    <OwnerPicker
      members={[maya, theo]}
      owners={owners}
      onCreateOwner={onCreateOwner}
      onChange={(next) => {
        onChange(next);
        setOwners(next);
      }}
    />
  );
}

afterEach(cleanup);

describe("member identity helpers", () => {
  it("normalizes names without changing display copy", () => {
    expect(memberNameKey("  MAYA  ")).toBe("maya");
    expect(findMemberByName([maya], " maya ")).toBe(maya);
    expect(initialsFromName("Alexandria Montgomery")).toBe("AM");
  });
});

describe("OwnerPicker", () => {
  it("shows selected Owners only until Add owner opens", () => {
    render(<Harness />);
    expect(screen.getByText("Maya")).toBeDefined();
    expect(screen.queryByText("Theo")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    const panel = screen.getByRole("dialog", { name: "Add owner" });
    expect(within(panel).getByRole("button", { name: "Add Theo" }))
      .toBeDefined();
    expect(within(panel).queryByRole("button", { name: "Add Maya" }))
      .toBeNull();
  });

  it("removes a selected Owner and adds an existing member", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Maya" }));
    expect(onChange).toHaveBeenLastCalledWith([]);

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Theo" }));
    expect(onChange).toHaveBeenLastCalledWith(["Theo"]);
    expect(screen.queryByRole("dialog", { name: "Add owner" })).toBeNull();
  });

  it("creates a unique member and immediately selects the returned row", async () => {
    const nova: Member = {
      ...theo,
      id: "member-nova",
      name: "Nova",
      initials: "N",
    };
    const onCreateOwner = vi.fn().mockResolvedValue(nova);
    const onChange = vi.fn();
    render(
      <Harness
        initialOwners={[]}
        onCreateOwner={onCreateOwner}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: "  Nova  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create owner" }));

    await waitFor(() => expect(onCreateOwner).toHaveBeenCalledWith("Nova"));
    expect(onChange).toHaveBeenLastCalledWith(["Nova"]);
    expect(screen.getByText("Nova")).toBeDefined();
  });

  it("reuses a case-insensitive existing member without inserting", () => {
    const onCreateOwner = vi.fn();
    const onChange = vi.fn();
    render(
      <Harness
        initialOwners={[]}
        onCreateOwner={onCreateOwner}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: " tHeO " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create owner" }));

    expect(onCreateOwner).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(["Theo"]);
  });

  it("retains a failed create draft and leaves selection unchanged", async () => {
    const onCreateOwner = vi.fn().mockRejectedValue(new Error("Save failed."));
    const onChange = vi.fn();
    render(
      <Harness
        initialOwners={[]}
        onCreateOwner={onCreateOwner}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
    fireEvent.change(screen.getByLabelText("New owner name"), {
      target: { value: "Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create owner" }));

    await waitFor(() => expect(onCreateOwner).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog", { name: "Add owner" })).toBeDefined();
    expect(screen.getByLabelText("New owner name")).toHaveProperty(
      "value",
      "Nova",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on Escape or outside pointer input and restores trigger focus", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Add owner" });
    fireEvent.click(trigger);
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByLabelText("New owner name"),
    ));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Add owner" })).toBeNull();
  });
});
```

Extend the existing CSS contract test so it asserts `.owner-picker-panel` is
anchored, selected Chip names can ellipsize, and the prior `.owner-options`
one-column contract is removed.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
export NVM_DIR="/home/yubaifeng/.config/nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24.18.0
npm test -- components/tasks/__tests__/OwnerPicker.test.tsx app/__tests__/workspace-styles.test.ts
```

Expected: FAIL because `lib/members.ts`, `components/tasks/OwnerPicker.tsx`,
and the new picker CSS do not exist.

- [ ] **Step 3: Implement the member helpers**

Create `lib/members.ts`:

```ts
import type { Member } from "@/lib/types";

export function memberNameKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function findMemberByName(
  members: Member[],
  value: string,
): Member | undefined {
  const key = memberNameKey(value);
  return members.find((member) => memberNameKey(member.name) === key);
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    return (Array.from(parts[0])[0] ?? "?").toUpperCase();
  }
  const first = Array.from(parts[0])[0] ?? "";
  const last = Array.from(parts[parts.length - 1])[0] ?? "";
  return `${first}${last}`.toUpperCase() || "?";
}
```

- [ ] **Step 4: Implement the controlled Owner picker**

Create `components/tasks/OwnerPicker.tsx` as a Client Component. Use one root
ref, one trigger ref, and one input ref. The key state and handlers are:

```tsx
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import OwnerAvatar from "@/components/ui/OwnerAvatar";
import { findMemberByName } from "@/lib/members";
import type { Member } from "@/lib/types";

export interface OwnerPickerProps {
  members: Member[];
  owners: string[];
  onChange: (owners: string[]) => void;
  onCreateOwner: (name: string) => Promise<Member>;
  disabled?: boolean;
}

export default function OwnerPicker({
  members,
  owners,
  onChange,
  onCreateOwner,
  disabled = false,
}: OwnerPickerProps) {
  const [open, setOpen] = useState(false);
  const [newOwnerName, setNewOwnerName] = useState("");
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ownerKeys = useMemo(
    () => new Set(owners.map((name) => name.trim().toLocaleLowerCase())),
    [owners],
  );
  const availableMembers = members.filter(
    (member) => !ownerKeys.has(member.name.trim().toLocaleLowerCase()),
  );

  function closePanel(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) {
      queueMicrotask(() => triggerRef.current?.focus());
    }
  }

  function selectOwner(name: string) {
    if (!ownerKeys.has(name.trim().toLocaleLowerCase())) {
      onChange([...owners, name]);
    }
    setNewOwnerName("");
    closePanel();
  }

  async function createOwner() {
    const name = newOwnerName.trim();
    if (!name || pending || disabled) return;
    const existing = findMemberByName(members, name);
    if (existing) {
      selectOwner(existing.name);
      return;
    }
    setPending(true);
    try {
      const created = await onCreateOwner(name);
      selectOwner(created.name);
    } catch {
      inputRef.current?.focus();
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const closeOnPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closePanel();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="owner-picker" ref={rootRef}>
      <div className="owner-picker-selected">
        {owners.length === 0 ? (
          <span className="field-help">No owners yet.</span>
        ) : owners.map((name) => {
          const member = findMemberByName(members, name);
          return (
            <span className="selected-owner-chip" key={name}>
              <OwnerAvatar
                name={name}
                initials={member?.initials}
                size={24}
              />
              <span className="selected-owner-name" title={name}>{name}</span>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                disabled={disabled}
                onClick={() => onChange(
                  owners.filter((owner) => owner !== name),
                )}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
      <button
        type="button"
        className="text-action owner-picker-trigger"
        ref={triggerRef}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Add owner
      </button>
      {open ? (
        <div className="owner-picker-panel" role="dialog" aria-label="Add owner">
          <div className="owner-picker-options">
            {availableMembers.length === 0 ? (
              <span className="field-help">Everyone is already added.</span>
            ) : availableMembers.map((member) => (
              <button
                type="button"
                key={member.id}
                aria-label={`Add ${member.name}`}
                onClick={() => selectOwner(member.name)}
              >
                <OwnerAvatar
                  name={member.name}
                  initials={member.initials}
                  size={24}
                />
                <span title={member.name}>{member.name}</span>
              </button>
            ))}
          </div>
          <form
            className="owner-picker-create"
            onSubmit={(event) => {
              event.preventDefault();
              void createOwner();
            }}
          >
            <label htmlFor="new-owner-name">New owner name</label>
            <input
              id="new-owner-name"
              ref={inputRef}
              value={newOwnerName}
              disabled={pending || disabled}
              onChange={(event) => setNewOwnerName(event.target.value)}
            />
            <button
              type="submit"
              className="btn"
              disabled={!newOwnerName.trim() || pending || disabled}
            >
              {pending ? "Creating…" : "Create owner"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
```

Use `useId()` instead of the literal input id shown above so both task surfaces
can coexist without duplicate DOM ids. Keep the exact accessible label
`New owner name`.

- [ ] **Step 5: Replace obsolete expanded-list CSS with shared picker CSS**

In `app/globals.css`, remove `.owner-options`, `.owner-option`,
`.owner-option-name`, `.task-owner-options`, and their checkbox-specific rules.
Add rules with these exact layout contracts:

```css
.owner-picker {
  position: relative;
  min-width: 0;
}
.owner-picker-selected {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.selected-owner-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 34px;
  padding: 4px 7px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
}
.selected-owner-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selected-owner-chip > button {
  display: inline-grid;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  min-height: 0;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.owner-picker-trigger {
  margin-top: 8px;
}
.owner-picker-panel {
  position: absolute;
  z-index: 35;
  top: calc(100% + 6px);
  left: 0;
  width: min(320px, 100%);
  max-height: min(360px, calc(100dvh - 120px));
  overflow-y: auto;
  padding: 10px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--surface);
  box-shadow: 0 16px 40px rgb(0 0 0 / 16%);
}
.owner-picker-options {
  display: grid;
  gap: 5px;
}
.owner-picker-options > button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 7px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}
.owner-picker-options > button:hover {
  background: var(--surface-hover);
}
.owner-picker-options > button > span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.owner-picker-create {
  display: grid;
  gap: 7px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
```

Keep `.owner-field` and `.task-property-owner` grid placement rules, because
they position the shared picker in their containing forms.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm test -- components/tasks/__tests__/OwnerPicker.test.tsx app/__tests__/workspace-styles.test.ts
```

Expected: both files pass, including focus, outside dismissal, failed create,
selected-only rendering, and picker CSS contracts.

- [ ] **Step 7: Commit Task 1**

```bash
git add lib/members.ts components/tasks/OwnerPicker.tsx \
  components/tasks/__tests__/OwnerPicker.test.tsx app/globals.css \
  app/__tests__/workspace-styles.test.ts
git commit -m "feat: add selected owner picker"
```

---

### Task 2: Create Task Owner Selection and Member Creation

**Files:**
- Modify: `components/tasks/AddTaskDrawer.tsx`
- Modify: `components/tasks/__tests__/AddTaskDrawer.test.tsx`
- Modify: `components/Board.tsx`
- Modify: `components/__tests__/Board.test.tsx`
- Modify: `components/tasks/BoardSecondaryViews.tsx`

**Interfaces:**
- Consumes: `OwnerPicker`, `findMemberByName`, `initialsFromName`, and
  `OwnerPickerProps["onCreateOwner"]` from Task 1.
- Produces: `AddTaskDrawerProps.onCreateOwner(name: string): Promise<Member>`.
- `Board.createMember(rawName)` returns the existing case-insensitive match or
  the authoritative inserted `Member`.

- [ ] **Step 1: Write failing Create Task picker tests**

Update the Add Task test harness to require an Owner creator:

```tsx
interface RenderDrawerOptions {
  onCreate?: (input: NewTaskInput) => Promise<void>;
  onCreateType?: (name: string) => Promise<string>;
  onCreateOwner?: (name: string) => Promise<Member>;
  onClose?: () => void;
  defaults?: {
    status?: NewTaskInput["status"];
    typeId?: string | null;
  };
}
```

Use this default:

```ts
const defaultCreateOwner = vi.fn(async (name: string): Promise<Member> => ({
  id: `member-${name.toLocaleLowerCase()}`,
  name,
  initials: name.slice(0, 1).toUpperCase(),
  position: members.length,
  created_at: "2026-07-28T00:00:00.000Z",
}));
```

Replace checkbox clicks with the approved flow and retain the existing
submission assertion:

```tsx
fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
fireEvent.click(screen.getByRole("button", { name: "Add Maya" }));
fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
fireEvent.click(screen.getByRole("button", { name: "Add Yubai" }));
expect(screen.getByRole("button", { name: "Remove Maya" })).toBeDefined();
expect(screen.getByRole("button", { name: "Remove Yubai" })).toBeDefined();
```

Add a create-and-select test:

```tsx
it("creates a Team Owner and immediately selects it in the task draft", async () => {
  const created: Member = {
    id: "member-nova",
    name: "Nova",
    initials: "N",
    position: 2,
    created_at: "2026-07-28T00:00:00.000Z",
  };
  const onCreateOwner = vi.fn().mockResolvedValue(created);
  renderDrawer({ onCreateOwner });

  fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
  fireEvent.change(screen.getByLabelText("New owner name"), {
    target: { value: "Nova" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create owner" }));

  expect(await screen.findByRole("button", { name: "Remove Nova" }))
    .toBeDefined();
  expect(onCreateOwner).toHaveBeenCalledWith("Nova");
});
```

Update the Board integration test to choose Maya through `Add owner`. Add a
Board test that creates Nova, verifies one successful `members` insert, then
submits the Task and verifies `assignees: ["Nova"]`.

- [ ] **Step 2: Run Create Task and Board tests and verify RED**

Run:

```bash
npm test -- components/tasks/__tests__/AddTaskDrawer.test.tsx \
  components/__tests__/Board.test.tsx
```

Expected: FAIL because `AddTaskDrawer` lacks `onCreateOwner`, still renders
expanded checkboxes, and `Board` does not return inserted Member rows.

- [ ] **Step 3: Replace Add Task's expanded Owner list**

Extend `AddTaskDrawerProps` and destructuring:

```ts
onCreateOwner: (name: string) => Promise<Member>;
```

Replace the Owner field body with:

```tsx
<fieldset className="add-task-field owner-field">
  <legend>Owner</legend>
  <div className="field-control">
    <OwnerPicker
      members={members}
      owners={draft.owners}
      disabled={pending || typePending}
      onCreateOwner={onCreateOwner}
      onChange={(owners) => updateDraft("owners", owners)}
    />
  </div>
</fieldset>
```

Remove the direct `OwnerAvatar` import. Keep draft reset and Task submission
logic unchanged.

- [ ] **Step 4: Return authoritative members from Board**

Import `findMemberByName` and `initialsFromName`, remove the local
`initialsFromName`, and replace `addMember` with:

```ts
const createMember = useCallback(async (rawName: string): Promise<Member> => {
  const name = rawName.trim();
  const existing = findMemberByName(members, name);
  if (existing) return { ...existing };
  if (!name) throw new Error("Owner name is required.");
  if (!supabase) {
    throw await exposeMutationError(
      "add owner",
      new Error("Supabase is not configured."),
    );
  }
  setMutationErrorMsg(null);
  try {
    const result = await supabase
      .from("members")
      .insert({
        name,
        initials: initialsFromName(name),
        position: nextPosition(members),
      })
      .select("*")
      .single();
    if (result.error) throw result.error;
    if (!result.data) {
      throw new Error("Created Owner did not return a row.");
    }
    const created = result.data as Member;
    await reload();
    return { ...created };
  } catch (caught) {
    throw await exposeMutationError("add owner", caught);
  }
}, [exposeMutationError, members, reload]);
```

Wire it without changing Team view behavior. Replace only the
`onAddMember` prop on the existing `BoardSecondaryViews` element and add
`onCreateOwner` to the existing `AddTaskDrawer` element; preserve every other
prop:

```tsx
<BoardSecondaryViews
  onAddMember={async (name) => {
    await createMember(name);
  }}
/>

<AddTaskDrawer
  onCreateOwner={createMember}
/>
```

Update the Board Supabase test builder to remember the select projection. When
`.select("*").single()` follows an insert, return the complete inserted row;
continue returning `{ id }` for `.select("id").single()` so Type and Task tests
keep their current contract.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- components/tasks/__tests__/AddTaskDrawer.test.tsx \
  components/__tests__/Board.test.tsx \
  components/tasks/__tests__/OwnerPicker.test.tsx
```

Expected: all tests pass; Create Task renders selected Chips only, choosing and
creating Owners updates the draft, and submission keeps every selected name.

- [ ] **Step 6: Commit Task 2**

```bash
git add components/tasks/AddTaskDrawer.tsx \
  components/tasks/__tests__/AddTaskDrawer.test.tsx \
  components/Board.tsx components/__tests__/Board.test.tsx \
  components/tasks/BoardSecondaryViews.tsx
git commit -m "feat: use owner picker when creating tasks"
```

---

### Task 3: Task Detail Owner Selection and Member Creation

**Files:**
- Modify: `components/tasks/TaskProperties.tsx`
- Modify: `components/tasks/__tests__/TaskProperties.test.tsx`
- Modify: `components/TaskDetail.tsx`
- Modify: `components/__tests__/TaskDetail.test.tsx`

**Interfaces:**
- Consumes: `OwnerPicker`, `findMemberByName`, and `initialsFromName`.
- Produces: `TaskPropertiesProps.onCreateOwner(name: string): Promise<Member>`.
- Task Detail adds mutation error key `ownerCreate` but keeps `owners` for Task
  patch failures.

- [ ] **Step 1: Write failing Task Properties tests**

Update every `TaskProperties` render with an `onCreateOwner` callback. Replace
the rapid checkbox test with:

```tsx
fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
fireEvent.click(screen.getByRole("button", { name: "Add Maya" }));
fireEvent.click(screen.getByRole("button", { name: "Add owner" }));
fireEvent.click(screen.getByRole("button", { name: "Add Theo" }));

expect(onPatch.mock.calls.map(([patch]) => patch)).toEqual([
  { owners: ["Maya"] },
  { owners: ["Maya", "Theo"] },
]);
expect(screen.getByRole("button", { name: "Remove Maya" })).toBeDefined();
expect(screen.getByRole("button", { name: "Remove Theo" })).toBeDefined();
expect(screen.queryByRole("button", { name: "Add Maya" })).toBeNull();
```

Add a rejected-create test asserting `onPatch` is not called and the create
input remains visible.

In `TaskDetail.test.tsx`, add integration coverage that queues a successful
`members` insert row, chooses Create owner, then queues the existing Owner Task
update/reload sequence and verifies:

```ts
expect(supabaseState.mutations).toContainEqual({
  table: "members",
  kind: "insert",
  payload: expect.objectContaining({
    name: "Nova",
    initials: "N",
  }),
});
expect(taskUpdates()).toContainEqual(expect.objectContaining({
  payload: { assignees: ["Nova"] },
}));
```

Add a failure case that queues `failure("Owner insert failed.")`, then asserts
the mutation alert contains `Could not add owner. Owner insert failed.`, no Task
update is issued, and `New owner name` retains `Nova`.

- [ ] **Step 2: Run Task Detail tests and verify RED**

Run:

```bash
npm test -- components/tasks/__tests__/TaskProperties.test.tsx \
  components/__tests__/TaskDetail.test.tsx
```

Expected: FAIL because `TaskProperties` still renders all-member checkboxes and
neither component accepts a create-Owner callback.

- [ ] **Step 3: Integrate OwnerPicker with Task Properties**

Add `onCreateOwner` to `TaskPropertiesProps`. Replace `toggleOwner` with a
single controlled selection handler:

```ts
function changeOwners(next: string[]) {
  ownerDraftRef.current = next;
  setOwnerDraft(next);
  onPatch({ owners: next });
}
```

Replace the expanded list with:

```tsx
<fieldset className="task-property task-property-owner">
  <legend>Owner</legend>
  <OwnerPicker
    members={members}
    owners={ownerDraft}
    onCreateOwner={onCreateOwner}
    onChange={changeOwners}
  />
</fieldset>
```

The existing owner sync effect remains unchanged so failed queued patches still
restore the authoritative list.

- [ ] **Step 4: Add Task Detail member creation**

Extend `MutationErrorKey`:

```ts
type MutationErrorKey = MutationField | "timeline" | "ownerCreate";
```

Add this callback before `propertyTask` is derived:

```ts
const createOwner = useCallback(async (rawName: string): Promise<Member> => {
  const name = rawName.trim();
  const existing = findMemberByName(members, name);
  if (existing) return { ...existing };
  if (!name) throw new Error("Owner name is required.");
  if (!supabase) throw new Error("Supabase is not configured.");
  const requestedVisit = visitRef.current;
  setMutationErrors((current) => {
    if (!current.ownerCreate) return current;
    const next = { ...current };
    delete next.ownerCreate;
    return next;
  });
  try {
    const position = members.length > 0
      ? Math.max(...members.map((member) => member.position)) + 1
      : 0;
    const result = await supabase
      .from("members")
      .insert({
        name,
        initials: initialsFromName(name),
        position,
      })
      .select("*")
      .single();
    throwIfError(result.error);
    if (!result.data) {
      throw new Error("Created Owner did not return a row.");
    }
    const created = result.data as Member;
    if (visitRef.current === requestedVisit) {
      setMembers((current) => [
        ...current.filter((member) => member.id !== created.id),
        created,
      ].sort((left, right) => left.position - right.position));
    }
    return { ...created };
  } catch (caught) {
    if (visitRef.current === requestedVisit) {
      setMutationErrors((current) => ({
        ...current,
        ownerCreate: `Could not add owner. ${errorMessage(caught)}`,
      }));
    }
    throw caught;
  }
}, [members]);
```

Pass `onCreateOwner={createOwner}` to `TaskProperties`. Import the Task 1 member
helpers.

Extend the Task Detail Supabase test builder with `.single()` support and queue
the complete `Member` row for member inserts. Do not weaken existing owner
queue, rollback, or activity assertions.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- components/tasks/__tests__/TaskProperties.test.tsx \
  components/__tests__/TaskDetail.test.tsx \
  components/tasks/__tests__/OwnerPicker.test.tsx
```

Expected: all tests pass, including cumulative selection, create success,
create failure without a Task patch, and existing Owner patch rollback tests.

- [ ] **Step 6: Commit Task 3**

```bash
git add components/tasks/TaskProperties.tsx \
  components/tasks/__tests__/TaskProperties.test.tsx \
  components/TaskDetail.tsx components/__tests__/TaskDetail.test.tsx
git commit -m "feat: manage task detail owners through picker"
```

---

### Task 4: Default Theme Copy and Desktop-Only Content Scrolling

**Files:**
- Modify: `components/theme/ThemeToggle.tsx`
- Modify: `components/theme/__tests__/ThemeToggle.test.tsx`
- Modify: `components/__tests__/Navbar.test.tsx`
- Modify: `app/globals.css`
- Modify: `app/__tests__/workspace-styles.test.ts`

**Interfaces:**
- Consumes: existing `Theme = "light" | "dark"` and existing application shell
  classes.
- Produces: visible `Default`, accessible `Default theme`, desktop
  `.app-content` scrolling, and unchanged mobile shell behavior.

- [ ] **Step 1: Write failing theme and scroll contract tests**

Add this Theme Toggle test:

```tsx
it("labels light as Default while preserving the light storage contract", () => {
  localStorage.setItem("triton-theme", "dark");
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Default theme" }));

  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.documentElement.style.colorScheme).toBe("light");
  expect(localStorage.getItem("triton-theme")).toBe("light");
  expect(
    screen.getByRole("button", { name: "Default theme" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});
```

Update `Navbar.test.tsx` to require `Default theme` and reject `Light theme`.

Extend the desktop shell CSS test:

```ts
const shell = ruleBody(globals, ".app-shell");
expect(shell).toMatch(/height\s*:\s*100dvh/);
expect(shell).toMatch(/min-height\s*:\s*0/);
expect(shell).toMatch(/overflow\s*:\s*hidden/);

const content = ruleBody(globals, ".app-content");
expect(content).toMatch(/height\s*:\s*100dvh/);
expect(content).toMatch(/min-height\s*:\s*0/);
expect(content).toMatch(/overflow-y\s*:\s*auto/);

const sidebar = ruleBody(globals, ".app-sidebar");
expect(sidebar).toMatch(/position\s*:\s*static/);
expect(sidebar).toMatch(/height\s*:\s*100dvh/);
```

Extend the existing 767px contract to require `height: auto` and
`overflow: visible` on `.app-shell` and `.app-content`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test -- components/theme/__tests__/ThemeToggle.test.tsx \
  components/__tests__/Navbar.test.tsx \
  app/__tests__/workspace-styles.test.ts
```

Expected: FAIL because the option is still labelled Light and `.app-content`
does not own desktop vertical scrolling.

- [ ] **Step 3: Rename only the visible light option**

Change one entry in `ThemeToggle.tsx`:

```ts
const THEME_OPTIONS = [
  { theme: "light", label: "Default", icon: "sun" },
  { theme: "dark", label: "Dark", icon: "moon" },
] satisfies Array<{ theme: Theme; label: string; icon: IconName }>;
```

Do not modify `ThemeProvider`, `app/layout.tsx`, semantic tokens, or storage
keys.

- [ ] **Step 4: Make app content the desktop vertical scroller**

Update the base shell rules:

```css
.app-shell {
  display: grid;
  grid-template-columns: 256px minmax(0, 1fr);
  min-height: 0;
  height: 100dvh;
  overflow: hidden;
  background: var(--canvas);
  color: var(--text-primary);
}
.app-content {
  min-width: 0;
  min-height: 0;
  height: 100dvh;
  overflow-y: auto;
  padding-inline: 32px;
  scrollbar-gutter: stable;
}
.app-sidebar {
  position: static;
  z-index: 20;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  height: 100dvh;
  border-right: 1px solid var(--border);
  background: var(--surface-subtle);
}
```

At `@media (max-width: 767px)`, preserve the current document-scrolling model:

```css
.app-shell {
  display: block;
  min-height: 100dvh;
  height: auto;
  overflow: visible;
}
.app-content {
  min-height: calc(100dvh - 56px);
  height: auto;
  overflow-y: visible;
  padding-inline: 16px;
}
```

Keep the existing mobile sidebar `position: fixed` and mobile app bar
`position: sticky`.

- [ ] **Step 5: Run focused and full automated verification**

Run:

```bash
npm test -- components/theme/__tests__/ThemeToggle.test.tsx \
  components/__tests__/Navbar.test.tsx \
  app/__tests__/workspace-styles.test.ts
npm test
npm run build
git diff --check
git status --short
```

Expected:

- focused tests pass;
- all test files pass;
- the Next.js production build passes;
- `git diff --check` prints nothing; and
- the worktree has only the intended Task 4 changes before commit.

- [ ] **Step 6: Run rendered desktop QA**

The Browser plugin is not listed in this session, so use the installed
agent-browser/Playwright fallback without adding dependencies. Use a local
Supabase stack and local-only user `team@triton-board.app` with password
`OwnerPicker-QA-2026!`; do not point browser QA at production.

Verify at `1440×900` and compact desktop `1024×800`:

1. Log in and open Task Board.
2. Record `.app-sidebar.getBoundingClientRect().top`.
3. Set `.app-content.scrollTop` to at least `600`.
4. Confirm the sidebar top is unchanged, `.app-content.scrollTop > 0`, and
   `document.scrollingElement?.scrollTop === 0`.
5. Open Create Task; confirm no unselected Owner names appear before
   `Add owner`.
6. Select an existing Owner, create a unique Owner, and confirm only selected
   Chips remain after the panel closes.
7. Create the Task, open Task Detail, remove one selected Owner, and add an
   existing unselected Owner.
8. Confirm `Default theme` applies the light appearance and `Dark theme`
   still applies the dark appearance.
9. Confirm no Next.js overlay, relevant console error, clipping, horizontal
   overflow, or hidden picker action.
10. Save one desktop Default screenshot and one compact Dark screenshot under
    `/tmp`; stop the dev server and local Supabase stack after evidence is
    captured.

- [ ] **Step 7: Commit Task 4**

```bash
git add components/theme/ThemeToggle.tsx \
  components/theme/__tests__/ThemeToggle.test.tsx \
  components/__tests__/Navbar.test.tsx \
  app/globals.css app/__tests__/workspace-styles.test.ts
git commit -m "feat: label default theme and fix desktop scrolling"
```

- [ ] **Step 8: Refresh PR #2 after final review**

After task-by-task review and whole-branch verification are clean:

```bash
git push dashboard fix/create-task-owner-list
gh pr edit 2 --repo CARI-Fields/triton-dashboard \
  --title "feat: add focused Owner picker and fixed desktop navigation"
```

Update the PR body with the selected-only Owner interaction, create-and-assign
behavior, Default theme terminology, fixed desktop sidebar, final test count,
build result, and rendered QA viewports. Run
`git diff --check dashboard/main..HEAD` after the last commit and keep the
worktree for PR feedback.
