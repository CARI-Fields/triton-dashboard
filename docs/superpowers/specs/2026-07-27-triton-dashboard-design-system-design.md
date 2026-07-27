# Triton Board：Notion-like Research OS 视觉重构设计

**日期：** 2026-07-27

**状态：** 已通过书面 Spec 复核，实施计划已完成，待选择执行方式

**范围：** 全部已登录界面、Light/Dark 双主题、桌面优先响应式体验，以及 Task
分类模型从固定 Module/Pipeline 语义向通用 Type + Tags 的无损演进

## 1. 目标

本次重构把 Triton Board 从两个视觉年代混合的工程界面，统一为一套安静、紧凑、
可持续扩展的 Research OS。设计语言从
[AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) 的任务信息密度与明确交互、
[AFFiNE](https://github.com/toeverything/AFFiNE) 的文档画布和数据库秩序，以及
[AFFiNE Design](https://github.com/toeverything/design) 的语义化主题方法中提炼，
但不复制任何单一产品。

完成后，用户应能：

1. 在一个稳定的应用 Shell 中访问 Task Board、Experiments、Compare 和 Analytics。
2. 默认按 Status 管理 Task，并在创建 Task 时自由设置 Type 与 Tags。
3. 在数据库式 Experiment Index 中快速扫描、过滤、选择和比较实验。
4. 在文档式 Experiment Detail 中编辑上下文、结果、证据和 Decision。
5. 在 Compare 中严格依据现有 Experiment Schema 做横向宽表对比。
6. 在 Light 与 Dark 主题下获得一致的层级、密度和可访问性。
7. 在桌面优先的前提下，在中窄屏仍能完成全部核心操作。

## 2. 已确认的产品决策

### 2.1 视觉方向

采用已确认的 **Hybrid Research OS**：

- 以 AFFiNE 的安静画布、细边界、文本型标签页和数据库对齐为骨架。
- 以 AppFlowy 的紧凑任务卡、属性编辑、语义状态和短操作路径为交互密度参考。
- 避免传统 SaaS Dashboard 常见的巨大 KPI 卡片、厚重阴影、渐变和高饱和装饰。
- 不追求逐像素复制 AppFlowy 或 AFFiNE；所有视觉决策服务于 Triton 研究协作模型。

### 2.2 范围

重构覆盖：

- `/`
- `/task/[id]`
- `/experiments`
- `/experiments/[id]`
- `/experiments/compare`
- `/analytics`
- 全局应用 Shell、Auth 状态、Loading、Empty、Error、Conflict 和 Modal/Drawer
- 匹配的 Light/Dark 主题
- 桌面、紧凑桌面/平板和窄屏行为

所有现有路由和核心能力必须保留。允许为清晰度增加 Saved Views、Sticky Toolbar、
属性 Drawer、Section Anchor 和次级面板，但不得移除已有编辑、Realtime、
Draft、Conflict、Compare、Attachment、Timeline、Retry 或 Auth 行为。

### 2.3 Task 分类

Task Board 不再以 Distill、SFT、RL 或任何其他固定业务阶段作为列。默认列只由
Status 决定：

- To do
- In progress
- Done
- Blocked

每个 Task 可使用：

- **Type**：零个或一个用户自定义主分类，用于分组。
- **Tags**：零个或多个用户自定义交叉标签，用于过滤和补充上下文。

现有 Module 记录无损映射为 Type。SFT、RL、Harness 等历史名称保留为普通、
可编辑的 Type，不再具有特殊布局语义。

### 2.4 Owner 术语

全部用户界面使用 **Owner**，不再使用 Assignee/Assignees。为避免旧数据丢失，
本轮底层仍允许一个 Task 保存多个名字；`Owner` 是属性名称，不强制改变现有字段
基数。

## 3. 设计原则

### 3.1 Canvas first

页面首先是一张连续画布。卡片、Panel 和 Toolbar 只在需要表达边界或交互状态时
出现。避免把每段信息都包进圆角容器。

### 3.2 Dense, not cramped

桌面以高信息密度为目标，但通过稳定的 4/8/12/16/24 间距节奏、清晰列对齐和
适度行高维持可读性。

### 3.3 Text carries hierarchy

层级主要来自字体大小、字重、文本颜色、留白与细分隔线，而不是阴影和大面积色块。

### 3.4 Semantic color only

蓝色只用于 Active、Focus、Selection 和主操作。绿色、红色和灰色只用于状态。
Type 与 Tags 使用低饱和色底，不能与状态色争夺注意力。

### 3.5 Progressive disclosure

高频属性直接可见；低频和危险操作进入 Overflow。长表单使用 Section Anchor，
复杂创建流程使用 Drawer，避免一次把全部控制铺在页面上。

### 3.6 Schema over mock data

Compare 的字段和 Delta 必须由 `Experiment` Schema 与现有
`buildCompareColumns` 派生。设计稿中的示例只说明布局，不授权添加不存在的
业务指标或字段。

## 4. 信息架构

```text
App Shell
├── Task Board
│   ├── Board
│   ├── Types
│   ├── Ownership
│   └── Team
├── Experiments
│   ├── Database
│   └── Experiment Detail
├── Compare
└── Analytics
```

### 4.1 主导航

主导航顺序固定为：

1. Task Board
2. Experiments
3. Compare
4. Analytics

Task Detail 归属于 Task Board；Experiment Detail 归属于 Experiments。
`aria-current="page"` 必须准确反映嵌套路由。

### 4.2 Board 次级导航

现有 `Foundations` 入口改为 `Types`：

- **Board**：Status 或 Type 分组的任务看板。
- **Types**：创建、重命名、描述、排序和删除用户自定义 Type。
- **Ownership**：以 Owner 为中心查看 Task 与 Type。
- **Team**：维护现有 Member 列表。

旧的 Pipeline/Foundation 分类、SFT → RL 引导文案和固定业务结构不再出现在
主界面。

## 5. 视觉系统

### 5.1 Light 语义色

| Token | Value | 用途 |
| --- | --- | --- |
| `--canvas` | `#FFFFFF` | 主画布 |
| `--surface` | `#FFFFFF` | 卡片、Dialog、Drawer |
| `--surface-subtle` | `#F8FAFF` | Sidebar、次级背景 |
| `--surface-hover` | `#F3F3F3` | Hover、轻选中 |
| `--border` | `#E6E6E6` | 普通边界和表格分隔 |
| `--border-strong` | `#D8DDE8` | 输入框、Sticky 边界 |
| `--text-primary` | `#141414` | 标题和主文本 |
| `--text-secondary` | `#6F748C` | 描述、Meta |
| `--text-tertiary` | `#929292` | Placeholder、低优先级 Meta |
| `--accent` | `#1E96EB` | Active、Focus、主操作 |
| `--accent-subtle` | `#EAF5FD` | 轻选中背景 |

### 5.2 Dark 语义色

| Token | Value | 用途 |
| --- | --- | --- |
| `--canvas` | `#141414` | 主画布 |
| `--surface` | `#252525` | 卡片、Dialog、Drawer、控件 |
| `--surface-subtle` | `#1B1B1B` | Sidebar、次级区域 |
| `--surface-hover` | `#303030` | Hover、轻选中 |
| `--border` | `#414141` | 普通边界和表格分隔 |
| `--border-strong` | `#525252` | 输入框、Sticky 边界 |
| `--text-primary` | `#E6E6E6` | 标题和主文本 |
| `--text-secondary` | `#929292` | 描述、Meta |
| `--text-tertiary` | `#7A7A7A` | Placeholder、低优先级 Meta |
| `--accent` | `#1E96EB` | Active、Focus、主操作 |
| `--accent-subtle` | `rgba(30, 150, 235, 0.12)` | 轻选中背景 |

Dark Theme 不能使用纯白 Panel、霓虹边界、发光效果、玻璃模糊或大面积纯黑。
层级来自语义表面、1px 边界和文字对比。

### 5.3 状态色

| 语义 | Light/Dark 基准 |
| --- | --- |
| To do / Planned | `#ABB3BF` |
| In progress / Running / Analyzing | `#1E96EB` |
| Done / Completed | `#248569` |
| Blocked / Error | `#D45D62` |
| Warning / Needs decision | `#C88719` |

状态必须同时显示文本或图标，不能只依赖颜色。

### 5.4 Typography

字体栈：

```text
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", sans-serif
```

若不引入新的字体资源，使用系统字体回退，不能为追求字体而增加阻塞式外部请求。

| Style | Size / Line height | Weight |
| --- | --- | --- |
| Page title | `36 / 40` | 650–700 |
| Section title | `20 / 28` | 600 |
| Subsection title | `16 / 22` | 600 |
| Body | `14 / 20` | 400 |
| Compact control | `13 / 18` | 450–500 |
| Caption / Meta | `12 / 18` | 400–500 |
| Eyebrow | `11 / 16` | 600，字距 `0.08em` |

Experiment ID、Metric Key 和 Config Key 可使用等宽字体回退，但正文不使用等宽字。

### 5.5 Spacing、Radius、Shadow

基础间距：`4, 8, 12, 16, 20, 24, 32, 40`。

- Sidebar 内边距：16–20px。
- 页面左右 Padding：桌面 32–40px。
- 表格行：40–48px。
- 紧凑输入和 Button：36–40px。
- Task Card 内边距：14–16px。
- Drawer 内边距：24–28px。
- 普通 Radius：6px。
- Card/Drawer Radius：8–12px。
- Pill 只用于真正的 Tag、Status 或短枚举，不能用于普通 Button/Tab。
- Shadow 仅用于 Drawer/Dialog：`0 14px 38px rgba(21, 28, 39, 0.10)`；
  Dark 使用更低透明度黑色。普通 Card 无阴影。

### 5.6 Iconography

使用统一的 16/18/20px 线性图标，Stroke 接近 1.5px。图标必须支持
`currentColor`，不能在组件内部写死 Light 色。若不增加图标依赖，建立小型共享
SVG Icon 组件集，避免页面各自定义不一致的符号。

## 6. App Shell 与主题

### 6.1 Desktop Shell

- Sidebar 固定宽度 256px。
- 主内容区域占剩余宽度，最小宽度由具体工作区决定。
- 品牌区显示 Triton Board Logo 与名称。
- 项目上下文显示在品牌区下方；当前只有单 Project 时是非欺骗性的静态上下文，
  不渲染无法工作的下拉行为。
- 主导航带图标、文字和 Active 状态。
- Sidebar 底部放 Shared team board、Light/Dark 切换和 Log out。

### 6.2 主题选择

- 首次访问优先使用已保存选择，否则使用 `prefers-color-scheme`。
- 用户手动选择后写入 `localStorage`，以后不被系统主题变化覆盖。
- 主题属性放在根节点，例如 `data-theme="light|dark"`。
- 在首次 Paint 前应用主题，避免 Light/Dark 闪烁。
- 设置匹配的 `color-scheme`，让原生 Form Control 与滚动条使用正确主题。
- Theme Toggle 是真实的二选一控件，具备键盘操作和可读 Label。

## 7. Task Board

### 7.1 页面头部

- Eyebrow/项目上下文
- 标题 `Task Board`
- 一句短描述
- 右上主操作 `New task`
- 次级 Tab：Board、Types、Ownership、Team

Toolbar 包含：

- Status 图例
- `Group by: Status | Type`
- Filter
- 可选搜索

Toolbar 在桌面滚动时保持可见，但不得遮挡页面标题。

### 7.2 默认 Board

默认使用四个 Status 列：

```text
To do | In progress | Done | Blocked
```

每列：

- Header 显示状态点、名称、数量和 Overflow。
- Task Card 垂直排列。
- 列底部提供 `Add task`，自动预选当前 Status。
- 空列显示轻量说明，不使用大型插画。

切换 `Group by: Type` 时：

- 每个用户定义的 Type 成为列。
- 无 Type 的 Task 放入 `No type`。
- Card 仍显示 Status。
- 在 Type 列新增 Task 时预选当前 Type。

### 7.3 Task Card Anatomy

Card 自上而下：

1. Title
2. Type 名称，作为普通 Meta 行
3. Tags
4. Owner Avatar(s)
5. Updated relative time

Status 在按 Status 分组时由列提供，不重复绘制大 Badge。按 Type 分组时以小点 +
文本显示。Hover 时出现 Open/Overflow，危险操作只存在于 Overflow。

Card 点击进入 `/task/[id]`。现有快速 Rename、Status 更新、Owner 编辑和 Delete
能力保留，可收进 Inline/Overflow，而不是永久占用 Card 空间。

### 7.4 Types

Types 页面替代 Foundations：

- 显示 Name、Description、Task count、Progress 和 Position。
- 可创建、重命名、描述和排序 Type。
- Type 不再有 Pipeline/Foundation Kind。
- 删除有 Task 的 Type 时先要求重新分配或明确移除分类；不能级联删除 Task。

### 7.5 Ownership

Ownership 表格列：

- Owner
- Task
- Type
- Status
- Updated

继续支持一个 Task 显示多个 Owner。空状态文案使用 `No owner yet`。

### 7.6 Team

Team 保留现有 Member 管理能力，视觉改为安静的紧凑列表。删除 Member 前继续处理
其 Task Owner 引用，不能产生悬挂显示。

## 8. Add Task

### 8.1 交互容器

桌面使用约 520px 右侧 Drawer：

- Board 保持可见，背景只做轻微 Dim。
- Focus Trap、Escape、Close Button 和恢复触发点 Focus 必须工作。
- 窄屏改为全屏 Sheet。

### 8.2 字段

顺序固定：

1. Title，必填
2. Status，默认 `To do`
3. Type，单选、可为空、可 Inline 创建
4. Tags，多选、可 Inline 创建
5. Owner，可为空，底层继续兼容多人
6. Priority：`Low | Medium | High | Urgent`，默认 `Medium`
7. Due date，可为空
8. Description，可为空，写入 Task Notes/Description 内容

Type 与 Tags 附近显示短说明：

```text
Types group work. Tags add flexible context.
```

Footer 固定显示 Cancel、Create task 和 `⌘/Ctrl Enter` Hint。Submit 中禁止重复提交，
失败时保留全部输入并在 Drawer 内显示可重试错误。

### 8.3 Tags

- Tags 是自由文本数组，不建立独立 Tag 表。
- 输入时 Trim，移除空值，并做大小写不敏感去重。
- Suggestion 从已有 Task Tags 派生。
- 颜色由规范化 Tag 文本稳定映射到低饱和 Palette，不保存随机色。

## 9. Task Detail

Task Detail 使用与 Experiment Detail 相同的 Document Record 语言：

- Breadcrumb 返回 Board。
- 大标题支持编辑。
- 顶部属性列表显示 Status、Type、Tags、Owner、Priority、Due date、Created、
  Updated。
- 正文包含 Description/Notes、Experiments、Attachments。
- Activity 在宽屏为右侧 Rail；中窄屏移动到正文之后。
- Task 关联 Experiment 表继续支持 New Experiment、Multi-select Compare 和打开详情。
- Realtime 和并发更新状态必须保留清晰反馈。
- Delete 等危险操作进入 Overflow，并保持确认流程。

## 10. Experiments Database

### 10.1 Header

- Eyebrow `Research database`
- Title `Experiments`
- 短描述
- `Compare selected (n)`
- 主操作 `New experiment`

### 10.2 Saved Views 与 Filters

保留现有模型支持的 Saved Views：

- All
- Running
- Blocked
- Needs Decision
- Recently Completed

Filters：

- Search
- Task
- Owner
- Status
- Decision

Toolbar 显示当前结果数量。默认仍由现有 Repository/Filter 逻辑决定顺序，不为了
视觉稿虚构 Archived、分页或后端排序语义。若加入 Sort，只允许对已加载数据做明确
的客户端排序，并在控件中展示当前排序。

### 10.3 Database Table

列顺序保持：

1. Selection
2. ID
3. Name
4. Task
5. Owner
6. Status
7. Decision
8. Featured metrics
9. Updated

规则：

- Header Sticky。
- Row 使用 1px 分隔，不转换为 Card。
- ID、Name 和必要身份列在宽度不足时可 Sticky。
- Status 使用 Dot + Text。
- Featured Metrics 使用紧凑 Key/Value，不使用 KPI Card。
- 选择两条或以上后 Compare 可用；选中行使用轻蓝背景。
- 空、Loading、Refresh、Load Error 和 Retry 使用稳定占位，不让 Toolbar 跳动。

## 11. Experiment Detail

### 11.1 Header 与 Properties

- Breadcrumb 指向 Task 或 Experiments。
- Experiment ID 为小型 Eyebrow。
- Name 是页面大标题且可编辑。
- Header 显示 Saved/Unsaved/Conflict 状态。
- 主操作按状态显示 Save changes。
- Compare、Duplicate 位于次级操作。
- Delete 放入 Overflow。

属性以无卡片的 Notion-like Label/Value 网格显示：

- Task
- Owner
- Status
- Current status
- Baseline
- Created
- Started
- Completed

### 11.2 Section Anchor

正文 Anchor：

1. Data
2. Object
3. Environment
4. Config
5. Result
6. Decision
7. Note

Anchor 在长页面中 Sticky，并使用文本 + 下划线 Active 状态，不使用 Pill Tab。
每个 Section 保留现有 Editor 和验证规则。收起状态可显示一行 Summary，但不能
隐藏 Validation Error。

### 11.3 Result 与 Evidence

- Metrics 使用紧凑属性表。
- Featured Metric 用 Star/Pin 状态表达。
- Result Summary 保持 Markdown/文本编辑能力。
- Attachment 使用文件行或缩略图 Gallery，保留 Upload、Caption 和 Delete。
- 不把 Metrics 转换成系统无法支持的 Chart。

### 11.4 Activity Rail 与 Save Bar

- ≥1280px：Activity 为右侧 300–340px Rail。
- <1280px：Activity 移到正文末尾。
- Add update 输入保持现有 Timeline 行为。
- Save Bar 在页面底部 Sticky，展示 Saved/Unsaved/Editing/Conflict。
- Remote Conflict、Remote Delete、Retry 和 Load Latest 行为不得被视觉重构删减。

## 12. Compare

### 12.1 Orientation

Compare 必须是横向宽表：

- 每个 Experiment 是一行。
- 每个 Schema Field 是一列。
- Baseline 行固定排在第一行并使用轻蓝背景。
- `Experiment`、`Task`、`Status` 为左侧 Sticky 身份列。
- 表格容器水平滚动，并提供可见的滚动条/边缘提示。

不能改成“字段为行、实验为列”的竖向矩阵。

### 12.2 Controls

- Add Experiment 搜索选择
- Baseline 选择
- Differences only
- Field Groups
- 可复制的 Share URL
- 当前选择列表和 Remove

Field Groups 严格为：

- Data
- Object
- Environment
- Config
- Result
- Decision & Note

### 12.3 Schema 派生

列只来自当前实现：

```text
data_spec
object_spec
environment_spec
config
metrics
result_summary
decision_outcome
decision_notes
notes
```

具体字段继续由 `flattenExperiment` / `buildCompareColumns` 动态展开。设计层不维护
第二份硬编码指标清单。

Delta 规则保持 Phase 1 规范：

- 没有 Baseline 时没有 Delta 列。
- 只为 `metrics` 中两侧均为有限 Number 的字段产生 Delta。
- `delta = current - baseline`。
- Delta 使用中性视觉，不自动解释好坏。
- 缺失和非有限值显示 `—`。
- `Diff only` 只隐藏所有选中实验完全相同的字段。

Footnote 解释：

```text
Missing values are shown as —. Context fields are flattened from the
Experiment schema; numeric Result deltas are current minus baseline.
```

## 13. Analytics

Analytics 只使用当前任务数据做 Live Snapshot，不虚构时间序列、增长率或预测。

### 13.1 KPI Strip

一个全宽、由 Hairline 分隔的 KPI Strip：

- Total tasks
- In progress
- Done
- Blocked
- Completion

不使用五个浮动 Card。

### 13.2 Progress 与 Attention

- Progress by status：Slim Stacked Bar + 对齐 Legend。
- Needs attention：直接列出 Blocked Task、Type、Owner、Updated，并链接回 Board。
- Progress by type：Type、Task count、分段 Progress、Done、In progress、Blocked、
  Owner coverage。
- Workload by owner：Owner、Task count 和紧凑分段 Bar。

所有 `Module progress` 文案改为 `Progress by type`。不渲染不存在的趋势箭头或
统计显著性。Export 若实现，只导出当前派生快照为 CSV，不调用不存在的报表服务。

## 14. Responsive 行为

### 14.1 Desktop：`≥1280px`

- 256px 固定 Sidebar。
- 四列 Status Board 在常见 1440/1536 宽度完整显示。
- Experiment Detail 使用正文 + Activity Rail。
- 完整数据库 Toolbar。

### 14.2 Compact：`768–1279px`

- Sidebar 收为 Icon Rail 或可开合 Drawer，保留可访问 Label。
- Board 和 Compare 使用水平滚动，不压缩到不可读列宽。
- Experiment Activity 移到正文下方。
- Toolbar 可分两行，但操作顺序不变。
- Add Task Drawer 宽度不超过 Viewport。

### 14.3 Narrow：`<768px`

- 使用紧凑 App Header + Navigation Sheet。
- Add Task 使用全屏 Sheet。
- Board 保持 Status 列横向滑动，并露出下一列边缘作为 Affordance。
- Database/Compare 保持真实 Table 结构并水平滚动；不把每一行自动转成 Card。
- Sticky 身份列减少到满足上下文所需的最小集合。
- Dialog 尺寸填满安全区域，操作栏固定在底部。
- 所有 Touch Target 至少 44px。

桌面是视觉验收基准，但窄屏不得丢失创建、编辑、过滤、比较、保存或重试能力。

## 15. 状态与反馈

所有页面必须统一以下状态组件：

- Skeleton/Loading：保持页面结构，避免整页只显示一行文字。
- Empty：一句说明 + 一个最相关操作。
- Inline Error：靠近失败的 Field 或 Section。
- Page Error：Error Banner + Retry。
- Saving：按钮和容器 `aria-busy`，阻止重复提交。
- Success：优先使用短暂 Inline Saved 状态，不大量使用 Toast。
- Remote Conflict：保留本地 Draft，明确提供 Keep editing / Load latest。
- Disabled：不能只降低透明度；保留可读性并给出原因。
- Destructive：Danger 操作进入 Overflow，并需要确认。

## 16. Accessibility

- 文本与背景满足 WCAG AA；正文至少 4.5:1，大文本至少 3:1。
- Focus Ring 为 2px Accent，外加足够 Offset。
- 所有 Icon-only Button 有可读 `aria-label`。
- Tabs 使用正确的 Tab/Pressed 语义；普通导航不能伪装成 Tab。
- Drawer/Dialog 使用 `aria-modal`、Focus Trap、Escape 和 Focus Restore。
- Status、Decision、Delta 不只依赖颜色。
- Table Header 使用正确 `scope`，Sticky 不破坏 Screen Reader 顺序。
- 水平滚动区域可用键盘聚焦，并有可读说明。
- Theme Toggle、Filter、Group by 和 Multi-select 支持键盘。
- `prefers-reduced-motion` 下关闭非必要动画。

## 17. 数据模型与迁移

### 17.1 无损 Type 兼容层

为降低已部署数据和旧迁移的风险，本轮用户界面和应用领域层使用 `TaskType` /
`typeId`，但数据库物理表可暂时保留：

```text
modules
tasks.module_id
```

映射规则：

- `modules.name` → Type Name
- `modules.objective` → Type Description
- `modules.position` → Type Position
- `modules.kind` → Legacy-only，不在 UI 使用
- `tasks.module_id` → Task Type

新 Type 可继续以兼容默认 `kind` 写入，但应用逻辑不能再按 `kind` 分组。

### 17.2 Task 字段

新增：

```text
tasks.tags       text[] not null default '{}'
tasks.priority   text not null default 'medium'
tasks.due_date   date null
```

Priority Check：

```text
low | medium | high | urgent
```

`module_id` 改为 Nullable，使 Type 真正可选。原 `on delete cascade` 外键改为
`on delete set null`，保证删除 Type 不会删除 Task。

现有记录：

- 原 Module ID 原样保留。
- 原 SFT/RL/Foundation 等名称原样显示为 Type。
- Tags 为空。
- Priority 为 Medium。
- Due date 为空。
- Assignees 原样保留并在 UI 显示为 Owner。

### 17.3 Repository 与 Realtime

- Queries、Realtime Channel 和测试 Fixture 必须覆盖新的 Task 字段。
- UI Domain Mapper 负责把 Legacy Storage Name 映射为 Type/Owner 术语。
- 不在同一版本中物理重命名 `modules` 表，避免不必要的 Policy、Publication、
  Trigger 和旧 Client 兼容风险。
- 若未来物理重命名，单独设计 Migration，不与视觉重构混合。

## 18. 前端架构

### 18.1 CSS

- 将 `globals.css` 与 `experiment-workspace.css` 中重复/冲突的视觉规则收敛为
  Semantic Tokens 和共享 Primitive。
- Route-specific CSS 只描述布局，不重复颜色、Button、Input、Table、Badge。
- Theme 通过语义 Token 切换，组件中不出现散落的 Light/Dark 条件颜色。
- Inline `style` 只保留真正的数据驱动数值，如 Progress Width。

### 18.2 共享 Primitive

优先抽取：

- `AppShell`
- `SidebarNav`
- `ThemeToggle`
- `PageHeader`
- `ViewTabs`
- `Toolbar`
- `Button` / `IconButton`
- `PropertyRow`
- `StatusDot`
- `Tag`
- `OwnerAvatar`
- `DataTable`
- `Drawer` / `Dialog`
- `EmptyState`
- `ErrorBanner`
- `StickySaveBar`

抽取以消除实际重复为准，不建立脱离当前需求的通用组件框架。

### 18.3 行为保留

视觉重构不能重写或削弱以下逻辑：

- Supabase Auth 与 RLS
- Realtime subscriptions
- Task/Experiment optimistic or guarded mutations
- Experiment Draft persistence
- Remote Conflict reconciliation
- Status transition validation
- Baseline validation
- URL-serialized Compare selection
- Attachment upload/delete
- Timeline activity

## 19. 验收标准

### 19.1 Visual

- 所有已登录路由共享同一个 App Shell、Type Scale、Spacing 和 Control System。
- Light/Dark 切换无明显闪烁，并在刷新后保持。
- 页面不再混用旧 Blue Dashboard 和新 Experiment Workspace 两套语言。
- Board 默认按四种 Status 分列；没有 Distill/SFT/RL 固定列。
- Type 与 Tags 在 Card、Create、Detail、Filter 和 Analytics 中一致。
- Dark Table、Drawer、Card 和 Input 都有可辨识但安静的层级。

### 19.2 Functional

- 所有现有 Route 可访问。
- Task 新增、编辑、删除、Owner、Status、Notes、Type、Tags、Priority、Due date
  正常工作。
- Type 删除不会级联删除 Task。
- Experiment Create、Edit、Duplicate、Compare、Attachment、Timeline、Draft、
  Conflict 和 Retry 继续工作。
- Compare 是实验为行、Schema Field 为列的横向宽表。
- Compare 不出现 `Experiment` Schema 之外的硬编码指标。
- Analytics 使用 Type 和 Owner 术语，并只从当前数据派生。

### 19.3 Responsive

- 1536×1024 为主要视觉基准。
- 1280px、1024px、768px 和 390px 宽度无不可达操作。
- Board/Database/Compare 的水平滚动可用且有 Affordance。
- Detail Activity 和 Drawer 在断点切换后不遮挡主操作。

### 19.4 Quality

- TypeScript、现有 Vitest Suite 和新增测试通过。
- 新增关键交互有 Testing Library 覆盖。
- 浏览器验证覆盖 Light/Dark 与 Desktop/Narrow。
- 控制台无 React Hydration、Invalid DOM、Unhandled Promise 或 Supabase 错误。
- 视觉验收需逐项对照已确认概念图，并记录可解释的差异。

## 20. 明确不做

- 不增加多 Project 数据模型。
- 不增加新的身份、角色或权限系统。
- 不增加自动实验采集。
- 不增加统计显著性判断或 Metric 好坏推断。
- 不把 Tags 升级为带权限、层级或独立生命周期的实体。
- 不把 Type 恢复为固定 Pipeline/Foundation 分类。
- 不为视觉效果增加不存在的 Experiment 字段、指标、趋势或预测。
- 不用大面积渐变、Glassmorphism、Cyberpunk Dark、3D 装饰或营销插画。

## 21. 设计交付基准

已确认的高保真状态覆盖：

- Generic Status Task Board
- Add Task Drawer
- Experiments Database
- Experiment Detail
- Horizontal Schema-driven Compare
- Analytics
- Dark Task Board
- Dark Experiments Database

实现应以这些状态的共同系统为基准，而不是把单张概念图中的示例数据当成新的
业务 Schema。若概念图与现有领域规则冲突，以本 Spec、`lib/types.ts` 和
`lib/experiments/compare.ts` 的明确规则为准。
