# Triton Board Phase 1：Task + Experiment 知识闭环设计

**日期：** 2026-07-24

**状态：** 对话设计已确认，等待书面 Spec 复核

**范围：** Phase 1，仅覆盖 Task 与 Experiment 的知识闭环

## 1. 目标

Triton Board 当前已经支持 Task、基础 Experiment 记录、Metrics、附件、Task
Activity 和 Realtime，但它仍主要是一个可编辑状态看板。Phase 1 要把它升级为
适合 Triton Kernel Agent 团队的研究协作空间，使成员仅查看 Task 和其关联的
Experiments，就能回答：

1. 这项工作要解决什么问题，由谁负责？
2. 实验使用了什么数据、对象、环境和配置？
3. 结果是什么，相对哪个明确的 Baseline？
4. 上下文是否一致，哪些字段发生了变化？
5. 团队最终做了什么 Decision，下一步 Task 如何推进？

实验内容由成员手动录入。Phase 1 不读取 `triton-op-agent` 的运行目录、
`result.txt`、Git commit 或其他仓库产物，也不暗示存在自动同步。

## 2. 路线图与范围边界

整体产品按三个阶段推进：

1. **Phase 1：Task + Experiment 知识闭环。**
2. **Phase 2：团队动态、关注与异步同步。**
3. **Phase 3：Project Dashboard、风险与进度预测。**

Phase 1 明确不做：

- 不增加 Subtask 或无限层级。
- 不增加个人 Supabase 账号或成员权限系统。
- 不自动读取实验运行产物。
- 不自动判断统计显著性。
- 不自动判定 Metric 变化是好或坏。
- 不自动更新 Task 状态。
- 不实现团队 Feed、关注通知或进度预测。
- 不新增多 Project 数据模型；当前 Board 继续代表一个 Project。

## 3. 核心领域模型

Phase 1 的唯一层级是：

```text
Project（当前 Board）
└── Task
    └── Experiment
```

- **Task** 是团队协作和进度管理单位，描述目标、Owner、Status、验收标准和
  Notes。
- **Experiment** 是 Task 下的研究证据，描述具体运行上下文、结果和决策。
- 一个 Task 可以有零个或多个 Experiments。
- 一个 Experiment 必须归属于且只归属于一个 Task。
- 文档、部署等非实验型 Task 可以没有 Experiment。
- Experiment Decision 只提示负责人评估 Task 状态，不自动修改 Task。

## 4. Experiment 内容模型

每个 Experiment 有顶部协作属性和七个正文区块。

### 4.1 顶部协作属性

- 所属 Task
- Owner
- Status
- Created time
- Started time
- Completed time
- 可选 Baseline Experiment

### 4.2 七个正文区块

1. **Data**：训练集和/或评测集，包括角色、名称、Split、Revision、Task 数和
   Samples per task。
2. **Object**：Model 与 Harness；Harness 细分为 Prompt、Skills、Tools、Parent
   和 Change Summary。只保存名称、版本、路径或摘要，不复制完整文件内容。
3. **Environment**：NPU/GPU、Server、Device、Hardware、Evaluator/Grader、
   Revision 和 Precision policy。
4. **Config**：可扩展的实验参数，例如 `max_turns`、`temperature`、`top_p`、
   `max_tokens` 和 `eval_concurrency`。
5. **Result**：数字 Metrics、可选的定性 Result Summary，以及现有的
   Experiment Plots/Images 与 Captions。
6. **Decision**：结构化 Outcome 加 Markdown 说明。
7. **Note**：Experiment 的自由 Markdown Notes。

### 4.3 Experiment Status

```text
Planned → Running → Analyzing → Completed
             ↓
           Blocked

任意未完成状态 → Cancelled
```

允许的值：

- `planned`
- `running`
- `analyzing`
- `completed`
- `blocked`
- `cancelled`

规则：

