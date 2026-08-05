# Triton Board：Blueprint 全量重构设计（第一性原理）

**日期：** 2026-08-05

**状态：** 设计已确认，待书面复核；通过后转 writing-plans 出实施计划

**范围：** 全量 8 个屏 + Template / ApiKey 数据模型，基于真实 Palantir Blueprint 设计系
统。一次性设计，不分阶段。

**取代：** 2026-07-27「Notion-like Research OS」设计中的**视觉语言**决策（改为 Blueprint）。
那版 spec 的功能、行为、数据规则继续有效；与本文冲突处以本文为准。

**参考：**
- 设计源：`~/Downloads/Triton Dashboard Blueprint重构(1).zip`（SuperDesign `.dc.html`，真实
  `@blueprintjs/core` 组件）
- 领域事实：`README.md`、`lib/types.ts`、`lib/experiments/policy.ts`、`lib/experiments/compare.ts`
- 后端契约：`docs/superpowers/specs/2026-07-28-triton-board-agent-api-design.md`（ApiKey / 审计 /
  权限模型）

---

## 1. 背景与目标

Triton Board 是 Triton Kernel Agent（RL Training）项目的实时研究协作面板：Task 协调 +
Experiment 记录 + 横向对比 + 进度分析，并正在引入 AI Agent 协作。

本次把整个产品重建到 Blueprint 设计系统上，并以第一性原理重新推导信息架构与领域模型，
而不是在旧实现或旧视觉上贴皮。

完成后用户（人 + Agent）应能：

1. 在统一的 Blueprint Shell 中访问 8 个屏。
2. 在 Experiment record 上**一眼看清它是否完整到可以推进**（Promotion checklist）。
3. 用 **Template** 定义某类实验的字段形状，并按模板结构化录入实验。
4. 用 **API Key** 给 Agent 发放 scoped 凭据并管理其生命周期。
5. 在 Compare 中严格依据现有 Schema 做横向宽表对比。
6. 保留全部现有功能行为（realtime、并发、Draft、Conflict、Baseline、状态 gate）。

## 2. 第一性原理

1. **协作单位是 Task，证据单位是 Experiment**。结构 `Project → Task → Experiment`。
2. **Experiment 的价值 = 可复现性 + 决策**。没有 runnable context 不可验证；没有 decision
   是噪声。产品根本职责：让"这个实验是否完整到可以推进"可见且被强制。
3. **进度 = 基于完整证据做出的决策**。Board 暴露 blocked / running / 已决策。
4. **不同研究线衡量不同东西** → 实验字段有形状，且形状应可定义、可复用（Template）。
5. **Agent 是二等协作者**：在某人协作范围内读写、永不删除、全程审计。

由 (2) 推出：**生命周期 gate 是产品脊柱**。由 (4) 推出：**Template 是与 Experiment 实例分离
的 schema**。

## 3. 范围

### 3.1 包含

- 真实 `@blueprintjs/core@6` 设计系统接入（Provider / CSS / 图标 / token 映射）。
- 8 个屏（App Shell 为统一框架，不计为独立屏）：Task Board、Task detail、Experiments、
  Experiment record（含**读/编两种视图**，同一 record）、Compare、Templates、API keys、Analytics。
- 新领域模型：**Template**（叠加层）、**ApiKey**、UUID **Owner** 关系、Agent 审计日志引用。
- 生命周期 Promotion checklist（现有 `policy.ts` 的可视化）。
- 统一状态组件、无障碍、响应式。

### 3.2 不包含（本次）

- **Dark mode**：蓝图 Light-only，本次只做 Light。
- Agent API **后端实现**（Route Handlers / RPC / RLS / 幂等 / OpenAPI / Python skill）：本设计
  定义其**数据模型与 UI 面**，后端物理实现范围留待 planning 阶段裁定（见 §12）。
- 多 Project、新身份/角色/权限系统、软删除/回收站、统计显著性判断、自动实验采集。
- 为视觉效果虚构 Experiment 字段、指标、趋势或预测。

