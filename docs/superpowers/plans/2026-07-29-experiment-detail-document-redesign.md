# Experiment Detail Document Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Experiment Detail into a calm, document-like IBM Plex interface with visible evidence, an independent Datasets section, compact setup disclosures, and a dirty-only save bar while preserving every existing workflow.

**Architecture:** Keep `ExperimentDetail` as the orchestration owner and retain all repository, draft, conflict, validation, activity, duplicate, delete, and save logic. Recompose only its rendered document tree around semantic sections and native `<details>` disclosures, add small pure summary helpers for collapsed content, and keep the existing editors as the authoritative edit surfaces. Load IBM Plex through Next.js 16 `next/font`, expose both families through the existing `--sans` and `--mono` design tokens, and implement layout hierarchy in `experiment-workspace.css`.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript, global CSS, Vitest 4.1.10, Testing Library, local Playwright-compatible browser validation.

## Global Constraints

- Work only in the linked worktree on branch `feat/experiment-detail-redesign`; do not modify the main checkout.
- Use Node.js `24.18.0`; the repository requires `>=24.18.0 <25.0.0`.
- Follow `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`: load fonts through `next/font`, define them once, and apply their CSS variables from the root layout.
- Use IBM Plex Sans for application UI, headings, controls, and body copy; use IBM Plex Mono for IDs, timestamps, lifecycle metadata, numeric metrics, and configuration values.
- Preserve every existing field, editor, action, status transition, baseline comparison, attachment flow, activity drawer, duplicate/delete path, validation rule, realtime conflict path, save/discard path, and session draft behavior.
- Render sections in this order: Overview, Result, Decision, Datasets, Setup, Note.
- Result and Decision remain expanded; Datasets is independently visible and editable; Object, Environment, and Config are closed native disclosures by default.
- Alternate major section surfaces between `var(--canvas)` and `var(--surface-subtle)` without adding decorative card chrome, gradients, new colors, or new shadows.
- Hide the save/discard bar in a clean state; reveal it for dirty, Markdown-editing, validation, mutation, or conflict states.
- Preserve semantic headings, keyboard-operable disclosures, focus states, dark theme tokens, and 44px mobile targets.

---

### Task 1: Lock the new document contract with a failing orchestration test

**Files:**
- Modify: `components/experiments/__tests__/ExperimentDetail.test.tsx`
- Test: `components/experiments/__tests__/ExperimentDetail.test.tsx`

**Interfaces:**
- Consumes: the existing `experiment(overrides)` and `bundle(current)` fixtures.
- Produces: an integration contract for section order, semantic IDs, disclosure summaries, clean-state save controls, and preserved actions.

- [ ] **Step 1: Expand the document-layout test fixture**

Use explicit rich values so expected summaries are hand-derived:

```tsx
const current = experiment({
  data_spec: {
    datasets: [{
      role: "evaluation",
      name: "ImageNet-1k",
      split: "val",
      revision: "v2.1",
      task_count: 50_000,
      samples_per_task: 1,
    }],
  },
  object_spec: {
    model: "ResNet-50-v2",
    harness: "VisionLab-Harness",
    parent_harness: "",
    prompt: "",
    prompt_change: "",
    skills: [],
    tools: [],
  },
  environment_spec: {
    platform: "gpu",
    server: "lab-03",
    devices: ["8× A100 80GB"],
    hardware: "",
    evaluator: "",
    revision: "",
    precision_policy: "",
  },
  config: {
    learning_rate: 0.001,
    epochs: 50,
    batch_size: 128,
    fused: true,
  },
});
```

- [ ] **Step 2: Replace the old seven-anchor assertions**

Assert both document navigators expose the new ordered links and that each target section is labelled:

```tsx
for (const [name, id] of [
  ["Overview", "overview"],
  ["Result", "result"],
  ["Decision", "decision"],
  ["Datasets", "datasets"],
  ["Setup", "setup"],
  ["Note", "note"],
]) {
  expect(within(sectionNavigation).getByRole("link", { name })
    .getAttribute("href")).toBe(`#${id}`);
  expect(document.getElementById(id)?.getAttribute("aria-labelledby"))
    .toBe(`${id}-title`);
}
```

Also assert:

```tsx
expect(screen.getByText("Evaluation · ImageNet-1k / val · 50,000 tasks"))
  .toBeDefined();
