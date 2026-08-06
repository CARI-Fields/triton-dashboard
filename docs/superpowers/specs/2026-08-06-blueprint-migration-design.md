# Triton Board：Blueprint 迁移设计（针对 current main）

**日期：** 2026-08-06

**状态：** 设计已确认，待书面复核；通过后转 writing-plans

**范围：** 把 current main（`CARI-Fields/triton-dashboard` @ `a2fd39c`）已有的**自研 CSS-class 设计系统**迁移到真实的 Palantir Blueprint（`@blueprintjs/core@6`）。**纯视觉迁移**：不改数据模型、不加新功能——main 已含全部屏幕 + Templates + Agent API + API keys + UUID owners（模板驱动实验模型）。

**取代：** `2026-08-05-triton-board-blueprint-refactor-design.md`（那份基于已被 main 抛弃的旧代码状态，作废）。

**参考：** 设计源 `~/Downloads/Triton Dashboard Blueprint重构(1).zip`（真实 Blueprint 组件的 SuperDesign `.dc.html`）；current main 的 `ThemeProvider`、`app/globals.css`、`components/ui/*`。

---

## 1. 背景

main 已是一套**已发布、全量重设计**的应用：自研设计系统（`globals.css` 2800+ 行 + `experiment-workspace.css` + `template-manager.css`）、`ThemeProvider`→`data-theme` 双主题（light/dark 完整 token）、IBM Plex 字体、accent `#1e96eb`、约 8 个薄原语（`PageHeader/Tag/StatusDot/Drawer/Icons/OwnerAvatar/ActivityDrawer/WorkspaceSkeleton`），所有屏幕均用 CSS class 绘制。**无组件库**（package.json 无 `@blueprintjs`）。

本次把这些**全部替换为真实 Blueprint**——配色、字体、组件、暗色机制均采用 Blueprint。

## 2. 已确认决策

1. **双主题保留**：保留 main 的 light/dark；`ThemeProvider` 作为唯一主题源，`theme==="dark"` 时同时给 `<html>` 加 Blueprint 的 `bp6-dark` class（`Classes.DARK`），使 Blueprint 组件渲染暗色。
2. **按域分阶段**：在一条分支上先做地基，再逐域把 CSS-class UI 换成 Blueprint 组件，逐域退役对应 CSS。过渡期两套样式共存、逐域收敛。
3. **采用 Blueprint 默认**：配色（accent `#2d72d2` 等）与字体栈，与 `.dc.html` 一致；退役 IBM Plex。

## 3. 现状（FROM）→ 目标（TO）

| 维度 | main 现状 | 迁移后 |
| --- | --- | --- |
| 组件 | 自研 CSS-class UI + ~8 薄原语 | 真实 `@blueprintjs/core@6` 组件 |
| 主题 | `ThemeProvider`→`data-theme`（light/dark token） | 保留 `ThemeProvider`；dark 桥接 `bp6-dark` |
| 配色 | accent `#1e96eb` + 自定义 status token | Blueprint palette（accent `#2d72d2`）+ `--bp-*` |
| 字体 | IBM Plex（next/font） | Blueprint 字体栈 |
| 样式文件 | globals/experiment-workspace/template-manager.css | 逐域退役，终态仅保留少量布局补丁 |

## 4. 地基阶段

分两个 plan：

**Plan 1（打底 plumbing）** ——

1. 安装 `@blueprintjs/core@6`（+ `icons`、`select`）；root layout 导入 Blueprint base CSS，在 `ThemeProvider` 内挂 `BlueprintProvider`。
2. **主题桥接**：扩展 `ThemeProvider.applyTheme`——`dark` 时 `documentElement.classList.add("bp6-dark")`，`light` 时移除；保留 `data-theme` 供未迁移 CSS 使用。新增测试覆盖 light/dark 的 class 切换。
3. **Token 桥接**：新增 `blueprint-tokens.css`，把 main 语义 token（`--canvas/--surface/--accent/--status-*` 等，light 与 `[data-theme="dark"]`）映射到 Blueprint `--bp-*`，使**未迁移屏幕在迁移期继续可用**；采用 Blueprint 配色/字体（退役 IBM Plex `next/font` 与其 CSS var）。
4. **原语就地 Blueprint 化（策略 A）**：把 main 现有 `components/ui/*` 原语**保持同名同 API**、改用 Blueprint 实现——`Icons`→Blueprint `Icon`（icon 名映射）、`Tag`→Blueprint `Tag`（`tagTone`→intent）、`StatusDot`→Blueprint、`Drawer`/`ActivityDrawer`→Blueprint `Drawer`、`WorkspaceSkeleton`→`bp6-skeleton`、`OwnerAvatar` 保留/微调、`PageHeader` 保留。屏幕调用方零改动即可跑在 Blueprint 上。
5. jsdom 测试补丁（`ResizeObserver`/`matchMedia`）+ `setupFiles`（main 现无 setup 文件）。

> Plan 1 完成后：整个应用在原语层跑在 Blueprint 上，light/dark 可用，现有屏幕视觉基本不变（仍用 CSS class），为逐域 reskin 铺路。

> **执行拆分：** Plan 1 只做 **plumbing**（第 1、2、3、5 点 + 主题/字体桥接）；**Plan 2** 做第 4 点（原语就地 Blueprint 化）。逐域 reskin 从 Plan 3 起。

## 5. 逐域计划（reskin + 退役 CSS）

每个 plan 把该域屏幕的 CSS-class UI 换成 Blueprint 组件（Button/Card/InputGroup/HTMLTable/Callout/SegmentedControl/Breadcrumbs/Menu/Tooltip/Dialog 等），并退役对应 `globals.css`/`experiment-workspace.css`/`template-manager.css` 规则。

- **Plan 3** App shell + nav + ThemeToggle（外壳）。
- **Plan 4** Task 域：Board、TaskCard、TaskDetail、AddTaskDrawer、OwnerPicker、TaskProperties、BoardSecondaryViews。
- **Plan 5** Experiments 域：ExperimentsDatabase、ExperimentTable、TemplateExperimentDetail、TemplateFieldTables、ValueEditor、ExperimentVersionDrawer、ExperimentFilters、AttachmentGallery、ExperimentTimeline。
- **Plan 6** Compare（TemplateExperimentCompare）+ Analytics。
- **Plan 7** Templates（TemplateManager/TemplateEditor/OptionsEditor/TemplateHistoryDrawer/TemplateList）+ Admin API keys（ApiKeyAdmin）+ Create/Duplicate Experiment dialogs。

## 6. 保留 / 不做

**保留（main 全部行为）：** Templates、Agent API、API keys、UUID owners、realtime、乐观并发、Draft/Conflict、`policy.ts` 状态 gate、Baseline/Delta、URL-serialized Compare、Attachment、Timeline、ThemeToggle、模板驱动实验模型、无障碍。

**不做：** 数据模型/Schema 变更（main 已具备）、新功能、Agent API 后端、删除已有能力。

## 7. 验收

- 所有屏幕共享同一 Blueprint 字阶/控件/配色；light/dark 切换无闪烁、刷新保留。
- main 现有全部功能回归通过；vitest 全绿（仅 `.worktrees/` 既有噪声）。
- 控制台无 hydration / 无效 DOM / 未处理 promise。
- 桌面 1440/1536 基准，1280/1024/768/390 无不可达操作。
- 逐域退役对应 CSS，终态 globals/experiment-workspace/template-manager.css 仅剩必要布局补丁。