### 3.3 数据原则

蓝图中的示例数据/文案**仅作布局示意**。真实内容来自 `lib/types.ts` 与现有数据。Compare 字段
继续由 `compare.ts` 派生，不维护第二份硬编码清单。

## 4. 领域模型

### 4.1 Task：Type + Tags + UUID Owner

- **Type**：零个或一个用户自定义主分类。沿用现有 `modules` 表作非破坏式承载（`name`→Type 名、
  `objective`→描述、`position`→顺序；`kind` 退为 legacy，UI 不再使用其语义）。
- **Tags**：自由文本数组，不建独立 Tag 表；颜色由规范化文本稳定映射到低饱和 palette。
- **Owner**：从 `tasks.assignees text[]` 升级为 UUID 引用（见 §4.5）。术语统一为 Owner。
- 新增 `tasks.tags text[] default '{}'`、`tasks.priority text default 'medium'`、
  `tasks.due_date date null`；`module_id` 改 nullable 且 `on delete set null`。

### 4.2 Experiment + Template（叠加层 = 判断 1，方案 A）

Experiment 的**强类型 specs**（`data_spec` / `object_spec` / `environment_spec`）保持为 runnable
context 的权威形状，**不变**。Template 作为**叠加层**定义某类实验**期望的字段元数据**：

- 期望的 **metric** 键（key / label / unit / direction / required / featured）。
- 期望的 **config** 键（key / label / type / required / default）。
- 可选：对 promotion checklist 的**额外要求**叠加（如"本类实验必须填 `reward` 才算有 result"）。

Experiment 增加 `template_id`、`template_version`（均可空；空 = freeform，沿用现状）。

编辑器按 template 字段渲染结构化表单；键不在 template 中时退化成 freeform。底层存储仍是现有
`config` / `metrics` / specs → **无损、可增量、老实验零迁移**。

### 4.3 Template 数据结构（v1）

```jsonc
{
  "metricFields": [
    { "key": "reward", "label": "Reward", "unit": "", "direction": "higher",
      "required": true, "featured": true, "order": 1 }
  ],
  "configFields": [
    { "key": "lr", "label": "Learning rate", "type": "number",
      "required": false, "default": null, "order": 1 }
  ],
  "checklistOverlay": [
    { "id": "metric_reward", "field": "metrics.reward",
      "label": "Reward recorded", "appliesTo": ["analyzing", "completed"] }
  ]
}
```

- Template **版本化**：`unique(name, version)`；改字段产生新 version，不就地改已被引用的版本。
- Experiment 创建时钉住 `template_id` + `template_version`。
- Templates 屏提供字段/键 schema 编辑器 + 版本历史 rail（只读历史 + 当前可编辑草稿）。

### 4.4 ApiKey / Audit（引用 agent-api spec）

- `api_keys`（spec §8.1）：name / member_id / scopes / key_prefix / key_digest / expires_at /
  revoked_at / last_used_at。原始 key 仅创建/轮换时返回一次；DB 只存 prefix + SHA-256 digest。
- `agent_api_audit_log`（spec §8.2）：append-only before/after 快照。
- Scopes 固定集（spec §6.1）：`board:read` / `tasks:write` / `experiments:write` /
  `attachments:write` / `activity:append` / `audit:read`。无 `delete` / `admin` / `batch`。
- `attachments` 增加 `updated_at`（支持 caption PATCH 的 If-Match）。

### 4.5 UUID Owner 关系

```text
task_assignees(task_id uuid → tasks.id, member_id uuid → members.id, created_at)
primary key (task_id, member_id)；索引 (member_id, task_id)
```

迁移（spec §7）：校验每个历史 assignee 名唯一匹配 `members.name` → 回填 `task_assignees` →
应用读写切换到 UUID → 保留旧 `tasks.assignees` 列暂不读不写。本设计要求 Dashboard 与 Agent 共用
这套 UUID 关系，作为人 + Agent 协作范围的单一事实来源。

