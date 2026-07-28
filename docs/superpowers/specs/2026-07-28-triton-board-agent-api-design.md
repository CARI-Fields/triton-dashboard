# Triton Board Agent API 与 Agent Skill 设计

日期：2026-07-28

## 1. 背景

Triton Board 当前是一个 Next.js 16 App Router 应用。浏览器登录共享的
Supabase Auth 团队账号后，直接通过 `supabase-js` 读写 Supabase 中的
Module、Task、Experiment、Attachment 和 Activity。

现在需要让外部 AI Agent 通过稳定的 HTTP API 查看和修改 Board 信息，同时满足：

- API Key 由共享 Admin 账号创建、轮换和吊销。
- Key 不代表具体 Agent；Key 是一个携带权限的凭据。
- Key 关联一个现有 Member UUID，用于计算可写的 Task 协作范围。
- Agent 可以读取 Board，并在权限范围内修改 Task 和 Experiment。
- Agent 不能修改 Owner、父级归属或系统字段。
- Agent API 完全不支持删除 Task 和 Experiment。
- Agent 改错时可以通过审计记录找回修改前的数据。
- 提供一个仓库级 Skill，指导 Agent 安全地使用该 API。

这里的“API 端口”是现有 Next.js 部署上的 HTTPS 路由空间，不新增独立 TCP
端口或独立服务。生产环境继续使用 HTTPS 443：

```text
https://<triton-board-host>/api/agent/v1
```

## 2. 设计原则

第一版只解决真实存在的风险：

1. 凭据是否有效，以及它拥有哪些操作权限。
2. 当前 Member 是否参与目标 Task。
3. 请求是否试图修改 Owner、父级关系或系统字段。
4. 写入是否会覆盖其他人的并发修改。
5. POST 重试是否会重复创建数据。
6. 写错后是否能查到修改前的值。

第一版不为恶意多租户、后端主机失陷或大规模公共流量设计复杂基础设施。

## 3. 范围

### 3.1 包含

- Next.js Route Handlers 形式的 Agent API。
- API Key 创建、查看、更新、轮换和吊销页面及 Admin API。
- Member UUID 驱动的 Task 协作权限。
- Task、Experiment、Attachment 和 Activity 的受控读写。
- Module、Member 和 Board 的只读接口。
- 乐观并发控制。
- POST 幂等。
- Agent API 修改审计。
- OpenAPI 规范和 `triton-board-api` Skill。

### 3.2 不包含

- 直接开放 Supabase Data API 给 Agent。
- OAuth、第三方账号系统或每个 Agent 独立身份。
- Task 或 Experiment 删除 API。
- 软删除和回收站。
- 批量写入。
- 人工审批队列或两阶段确认 Token。
- 自动回滚端点。
- 独立 API 服务、Edge Function 或专用数据库登录角色。
- Webhook、事件订阅或流式 API。

## 4. 总体架构

```text
AI Agent
  │  Authorization: Bearer <API Key>
  ▼
Next.js /api/agent/v1/*
  ├─ 验证 Key
  ├─ 检查 scope
  ├─ 计算 Member 的 Task 协作范围
  ├─ 校验可写字段和 If-Match
  ▼
Supabase server-side client
  ▼
小型事务 RPC
  ├─ 修改业务数据
  └─ 写入 agent_api_audit_log
```

Agent 不会获得 Supabase publishable key、用户 JWT、secret key 或数据库连接串。

Route Handler 使用仅存在于服务端环境变量中的 Supabase secret key。该客户端只在
`lib/agent-api/server.ts` 内创建，不导出给 Client Component，也不进入
`NEXT_PUBLIC_*` 环境变量。

## 5. API Key 与 Admin 管理

### 5.1 Key 语义

API Key 是权限凭据，不绑定某个 Agent 实例。每把 Key 包含：

- 管理用名称，例如 `bruce-research-write`。
- 一个 `member_id`，指向现有 `members.id`。
- 一组 scopes。
- 可选过期时间。
- 吊销状态。

同一 Member 可以拥有多把 Key。吊销一把 Key 不影响其他 Key。

### 5.2 Key 格式与保存

Key 使用加密安全随机数生成，至少包含 256 bit 随机熵：

