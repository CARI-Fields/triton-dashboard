# Experiment Template Workspace Design

**Date:** 2026-07-30

**Status:** Awaiting written-spec review

**Branch:** `feat/experiment-template-workspace`

## Goal

Replace the fixed Experiment content model with a reusable, typed Template
system.

An Experiment Template defines a stable set of Field Labels and Keys. Every
Experiment created from that Template uses the same schema, so its values can
be edited like spreadsheet cells and compared as rows in one coherent table.
Experiments remain editable with automatic version history until they are
Archived.

The resulting model should make these statements true:

1. adding a Key such as `pass@1` to a Template makes that Key available to all
   existing and future Experiments using the Template;
2. an Experiment selects its Template once at creation and can never switch;
3. only Experiments using the same Template can be compared;
4. the Compare surface is one read-only table whose primary tools are sorting,
   filtering, column visibility, and Baseline-relative difference highlighting;
5. Experiment Values autosave and can be restored from version history;
6. Archive makes an Experiment read-only, while Unarchive deliberately restores
   editability.

## First-Principles Model

The existing Data, Object, Environment, Config, Result, Decision, and Note
sections are not universal Experiment concepts. They are one particular schema
imposed on every record. The Template replaces those hard-coded sections.

The new hierarchy is:

```text
Experiment Template
└── Field Label
    └── Key
        ├── Value Type
        ├── Required / Optional
        └── Experiment Value
```

The spreadsheet analogy is exact:

| Product concept | Spreadsheet concept |
| --- | --- |
| Experiment Template | One sheet schema |
| Field Label | A visual column group |
| Key | A reusable column |
| Experiment | A row |
| Experiment Value | A cell |
| Compare | The complete same-Template sheet |

Field Label is the only grouping layer. There is no additional Category,
Section, or Group entity.

## Approaches Considered

### Per-Experiment arbitrary Key/Value

Each Experiment could continue to create its own Keys. This makes editing
flexible but does not create a reliable comparison schema. Two equal-looking
Keys can have different meanings or types, and the Compare page must keep
flattening arbitrary JSON paths. This approach is rejected.

### Schema snapshot copied at creation

Each Experiment could copy its Template schema once. Historical records would
remain isolated, but adding `pass@1` to the Template would not update existing
Experiments. It contradicts the requirement that one Template defines the
whole comparable series. This approach is rejected.

### Live typed Template

Experiments keep a permanent `template_id`; the current Template schema is
joined with each Experiment's stored Values. A newly added Key therefore
appears immediately on every associated Experiment without creating empty
Value rows. Missing Values render as `—`. This is the selected approach.

## Scope

This design covers:

- Board-wide Experiment Template management;
- Template creation, editing, history, archive, and unarchive;
- Field Label ordering and theme colors;
- typed Keys and Required / Optional rules;
- Template selection during Experiment creation;
- Experiment Detail information architecture and cell editing;
- automatic Value persistence and cell-level conflict handling;
- Experiment version history and non-destructive restoration;
- Experiment archive and unarchive;
- a same-Template, read-only Compare table;
- migration of every existing Experiment and Attachment;
- Supabase schema, grants, RLS, Realtime, and indexes;
- additive Agent API compatibility.

## Non-Goals

The first release does not include:

- Formula or computed Keys;
- changing an Experiment's Template after creation;
- comparing Experiments from different Templates;
- automatic interpretation of whether a Result is good or bad;
- automatic conversion of a populated Key to another Value Type;
- hard deletion of populated Keys, Templates, Experiment versions, or
  Attachment history;
- a second grouping layer beneath or above Field Label;
- bulk editing from Compare;
- multiple Compare modes or separate Decision/Diff/Matrix views.

## Fixed Experiment Fields

Every Experiment keeps these system-owned fields outside its Template:

- ID / Experiment number;
- Name;
- Task;
- Owner;
- Status;
- Archive state;
- Template ID;
- Created and updated timestamps used by the system;
- internal revision metadata used for concurrency.

ID, Task, and Template ID are immutable after creation. Name, Owner, and Status
are editable while the Experiment is not Archived. Archive state changes only
through the Archive and Unarchive actions.