- 进入 `running` 前，Owner、Data、Object、Environment 和 Config 必须填写：
  Data 至少包含一个 Dataset；Object 至少包含 Model；Environment 至少包含
  Platform 和一个 Server/Device 描述；Config 至少包含一个显式参数或
  `profile: "defaults"`。
- 首次进入 `running` 时设置 `started_at`。
- 进入 `analyzing` 前必须存在至少一个 Metric 或 Result Summary。
- 进入 `completed` 前必须同时满足 Running 的上下文要求，并存在 Result 和
  Decision。
- 进入 `completed` 时设置 `completed_at`。
- `blocked` 和 `cancelled` 不强制要求 Result 或 Decision。

允许的恢复路径：

- `blocked` 可以回到 `planned`、`running` 或 `analyzing`，由成员选择恢复阶段。
- `cancelled` 可以回到 `planned`。
- `completed` 可以回到 `analyzing` 以修订 Result/Decision；此时清空
  `completed_at`，再次完成时写入新的时间。
- `started_at` 始终保留首次进入 `running` 的时间。

### 4.4 Decision

Decision Outcome 使用：

- `reference`：作为对照或记录基线。
- `accepted`
- `rejected`
- `inconclusive`

Baseline 是 Experiment 间的比较关系，不由 Decision 自动推导。任何 Experiment
都只能在用户显式选择后成为另一个 Experiment 的 Baseline。

## 5. Baseline 与比较

### 5.1 Experiment 页面的一对一比较

每个 Experiment 可以选择零个或一个 Baseline：

- Baseline 必须显式选择，不能由时间、Task 顺序或最近记录自动猜测。
- Baseline 不能指向当前 Experiment 自己。
- Baseline Selector 默认只列出当前 Task 的 Experiments，也允许成员主动搜索
  当前 Board 中其他 Task 的 Experiment；跨 Task 选择必须显示 Context 差异。
- Duplicate 时，用户已经显式选择了 Source Experiment；创建确认界面会清楚显示
  `Baseline = Source Experiment`，因此这属于显式选择而不是系统猜测。
- 未选择 Baseline 时，只显示当前 Experiment 的原始 Result，不显示任何 Delta。
- 选择 Baseline 后，页面始终显示 Baseline 的 ID 和 Name。
- 数字 Delta 只针对两边同名的数字 Metric：

  ```text
  delta = current value - baseline value
  ```

- Delta 不持久化到数据库，避免 Baseline 更新后留下过期值。
- 缺失 Metric 显示 `—`。
- Data、Object、Environment 和 Config 展示相同项与差异项，但系统不自动判断
  两个实验是否可比。
- Delta 使用中性视觉，不自动用绿色或红色解释结果；判断写在 Decision。

### 5.2 Dedicated Compare 页面

Dedicated Compare 支持选择多条 Experiment，不设置 4 条业务上限。Phase 1
必须流畅支持至少 20 条所选 Experiment；更大的选择受正常 URL 长度、查询和浏览器
渲染约束，而不是承诺无限容量：

- Experiment 作为行，字段作为列。
- Baseline 可选；选择后固定在第一行。
- Experiment Name 列固定在左侧。
- Data、Object、Environment、Config、Result、Decision & Note 作为可切换
  字段组。
- `Diff only` 隐藏所有所选 Experiments 中完全相同的字段。
- 取消 Baseline 后所有 Delta 列一起消失。
- 缺失值显示 `—`。
- 所选 Experiment IDs 和 Baseline ID 保存在 URL Query 中，使链接可分享：

  ```text
  /experiments/compare?ids=<uuid>,<uuid>&baseline=<uuid>
  ```

Dedicated Compare 不保存衍生 Delta，也不保存独立的数据副本。

## 6. 创建与 Duplicate

### 6.1 New Experiment

从 Task 页面或全局 Experiments 页面创建：

- 必填 Name 和 Owner。
- 从 Task 页面创建时自动关联当前 Task。
- 初始 Status 为 `planned`。
- Data、Object、Environment、Config 初始为空。
- 数据库自动产生 `Experiment created` Timeline 事件。