```text
tb_live_<public-prefix>_<secret>
```

数据库只保存：

- 可展示的短 prefix。
- 完整 Key 的 SHA-256 digest。

原始 Key 只在创建或轮换成功时返回一次。Admin 列表之后只显示 prefix。

Key 只允许放在请求头中：

```http
Authorization: Bearer tb_live_...
```

禁止通过 URL query、请求体或日志传递 Key。服务端日志必须移除
`Authorization`。

### 5.3 Admin 身份

现阶段继续使用一个共享 Supabase Auth Admin 账号。Admin API 同时检查：

1. Supabase access token 有效。
2. token 中的 user UUID 等于服务端 `TRITON_BOARD_ADMIN_USER_ID`。

Agent API Key 不能调用 Admin API。

### 5.4 Admin 页面与端点

Dashboard 新增：

```text
/admin/api-keys
```

Admin API：

| 方法 | 路径 | 行为 |
|---|---|---|
| `GET` | `/api/admin/v1/api-keys` | 列出 Key 元数据和最近使用时间 |
| `POST` | `/api/admin/v1/api-keys` | 创建 Key，并一次性返回原始 Key |
| `PATCH` | `/api/admin/v1/api-keys/{id}` | 修改名称、Member、scopes、过期时间 |
| `POST` | `/api/admin/v1/api-keys/{id}/rotate` | 立即失效旧 secret 并返回新 secret |
| `POST` | `/api/admin/v1/api-keys/{id}/revoke` | 立即吊销 |

不提供删除 Key 的端点。已吊销记录保留用于审计关联。

## 6. 权限模型

### 6.1 Scopes

第一版固定以下 scopes：

| Scope | 能力 |
|---|---|
| `board:read` | 读取 Board、Module、Member、Task、Experiment、Attachment 和 Activity |
| `tasks:write` | 修改协作范围内 Task 的可写字段 |
| `experiments:write` | 创建或修改协作范围内的 Experiment |
| `attachments:write` | 在协作范围内创建附件或修改 caption |
| `activity:append` | 在协作范围内追加 Activity |
| `audit:read` | 读取协作范围内的 Agent API 审计记录 |

没有 `delete`、`admin` 或 `batch` scope。

### 6.2 Task 协作范围

Key 的 `member_id` 出现在 `task_assignees` 中时，该 Key 对相应 Task 具有协作范围：

```text
api_key.member_id
  → task_assignees.member_id
  → task_assignees.task_id
```

Task 协作范围意味着：

- 可以修改该 Task 的可写字段。
- 可以创建该 Task 下的 Experiment；服务端把 Owner 固定为 Key 的 `member_id`。
- 可以修改该 Task 下的所有 Experiment，不受 Experiment Owner 限制。
- 可以管理该 Task 下的 Attachment 和 Activity。

从 Task 移除 Member 后，相关 Key 对该 Task 的写权限立即失效。

### 6.3 读取范围

持有 `board:read` 的 Key 可以读取整个 Board，以便 Agent 获取跨 Module 和 Task
的上下文。Member 关系只限制写入。

`audit:read` 只返回该 Member 当前参与 Task 的审计记录。Admin 页面可以查看全部审计。

### 6.4 每次请求都检查对象权限

请求中的 UUID 不是权限证明。每个读写实现都必须根据数据库中的 Task 关系重新判断
权限，不能信任 body 中的 `member_id`、`task_id` 或 `module_id`。

## 7. UUID Assignee 模型

新增关系表：

```text
task_assignees
  task_id    uuid → tasks.id
  member_id  uuid → members.id
  created_at timestamptz
  primary key (task_id, member_id)
```

同时为 `(member_id, task_id)` 创建索引。

现有 `tasks.assignees text[]` 不再作为权限或业务关系的权威来源。迁移步骤：

1. 验证每个历史 assignee 名称都能唯一匹配一个 `members.name`。
2. 如果存在未知或重复名称，迁移失败并报告具体 Task，避免静默丢失关系。
3. 回填 `task_assignees`。
4. 同一版本更新 Dashboard，使 assignee 读写都使用 UUID 关系。
5. 暂时保留旧 `tasks.assignees` 列，但新代码不再读取或写入它。