## 5. 生命周期脊柱：Promotion checklist

`policy.ts` 已精确编码全部 gate：`runnableIssues`（running 前置：owner / dataset / model / 平台 /
server-or-device / config）、`hasResult`（analyzing 前置：metric 或 result_summary）、
`validateForStatus`（completed 前置：runnable + result + decision）、`canTransition`（状态机）。

**设计决定**：不新造 checklist 概念，**把现有 policy 直接渲染成 Experiment record 右侧的
Promotion checklist（只读）**：

- 清单项 = gate 规则；状态（✓/○）由 `validateForStatus(experiment, nextStatus)` 计算。
- 状态选择器推进时仍走 `canTransition` + `validateForStatus`；失败则高亮对应清单项并阻止。
- Template 的 `checklistOverlay` 可追加本类实验专属项，并入同一计算。

→ 清单与状态机是同一规则的两个视图，单一事实来源 = `policy.ts`。

状态机与术语保持现状：`planned → running → analyzing → completed`，加 `blocked` / `cancelled`。

## 6. 信息架构与导航

```text
App Shell（侧栏）
├─ Task Board          `/`
│  └─ Task detail      `/task/[id]`
├─ Experiments         `/experiments`
│  ├─ Record (读)      `/experiments/[id]`
│  └─ Record (编)      `/experiments/[id]`（编辑态/分区切换）
├─ Compare             `/experiments/compare`
├─ Templates           `/templates`（新）
├─ API keys            `/admin/api-keys`（新）
└─ Analytics           `/analytics`
```

主导航顺序固定：Task Board / Experiments / Compare / Templates / API keys / Analytics。
`aria-current="page"` 准确反映嵌套路由（Task detail 属 Board，Experiment record 属 Experiments）。

## 7. 视觉系统（Blueprint）

### 7.1 集成与 RSC 边界

- `@blueprintjs/core@6`（+ 按需 `@blueprintjs/icons`、`@blueprintjs/select`）。peer `react/react-dom
  18||19`，与项目 React 19.2.4 / Next 16.2.10 兼容。
- Next 16 第三方 CSS 导入、字体、client 边界以 `node_modules/next/dist/docs/` 为准（AGENTS.md）。
- 根 `layout` 包 `BlueprintProvider`；页面保持 Server Component 取数；交互组件为 client。
- 建一层 `components/ui/*` 客户端原语封装 Blueprint；业务逻辑/取数留在 server / lib。

### 7.2 Token 与主题

- `import "@blueprintjs/core/lib/css/blueprint.css"` + 图标字体。
- 保留薄语义 token 层，别名到 Blueprint `--bp-*`，让旧手写 CSS 与 `bp5-*` 共存、逐屏退役。
- **Light-only**。普通 Card 无阴影；阴影仅用于 Dialog/Drawer/Popover。

### 7.3 共享原语（替换现有手写组件）

| 原语 | Blueprint 基础 | 替换 |
| --- | --- | --- |
| `AppShell` + `SidebarNav` | 自绘 + `Icon`/`Tag` | `Navbar.tsx` |
| `PageHeader`（eyebrow/H1/lede） | 文本 | 散落标题 |
| `Breadcrumbs` | `Breadcrumbs` | 各页返回链 |
| `Toolbar` | `InputGroup`/`HTMLSelect`/`SegmentedControl`/`Button` | 手写工具栏 |
| `DataTable` | `HTMLTable` + sticky | `ExperimentTable` |
| `StatusTag`/`StatusDot`/`Tag` | `Tag` | `.pill`/`.dot` |
| `Button`/`IconButton` | `Button`/`Tooltip` | `.btn`/`.icon-btn` |
| `Card`/`Callout`/`ProgressBar` | 同名 | `.stage`/`.kpi`/`.progress` |
| `Drawer`/`Dialog` | `Drawer`/`Dialog` | 自写 modal |
| `FieldTable`/`ValueEditor`/`MarkdownField` | `InputGroup`/`TextArea` | 现有 editors |
| `PromotionChecklist` | `Card` + `Icon` | （新） |
| 状态族：Skeleton/Empty/ErrorBanner/SaveBar | `Skeleton`/`NonIdealState`/`Callout` | 零散实现 |

