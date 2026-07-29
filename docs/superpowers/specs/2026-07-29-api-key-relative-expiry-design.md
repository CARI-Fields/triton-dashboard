# API Key 相对有效期设计

日期：2026-07-29

## 背景

Admin API Key 页面目前使用 `datetime-local` 让管理员选择绝对过期时间。创建
凭据时，管理员真正关心的是“从现在起允许使用多久”，手工选择日期和时区增加了不必要
的计算成本。

本改动只优化 Admin 页面交互。现有 Admin API、数据库字段和 Key 鉴权逻辑继续使用
RFC3339 格式的绝对 `expires_at`。

## 交互设计

创建 Key 时，将 `Expires at` 日期时间输入替换为 `Expires after` 下拉框：

- `Never`
- `1 day`
- `7 days`
- `30 days`
- `90 days`

新建表单默认选择 `30 days`。管理员仍可主动选择 `Never`。

编辑已有 Key 时，使用相同的固定档位，并额外提供默认选项
`Keep current expiration`：

- 未修改该选项时，保存不会改变当前 `expires_at`。
- 选择 `Never` 时，将 `expires_at` 设置为 `null`。
- 选择其他档位时，从点击保存并构造请求的时刻重新计算过期时间。

页面中的 Key 卡片继续显示最终的绝对过期日期以及 Active、Expired、Revoked 状态。

## 数据流

前端使用有限枚举表示选择：

```text
keep | never | 1d | 7d | 30d | 90d
```

`keep` 只用于编辑表单。提交时：

1. 读取一次 `Date.now()`，避免一次请求内出现不同基准时间。
2. `never` 转换为 `null`。
3. 天数档位转换为 `new Date(now + days * 86_400_000).toISOString()`。
4. `keep` 复用该 Key 当前的 `expires_at`。
5. 使用现有 `expires_at` 请求字段调用 Admin API。

因此不新增请求字段，不修改数据库 migration，也不改变 Agent API 或 Skill。

## 错误处理

下拉框只产生受支持的枚举值，不提供自定义数字或日期输入。转换函数遇到未知值时抛出
安全的前端错误，并沿用页面现有的错误 banner；不会发送部分或猜测后的请求。

## 测试

组件测试固定系统时间并验证：

- 创建表单默认发送从当前时间起 30 天的 `expires_at`。
- `Never` 发送 `expires_at: null`。
- 1、7、30、90 天分别生成准确的 RFC3339 时间。
- 编辑表单默认保留原 `expires_at`。
- 编辑时主动选择新档位，会从保存时重新计时。
- 现有 Key 状态切换、轮换、吊销和一次性 secret 行为保持不变。

## 非目标

- 不支持自定义小时数或天数。
- 不改变已经保存的 Key。
- 不改变后端 `expires_at` 校验。
- 不引入新的数据库字段或相对时长持久化。