旧列的最终删除不属于本设计范围。

## 8. 数据库新增对象

### 8.1 `api_keys`

```text
id            uuid primary key
name          text not null
key_prefix    text not null
key_digest    text unique not null
member_id     uuid not null → members.id
scopes        text[] not null
expires_at    timestamptz null
revoked_at    timestamptz null
last_used_at  timestamptz null
created_by    uuid not null
created_at    timestamptz not null
updated_at    timestamptz not null
```

数据库约束保证 `scopes` 只包含第 6.1 节定义的值。

该表启用 RLS，并撤销 `anon` 和普通 `authenticated` 的直接表权限。Admin 和 Agent
都只能通过 Next.js API 使用它。

### 8.2 `agent_api_audit_log`

```text
id               uuid primary key
api_key_id       uuid not null → api_keys.id
member_id        uuid not null
request_id       text unique not null
idempotency_key  text null
request_hash     text null
resource_type    text not null
resource_id      uuid not null
task_id          uuid null
action           text not null
before_state     jsonb null
after_state      jsonb null
response_status  integer not null
created_at       timestamptz not null
```

当 `idempotency_key` 非空时，`(api_key_id, idempotency_key)` 必须唯一。

索引：

- `(api_key_id, created_at desc)`，用于固定写入限流。
- `(task_id, created_at desc)`，用于资源审计。
- `(resource_type, resource_id, created_at desc)`，用于历史查询。

审计表是 append-only。Agent API 不提供修改或删除审计记录的能力。

### 8.3 Attachment 时间戳

`attachments` 增加 `updated_at`，使 caption PATCH 也能使用 `If-Match`。

### 8.4 事务 RPC

为需要同时修改业务数据和写入审计的操作提供少量、按资源划分的 Postgres RPC：

- Task PATCH。
- Experiment POST/PATCH。
- Attachment POST/PATCH。
- Activity POST。

RPC 保证以下检查和写入处于同一事务：

- Member 仍然参与目标 Task。
- PATCH 的旧 `updated_at` 仍然匹配。
- 业务数据写入。
- 审计写入。
- POST 幂等结果。

Key 身份验证、scope 和请求 schema 由 Next.js API 层负责。RPC 中再次检查 Task
关系是为了避免 Member 恰好在权限检查与数据写入之间被移出 Task。

RPC 不包含 Task 或 Experiment 删除逻辑。

## 9. Agent API

Base path：

```text
/api/agent/v1
```

### 9.1 Capabilities

```text
GET /capabilities
```

返回当前 Key 的 prefix、Member、scopes、过期时间和固定限制。原始 Key 和 digest
永不返回。

### 9.2 只读端点

| 方法 | 路径 | 行为 |
|---|---|---|
| `GET` | `/board` | Board 摘要 |
| `GET` | `/modules` | Module 列表 |
| `GET` | `/members` | Member UUID 与显示信息 |
| `GET` | `/tasks` | 过滤和分页查询 Task |
| `GET` | `/tasks/{id}` | Task 详情 |
| `GET` | `/experiments` | 过滤和分页查询 Experiment |
| `GET` | `/experiments/{id}` | Experiment 详情 |
| `GET` | `/tasks/{id}/activity` | Task Timeline |
| `GET` | `/audit` | 当前协作范围内的 API 审计 |

Task 查询支持 `module_id`、`assignee_id`、`status` 和 `updated_after`。

Experiment 查询支持 `task_id`、`owner_id`、`status` 和 `updated_after`。

列表使用不透明 cursor，默认 `limit=50`，最大 `limit=100`，不使用 OFFSET 页码。

### 9.3 写端点

| 方法 | 路径 | 行为 |
|---|---|---|
| `PATCH` | `/tasks/{id}` | 修改 Task 可写字段 |
| `POST` | `/tasks/{id}/experiments` | 创建 Experiment，Owner 固定为 Key 对应 Member |
| `PATCH` | `/experiments/{id}` | 修改 Experiment 可写字段 |
| `POST` | `/tasks/{id}/activity` | 追加 Activity |
| `POST` | `/experiments/{id}/attachments` | 上传附件 |
| `PATCH` | `/attachments/{id}` | 修改附件 caption |