Status remains a workflow property, not a content validator. Existing allowed
Status transitions remain, but all old content-specific gates for `running`,
`analyzing`, and `completed` are removed. A generic Template may not contain
the old Dataset, Model, Environment, Result, or Decision Keys. Template
Required Keys govern whether the Experiment is eligible to Archive.

## Experiment Template

### Template identity

A Template has:

- stable UUID;
- unique active Name within the current workspace;
- optional Description;
- schema revision number;
- archived timestamp;
- created and updated timestamps.

Templates are workspace-wide because the current product has one Board and no
separate Board table. A future multi-Board model may add `board_id` without
changing Field, Key, or Value identity.

An active Template can be selected when creating an Experiment. An Archived
Template remains readable and keeps its existing Experiments comparable, but
cannot create new Experiments until it is Unarchived.

### Field Label

Field Label is a user-defined visual classification such as `Input`,
`Settings`, `Metrics`, or `Outcome`.

Each Field Label has:

- stable UUID;
- Template ID;
- Label;
- position;
- semantic color token;
- archived timestamp.

Field Labels are ordered. Their order drives Template design, Experiment
Detail, and Compare column groups.

The color token comes from a finite accessible palette rather than arbitrary
hex values. A new Field Label receives the next stable palette color by
default. The user can change the token from the Field Label menu without
adding a Color column to the Template table.

Color is repeated consistently in:

- the merged Field Label cell in Template design;
- the Field Table header in Experiment Detail;
- the top-level Field Label header in Compare.

Text remains visible everywhere, so color is never the only carrier of
meaning.

### Key

Each Key belongs to exactly one Field Label and has:

- stable UUID;
- Template ID;
- Field Label ID;
- Key string;
- Value Type;
- Required / Optional flag;
- position within the Field Label;
- archived timestamp.

Key strings are case-insensitively unique within a Template. They may use
recognizable metric notation such as `pass@1`, or machine-oriented names such
as `latency_ms`. Stable UUIDs remain the canonical identity, so renaming a Key
does not orphan Values or versions.

Keys can be reordered or moved between Field Labels without changing identity.

### Value Types

The first release supports:

| Value Type | Editor | Sorting and filtering | Compare |
| --- | --- | --- | --- |
| Short text | one-line input | lexical sort, contains filter | equality |
| Long text | expandable multiline editor | contains filter | equality |
| Number | numeric input | numeric sort, range filter | equality and Delta |
| Boolean | checkbox | true/false filter | equality |
| Single select | one option picker | option filter | equality |
| Multi select | multi-option picker | contains-any/all filter | set equality |
| Date/time | date-time picker | chronological sort, range filter | equality |
| URL | URL input | lexical sort, contains filter | equality |
| Attachment | attachment picker/uploader | presence filter | attachment-set equality |

Percentages, milliseconds, and other units do not introduce another schema
property in the first release. The Key itself communicates the convention,
for example `pass@1_pct` or `latency_ms`.

Formula Values are explicitly out of scope.

Single-select and multi-select Keys maintain ordered option rows. Options use
stable UUIDs and visible labels; renaming an option does not rewrite every
stored Value.

### Required semantics

Required Keys may remain empty while an Experiment is in progress.

The Detail page marks missing Required Values, but does not block Experiment
creation or ordinary autosave. Archive is blocked until every active Required
Key has a non-empty, type-valid Value.

Adding a new Required Key does not unarchive or invalidate already Archived
Experiments. They show the new Key as `—` and remain read-only. If one is
Unarchived, the missing Required Key must be completed before it can be
Archived again.

### Safe Template evolution

Template edits update all linked Experiments through the live schema join:

- adding a Key makes it appear as `—` on every linked Experiment;
- renaming a Field Label or Key preserves all Values through stable UUIDs;
- reordering or recoloring changes presentation only;
- moving a Key to another Field Label changes presentation only;
- changing Optional to Required affects the next Archive validation;
- archiving a Key hides it from current Detail and Compare while preserving
  its Values and history;
- archiving a Field Label hides its active Keys but preserves their data.