### 6.2 Duplicate Experiment

Duplicate 复制：

- Task
- Owner（创建时可更换）
- Data
- Object
- Environment
- Config

Duplicate 不复制：

- Result Metrics
- Result Summary
- Decision
- Note
- Attachments
- Timeline
- Started/Completed time

新 Experiment：

- Status 重置为 `planned`。
- 原 Experiment 自动成为可清除或更换的 Baseline。
- 由一个 Experiment Insert 完成；Timeline Insert 由数据库 Trigger 在同一事务
  中生成。

## 7. 数据库设计

保留现有 `modules`、`tasks`、`members`、`experiments`、`attachments` 和
`activity` 表。使用 additive migration
`supabase/migrations/0006_experiment_workspace.sql` 扩展现有表。

### 7.1 `experiments`

```text
id                       uuid primary key                    existing
experiment_no            bigint identity unique             new
task_id                  uuid → tasks on delete cascade      existing
owner_id                 uuid → members on delete set null   new
name                     text                                existing
status                   text                                new

baseline_experiment_id   uuid → experiments on delete set null  new

data_spec                jsonb default '{}'                  new
object_spec              jsonb default '{}'                  new
environment_spec         jsonb default '{}'                  new
config                   jsonb default '{}'                  new

metrics                  jsonb default '{}'                  existing
featured_metric_keys     text[] default '{}'                 new
result_summary           text default ''                     new

decision_outcome         text null                           new
decision_notes           text default ''                     new
notes                    text                                existing

position                 double precision                    existing
started_at               timestamptz null                    new
completed_at             timestamptz null                    new
created_at               timestamptz                         existing
updated_at               timestamptz                         existing
```

Database Constraints：

- Status 限制为 §4.3 的六个值。
- Decision 限制为 §4.4 的四个值或 `null`。
- `baseline_experiment_id <> id`。
- `completed` 必须有非空 Decision。
- Owner 在数据库中暂时允许 `null` 以迁移旧数据；UI 对所有新 Experiment
  强制要求 Owner。

新增索引：

- `experiments(task_id, status, updated_at desc)`
- `experiments(owner_id, status)`
- `experiments(baseline_experiment_id)`
- `activity(experiment_id, created_at desc)`

JSONB 由 UI 作为结构化属性表编辑，用户不直接编辑 JSON。例如：

```json
{
  "data_spec": {
    "datasets": [
      {
        "role": "evaluation",
        "name": "dr-kernel-rl",
        "split": "tier1-gen1",
        "revision": "seed20260717-gen1",
        "task_count": 20,
        "samples_per_task": 1
      }
    ]
  },
  "object_spec": {
    "model": "Qwen3.6-35B-A3B",
    "harness": "cand_0000",
    "parent_harness": "seed",
    "prompt_change": "+6 lines of Ascend guardrails",
    "skills": [],
    "tools": []
  },
  "environment_spec": {
    "platform": "npu",
    "server": "localhost.localdomain",
    "devices": ["npu:14", "npu:15"],
    "hardware": "Ascend910_9372",
    "evaluator": "triton-evaluation"
  },
  "config": {
    "max_turns": 18,
    "temperature": 0.1,
    "top_p": 0.95,
    "max_tokens": 8192,
    "eval_concurrency": 2
  }
}
```

`metrics` 继续保存数字 Key/Value，例如：

```json
{
  "pass@1": 0.2,
  "tokens": 671552,
  "compile_fail": 16
}
```

Result Card 不是独立数据库对象。Experiment 页面根据
`featured_metric_keys` 从 `metrics` 中选择重点指标进行展示。

### 7.2 `activity`

新增：

```text
experiment_id uuid null → experiments on delete set null
```

每条 Experiment Activity 同时保留 `task_id`，因此：

- Task Timeline 可以显示其所有 Experiment 动态。
- Experiment Timeline 按 `experiment_id` 过滤。

