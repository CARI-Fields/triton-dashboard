# Route map

Framework: Next.js 16.2.10 App Router with React 19 and TypeScript. Styling is global CSS (`app/globals.css` and `app/experiment-workspace.css`); no component-library package is installed. The `@/*` alias resolves to the repository root.

All UI routes inherit the root layout at `app/layout.tsx`, which wraps pages in `ThemeProvider`, `AuthGate`, `Navbar`, and the `app-content` main region. API route handlers are listed separately because they do not render the shared UI shell.

## Rendered App Router pages

| URL | Route file | Page component / summary | Layout |
| --- | --- | --- | --- |
| `/` | `app/page.tsx` | `Board`: task-board workspace with board, types, ownership, and team views plus task creation. | `app/layout.tsx` |
| `/task/[id]` | `app/task/[id]/page.tsx` | `TaskDetail`: task properties, activity, attachments, and associated experiments. | `app/layout.tsx` |
| `/task/[id]` loading | `app/task/[id]/loading.tsx` | Task-detail loading state. | `app/layout.tsx` |
| `/experiments` | `app/experiments/page.tsx` | `ExperimentsDatabase`: filterable experiment index, create dialog, and comparison selection. | `app/layout.tsx` |
| `/experiments/[id]` | `app/experiments/[id]/page.tsx` | `ExperimentDetail`: editable experiment record with structured sections and evidence. | `app/layout.tsx` |
| `/experiments/[id]` loading | `app/experiments/[id]/loading.tsx` | Experiment-detail loading state. | `app/layout.tsx` |
| `/experiments/compare` | `app/experiments/compare/page.tsx` | `ExperimentCompare`: query-string driven multi-experiment comparison. | `app/layout.tsx` |
| `/analytics` | `app/analytics/page.tsx` | `Analytics`: task status, ownership, and timing analytics. | `app/layout.tsx` |
| `/admin/api-keys` | `app/admin/api-keys/page.tsx` | `ApiKeyAdmin`: team API-key management; it additionally nests `AuthGate`. | `app/layout.tsx` |

## API-only route handlers (no visual layout)

- `app/api/admin/v1/api-keys/route.ts` → `/api/admin/v1/api-keys`
- `app/api/admin/v1/api-keys/[id]/route.ts` → `/api/admin/v1/api-keys/[id]`
- `app/api/admin/v1/api-keys/[id]/revoke/route.ts` → `/api/admin/v1/api-keys/[id]/revoke`
- `app/api/admin/v1/api-keys/[id]/rotate/route.ts` → `/api/admin/v1/api-keys/[id]/rotate`
- `app/api/agent/v1/audit/route.ts` → `/api/agent/v1/audit`
- `app/api/agent/v1/board/route.ts` → `/api/agent/v1/board`
- `app/api/agent/v1/capabilities/route.ts` → `/api/agent/v1/capabilities`
- `app/api/agent/v1/members/route.ts` → `/api/agent/v1/members`
- `app/api/agent/v1/modules/route.ts` → `/api/agent/v1/modules`
- `app/api/agent/v1/tasks/route.ts` and `app/api/agent/v1/tasks/[id]/route.ts` → task collection/item endpoints
- `app/api/agent/v1/tasks/[id]/activity/route.ts` → task activity endpoint
- `app/api/agent/v1/tasks/[id]/experiments/route.ts` → task experiments endpoint
- `app/api/agent/v1/experiments/route.ts` and `app/api/agent/v1/experiments/[id]/route.ts` → experiment collection/item endpoints
- `app/api/agent/v1/experiments/[id]/attachments/route.ts` and `app/api/agent/v1/attachments/[id]/route.ts` → attachment endpoints

There are no nested `layout.tsx` files, route groups, parallel routes, middleware, or configuration-based client router in this repository.
