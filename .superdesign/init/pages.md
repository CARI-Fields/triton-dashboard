# Key page dependency trees

Trees below recursively trace local `@/` and relative imports. Shared root-shell dependencies are documented in `layouts.md` and apply to every entry.

## / (Task Board)

Entry: `app/page.tsx`

Dependencies:

- `components/Board.tsx`
  - `components/tasks/AddTaskDrawer.tsx`
    - `components/ui/Drawer.tsx` → `components/ui/useModalFocus.ts`
    - `components/ui/Icons.tsx`
    - `components/tasks/OwnerPicker.tsx` → `components/ui/OwnerAvatar.tsx`, `lib/members.ts` → `lib/types.ts`
    - `components/ui/Tag.tsx` → `lib/tasks/model.ts` → `lib/types.ts`, `components/ui/Icons.tsx`
    - `lib/status.ts` → `lib/types.ts`
  - `components/tasks/BoardSecondaryViews.tsx`
    - `components/ui/OwnerAvatar.tsx`; `lib/status.ts`; `lib/time.ts`; `lib/types.ts`
    - `components/tasks/TaskBoardView.tsx`
      - `components/tasks/TaskCard.tsx` → `components/ui/Icons.tsx`, `OwnerAvatar.tsx`, `StatusDot.tsx` → `lib/types.ts`, `Tag.tsx`, `lib/status.ts`, `lib/time.ts`, `lib/types.ts`
  - `components/tasks/TaskBoardView.tsx`
  - `components/ui/Icons.tsx`; `PageHeader.tsx`; `StatusDot.tsx`; `WorkspaceSkeleton.tsx`
  - `lib/activity.ts` → `lib/supabase.ts`, `lib/types.ts`
  - `lib/members.ts`; `lib/supabase.ts`; `lib/tasks/model.ts`; `lib/tasks/assignees.ts` → `lib/types.ts`; `lib/status.ts`; `lib/types.ts`

## /task/[id] (Task detail)

Entry: `app/task/[id]/page.tsx`

Dependencies:

- `components/TaskDetail.tsx`
  - `components/MarkdownField.tsx`
  - `components/ui/ActivityDrawer.tsx` → `components/ui/Icons.tsx`, `components/ui/useModalFocus.ts`
  - `components/ui/Icons.tsx`; `PageHeader.tsx`; `WorkspaceSkeleton.tsx`
  - `components/tasks/TaskProperties.tsx` → `OwnerPicker.tsx` → `OwnerAvatar.tsx`, `lib/members.ts` → `lib/types.ts`; `lib/tasks/model.ts`; `lib/status.ts`; `lib/types.ts`
  - `components/experiments/AttachmentGallery.tsx` → `lib/attachments/repository.ts` → `lib/supabase.ts`, `lib/types.ts`
  - `components/experiments/TaskExperimentsPanel.tsx`
    - `components/experiments/CreateExperimentDialog.tsx` → `lib/experiments/repository.ts` → `lib/supabase.ts`, `attachments/repository.ts`, `experiments/draft.ts` → `experiments/schema.ts` → `lib/types.ts`, `tasks/assignees.ts`, `experiments/policy.ts`; `components/ui/useModalFocus.ts`
    - `components/experiments/ExperimentTable.tsx` → `lib/time.ts`, `experiments/policy.ts`, `ExperimentStatusBadge.tsx`
    - `lib/experiments/compare-url.ts`; `lib/types.ts`
  - `lib/supabase.ts`; `lib/activity.ts`; `lib/members.ts`; `lib/status.ts`; `lib/tasks/model.ts`; `lib/tasks/assignees.ts`; `lib/time.ts`; `lib/types.ts`

## /experiments (Experiment index)

Entry: `app/experiments/page.tsx`

Dependencies:

- `components/experiments/ExperimentsDatabase.tsx`
  - `lib/experiments/filters.ts` → `lib/types.ts`
  - `lib/experiments/repository.ts` → `lib/supabase.ts`, `lib/attachments/repository.ts`, `lib/types.ts`, `lib/experiments/draft.ts` → `experiments/schema.ts`, `lib/tasks/assignees.ts`, `lib/experiments/policy.ts`
  - `lib/experiments/compare-url.ts`
  - `components/experiments/CreateExperimentDialog.tsx` → `lib/types.ts`, `repository.ts`, `components/ui/useModalFocus.ts`
  - `components/experiments/ExperimentFilters.tsx` → `lib/types.ts`, `filters.ts`, `policy.ts`
  - `components/experiments/ExperimentTable.tsx` → `lib/types.ts`, `lib/time.ts`, `policy.ts`, `ExperimentStatusBadge.tsx` → `lib/types.ts`, `policy.ts`
  - `components/ui/PageHeader.tsx`; `components/ui/WorkspaceSkeleton.tsx`; `lib/types.ts`