当前 Board 使用共享团队 Supabase 账号，无法可靠识别实际操作者。Phase 1 采用
匿名 Timeline：

- 自动记录事件和时间。
- 不显示 `Bruce changed...` 等无法证明的 Actor。
- Owner 变化可以记录目标值，例如 `Owner changed to Bruce`，但不声称由谁修改。

Database Trigger 在 Experiment Insert/Update 时生成：

- Experiment created/duplicated
- Owner changed
- Status changed
- Data/Object/Environment/Config updated
- Result updated
- Decision recorded

手动 Timeline Note 由 UI 插入 `activity`。Trigger 保证数据更新和自动 Timeline
事件处于同一事务，不再依赖当前 best-effort Client log。

## 8. 页面与路由

```text
/                       Task Board
/task/[id]              Task Detail
/experiments            Global Experiment database
/experiments/[id]       Experiment Detail
/experiments/compare    Dedicated Compare
/analytics              Existing Analytics
```

### 8.1 Task Detail

- 显示 Task 目标、Owner/Assignees、Status、Notes 和 Timeline。
- 用紧凑 Experiment Table 替代完整的内联 Experiment Cards。
- Experiment Table 显示 ID、Name、Owner、Status、Decision、Updated time 和
  Featured Metrics。
- 点击一行进入独立 Experiment 页面。
- 提供 New Experiment 和 Compare selected。

### 8.2 Global Experiments

列：

- ID
- Name
- Task
- Owner
- Status
- Decision
- Updated time
- Featured Metrics

筛选：

- Owner
- Status
- Task
- Decision

Saved Views：

- Running
- Blocked
- Needs Decision
- Recently Completed

因为 Phase 1 不建立用户身份，不提供误导性的 `My Work` 或 `My Experiments`
视图。

### 8.3 Experiment Detail

- 顶部 Properties。
- 七个正文区块。
- 右侧匿名 Timeline。
- Duplicate 和 Compare Actions。
- Baseline 存在时显示一对一 Context Summary 和 Result Delta。
- Baseline 不存在时只显示当前记录。

## 9. 前端组件与代码边界

现有 `Board.tsx` 和 `TaskDetail.tsx` 已分别达到约 800 和 600 行。Phase 1 不把
新功能继续塞进单体组件，而采用清晰边界：

```text
ExperimentTable
ExperimentFilters
ExperimentHeader
ExperimentSection
DataEditor
ObjectEditor
EnvironmentEditor
ConfigEditor
ResultEditor
DecisionEditor
ExperimentTimeline
BaselineSummary
ExperimentCompareTable
```

纯数据逻辑与 React UI 分离：

```text
lib/experiments
  createExperiment
  duplicateExperiment
  updateExperiment
  loadExperiment
  loadExperimentsForCompare

lib/experiment-diff
  flattenProperties
  compareContexts
  alignMetrics
  calculateDeltas

lib/experiment-validation
  validateStatusTransition
  validateBeforeRunning
  validateBeforeCompleted
```

保持现有 Supabase 浏览器直连架构，不在 Phase 1 新增独立 Backend Service。
Domain Unit Tests 使用 Vitest；Phase 1 不额外引入完整 Browser E2E Framework，
页面级验收按 §14.3 执行。

## 10. Realtime 与并发编辑

- Experiment 变化实时刷新 Task Table 和 Global Experiments。
- Activity 变化实时刷新 Task/Experiment Timeline。
- Compare 页面收到更新后重新读取源数据并重新计算 Delta。
- Delta 永不写回数据库。
- 用户正在编辑时，Realtime 变化只触发冲突提示，不覆盖本地输入。

保存使用 Optimistic Concurrency：

```text
UPDATE experiments
WHERE id = :id
  AND updated_at = :loaded_updated_at
```

若影响零行，显示：

> This experiment changed remotely. Review the latest version before saving.

用户可以加载最新版本后重新应用本地编辑，系统不静默覆盖远程内容。

## 11. 错误处理