## 8. 逐屏设计

> 统一节奏：**面包屑 → 页头（eyebrow + H1 + lede）→ 工具栏（搜索/筛选/Segmented/主操作）→ 内容**。

### 8.1 App Shell / Sidebar

- 左侧固定侧栏：品牌（Triton Board logo + 名）、分组导航（带图标 + Active 态）、底部 live 徽标
  与用户/登出。
- 移动端收为顶栏 + 可开合 Sheet，保留可访问 label。
- 保留 AuthGate、realtime、路由高亮。

### 8.2 Task Board（`/`）

- 页头 + 工具栏：Status 图例、`Group by: Status | Type`、Filter、搜索、`New task`。
- 默认四列 Status（To do / In progress / Done / Blocked）；`Group by: Type` 时每 Type 为列，
  无 Type 入 `No type`，卡片仍显示 Status。
- Task 卡片：Title / Type（meta）/ Tags / Owner 头像 / 更新时间；hover 出 Open + Overflow（危险
  操作进 Overflow）。点标题进 `/task/[id]`。
- 保留快速 Rename、Status 更新、Owner 编辑、Delete（带确认）、列底 `Add task`。

### 8.3 Task detail（`/task/[id]`）

- 面包屑回 Board；可编辑大标题；属性网格（Status / Type / Tags / Owner / Priority / Due /
  Created / Updated）。
- 正文：Description（markdown）/ Experiments（关联表，支持 New / Multi-select Compare / 打开详
  情）/ Attachments。
- Activity：宽屏右侧 rail，窄屏移到正文后。保留 realtime 与并发反馈、Delete 进 Overflow + 确认。

### 8.4 Experiments（`/experiments`）

- 页头（eyebrow `Research database`）+ 工具栏：Saved Views（All / Running / Blocked / Needs
  Decision / Recently Completed）、Search / Task / Owner / Status / Decision 筛选、
  `Compare selected (n)`、`New experiment`。Toolbar 显示当前结果数。
- `DataTable` 列顺序：Selection / ID / Name / Task / Owner / Status / Decision / Featured metrics
  / Updated。Header sticky；1px 分隔；Status 用 Dot+Text；Featured metrics 紧凑 Key/Value。
- 选 ≥2 行启用 Compare；选中行轻蓝底。空/Loading/Error/Retry 占位稳定，不让 toolbar 跳动。
- 排序只对已加载数据做明确客户端排序并展示当前排序。

### 8.5 Experiment record（读）（`/experiments/[id]`）

- 同一路由 `/experiments/[id]` 上的**读视图**；`Edit` 操作切换到编视图（§8.6），Save/Cancel 回到读视图。
- 面包屑回 Task 或 Experiments；Experiment ID 为 eyebrow；Name 可编辑大标题；Header 显
  Saved/Unsaved/Conflict；主操作按状态显 `Save changes`；Compare / Duplicate 次级；Delete 进 Overflow。
- 属性网格：Task / Owner / Status / Current status / Baseline / Created / Started / Completed。
- 正文分区（对齐蓝图）：**Runnable context**（= Data+Object+Environment+Config）/ **Metrics vs
  baseline**（紧凑属性表 + Featured 标记）/ **Result & decision**（result_summary + decision）/
  **Evidence**（Attachments gallery/plots）。
- **右侧 Promotion checklist rail**（见 §5）。≥1280px 为 rail，否则移正文末尾。
- Section anchor sticky（文本+下划线 active，不用 pill tab）。
- 保留 Draft、Conflict（Keep editing / Load latest）、Save、Baseline 校验、Timeline（realtime）。