明确不提供：

```text
DELETE /tasks/{id}
DELETE /experiments/{id}
POST   /batch
```

对 Task 或 Experiment 发送 DELETE 返回 `405 Method Not Allowed`。

## 10. PATCH 语义

PATCH 用于部分修改现有资源。请求使用：

```http
Content-Type: application/json
```

body 结构：

```json
{
  "changes": {
    "status": "analyzing",
    "metrics": {
      "latency_ms": 1.42
    }
  }
}
```

规则：

- 未提供的字段保持不变。
- `null` 是普通 JSON 值，由字段 schema 决定是否允许。
- 数组字段一旦提供就整体替换。
- 未知字段返回 `422 UNKNOWN_FIELD`。
- 不可写字段返回 `422 FIELD_NOT_WRITABLE`。
- 所有 changes 原子成功或原子失败。

不使用 JSON Merge Patch，因为当前 Experiment 数据模型包含显式 `null` 和数组。

### 10.1 Task 可写字段

可写：

- `title`
- `status`
- `notes`
- `position`

不可写的权限或父级字段：

- `module_id`
- `task_assignees` / assignee UUID

不可写的系统字段：

- `id`
- `created_at`
- `updated_at`

### 10.2 Experiment 可写字段

可写：

- `name`
- `status`
- `baseline_experiment_id`
- `data_spec`
- `object_spec`
- `environment_spec`
- `config`
- `notes`
- `metrics`
- `featured_metric_keys`
- `result_summary`
- `decision_outcome`
- `decision_notes`
- `position`

不可写的 Owner 或父级字段：

- `owner_id`
- `task_id`

不可写的系统字段：

- `id`
- `experiment_no`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

`started_at` 和 `completed_at` 继续由 Experiment 状态触发器维护。

创建 Experiment 时，请求 body 不接受 `owner_id` 或 `task_id`。`task_id` 来自 URL，
`owner_id` 由服务端设置为当前 Key 的 `member_id`。创建后这两个字段都不能通过
Agent API 修改。

## 11. 并发控制

不新增 `version` 列。复用现有 `updated_at` 作为 ETag。

GET 响应包含：

```http
ETag: "2026-07-28T15:31:22.123456Z"
```

Task、Experiment 和 Attachment PATCH 必须携带：

```http
If-Match: "2026-07-28T15:31:22.123456Z"
```

数据库 UPDATE 同时按 `id` 和旧 `updated_at` 过滤。没有匹配行时返回：

```text
412 Precondition Failed
VERSION_CONFLICT
```

Agent 必须重新 GET。API 不自动合并，也不执行 last-write-wins 覆盖。

## 12. POST 幂等

所有创建数据的 POST 都要求：

```http
Idempotency-Key: <UUID>
```

服务端对规范化后的 method、path 和 body 计算 request hash：

- 同一 Key、同一 Idempotency-Key、同一 request hash：返回第一次的结果。
- 同一 Key、同一 Idempotency-Key、不同 request hash：返回
  `409 IDEMPOTENCY_KEY_REUSED`。

PATCH 不要求 Idempotency-Key。客户端在 PATCH 响应丢失时重新 GET，确认目标状态。

## 13. 输入限制与状态规则

API 层必须：

- 严格解析 JSON schema。
- 拒绝非有限数字、错误 enum 和错误 UUID。
- 限制普通 JSON 请求体为 256 KiB。
- 限制附件为 10 MiB，并校验允许的 MIME 类型。
- 拒绝服务端未声明的额外字段。
- 复用现有 Experiment workflow 验证，不让 API 绕过 UI 中的状态前置条件。
- 继续依靠数据库 CHECK、FK 和 trigger 作为数据完整性最后防线。

每个请求只修改一个业务资源。

## 14. 固定限流

第一版只实现简单的 Key 级写限流：

```text
每把 Key 在任意连续 60 秒内最多完成 30 次成功写入
```

服务端在执行下一次写入前，通过该 Key 最近的成功审计记录计算额度。达到限制时返回
`429 Too Many Requests` 和 `Retry-After`。schema 或权限校验失败的请求不进入该
成功写入计数。