A Key's Value Type can change only while no current or historical Value exists.
Once any Experiment has stored a Value for the Key, the type is permanently
locked. A different type requires a new Key.

Hard delete is permitted only for a Template, Field Label, Key, or option that
has never been referenced by an Experiment Value, version snapshot, or
Attachment. Otherwise the UI offers Archive.

Every Template mutation increments `schema_revision` and writes an immutable
Template version snapshot.

## Data Storage

The project continues to use imperative Supabase migrations.

### `experiment_templates`

```text
id                uuid primary key
name              text not null
description       text not null default ''
schema_revision   bigint not null default 1
archived_at       timestamptz null
created_at        timestamptz not null
updated_at        timestamptz not null
```

An active-name partial unique index enforces case-insensitive uniqueness where
`archived_at is null`.

### `experiment_template_fields`

```text
id                uuid primary key
template_id       uuid not null → experiment_templates on delete restrict
label             text not null
color_token       text not null
position          integer not null
archived_at       timestamptz null
created_at        timestamptz not null
updated_at        timestamptz not null
```

Indexes cover `(template_id, position)` and active rows.

### `experiment_template_keys`

```text
id                uuid primary key
template_id       uuid not null
field_id          uuid not null
key               text not null
value_type        text not null
required          boolean not null default false
position          integer not null
archived_at       timestamptz null
created_at        timestamptz not null
updated_at        timestamptz not null
```

A composite foreign key ensures `field_id` belongs to the same `template_id`.
A case-insensitive unique index enforces Key uniqueness within a Template.
Checks constrain Value Type to the supported set and reject blank Keys.

Indexes cover `(template_id, field_id, position)` and active rows.

### `experiment_template_key_options`

```text
id                uuid primary key
template_id       uuid not null
key_id            uuid not null
label             text not null
position          integer not null
archived_at       timestamptz null
```

This table is used only by Single select and Multi select Keys. Composite
foreign keys guarantee the option belongs to a Key in the same Template.

### `experiments`

The existing table gains:

```text
template_id       uuid → experiment_templates on delete restrict
archived_at       timestamptz null
core_revision     bigint not null default 1
```

`template_id` becomes `not null` after legacy backfill. A database guard
rejects any update that changes it.

Existing legacy content columns remain during the compatibility period but
stop being canonical after cutover:

- `baseline_experiment_id`;
- `data_spec`;
- `object_spec`;
- `environment_spec`;
- `config`;
- `notes`;
- `metrics`;
- `featured_metric_keys`;
- `result_summary`;
- `decision_outcome`;
- `decision_notes`.

They are removed only in a later, independently reviewed cleanup release.
`baseline_experiment_id` is not part of the new Template model: current
Compare Baseline is shareable URL state. During compatibility, an existing
stored Baseline may seed the Compare link from a legacy Detail page, but new
Baseline choices are not persisted back to the Experiment.

### `experiment_values`

One row stores one current cell:

```text
experiment_id     uuid not null
template_id       uuid not null
key_id            uuid not null
text_value        text null
number_value      double precision null
boolean_value     boolean null
datetime_value    timestamptz null
option_id         uuid null
cell_revision     bigint not null default 1
created_at        timestamptz not null
updated_at        timestamptz not null
primary key (experiment_id, key_id)
```

Composite foreign keys guarantee:

- the Experiment belongs to `template_id`;
- the Key belongs to `template_id`;
- an Experiment cannot store a Key from another Template.

A check constraint permits exactly one scalar storage column for Short text,
Long text, Number, Boolean, Date/time, URL, or Single select. For Multi select
and Attachment, all scalar columns are null and the row is a revision anchor
for the non-empty association set described below. Type-specific validation
that depends on the Key definition is also enforced by the mutation function,
because a cross-table check cannot be expressed as an ordinary Postgres check
constraint.

Number mutations reject `NaN`, positive infinity, and negative infinity. URL
mutations require an absolute `http` or `https` URL. Single-select `option_id`
must reference an active option belonging to the same Key.

No row represents an empty cell. A Multi select or Attachment parent row is
created with its first active association and removed with its last active
association. The UI derives `—` by left joining active Template Keys with
current Values.