### 8.6 Experiment record（编）

- 同一 record 的**采集视图**：按 Experiment 所钉 Template 的字段渲染**结构化字段表**
  （`FieldTable` + `ValueEditor`），覆盖 metric/config（以及 spec 的可结构化部分）。
- 键不在 template 中 → freeform 行。`Version drawer` 显示所钉 template 版本与可切换的可用版本。
- 无 template 的实验退化为现有内联 editors（不阻断）。
- 同一 Save/Conflict/Concurrency 语义；状态推进仍受 promotion checklist 约束。

### 8.7 Compare（`/experiments/compare`）

- **横向宽表**：每个 Experiment 一行，每个 Schema field 一列。Baseline 行固定首位 + 轻蓝底。
  `Experiment`/`Task`/`Status` 为左侧 sticky 身份列；容器水平滚动 + 可见滚动提示。
- 控件：Add experiment（搜索选择）/ Baseline 选择 / Differences only / Field Groups / Share URL /
  当前选择列表 + Remove。Field Groups：Data / Object / Environment / Config / Result / Decision & Note。
- 列只来自 `compare.ts` 的 `flattenExperiment` / `buildCompareColumns`；Delta = current − baseline，
  仅对两侧均为有限数的 metric 产生；缺失/非有限显 `—`；`Differences only` 隐藏完全相同字段。
- Footnote 解释 `—` 与 delta 规则。保留 URL 序列化选择。

### 8.8 Templates（`/templates`，新）

- 左：模板列表 rail（name / version / 使用中实验数）。中：字段/键 schema 编辑器（metricFields /
  configFields / checklistOverlay，行内编辑 key/label/unit/type/required/order）。右：版本历史
  rail（只读历史版本 + 当前可编辑草稿；保存发新 version）。
- 删除模板：无实验引用时可删除；有引用时禁止删除（提示新建下一版本），不级联。已钉实验继续按其
  `template_version` 渲染，不受模板后续版本影响。

### 8.9 API keys（`/admin/api-keys`，新）

- Admin 面。表格：Name / Member / Scopes（tags）/ Prefix / Last used / Status（active/expired/
  revoked）。`Create API key` 打开 Dialog：name / member / scopes / expiry；成功**一次性**显示原始
  secret（可复制，仅此一次）。行操作：Rotate（返回新 secret，旧 secret 立即失效）/ Revoke / Edit。
- 不提供删除端点（已吊销记录保留供审计）。UI 仅在 Admin 身份下可见（spec §5.3）。
- 后端（GET/POST/PATCH/rotate/revoke + Agent API）见 agent-api spec；UI 按 §12 裁定实现范围。

### 8.10 Analytics（`/analytics`）

- 仅从现有数据派生，不虚构趋势/预测。
- 全宽 hairline 分隔的 **KPI strip**：Total / In progress / Done / Blocked / Completion（不用浮动
  大卡）。
- **Progress by status**（slim 堆叠条 + legend）；**Progress by type**（Type / 任务数 / 分段进度 /
  done/in-progress/blocked / owner 覆盖）；**Workload by owner**（owner / 任务数 / 紧凑分段条）；
  **Needs attention**（Blocked task / Type / Owner / Updated，链接回 Board）。

## 9. 状态、反馈、无障碍、响应式

- 统一：Skeleton（保持结构）/ Empty（一句 + 一个最相关操作）/ Inline Error（靠近失败字段）/
  Page Error（Banner + Retry）/ Saving（`aria-busy`，禁重复提交）/ Success（短暂 inline）/
  Conflict（保 Draft + Keep editing / Load latest）/ Disabled（不只降透明度）/ Destructive
  （Overflow + 确认）。
- a11y：WCAG AA；focus ring 2px accent；icon-only button 有 `aria-label`；Status/Decision/Delta 不
  只靠颜色；Dialog/Drawer 用 `aria-modal` + focus trap + escape + restore；`prefers-reduced-motion`
  关非必要动画。