expect(screen.getByText("ResNet-50-v2 · VisionLab-Harness"))
  .toBeDefined();
expect(screen.getByText("GPU · 8× A100 80GB · lab-03")).toBeDefined();
expect(screen.getByText("learning_rate 0.001 · 4 parameters")).toBeDefined();
expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
```

Find the Object, Environment, and Config disclosure summaries by text, obtain their closest `<details>`, and assert `open === false`.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
/home/yubaifeng/.config/nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run components/experiments/__tests__/ExperimentDetail.test.tsx
```

Expected: FAIL because the current navigation still exposes Data/Object/Environment/Config as major sections, the summary strings do not exist, and the clean save button is still rendered.

### Task 2: Recompose Experiment Detail around semantic document sections

**Files:**
- Create: `components/experiments/ExperimentDisclosure.tsx`
- Modify: `components/experiments/ExperimentDetail.tsx`
- Modify: `components/experiments/ExperimentSection.tsx`
- Modify: `components/experiments/BaselinePicker.tsx`
- Test: `components/experiments/__tests__/ExperimentDetail.test.tsx`

**Interfaces:**
- Consumes: the unchanged editor props and `Experiment` draft shape.
- Produces: `ExperimentDisclosure({ title, summary, actionLabel, children })`, tone-aware `ExperimentSection`, and pure visible summaries derived from the current draft.

- [ ] **Step 1: Add the reusable native disclosure**

Implement a native `<details>` wrapper whose `<summary>` contains a title, one-line summary, and closed/open affordance. Keep children mounted so the existing editor components and state remain authoritative.

- [ ] **Step 2: Add pure summary helpers**

Inside `ExperimentDetail.tsx`, derive:

```ts
datasetSummary(draft.data_spec)
objectSummary(draft.object_spec)
environmentSummary(draft.environment_spec)
configSummary(draft.config)
```

Use literal fallbacks such as `No datasets recorded`, `No model or Harness recorded`, `No environment recorded`, and `No parameters`. Format dataset task counts with `Intl.NumberFormat("en-US")`.

- [ ] **Step 3: Recompose the JSX**

Render one `.experiment-document-layout` containing:

```tsx
<main className="experiment-document">
  <section id="overview">...</section>
  <ExperimentSection id="result" tone="subtle">...</ExperimentSection>
  <ExperimentSection id="decision" tone="canvas">...</ExperimentSection>
  <ExperimentSection id="datasets" tone="subtle">
    <ExperimentDisclosure title="Dataset" summary={datasetSummary(...)} actionLabel="Edit data">
      <DataEditor ... />
    </ExperimentDisclosure>
  </ExperimentSection>
  <ExperimentSection id="setup" tone="canvas">
    <ExperimentDisclosure title="Object" ...><ObjectEditor ... /></ExperimentDisclosure>
    <ExperimentDisclosure title="Environment" ...><EnvironmentEditor ... /></ExperimentDisclosure>
    <ExperimentDisclosure title="Config" ...><ConfigEditor ... /></ExperimentDisclosure>
  </ExperimentSection>
  <ExperimentSection id="note" tone="subtle">...</ExperimentSection>
</main>
<aside className="experiment-outline">...</aside>
```

Keep the Result attachments and optional `BaselineSummary` in Result. Keep the existing editor callbacks byte-for-byte equivalent.

- [ ] **Step 4: Make Overview sparse and move clean metadata beside the ID**

Retain Task, Owner, editable Status, and Baseline as primary properties. Compress Created, Started, and Completed into a single mono lifecycle line. Show saved status only when `draft.status !== server.status`. Use a compact Baseline disclosure while keeping the existing select, search, and warning behavior.

- [ ] **Step 5: Make the save bar stateful**

Render `.experiment-save-bar` only while one of these is true:

```ts
dirty ||
markdownEditing ||
issues.length > 0 ||
saving ||
deleting ||
reloadingLatest ||
Boolean(remoteConflict) ||
remoteDeleted
```