Indexes cover:

- `(template_id, experiment_id, key_id)` for Template-grid loading;
- `(key_id, number_value)` for numeric sort/filter;
- `(key_id, datetime_value)` for date sort/filter;
- `(key_id, option_id)` for Single select filters.

Text contains filtering remains client-side in the initial scale envelope;
full-text or trigram indexes are deferred until measured data requires them.

### `experiment_value_options`

Multi select uses a normalized association rather than an option UUID array:

```text
experiment_id     uuid not null
template_id       uuid not null
key_id            uuid not null
option_id         uuid not null
position          integer not null
primary key (experiment_id, key_id, option_id)
```

Composite foreign keys guarantee that Experiment, Key, and option belong to the
same Template and that the option belongs to the Key. The parent
`experiment_values` row owns `cell_revision`; this association owns the
selected option set. A foreign key from `(experiment_id, key_id)` to the parent
Value cascades current selections when the cell is cleared. Indexes on
`(key_id, option_id, experiment_id)` support contains-any/all filters without
array scans.

### `experiment_versions`

Every successful autosave, restore, archive, unarchive, or core-field mutation
creates an immutable snapshot:

```text
id                       uuid primary key
experiment_id            uuid not null
version_no               bigint not null
reason                   text not null
source                   text not null
edit_session_id          uuid null
template_schema_revision bigint not null
snapshot                 jsonb not null
actor_member_id          uuid null
created_at               timestamptz not null
unique (experiment_id, version_no)
```

The snapshot contains:

- Name, Owner, and Status;
- immutable Task and Template references for historical context;
- Archive state;
- all current Values keyed by stable Key UUID;
- active Attachment references and captions.

It does not duplicate Storage blobs.

Browser changes use a nullable actor because the current authenticated session
is not mapped reliably to a Board Member. Agent API changes may record the
API-key Member. The UI must not invent an actor.

### `experiment_template_versions`

Each Template mutation stores an immutable snapshot of:

- Template identity and archive state;
- ordered Field Labels and color tokens;
- ordered Keys, types, Required flags, and archive states;
- select options.

Restoring a Template version is a new forward mutation. It must obey current
safety rules: populated Keys cannot change type, and populated archived Keys
cannot be hard-deleted.

### `attachments`

The existing table gains:

```text
template_key_id   uuid null → experiment_template_keys on delete restrict
archived_at       timestamptz null
```

An Attachment Value is satisfied by one or more active Attachment rows for an
Attachment-type Key. Deleting an Attachment from an Experiment soft-archives
the row and retains the Storage object so a version restore can reattach it.
Permanent blob deletion is an administrative cleanup concern outside this
release.

The corresponding `experiment_values` parent row owns one cell revision for
the whole active Attachment set. Upload, caption edit, removal, and restore
lock and update that parent atomically with the Attachment rows and Experiment
snapshot. Removing the last active Attachment removes the parent row after its
final state has been captured in history.

## Activity versus Version History

Version History is the canonical audit trail for Experiment content. A Value
autosave does not also append a generic Activity row; otherwise a normal
editing session would flood the existing Task and Experiment timeline with
low-information events.

The existing Activity timeline remains a concise lifecycle feed. It records
Experiment creation, Owner and Status changes, Archive, Unarchive, Duplicate,
and Restore. The legacy trigger branches for Data, Object, Environment,
Config, Result, and Decision updates are removed at cutover because those
columns stop being canonical. Manual Activity comments and Task-level Activity
continue unchanged.

## Supabase Security and Realtime

Every new table in `public`:

- has RLS enabled;
- has explicit authenticated policies matching the current workspace-wide
  collaboration model;
- has explicit Data API grants, because new Supabase tables are no longer
  guaranteed to be exposed automatically;
- grants only the required operations to `authenticated` and `service_role`;
- receives indexes on foreign keys and policy/filter columns.

The current product intentionally gives every authenticated user access to the
single shared workspace. Policies may therefore use authenticated-wide
predicates for this release; that is an explicit access model, not an ownership
check. A future multi-Board model must replace them with Board membership
predicates before adding `board_id`.