- 响应式：桌面 ≥1280 为基准；1280/1024/768/390 无不可达操作；侧栏在窄屏收折；Board/Compare/
  Database 保持真实表结构并水平滚动；touch target ≥44px。

## 10. 数据模型与迁移

新增迁移（续 `0007+`）：

- `task_assignees`（§4.5）+ 历史 assignee 校验/回填。
- `tasks`：`tags text[] default '{}'`、`priority text default 'medium'`（check: low|medium|high|
  urgent）、`due_date date null`；`module_id` nullable + `on delete set null`。
- `templates`（id / name / description / version int / sections jsonb / created_at / updated_at；
  `unique(name, version)`）。
- `experiments.template_id uuid null`、`experiments.template_version int null`。
- `attachments.updated_at`。
- `api_keys`、`agent_api_audit_log`（spec §8.1/§8.2，含 RLS：撤销 anon/authenticated 直接表权限）。
- 必要 RPC（spec §8.4）随 Agent API 后端实现（见 §12）。

所有表继续启用 realtime 与 RLS。迁移用 `npm run db:migrate`，文件放 `supabase/migrations/`。

## 11. 保留（不可削弱）

Supabase Auth/RLS；Realtime subscriptions；Task/Experiment 乐观/受控 mutation（`updated_at`）；
Experiment Draft 持久化；Remote Conflict 调和；`policy.ts` 状态 gate 与 Baseline 校验；
`compare.ts` 派生列与 Delta 规则；URL-serialized Compare；Attachment 上传/删除；Timeline；
Agent API 契约（不删除、按 scope、可审计、Idempotency-Key、If-Match）。

## 12. 开放项（留待 planning）

- **Agent API 后端实现范围**：本设计纳入其数据模型与 API-keys UI。后端 Route Handlers / RPC / RLS /
  幂等 / 限流 / 审计 / OpenAPI / Python skill 的物理实现是否并入本次构建，在 writing-plans 阶段
  裁定（它与 UI 可分离，可先以 mock/最小 server 支撑 UI 联调）。
- 模板 `checklistOverlay` 与全局 `policy.ts` 的合并优先级（是否 v1 只做全局 gate、overlay 进 v2）。

## 13. 验收标准

- 8 个屏共享同一 Blueprint shell / 字阶 / 控件体系；控制台无 hydration、无效 DOM、未处理 promise
  或 Supabase 错误。
- Experiment record 的 Promotion checklist 与状态选择器一致反映 `policy.ts`，状态推进受其约束。
- Template 可创建/版本化；按模板可结构化录入实验；无模板实验不阻断。
- API keys 可创建（一次性 secret）/ rotate / revoke；scopes 与 member 绑定正确。
- 现有全部功能（Task/Experiment CRUD、Compare、realtime、Draft、Conflict、Attachment、Timeline、
  Baseline/Delta）回归通过；现有 Vitest 全绿 + 新增关键交互测试。
- 桌面 1440/1536 为基准，1280/1024/768/390 无不可达操作。
- 真实内容来自 `lib/types.ts` 与现有数据；无虚构字段/指标/趋势。
- 数据迁移无损：老 Task/Experiment/assignee 全部可读可编辑；`task_assignees` 回填可验证。

## 14. 参考

- `README.md`（Task+Experiment workflow、routes、data model）
- `lib/experiments/policy.ts`（状态 gate）、`lib/experiments/compare.ts`（Compare 派生）
- `docs/superpowers/specs/2026-07-28-triton-board-agent-api-design.md`（ApiKey / 审计 / 权限）
- `docs/superpowers/specs/2026-07-27-triton-dashboard-design-system-design.md`（被取代的视觉语言；
  其 Type/Tags/Owner/响应式/无障碍细则仍可借鉴）
- 设计源 zip（SuperDesign `.dc.html`，真实 Blueprint 组件）