不实现每日预算、自动封禁、动态令牌桶或复杂熔断。Admin 可随时吊销 Key。

## 15. 审计与恢复

现有 `activity` 是面向用户的 Timeline；`agent_api_audit_log` 是面向安全和恢复的
API 审计，两者不互相替代。

每次 Agent API 写入记录：

- 哪把 Key。
- Key 对应的 Member UUID。
- 请求和资源。
- 修改前完整快照。
- 修改后完整快照。
- 请求结果和时间。

第一版不提供自动 revert API。恢复流程是：

1. 通过 `/audit` 读取目标修改的 `before_state`。
2. GET 当前资源和 ETag。
3. 比较当前状态，避免覆盖后续修改。
4. 使用普通 PATCH 恢复需要恢复的可写字段。
5. 恢复本身形成一条新的审计记录。

创建错误的 Experiment 不通过 API 删除；可以将其状态改为 `cancelled`，或由 Admin
在现有 Dashboard 中人工处理。

## 16. 响应与错误

成功响应：

```json
{
  "data": {
    "id": "resource-uuid",
    "updated_at": "2026-07-28T15:31:22.123456Z"
  },
  "meta": {
    "request_id": "req_...",
    "idempotency_replayed": false
  }
}
```

错误响应：

```json
{
  "error": {
    "code": "FIELD_NOT_WRITABLE",
    "message": "owner_id cannot be modified by the Agent API.",
    "request_id": "req_...",
    "retryable": false,
    "details": {
      "field": "owner_id"
    }
  }
}
```

主要状态码：

| 状态 | 场景 |
|---|---|
| `400` | 无法解析的请求 |
| `401` | Key 缺失、错误、过期或已吊销 |
| `403` | 缺少 scope 或不在 Task 协作范围 |
| `404` | 资源不存在 |
| `405` | 不支持的方法，包括 Task/Experiment DELETE |
| `409` | Idempotency-Key 被不同请求复用或业务冲突 |
| `412` | If-Match 失败 |
| `422` | 字段、schema 或 workflow 验证失败 |
| `429` | 写限流 |
| `500/503` | 服务端或依赖暂时失败 |

所有响应都包含 request ID。

## 17. 代码边界

建议目录：

```text
app/api/agent/v1/
app/api/admin/v1/api-keys/
app/admin/api-keys/
lib/agent-api/
  server.ts
  auth.ts
  permissions.ts
  schemas.ts
  responses.ts
  repository.ts
```

规则：

- Agent Route Handler 不直接散落 Supabase 查询。
- Key 验证集中在 `auth.ts`。
- Task 协作权限集中在 `permissions.ts`。
- 字段白名单和输入限制集中在 `schemas.ts`。
- 数据修改与审计集中在 `repository.ts` 和数据库 RPC。
- Agent API 代码中不出现 Task/Experiment `.delete()`。

## 18. Agent Skill

Skill 名称：

```text
triton-board-api
```

仓库位置：

```text
.agents/skills/triton-board-api/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── references/
│   └── openapi.yaml
└── scripts/
    └── triton_board_api.py
```

### 18.1 触发条件

当 Agent 需要通过 Triton Board Agent API 查看、创建或修改 Board、Task、
Experiment、Attachment、Activity 或审计数据时使用。

### 18.2 环境变量

```text
TRITON_BOARD_API_URL
TRITON_BOARD_API_KEY
```

### 18.3 核心工作流

```text
检查环境变量
  → GET /capabilities
  → GET 当前资源
  → 计算最小变化
  → PATCH + If-Match 或 POST + Idempotency-Key
  → 验证响应或重新 GET
```

Skill 明确要求：

- 不打印或回显 API Key。
- 不尝试 DELETE。
- 不修改 Owner、assignee、父级或系统字段。
- 不构造批量写入。
- PATCH 只发送完成用户目标所需的最小字段。
- 遇到 `412` 先重新读取；目标字段发生并发修改时停止并报告冲突。
- 遇到 `401/403/422` 不原样重试。
- 遇到 `429` 遵守 `Retry-After`。
- POST 重试必须复用原 Idempotency-Key。

### 18.4 Skill 资源

`references/openapi.yaml` 是完整端点和 schema 的机器可读规范。