Update policies include both `using` and `with check`, with corresponding
Select policies.

Atomic multi-table mutations use explicitly granted Postgres functions with
`security invoker`, not `security definer`. Execute is revoked from `public`
and granted only to intended roles.

Realtime publication is extended only through
`supabase_realtime` publication entries for the new public tables. The design
does not create or modify objects inside the locked `realtime` schema.

Realtime subscriptions cover:

- Templates, Field Labels, Keys, and options;
- Experiments;
- current Experiment Values;
- Attachments.

Version snapshot tables do not need broad live subscriptions. Opening Version
History performs an authoritative fetch.

## Template Manager

Route: `/experiments/templates`

The page uses the approved dense design:

- Template list on the left;
- selected Template schema on the right;
- one continuous table;
- columns are exactly `Field label`, `Key`, `Value type`, and
  `Required / optional`;
- a narrow canvas-colored gap separates adjacent Field Label blocks;
- Keys inside one Field remain tightly stacked;
- the merged Field Label cell is vertically centered;
- no row-count or Key-count text appears;
- Field Label color is visible in the merged cell;
- drag handles reorder Field Labels and Keys;
- one action adds a Field Label or a Key;
- History and Archive remain header actions.

Type-specific settings, such as Select options, open from the Value Type cell
in a popover or focused drawer. They do not add permanent table columns.

Before applying a schema edit, the UI states its impact, for example:

`Adding pass@1 creates an empty Key for 24 existing Experiments.`

Unsafe edits are unavailable rather than attempted optimistically.

## Create Experiment

Every creation entry point uses the same flow:

1. choose Task;
2. choose one active Template;
3. enter Name and Owner;
4. create the Experiment with default Status;
5. open Experiment Detail to fill Template Values.

Template selection is required and the confirmation states that it cannot be
changed later.

The Template list shows Name, Description, active Key count, and existing
Experiment count. Archived Templates are excluded.

No Template Values are required at creation time.

## Experiment Detail

Route: `/experiments/[id]`

### Header

The header contains:

- Experiment ID;
- editable Name;
- Task;
- Owner;
- Status;
- locked Template Name;
- autosave state;
- Version History;
- Duplicate;
- Archive or Unarchive.

Template ID is visible but never editable.

### Field Tables

The approved layout is one vertical column of Field Tables.

Each active Field Label renders as one full-width table:

- Field Label is the table header;
- the stable theme color appears only in the header/accent;
- the table body has `Key | Value`;
- Keys remain in Template order;
- Values use type-specific controls;
- there is no Value Type, comparison, format, unit, or row-count column;
- Field Tables remain a single column at every desktop width;
- mobile keeps the same order and reduces padding rather than creating a
  second column.

Missing Optional Values display `—`. Missing Required Values display `—` plus
a restrained required indicator.

Archived Field Labels and Keys are absent from the current record view but
remain available in version history.

### Autosave

Clicking a Value enters edit mode.

- Enter or blur commits a valid single-line Value.
- Escape restores the last saved Value.
- Long text uses an expandable editor with an explicit Done action.
- Invalid Values remain local and show an inline message.
- There is no global Save or Discard bar.
- `Saving…`, `Saved just now`, `Retry`, and conflict states appear near the
  active cell and in the page-level autosave indicator.

Every successful cell commit:

1. validates Template, Key, type, and Archive state;
2. compares the submitted `cell_revision`;
3. inserts or updates the one current Value;
4. increments the Experiment's current revision/timestamp;
5. writes one immutable Experiment version snapshot;
6. commits atomically.

### Concurrency

Different Keys have independent cell revisions, so concurrent edits to
different Keys merge naturally.

If two clients change the same Key from the same prior revision, the first
commit succeeds. The second receives a conflict containing the saved remote
Value and its local Value. The UI offers:

- Keep remote;
- Replace with mine.

Replacing is a new explicit version, never a silent last-write-wins overwrite.

Template mutations use `schema_revision` in the same optimistic manner.

### Version History