- 保存失败时保留本地输入并提供 Retry；失败操作不产生 Timeline。
- Baseline 被删除时 `ON DELETE SET NULL`，Delta 随即消失。
- Baseline 的 Metric 缺失或非数字时显示 `—`。
- Context 不一致时显示字段差异和警告，但不阻止比较。
- Duplicate 是单一 Experiment Insert；Result/Attachments 不参与复制，因此不会
  产生半复制状态。
- JSONB 编辑器只提交合法 JSON 类型；不让用户直接输入原始 JSON。
- Realtime 冲突由 §10 的 `updated_at` 条件处理。

## 12. 视觉设计

采用已确认的 Notion-inspired 方向，不复制 Notion 品牌资产：

- 白色内容画布和暖灰侧栏。
- 深灰主文字、浅灰次级文字、细边框。
- 以 Properties、内容层级和留白建立信息密度。
- 移除当前装饰性背景网格。
- Status 使用克制的语义色 Chip。
- Result Delta 默认中性，不自动使用好/坏颜色。
- Inline editing、键盘焦点和横向滚动均明确可见。
- Task、Experiment 和 Compare 使用一致的属性与表格语言。

## 13. Migration 与上线

Migration 为 additive、idempotent，不删除或重命名旧字段。

旧数据 Backfill：

- 保留 Name、Notes、Metrics、Attachments 和时间。
- `metrics` 非空的旧 Experiment 设为 `analyzing`，不擅自生成 Decision。
- `metrics` 为空的旧 Experiment 设为 `planned`。
- Owner、Baseline 和 Decision 保持 `null`。
- Data/Object/Environment/Config 初始化为空对象。

上线顺序：

1. 在独立 Supabase 项目运行 Migration 并验证。
2. 备份 Production Database。
3. 先在 Production 执行 Migration；旧版 Web 仍可工作。
4. 再部署新版 Web。
5. 验证旧数据、Create、Duplicate、Realtime、Baseline 和 Compare。
6. UI 回滚只回滚 Web 版本；保留 additive 数据库字段，不做破坏性 Drop。

## 14. 测试与验收

### 14.1 Domain Unit Tests

- Status 合法与非法流转。
- Running/Analyzing/Completed 的字段校验。
- Duplicate 的 Copy/Clear 规则。
- Baseline 不能指向自身。
- 无 Baseline 不产生 Delta。
- Metric 对齐、缺失值、数字 Delta。
- Nested Context flatten/diff。
- Compare URL 解析。
- `Diff only` 隐藏全相同字段。
- Realtime 冲突不覆盖编辑中的内容。

### 14.2 Migration Verification

- 旧 Experiment 数量、Metrics、Notes、Attachments 不变。
- 旧数据 Status Backfill 符合规则。
- Baseline 删除后引用变为 `null`。
- Experiment 更新和自动 Activity 在同一事务完成。
- Running/Completed 时间正确写入。
- RLS 继续限制为已认证团队。
- Realtime 包含 Experiments 和对应 Activity。

### 14.3 UI Acceptance

- 从 Task 创建 Experiment。
- Duplicate 并只修改少数变量。
- 手动录入定量和定性 Result。
- 选择、取消和更换 Baseline。
- Experiment Page 一对一摘要。
- Dedicated Compare 添加多条 Experiment。
- Experiment 为行、字段组切换、`Diff only`。
- Running、Blocked、Needs Decision 过滤。
- 桌面和窄屏横向表格操作。
- 键盘导航、焦点状态和非纯颜色状态表达。

## 15. Phase 1 完成标准

Phase 1 完成时：

- Task 是协作与进度中心。
- Experiment 是结构化、可比较、带决策的证据。
- 每条 Delta 都有明确 Baseline 来源。
- 多实验比较来自已保存的手动数据，不存在隐式导入。
- Timeline 只记录系统能证明的事件。
- 旧实验与附件完整保留。
- 团队可以从 Task → Experiments → Decision 理解项目为何处于当前状态。