## /experiments/[id] (Experiment detail)

Entry: `app/experiments/[id]/page.tsx`

Dependencies:

- `components/experiments/ExperimentDetail.tsx`
  - `components/MarkdownField.tsx`; `components/ui/ActivityDrawer.tsx` → `Icons.tsx`, `useModalFocus.ts`; `Icons.tsx`; `PageHeader.tsx`; `WorkspaceSkeleton.tsx`
  - `lib/experiments/draft.ts` → `lib/types.ts`, `lib/experiments/schema.ts` → `lib/types.ts`
  - `lib/experiments/policy.ts` → `lib/types.ts`
  - `lib/experiments/repository.ts` → `lib/supabase.ts`, `lib/attachments/repository.ts`, `lib/types.ts`, `draft.ts`, `lib/tasks/assignees.ts`, `policy.ts`
  - `components/experiments/AttachmentGallery.tsx` → `attachments/repository.ts`, `lib/types.ts`
  - `BaselinePicker.tsx` → `experiments/compare.ts` → `lib/types.ts`, `policy.ts`; `BaselineSummary.tsx` → `lib/types.ts`, `compare.ts`, `policy.ts`
  - `ConfigEditor.tsx`; `DataEditor.tsx`; `ResultEditor.tsx` → `lib/types.ts`
  - `DecisionEditor.tsx` → `MarkdownField.tsx`, `policy.ts`, `lib/types.ts`
  - `DuplicateExperimentDialog.tsx` → `lib/types.ts`, `repository.ts`, `policy.ts`, `useModalFocus.ts`
  - `EnvironmentEditor.tsx` and `ObjectEditor.tsx` → `CommaListInput.tsx`, `lib/types.ts`
  - `ExperimentSection.tsx`; `ExperimentStatusBadge.tsx`; `ExperimentTimeline.tsx` → `lib/activity.ts`, `repository.ts`, `lib/time.ts`, `lib/types.ts`
  - `lib/types.ts`; `lib/time.ts`; `lib/experiments/compare-url.ts`

## /experiments/compare

Entry: `app/experiments/compare/page.tsx`

Dependencies:

- `components/experiments/ExperimentCompare.tsx`
  - `lib/types.ts`; `lib/experiments/compare.ts` → `lib/types.ts`; `compare-url.ts`
  - `lib/experiments/repository.ts` → `lib/supabase.ts`, `attachments/repository.ts`, `lib/types.ts`, `experiments/draft.ts` → `experiments/schema.ts`, `tasks/assignees.ts`, `experiments/policy.ts`
  - `components/experiments/share-request-authority.ts`; `components/ui/WorkspaceSkeleton.tsx`
- `lib/experiments/compare-url.ts`

## /analytics

Entry: `app/analytics/page.tsx`

Dependencies:

- `components/Analytics.tsx`
  - `components/ui/PageHeader.tsx`; `StatusDot.tsx` → `lib/types.ts`; `WorkspaceSkeleton.tsx`
  - `lib/supabase.ts`; `lib/tasks/analytics.ts` → `lib/status.ts` → `lib/types.ts`, `lib/types.ts`
  - `lib/tasks/model.ts` → `lib/types.ts`; `lib/tasks/assignees.ts` → `lib/types.ts`; `lib/status.ts`; `lib/time.ts`; `lib/types.ts`

## /admin/api-keys

Entry: `app/admin/api-keys/page.tsx`

Dependencies:

- `components/AuthGate.tsx` → `lib/supabase.ts`, `lib/auth.ts`
- `components/admin/ApiKeyAdmin.tsx`
  - `lib/supabase.ts`; `lib/agent-api/types.ts`
  - `lib/agent-api/admin-key-dto.ts` → `types.ts`, `admin-keys.ts` → `agent-api/auth.ts` → `errors.ts`, `server.ts`, `types.ts`; `errors.ts`