History stores every committed change. A page visit creates an
`edit_session_id` and rotates it after five minutes without a successful
mutation. The UI groups versions by that ID into readable editing sessions.
Expanding a session shows each changed Key and its before/after Value.

Restoring version N:

- is allowed only on an unarchived Experiment;
- preserves ID, Task, and Template ID;
- maps the snapshot's stable Key IDs into the current Template;
- restores Name, Owner, Status, and current Values;
- leaves Keys added after version N empty;
- preserves values of now-archived Keys in history but does not make them
  current;
- creates a new `Restored from version N` snapshot.

No version is deleted or rewound in place.

### Archive

Archive is enabled only when all active Required Keys are type-valid and
non-empty.

Archive:

- writes `archived_at`;
- creates an immutable version;
- makes core fields, Values, Attachments, and Duplicate inputs read-only;
- retains Detail, Version History, and Compare visibility;
- excludes the Experiment from default lists and Compare rows.

Unarchive:

- is explicit and confirmed;
- clears `archived_at`;
- creates an immutable version;
- restores editing.

Archived Experiments continue to join the live Template schema. New Keys appear
as read-only `—`.

### Duplicate

Duplicate must remain available on unarchived Experiments.

Because the generic Template has no system-owned Input/Result distinction, the
dialog lists Field Labels and lets the user choose which Field Tables to copy.
All Field Labels are selected by default. The new Experiment:

- uses the same immutable Template;
- copies only selected Values;
- does not copy Archive state or version history;
- does not copy Attachments by default;
- receives a new ID, Name, Owner selection, and initial Status.

## Compare

Route: `/experiments/compare`

Compare is a single read-only data table, not multiple views.

### Entry and rows

The user selects one Template. All non-archived Experiments using that Template
become eligible rows. Archived rows are available through an explicit
`Include archived` filter.

The table never mixes Template IDs. A shared URL containing unavailable or
mixed-Template IDs removes invalid rows and explains why.

Fixed sticky columns are:

- Experiment ID;
- Name;
- Task;
- Owner;
- Status;
- Archive state when archived rows are included.

### Dynamic columns

Compare uses a two-level header:

1. Field Label spans its active Keys and uses the stable theme color;
2. each Key is an independently sortable and filterable column.

Keys preserve Template order by default. Users may hide or reorder visible
columns without changing the Template. Column selection, filters, sorting,
Template ID, Baseline ID, and the Include Archived flag are encoded in the URL
so the analysis is shareable.

Missing Values display `—`.

### Sorting and filtering

Value Type determines behavior:

- Number sorts numerically and supports min/max filters;
- Date/time sorts chronologically and supports ranges;
- Boolean and Select use exact option filters;
- Multi select supports contains-any/all;
- Short/Long text and URL support contains;
- Attachment supports present/missing.

Sort and filter never infer whether a Value is good.

The initial release loads one Template dataset and performs interactive
sorting/filtering client-side after the authoritative fetch. The acceptance
envelope is 200 Experiments and 50 active Keys without broken scrolling or
multi-second interactions. Larger measured workloads trigger a later
server-side query and virtualization phase rather than speculative complexity.

### Baseline difference

Difference highlighting is Baseline-relative only.

Selecting one visible Experiment as Baseline:

- pins and labels the Baseline row;
- highlights every other cell whose normalized Value differs;
- shows a neutral numeric Delta when both Baseline and current Values are
  Numbers;
- treats two missing Values as equal;
- treats missing versus present as different;
- compares Multi select as sets;
- compares Attachments by active Attachment identity;
- applies no green/red good-or-bad semantics.

Without a Baseline, difference highlighting and Delta are absent.

## Realtime and Error Handling

Realtime events invalidate the smallest authoritative resource:

- Template schema changes reload Template metadata and active Keys;
- Value changes reload the affected Experiment row/cell;
- Experiment core changes reload the affected row;
- Attachment changes reload the affected Attachment Key.

Local invalid edits are never written.

Expected error states include:

- Template archived between selection and Experiment creation;
- Key archived while its editor is open;
- Value Type mismatch;
- Required Values missing during Archive;
- same-cell revision conflict;
- Experiment archived or deleted remotely;
- Template schema revision conflict;
- failed autosave or restore;
- unavailable Baseline;
- Realtime disconnect.