`scripts/triton_board_api.py` 使用 Python 标准库实现一个薄客户端：

- 从环境变量读取 URL 和 Key。
- 只支持 GET、PATCH 和 POST。
- 不实现 DELETE。
- 自动输出 HTTP 状态、request ID、ETag 和响应 JSON。
- API Key 不进入命令行参数或输出。

## 19. 测试

### 19.1 权限矩阵

至少创建 Bruce、Alice、Bruce-only Task、Alice-only Task 和共同 Task：

- Bruce Key 可以修改 Bruce-only Task。
- Bruce Key 不能修改 Alice-only Task。
- Bruce Key 可以修改共同 Task 下 Alice Owner 的 Experiment。
- Bruce Key 创建的 Experiment 自动以 Bruce 为 Owner。
- 从共同 Task 移除 Bruce 后，Bruce Key 立即失去写权限。
- 缺少相应 scope 时，即使参与 Task 也不能写。

### 19.2 字段保护

- Task `module_id` 和 assignee 修改返回 `422`。
- Experiment `owner_id` 和 `task_id` 修改返回 `422`。
- 系统字段修改返回 `422`。
- 未知字段返回 `422`。
- 合法可写字段可以原子修改。

### 19.3 删除保护

- Task DELETE 返回 `405`。
- Experiment DELETE 返回 `405`。
- Agent API 路由和 mutation repository 不包含删除实现。

### 19.4 并发与幂等

- 正确 If-Match 可 PATCH。
- 过期 If-Match 返回 `412` 且数据不变。
- 相同 POST Idempotency-Key 返回同一资源。
- 相同 Idempotency-Key 配合不同 body 返回 `409`。

### 19.5 审计

- 成功写入包含正确 before/after 快照。
- 失败写入不产生伪造的成功审计。
- 普通 Key 只能读取当前协作范围内的审计。
- 从 before_state 执行普通 PATCH 可以恢复可写字段。

### 19.6 Key 管理

- 原始 Key 只返回一次。
- 数据库没有原始 Key。
- 过期、吊销和轮换后的旧 Key 返回 `401`。
- 非 Admin Supabase 用户不能调用 Admin API。

### 19.7 Skill

- Skill 能完成 capabilities、读取 Task、PATCH Task、创建 Experiment 和处理 412。
- 客户端脚本不支持 DELETE。
- 测试输出和进程参数不包含原始 API Key。

## 20. 上线顺序

1. 增加数据库表、索引、RPC、RLS 和历史 assignee 验证/回填。
2. 同一版本把 Dashboard assignee 读写切换到 UUID 关系。
3. 增加服务端环境变量：
   - `SUPABASE_SECRET_KEY`
   - `TRITON_BOARD_ADMIN_USER_ID`
4. 实现 Agent API 和 Admin Key 管理页面。
5. 运行权限矩阵、字段保护、并发、幂等和审计测试。
6. 生成并校验 OpenAPI 规范与 `triton-board-api` Skill。
7. 部署后由共享 Admin 账号创建第一把 Key。

初始部署时 `api_keys` 为空，因此 API 默认没有任何可用调用者。

## 21. 完成标准

- Admin 可以创建、轮换和吊销绑定 Member UUID 与 scopes 的 Key。
- Key 只能修改其 Member 参与 Task 范围内的数据。
- Task 协作范围允许修改该 Task 下任意 Owner 的 Experiment。
- Task/Experiment Owner、父级和系统字段无法通过 Agent API 修改。
- Task/Experiment DELETE 无法通过 Agent API 调用。
- PATCH 不覆盖并发修改。
- POST 重试不创建重复记录。
- 每次 Agent 写入具有可用于人工恢复的 before/after 审计。
- OpenAPI 与实际行为一致。
- 仓库中的 `triton-board-api` Skill 能安全完成读写流程。

## 22. 参考

- [RFC 5789: PATCH Method for HTTP](https://www.rfc-editor.org/rfc/rfc5789.html)
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 7396: JSON Merge Patch](https://www.rfc-editor.org/rfc/rfc7396.html)
- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase: Securing your data](https://supabase.com/docs/guides/database/secure-data)
- [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