Keep the existing button handlers and disabled conditions unchanged.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run the Task 1 command. Expected: all Experiment Detail orchestration tests pass.

### Task 3: Install the IBM Plex typography and document visual system

**Files:**
- Create: `app/fonts.ts`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `app/experiment-workspace.css`
- Test: `components/experiments/__tests__/ExperimentDetail.test.tsx`

**Interfaces:**
- Consumes: Next.js `IBM_Plex_Sans` and `IBM_Plex_Mono` font loaders.
- Produces: root CSS variables `--font-ibm-plex-sans` and `--font-ibm-plex-mono`, mapped through existing `--sans` and `--mono` tokens.

- [ ] **Step 1: Define the fonts once**

Create:

```ts
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

export const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ibm-plex-sans",
});

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-mono",
});
```

Apply both `.variable` classes to `<html>` in `app/layout.tsx`. Update `--sans` and `--mono` to prefer the generated variables while retaining system fallbacks.

- [ ] **Step 2: Replace the record-table styling with document bands**

Implement:

- a centered 800px reading column;
- a 160px sticky outline at `min-width: 1440px`;
- a horizontal navigator below that breakpoint;
- a 39–40px/600 title with `-0.025em` tracking;
- 18px/600 section headings;
- 14–15px/1.6 body copy;
- IBM Plex Mono for experiment ID, lifecycle, metrics, dataset counts, and config rows;
- canvas/subtle alternating bands with 56–64px vertical padding;
- transparent resting controls and visible hover/focus states;
- meaningful borders only inside disclosures, editors, attachments, alerts, menus, and focus states.

- [ ] **Step 3: Preserve responsive and theme behavior**

At `max-width: 767px`, stack header actions and property rows, make the navigator horizontally scrollable, make document bands edge-to-edge inside the page, collapse multi-column editors, and retain 44px targets. Use only semantic color variables so dark theme remains correct.

- [ ] **Step 4: Run focused tests**

Run the Task 1 test command. Expected: PASS with no new warnings attributable to the change.

### Task 4: Verify the full application and real browser rendering

**Files:**
- No committed test artifact required.
- Temporary screenshots/scripts: `/tmp/triton-board-experiment-detail-*`

**Interfaces:**
- Consumes: the completed local branch.
- Produces: automated and visual evidence for the final handoff.

- [ ] **Step 1: Run all component tests**

```bash
/home/yubaifeng/.config/nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run
```

Expected: 54 test files and at least 1,045 tests pass.

- [ ] **Step 2: Run type and production checks**

Run:

```bash
/home/yubaifeng/.config/nvm/versions/node/v24.18.0/bin/node node_modules/typescript/bin/tsc --noEmit
/home/yubaifeng/.config/nvm/versions/node/v24.18.0/bin/node node_modules/next/dist/bin/next build
```

Expected: both exit 0; the build self-hosts IBM Plex and emits no browser-time Google font request.

- [ ] **Step 3: Start the local development server**

Run `npm run dev` with Node 24 on an available localhost port and keep the session running for browser verification.

- [ ] **Step 4: Verify the target flow in a browser**

The flow under test is: `/experiments/[id]` loads → the user scans Result, Decision, and Datasets → opens Edit data and a Setup disclosure → changes a field → the dirty save bar appears.

Check desktop and mobile viewports for:

- correct page identity and meaningful DOM;
- no Next.js error overlay;
- no relevant console warnings/errors;
- computed IBM Plex Sans and IBM Plex Mono families;
- alternating white/subtle-gray sections;
- sticky/horizontal navigator behavior;
- Dataset visibility and disclosure interaction;
- closed Object/Environment/Config defaults;
- dirty save bar appearance after editing;
- clipping, overlap, wrapping, scroll traps, and 44px mobile targets.

- [ ] **Step 5: Capture screenshots outside the repository**

Save one desktop and one mobile screenshot under `/tmp`, inspect them, and use them as final QA evidence.

- [ ] **Step 6: Review the final diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors and only intentional plan, test, font, component, layout, and stylesheet changes.