Every error keeps the user's typed Value when safe, names the affected Key, and
offers a specific Retry, Reload, or conflict-resolution action. Errors do not
silently discard local input.

## Existing Data Migration

Migration must be additive and verifiable.

### Imported Legacy Template

Create one workspace-wide Template named `Imported legacy experiments` and
assign every existing Experiment to it. Using one Template preserves the
ability to compare legacy Experiments across Tasks.

Generate Field Labels from the existing content model:

- Data;
- Object;
- Environment;
- Config;
- Result;
- Decision;
- Note;
- Lifecycle;
- Attachments.

Generate Keys deterministically:

- flatten each Dataset position as `dataset_1_role`, `dataset_1_name`, and so
  on up to the maximum observed Dataset count;
- map fixed Object and Environment properties directly;
- create the union of all Config Keys, prefixed where necessary to keep
  Template-wide uniqueness;
- create the union of all Metric Keys as Number Keys;
- map Result Summary, Decision Outcome, Decision Notes, Note, Started At, and
  Completed At;
- create one Attachment Key and associate existing Attachment rows.

When one legacy Config Key has inconsistent primitive types across Experiments,
the migration uses Long text and serializes each value deterministically.

All imported Keys are Optional. This prevents a new generic Required rule from
retroactively blocking legacy records.

Every existing Experiment receives:

- the Imported Legacy Template ID;
- typed current Values;
- Attachment associations;
- one `migration` version snapshot.

The cutover migration also:

- drops `experiments_completed_decision_check`;
- replaces content-aware status validation with transition-only validation;
- replaces the legacy Experiment Activity trigger with the lifecycle-only
  behavior above.

### Verification

Before cutover, automated checks compare:

- Experiment counts and IDs;
- Task, Owner, Name, Status, and timestamps;
- every legacy JSON/scalar property against its generated Key;
- numeric Metric values without string conversion;
- Notes and Decision text;
- Attachment counts, IDs, captions, and Storage paths;
- one initial version per Experiment;
- zero cross-Template Value rows;
- zero orphan Field, Key, Value, option, or Attachment rows.

The migration does not drop legacy columns. Cleanup is a separate future
release after application and Agent API compatibility have been verified.

## Agent API Compatibility

The existing `/api/agent/v1` remains additive during the migration period.

Experiment responses gain:

- `template_id`;
- Template summary;
- typed `values` entries containing `key_id`, current Key string, Value Type,
  Value, and cell revision;
- `archived_at`;
- current version number.

Existing fixed Experiment fields remain in responses and are marked
deprecated. For the Imported Legacy Template, mutation adapters dual-write the
canonical typed Value and corresponding legacy column during the compatibility
period.

Create requests accept either:

- the deprecated fixed legacy payload, which selects the Imported Legacy
  Template; or
- `template_id` plus typed `values` addressed by stable `key_id`.

Patch requests address a stable `key_id` and include the expected cell
revision; Key strings are display/API convenience rather than mutation
identity. Legacy fixed patches remain valid only for the Imported Legacy
Template.

Template-aware endpoints expose:

- Template list and one Template schema;
- Experiment create/read/update/archive/unarchive;
- Experiment versions and restore;
- same-Template Compare source data.

The API rejects:

- changing `template_id`;
- cross-Template Keys;
- populated-Key Value Type changes;
- writes to Archived Experiments;
- Archive with missing Required Values;
- stale cell revisions.

Agent mutations use the same database functions as the browser so validation,
versioning, and conflict behavior cannot diverge.

## Performance and Indexing

Primary access paths are:

1. load active Templates;
2. load ordered Fields/Keys for one Template;
3. load one Experiment with all active Keys and Values;
4. load all non-archived Experiments and Values for one Template;
5. load versions for one Experiment or Template;
6. filter/sort one typed Key when server-side Compare is introduced.

Every foreign key receives an index. Partial indexes favor active Templates,
Fields, Keys, and non-archived Experiments. Composite indexes begin with the
Template or Experiment identifier used by the query.

