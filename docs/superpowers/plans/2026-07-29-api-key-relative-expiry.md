# API Key Relative Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace absolute API-key expiry inputs in the Admin UI with fixed durations measured from submission time, while preserving the existing `expires_at` Admin API contract.

**Architecture:** Keep the change inside the existing client component. Store a small expiry-choice enum in form state, convert it to RFC3339 or `null` immediately before each request, and preserve the current absolute expiry when an edit remains on `Keep current expiration`. No server, database, Agent API, or Skill changes are needed.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript, Vitest 4.1.10, React Testing Library 16.3.2

## Global Constraints

- Before editing code, read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` and `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`, as required by `AGENTS.md`.
- Follow the approved design in `docs/superpowers/specs/2026-07-29-api-key-relative-expiry-design.md`.
- Offer exactly `Never`, `1 day`, `7 days`, `30 days`, and `90 days`; do not add custom durations.
- Default new keys to `30 days`.
- Default edits to `Keep current expiration`; only an explicit new choice resets the expiry from save time.
- Define one day as exactly `86_400_000` milliseconds.
- Keep the Admin API payload field as `expires_at: string | null`; do not change routes, DTOs, database migrations, Agent API behavior, or Skills.
- Keep the existing absolute date display and Active/Expired/Revoked behavior on key cards.
- Do not add CSS unless the existing select styling is demonstrably insufficient.

---

### Task 1: Lock the relative-expiry behavior with component tests

**Files:**
- Modify: `components/admin/__tests__/ApiKeyAdmin.test.tsx`
- Test: `components/admin/__tests__/ApiKeyAdmin.test.tsx`

- [ ] **Step 1: Make the create-response fixture preserve the submitted expiry**

In `installFetch`, add the submitted value to the mocked created row so the mock matches the Admin API:

```ts
if (method === "POST") {
  const body = JSON.parse(String(init?.body));
  rows = [{
    ...VIEW,
    name: body.name,
    member: MEMBERS.find((member) => member.id === body.member_id)!,
    scopes: body.scopes,
    expires_at: body.expires_at,
  }];
  return envelope({ ...rows[0], secret: CREATE_SECRET }, 201);
}
```

- [ ] **Step 2: Change the existing create test to prove the 30-day default**

At the beginning of `"creates a Bruce key, copies its one-time secret, then forgets it"`, freeze the time source without replacing timers:

```ts
vi.spyOn(Date, "now").mockReturnValue(
  Date.parse("2026-07-29T12:00:00.000Z"),
);
```

After the empty state appears, assert the new select default:

```ts
expect(
  (screen.getByLabelText("Expires after") as HTMLSelectElement).value,
).toBe("30d");
```

Update the expected POST body:

```ts
expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
  name: "Bruce experiments",
  member_id: BRUCE_ID,
  scopes: ["board:read", "experiments:write"],
  expires_at: "2026-08-28T12:00:00.000Z",
});
```

- [ ] **Step 3: Add a table-driven test for the other create choices**

Place this test after the existing create test. The 30-day choice is already covered by the default test, so this table covers each alternate choice once:

```ts
it.each([
  ["never", null],
  ["1d", "2026-07-30T12:00:00.000Z"],
  ["7d", "2026-08-05T12:00:00.000Z"],
  ["90d", "2026-10-27T12:00:00.000Z"],
] as const)(
  "serializes the %s create expiry choice",
  async (choice, expectedExpiry) => {
    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse("2026-07-29T12:00:00.000Z"),
    );
    const fetchMock = installFetch([]);
    render(<ApiKeyAdmin />);
    await screen.findByText("No API keys yet.");

    fillCreateDraft(`Bruce ${choice}`);
    fireEvent.change(screen.getByLabelText("Expires after"), {
      target: { value: choice },
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Create API key",
    }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const createCall = fetchMock.mock.calls.find(([, init]) => (
      init?.method === "POST"
    ));
    expect(JSON.parse(String(createCall?.[1]?.body)).expires_at)
      .toBe(expectedExpiry);
  },
);
```

- [ ] **Step 4: Prove an unsupported choice is rejected before a request**

Add this test after the preset table. Appending an option models a forged client
value that cannot be produced by the normal UI:

```ts
it("rejects an unsupported expiry choice before creating a key", async () => {
  const fetchMock = installFetch([]);
  render(<ApiKeyAdmin />);
  await screen.findByText("No API keys yet.");
  fillCreateDraft();

  const select = screen.getByLabelText(
    "Expires after",
  ) as HTMLSelectElement;
  const unsupported = document.createElement("option");
  unsupported.value = "unsupported";
  unsupported.textContent = "Unsupported";
  select.append(unsupported);
  fireEvent.change(select, {
    target: { value: "unsupported" },
  });
  fireEvent.click(screen.getByRole("button", {
    name: "Create API key",
  }));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Expiry option is invalid.");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 5: Add an edit test that preserves an existing absolute expiry**

Place this test before the existing patch/rotate/revoke test:

```ts
it("keeps the current expiry when an edit does not choose a new duration", async () => {
  const originalExpiry = "2026-08-15T16:30:00.000Z";
  const fetchMock = installFetch([{
    ...VIEW,
    expires_at: originalExpiry,
  }]);
  render(<ApiKeyAdmin />);
  await screen.findByRole("article", { name: "Bruce experiments" });

  fireEvent.click(screen.getByRole("button", {
    name: "Edit Bruce experiments",
  }));
  expect(
    (
      screen.getByLabelText(
        "Expires after for Bruce experiments",
      ) as HTMLSelectElement
    ).value,
  ).toBe("keep");
  fireEvent.change(screen.getByLabelText(
    "Key name for Bruce experiments",
  ), {
    target: { value: "Renamed without expiry reset" },
  });
  fireEvent.click(screen.getByRole("button", {
    name: "Save key changes",
  }));

  expect(await screen.findByRole("article", {
    name: "Renamed without expiry reset",
  })).toBeDefined();
  const patchCall = fetchMock.mock.calls.find(([, init]) => (
    init?.method === "PATCH"
  ));
  expect(JSON.parse(String(patchCall?.[1]?.body)).expires_at)
    .toBe(originalExpiry);
});
```

- [ ] **Step 6: Update the live-expiry rescheduling test to use a relative choice**

In `"reschedules live expiry after an edit extends the deadline"`, replace the `datetime-local` change with:

```ts
fireEvent.change(screen.getByLabelText(
  "Expires after for Bruce experiments",
), {
  target: { value: "1d" },
});
```

Keep the assertion after the first second, then replace the final timer advance with the exact remaining duration:

```ts
act(() => {
  vi.advanceTimersByTime(86_400_000 - 1_000);
});
expect(within(card).getByText("Expired")).toBeDefined();
expect(within(card).queryByRole("button", {
  name: "Rotate Bruce experiments",
})).toBeNull();
```

- [ ] **Step 7: Run the focused test and confirm it fails for the intended reason**

Run:

```bash
npm test -- components/admin/__tests__/ApiKeyAdmin.test.tsx
```

Expected: the new assertions fail because the `Expires after` selects and duration serialization do not exist yet. Do not weaken the assertions.

### Task 2: Implement the fixed expiry choices in the client component

**Files:**
- Modify: `components/admin/ApiKeyAdmin.tsx`
- Test: `components/admin/__tests__/ApiKeyAdmin.test.tsx`

- [ ] **Step 1: Replace the absolute-expiry draft field with a finite choice**

Replace the existing `KeyDraft`, `EMPTY_DRAFT`, `expiryForApi`, and `expiryForInput` definitions with:

```ts
const DAY_MS = 86_400_000;

const EXPIRY_PRESETS = [
  { value: "never", label: "Never", days: null },
  { value: "1d", label: "1 day", days: 1 },
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
] as const;

type ExpiryPreset = (typeof EXPIRY_PRESETS)[number]["value"];
type ExpiryChoice = "keep" | ExpiryPreset;

interface KeyDraft {
  name: string;
  member_id: string;
  scopes: ApiScope[];
  expiry: ExpiryChoice;
}

const EMPTY_CREATE_DRAFT: KeyDraft = {
  name: "",
  member_id: "",
  scopes: [],
  expiry: "30d",
};

const EMPTY_EDIT_DRAFT: KeyDraft = {
  name: "",
  member_id: "",
  scopes: [],
  expiry: "keep",
};

function expiryForApi(
  value: ExpiryChoice,
  currentExpiresAt: string | null,
): string | null {
  if (value === "keep") return currentExpiresAt;
  const preset = EXPIRY_PRESETS.find(
    (candidate) => candidate.value === value,
  );
  if (!preset) throw new Error("Expiry option is invalid.");
  if (preset.days === null) return null;
  const now = Date.now();
  return new Date(now + preset.days * DAY_MS).toISOString();
}
```

Keep `formatDate` and all status/timer functions unchanged.

- [ ] **Step 2: Give create and edit state their correct defaults**

Update the two state initializers:

```ts
const [createDraft, setCreateDraft] = useState<KeyDraft>(
  EMPTY_CREATE_DRAFT,
);
const [editDraft, setEditDraft] = useState<KeyDraft>(EMPTY_EDIT_DRAFT);
```

After a successful create, reset with:

```ts
setCreateDraft(EMPTY_CREATE_DRAFT);
```

In `beginEdit`, stop translating the stored absolute date and always start in preserve mode:

```ts
function beginEdit(key: ManagedKeyView) {
  setEditingId(key.id);
  setEditDraft({
    name: key.name,
    member_id: key.member?.id ?? "",
    scopes: [...key.scopes],
    expiry: "keep",
  });
}
```

- [ ] **Step 3: Convert the choices only when constructing API payloads**

In `createKey`, use:

```ts
expires_at: expiryForApi(createDraft.expiry, null),
```

In `saveEdit`, use the current row as the source for `keep`:

```ts
expires_at: expiryForApi(editDraft.expiry, key.expires_at),
```

Do not change `ManagedKeyInput` or the API request body shape.

- [ ] **Step 4: Replace the create date input with the fixed preset select**

Replace the create expiry `<label>` with:

```tsx
<label>
  <span>Expires after</span>
  <select
    value={createDraft.expiry}
    onChange={(event) => setCreateDraft({
      ...createDraft,
      expiry: event.target.value as ExpiryChoice,
    })}
  >
    {EXPIRY_PRESETS.map((preset) => (
      <option key={preset.value} value={preset.value}>
        {preset.label}
      </option>
    ))}
  </select>
</label>
```

Do not include `Keep current expiration` in the create select.

- [ ] **Step 5: Replace the edit date input with preserve mode plus presets**

Replace the edit expiry `<label>` with:

```tsx
<label>
  <span>Expires after</span>
  <select
    aria-label={`Expires after for ${key.name}`}
    value={editDraft.expiry}
    onChange={(event) => setEditDraft({
      ...editDraft,
      expiry: event.target.value as ExpiryChoice,
    })}
  >
    <option value="keep">Keep current expiration</option>
    {EXPIRY_PRESETS.map((preset) => (
      <option key={preset.value} value={preset.value}>
        {preset.label}
      </option>
    ))}
  </select>
</label>
```

- [ ] **Step 6: Run the focused component test**

Run:

```bash
npm test -- components/admin/__tests__/ApiKeyAdmin.test.tsx
```

Expected: all `ApiKeyAdmin` tests pass, including the unchanged secret, race, session, rotation, revoke, and status cases.

### Task 3: Verify the complete change and commit it

**Files:**
- Verify: `components/admin/ApiKeyAdmin.tsx`
- Verify: `components/admin/__tests__/ApiKeyAdmin.test.tsx`

- [ ] **Step 1: Confirm the old absolute input is gone only from the form**

Run:

```bash
rg -n "datetime-local|expiryForInput|expires_at: expiryForApi\\([^,]+\\)" components/admin/ApiKeyAdmin.tsx
```

Expected: no matches. The key-card absolute expiry display using `formatDate(key.expires_at)` must remain.

- [ ] **Step 2: Run all automated tests**

Run:

```bash
npm test
```

Expected: the full Vitest suite passes.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: Next.js production compilation and type checking succeed.

- [ ] **Step 4: Check patch hygiene and scope**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only the Admin component and its component test are changed for the implementation.

- [ ] **Step 5: Commit the implementation**

Run:

```bash
git add components/admin/ApiKeyAdmin.tsx components/admin/__tests__/ApiKeyAdmin.test.tsx
git commit -m "feat: use relative API key expiry presets"
```

Expected: the commit contains the tested frontend-only relative-expiry change.