The UI never fetches all history with the main Detail or Compare payload.
Version snapshots load on demand.

## Responsive and Accessibility

- Template Manager keeps the continuous schema table horizontally scrollable
  on narrow screens rather than collapsing columns into ambiguous cards.
- Experiment Detail remains one vertical Field Table column at all widths.
- Compare retains sticky identity columns and an explicitly focusable
  horizontal scroll region.
- Every Value editor has a visible label derived from Field Label and Key.
- Required state, errors, autosave, conflict, Archive, and Baseline never rely
  on color alone.
- Field theme colors use a finite contrast-checked palette in light and dark
  themes.
- Drag-and-drop ordering has keyboard move controls.
- Table headers use correct `scope`, including grouped Compare headers.
- Archived controls expose disabled/read-only semantics and explanatory text.

## Test and Acceptance Plan

### Domain and database

- Template ID cannot change after Experiment creation.
- A Value cannot use a Key from another Template.
- Value storage matches Key Value Type.
- Populated Keys reject Value Type changes.
- Renames and moves preserve stable IDs and Values.
- Adding a Key appears as missing on every linked Experiment without fan-out
  placeholder rows.
- Required Values block Archive but not creation/autosave.
- Status transitions do not depend on legacy Dataset, Model, Environment,
  Result, or Decision content.
- Archive blocks writes; Unarchive restores them.
- Cell revision conflicts affect the same Key only.
- Version restore creates a new version.
- RLS and explicit grants cover every new public table and function.
- Realtime publication includes intended public tables without modifying the
  `realtime` schema.

### Migration

- Existing Experiment, Metric, text, Config, Dataset, and Attachment data
  round-trips through the Imported Legacy Template.
- Mixed legacy Config types become deterministic Long text.
- Legacy columns remain intact.
- The legacy completed/Decision constraint and content Activity branches are
  retired without removing manual or lifecycle Activity.
- Backfill is idempotent or fails safely before cutover.

### Template Manager

- Columns are exactly Field Label, Key, Value Type, Required / Optional.
- Field Label cells are vertically centered.
- Field blocks use narrow gaps; Keys inside one Field do not.
- No row counts appear.
- Theme colors remain consistent.
- Impact preview describes schema changes.
- Populated type controls are locked.

### Experiment creation and Detail

- Every create flow requires a Template and explains immutability.
- Detail renders one full-width Field Table per active Field Label in one
  vertical column.
- Typed editors, validation, Enter/blur/Escape, autosave, Retry, and conflicts
  behave as specified.
- Version History groups sessions and can restore.
- Required indicators and Archive gating agree.
- Archived records are read-only and can be Unarchived.

### Compare

- Mixed Templates cannot enter one table.
- Core columns remain sticky.
- Field Label and Key headers align correctly.
- Type-aware sort and filter produce correct order/results.
- Baseline highlighting handles numeric, text, select, multi-select, missing,
  and Attachment Values.
- Numeric Delta is neutral and correct.
- Archived rows remain excluded until requested.
- URL state restores Template, Baseline, filters, sort, and visible columns.

### Rendered verification

Browser verification covers:

- Template Manager;
- Create Experiment Template selection;
- one editable Experiment;
- validation and autosave states;
- Version History and restore;
- Archive and Unarchive;
- Compare with sorting, filtering, Baseline, missing Values, and horizontal
  scrolling;
- desktop and mobile widths;
- light and dark themes;
- page identity, meaningful content, framework overlays, console health, and
  target interactions.

## Delivery Sequence

Implementation should proceed in these dependent phases:

1. additive database schema, constraints, RLS, grants, indexes, migration, and
   repository types;
2. Template Manager and Template-aware Experiment creation;
3. one-column Field Table Detail, typed autosave, conflicts, versions, and
   Archive;
4. same-Template Compare with sorting, filtering, and Baseline differences;
5. additive Agent API compatibility and legacy dual-write verification;
6. full migration cutover, Realtime verification, browser QA, and production
   rollout.

Each phase must keep all existing data recoverable. No phase may drop legacy
Experiment columns or permanently delete historical Values or Attachments.
