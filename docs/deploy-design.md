# nxspub deploy 设计方案（MVP）

## 1. 背景与目标

`nxspub version/release` 解决了版本计算与包发布，但团队仍需要一套统一的“发布后部署”流程，将产物部署到运行环境（staging/production/canary），并具备明确的安全门禁、灰度策略与回滚路径。

`nxspub deploy` 定义为发布后的部署编排器。

目标：

- 统一单包与 workspace 两种项目的部署流程。
- 复用现有分支策略与发布元数据，降低误部署风险。
- 提供可审计、可回放的部署记录，支撑 CI/CD 与故障恢复。
- 保持本地与 CI 行为一致，基于共享 deploy core 实现。
- 必须支持以下部署目标：Vercel、Cloudflare、1Panel、宝塔面板（bt.cn）。

非目标（MVP）：

- 不做托管控制平面/SaaS。
- 不实现密钥管理系统（仅消费外部注入的环境变量/密钥）。
- 不做过深的厂商抽象（仅定义 Provider Adapter 契约）。

---

## 2. 命令与运行模式

命令形态：

```bash
nxspub deploy
nxspub deploy --env staging
nxspub deploy --env production --strategy canary
nxspub deploy --plan
nxspub deploy --dry
nxspub deploy --rollback --to <deploymentId>
```

行为规则：

- `deploy`：按当前分支策略与默认配置执行部署。
- `deploy --plan`：仅计算并输出部署计划，不产生副作用。
- `deploy --dry`：执行部署预演（含 provider 校验），不切换流量。
- `deploy --rollback`：回滚到指定成功部署记录。

### 2.1 参数矩阵

| 命令     | 参数             | 类型      | 默认值          | 说明                       | 约束                                                   |
| -------- | ---------------- | --------- | --------------- | -------------------------- | ------------------------------------------------------ |
| `deploy` | `--cwd`          | `string`  | `process.cwd()` | 工作目录                   | 必须能解析有效 nxspub 配置                             |
| `deploy` | `--env`          | `string`  | 分支映射结果    | 目标环境（dev/staging/prod） | 必须存在于 `deploy.environments`                       |
| `deploy` | `--strategy`     | `string`  | `rolling`       | 发布策略（rolling/canary/blue） | 必须被当前 provider adapter 支持                    |
| `deploy` | `--plan`         | `boolean` | `false`         | 仅输出部署计划             | 不允许写入/流量变更                                     |
| `deploy` | `--dry`          | `boolean` | `false`         | 预演部署                   | 不允许改变运行时状态                                     |
| `deploy` | `--rollback`     | `boolean` | `false`         | 启用回滚模式               | 必须搭配 `--to`                                        |
| `deploy` | `--to`           | `string`  | 无              | 回滚目标 deployment id     | 必须是本地部署记录中的成功项                             |
| `deploy` | `--skipChecks`   | `boolean` | `false`         | 跳过非关键检查             | 不可跳过硬门禁（策略、产物存在性）                        |
| `deploy` | `--concurrency`  | `number`  | `1`             | workspace 最大并发部署数   | 必须 >= 1；canary/blue-green 通常强制为 `1`             |
| `deploy` | `--json`         | `boolean` | `false`         | 机器可读输出               | 输出计划/结果/时间线                                     |

---

## 3. 典型场景

1. 单包部署到 staging  
   校验最新已发布产物，按 rolling 策略部署。

2. workspace 部署到 production  
   按依赖拓扑顺序部署多个公开包，并受并发上限控制。

3. Canary 灰度  
   小流量发布 + 健康探针验证，通过后提升，不通过自动/手动回滚。

4. 事故回滚  
   回滚到既有成功 deployment id，并记录完整审计链路。

---

## 4. 部署信息架构

### 4.1 输入层

- 分支与环境解析
- 发布产物选择（version/tag/dist-tag）
- 策略与 rollout 参数
- 安全开关（`dry`、`plan`、`skipChecks`）

### 4.2 计划层

- 产物解析结果
- workspace 包部署顺序
- provider 需要执行的操作清单
- 风险与阻断项

### 4.3 执行层

- 时间线：`validate -> prepare -> deploy -> verify -> finalize`
- 分步骤日志与 provider 回执
- 部分失败处理与重试建议

### 4.4 结果层

- deployment id
- environment / strategy
- 包结果矩阵（deployed/skipped/failed）
- 回滚指引与下一步建议

### 4.5 产物来源与环境晋级规则

产物来源优先级（从高到低）：

1. 显式参数指定（如 `--artifact` / `--image`，后续实现）
2. deploy 记录中的最近成功产物（用于晋级与回滚）
3. release 结果（同会话）
4. registry/tag 解析结果

冲突处理：

- 同一包若出现多个候选版本，优先使用“同一批次、同一来源”的一致产物集合。
- 若无法形成一致集合，直接硬失败，不做“自动猜测”。

环境晋级（promotion）规则：

- `staging -> production` 必须使用同一产物标识（建议 digest/不可变 tag）。
- 晋级禁止重新构建产物，只允许“复用已验证产物”。
- 若发现产物不一致（版本相同但 digest 不同），硬失败并要求人工确认。

---

## 5. 配置模型

建议扩展：

```ts
interface NxspubDeployConfig {
  enabled?: boolean
  defaultEnvironment?: string
  branchEnvironmentMap?: Record<string, string>
  provider: {
    name:
      | 'vercel'
      | 'cloudflare'
      | 'onepanel'
      | 'btpanel'
      | 'ssh'
      | 'rancher'
      | 'k8s'
      | 'custom'
    config?: Record<string, unknown>
  }
  environments: Record<
    string,
    {
      strategy?: 'rolling' | 'canary' | 'blue-green'
      verify?: {
        healthEndpoint?: string
        timeoutMs?: number
        successThreshold?: number
      }
      approval?: {
        required?: boolean
        channel?: string
      }
    }
  >
}
```

规则：

- `deploy.enabled=false` 时阻止 `deploy` 执行。
- 当前分支必须映射到有效环境，否则硬失败。
- 必须配置 provider adapter。

### 5.1 Provider 最小配置示例（MVP）

Vercel：

```ts
deploy: {
  provider: {
    name: 'vercel',
    config: {
      tokenEnv: 'VERCEL_TOKEN',
      teamId: 'team_xxx',
      projectId: 'prj_xxx',
    },
  },
}
```

Cloudflare：

```ts
deploy: {
  provider: {
    name: 'cloudflare',
    config: {
      apiTokenEnv: 'CLOUDFLARE_API_TOKEN',
      accountId: 'acc_xxx',
      project: 'my-pages-project',
    },
  },
}
```

1Panel：

```ts
deploy: {
  provider: {
    name: 'onepanel',
    config: {
      baseUrl: 'https://panel.example.com',
      apiKeyEnv: 'ONEPANEL_API_KEY',
      appName: 'my-app',
    },
  },
}
```

宝塔（BT Panel）：

```ts
deploy: {
  provider: {
    name: 'btpanel',
    config: {
      baseUrl: 'https://bt.example.com',
      apiKeyEnv: 'BT_API_KEY',
      siteName: 'my-site',
    },
  },
}
```

SSH：

```ts
deploy: {
  provider: {
    name: 'ssh',
    config: {
      hosts: [
        {
          name: 'prod-1',
          host: '10.0.0.10',
          user: 'deploy',
          privateKeyPath: '~/.ssh/id_ed25519',
          deployPath: '/srv/myapp',
          releasePath: '/srv/myapp/releases',
          currentSymlink: '/srv/myapp/current',
        },
      ],
      transfer: 'rsync',
      healthCheckCommand: 'curl -f http://127.0.0.1:3000/health',
    },
  },
}
```

Rancher：

```ts
deploy: {
  provider: {
    name: 'rancher',
    config: {
      serverUrl: 'https://rancher.example.com',
      tokenEnv: 'RANCHER_TOKEN',
      clusterId: 'c-xxxxx',
      namespace: 'prod',
      workload: 'my-app',
    },
  },
}
```

---

## 6. API / Core 契约（供 CLI + 后续 Console 复用）

### 6.0 Artifact 字段规范（统一语义）

统一 artifact 结构：

```ts
type DeployArtifact = {
  name: string
  version: string
  tag?: string
  digest?: string
  image?: string
  source: 'release-session' | 'deploy-record' | 'registry' | 'manual'
}
```

字段规则：

- `name`、`version` 必填。
- `image` 用于容器型 Provider（如 Rancher/k8s）。
- `digest` 为强推荐字段，用于晋级一致性校验。
- `tag` 仅作展示或弱引用，不能替代 `digest` 的一致性保障。
- `source` 必填，便于审计溯源。

### 6.1 部署计划契约（内部）

```ts
type DeployPlan = {
  env: string
  strategy: 'rolling' | 'canary' | 'blue-green'
  mode: 'single' | 'workspace'
  artifacts: Array<{ name: string; version: string; source: string }>
  checks: Array<{ id: string; ok: boolean; level: 'blocker' | 'warn' | 'info'; message: string }>
}
```

### 6.2 部署执行契约（内部）

```ts
type DeployResult = {
  deploymentId: string
  status: 'success' | 'failed' | 'partial'
  deployed: Array<{ name: string; version: string }>
  skipped: Array<{ name: string; version: string; reason: string }>
  failed: Array<{ name: string; version: string; reason: string }>
  timeline: Array<{ step: string; status: string; at: string; message?: string }>
}
```

### 6.3 回滚契约（内部）

```ts
type RollbackResult = {
  deploymentId: string
  rollbackTo: string
  status: 'success' | 'failed'
  timeline: Array<{ step: string; status: string; at: string; message?: string }>
}
```

---

## 7. Provider Adapter 接口

```ts
interface DeployProviderAdapter {
  name: string
  validate(config: unknown): Promise<void>
  plan(input: DeployPlanInput): Promise<DeployPlan>
  execute(input: DeployExecuteInput): Promise<DeployResult>
  rollback(input: DeployRollbackInput): Promise<RollbackResult>
}
```

Adapter 要求：

- 同一 `deploymentId` 种子重复执行应具备幂等性。
- 必须返回结构化失败原因。
- 日志不得泄露密钥信息。

### 7.1 强制支持的 Provider（MVP 范围）

以下平台为强制支持项，不可降级为“后续再支持”：

1. Vercel
2. Cloudflare
3. 1Panel（[https://1panel.cn/](https://1panel.cn/)）
4. 宝塔面板 / BT Panel（[https://www.bt.cn/new/index.html](https://www.bt.cn/new/index.html)）
5. SSH（直连服务器部署）
6. Rancher

每个 Provider 在 MVP 最少能力：

- `validate`：校验配置与凭证可用性
- `plan`：生成变更计划（目标应用/服务、版本、策略）
- `execute`：执行部署并返回结构化结果
- `rollback`：基于部署记录执行回滚

推荐适配方式：

- Vercel：Vercel CLI 或官方 API
- Cloudflare：Wrangler CLI / Cloudflare API（Pages/Workers）
- 1Panel：1Panel Open API（如可用）或受控 SSH/CLI 适配
- 宝塔：BT 面板 API（开启 API 令牌）或受控 SSH/CLI 适配
- SSH：原生 SSH/SCP/RSYNC + 远端部署脚本（支持原子切换与回滚）
- Rancher：Rancher API（v3）或 `kubeconfig + kubectl/helm` 适配

### 7.2 SSH Provider 最小规范

建议配置形态：

```ts
type SshProviderConfig = {
  hosts: Array<{
    name: string
    host: string
    port?: number
    user: string
    privateKeyPath?: string
    passwordEnv?: string
    deployPath: string
    releasePath?: string
    currentSymlink?: string
  }>
  transfer?: 'rsync' | 'scp'
  preDeployScript?: string
  postDeployScript?: string
  healthCheckCommand?: string
}
```

安全要求：

- 必须校验主机指纹（禁止默认关闭 `StrictHostKeyChecking`）。
- 密钥/口令仅通过环境变量或本地安全文件读取，不落盘到 deploy record。
- 远端脚本必须显式失败退出（非零码）并返回结构化错误。

回滚建议：

- 采用版本目录 + `current` 软链接切换（原子切换）。
- 保存最近 N 个 release 目录，回滚时切回上一个成功版本目录。

### 7.3 Provider 能力矩阵（MVP）

| Provider   | 支持策略                      | 回滚 | 健康检查 | 备注 |
| ---------- | ----------------------------- | ---- | -------- | ---- |
| Vercel     | rolling / canary（按平台能力） | 支持 | 支持     | 基于 Vercel API/CLI |
| Cloudflare | rolling / canary（Workers/Pages） | 支持 | 支持   | 基于 Wrangler/API |
| 1Panel     | rolling（MVP）                 | 支持 | 支持     | API 不可用时走 SSH 受控适配 |
| 宝塔        | rolling（MVP）                 | 支持 | 支持     | API Token 模式优先 |
| SSH        | rolling / blue-green           | 支持 | 支持     | 基于目录切换与脚本探针 |
| Rancher    | rolling / canary / blue-green  | 支持 | 支持     | 基于 Rancher API/kubectl/helm |

---

## 8. 安全门禁与鲁棒性

硬门禁（不可跳过）：

- 分支策略不允许部署到目标环境。
- 找不到匹配的已发布产物。
- provider 配置无效。
- 同一工作区已有 deploy/rollback 任务在执行（锁冲突）。

软门禁（`--skipChecks` 可跳过）：

- 非关键健康探针告警。
- 可选审批通道不可用。

强制安全要求：

- 执行期间加锁：`.nxspub/deploy.lock`
- 持久化部署记录：`.nxspub/deploy-records/<deploymentId>.json`
- 回滚目标必须是成功记录。

### 8.1 幂等与重试协议

- 每次部署生成 `deploymentId` 与 `idempotencyKey`（基于 env + artifacts + commit + strategy）。
- 相同 `idempotencyKey` 的重复请求：
  - 若前次成功：返回已有结果（不重复执行）。
  - 若前次失败：允许按策略重试（记录重试次数）。
- 步骤级重试：
  - 可重试：网络抖动、瞬时 API 超时、短暂健康探针失败。
  - 不可重试：配置错误、鉴权失败、策略不满足、产物不存在。

### 8.2 超时与自动回退策略

默认超时建议：

- `validate`: 30s
- `prepare`: 120s
- `deploy`: 600s
- `verify`: 300s
- `finalize`: 60s

自动回退规则：

- `verify` 阶段连续失败且超过阈值时触发自动回滚（若 provider 支持）。
- 自动回滚失败时，状态标记为 `failed` 并输出人工恢复指引。

### 8.3 凭证与日志脱敏规范

凭证来源白名单：

- 环境变量（推荐）
- 本地只读凭证文件路径（明确在配置中声明）
- 外部 secret 引用（由 CI 注入后解析）

禁止行为：

- 不得将密钥、Token、密码写入 deploy record。
- 不得在日志输出完整凭证值。

脱敏字段建议：

- `token`、`apiKey`、`password`、`secret`、`privateKey`、`authorization`

---

## 9. 状态机

状态：

- `idle`
- `planning`
- `ready`
- `executing`
- `verifying`
- `completed`
- `failed`
- `rolling_back`

状态迁移：

1. `idle -> planning`（`deploy --plan` / `deploy`）
2. `planning -> ready`（硬门禁全部通过）
3. `ready -> executing`（确认执行）
4. `executing -> verifying`（provider 部署完成）
5. `verifying -> completed`（健康阈值通过）
6. `verifying -> failed`（关键验证失败）
7. `failed -> rolling_back`（自动/手动回滚）
8. `rolling_back -> completed/failed`

---

## 10. 部署记录与审计

记录字段：

- deploymentId / startedAt / finishedAt
- git commit sha / branch / environment
- 产物列表与版本
- 策略参数
- 时间线与最终状态
- 回滚关联信息

存储：

- `.nxspub/deploy-records/index.json`（摘要索引）
- `.nxspub/deploy-records/<deploymentId>.json`（完整明细）

并发写入策略：

- `index.json` 与明细文件均采用“临时文件 + 原子 rename”写入。
- 写入前后持有文件锁，避免并发进程覆盖。
- 读取失败时保留损坏快照并降级回退到上一个可用索引。

---

## 11. 实施策略

1. 抽取 deploy core（`plan/execute/rollback`）为纯编排层。
2. 增加首个 provider（MVP 使用 `custom` shell adapter）。
3. 增加 CLI 命令包装层（锁、输出格式、错误码）。
4. 增加部署记录持久化与查询能力。
5. 下一里程碑接入 `console` 执行 API（可选）。
6. 先实现强制支持 Provider 的最小可用适配（Vercel/Cloudflare/1Panel/宝塔/SSH/Rancher）。

---

## 12. 里程碑计划

### Milestone 1（MVP CLI）

- `nxspub deploy` 命令与参数解析
- 分支到环境映射
- 计划输出 + dry 执行
- provider adapter 基础契约
- 部署记录持久化
- 六类强制 Provider 的 smoke 级适配打通

### Milestone 2（安全与回滚）

- 回滚命令路径
- canary 验证门禁
- 并发冲突控制
- 失败分类增强

### Milestone 3（Console 集成）

- 向 console 暴露 deploy plan/run API
- 执行时间线 UI 与回滚操作

### 12.1 Console 集成设计（Deploy Workspace）

`nxspub console` 中新增 `Deploy` 视图（与 Version Runner / Release Runner 并列），统一称为 `Deploy Workspace`。

UI 分区：

1. Deploy Controls
- 环境选择（`env`）
- 策略选择（`strategy`）
- 执行模式（`plan/dry/run/rollback`）
- 并发配置（workspace）

2. Artifact Panel
- 当前候选产物列表（name/version/tag/digest/source）
- 晋级一致性检查结果（staging -> production）
- 冲突提示与阻断原因

3. Risk & Gate Panel
- policy / artifact / provider / lock / approval 状态
- blocker/warn/info 分级展示

4. Execution Timeline
- `validate -> prepare -> deploy -> verify -> finalize`
- 每步状态：`pending/running/success/error`

5. Rollback Panel
- 可选回滚目标（最近成功 deployment records）
- 回滚执行入口与结果展示

6. Deploy Records Panel
- 最近部署记录列表
- 详情查看（JSON/结构化）

### 12.2 Console Deploy API 设计

建议路由：

- `POST /api/deploy/plan`
  - Request: `{ env?: string, strategy?: string, branch?: string }`
  - Response: `DeployPlan`

- `POST /api/deploy/run`
  - Request: `{ env?: string, strategy?: string, dry?: boolean, skipChecks?: boolean, concurrency?: number }`
  - Response: `DeployResult`

- `POST /api/deploy/rollback`
  - Request: `{ to: string, env?: string }`
  - Response: `RollbackResult`

- `GET /api/deploy/status`
  - Response: `{ running: boolean, currentTask?: { kind: 'deploy'|'rollback', startedAt: string, requestId: string } }`

- `GET /api/deploy/records`
  - Response: `{ items: DeployRecordSummary[] }`

- `GET /api/deploy/records/:id`
  - Response: `DeployRecordDetail`

### 12.3 与 Console 现有执行模型对齐

- 与 `version/release` 共用执行互斥（同一时刻仅一个执行任务）。
- `readonly-strict` 下禁止 `deploy/run` 与 `deploy/rollback`（返回 `403`）。
- in-flight 冲突统一返回 `409`。
- SSE 事件沿用现有流：
  - `kind: 'deploy' | 'deploy-rollback'`
  - `phase: 'start' | 'success' | 'error' | 'info'`

### 12.4 Console 验收补充

- 在 console 中可独立完成 `plan -> dry -> run -> rollback` 全流程。
- Deploy Timeline 与后端步骤状态一致，不出现乱序覆盖。
- Deploy 记录可在控制台查询并用于回滚选择。

### 12.5 当前实现状态（截至 2026-04-21）

已完成：

- [x] `nxspub deploy` 命令与 `plan/dry/run/rollback/json` 参数路径
- [x] `deploy.lock` 执行互斥
- [x] deploy record 持久化与查询（`index.json` + `<deploymentId>.json`）
- [x] `index.json` 写入锁（`index.lock`）与原子写入
- [x] Console Deploy API：`/api/deploy/plan`、`/api/deploy/run`、`/api/deploy/rollback`、`/api/deploy/records`、`/api/deploy/records/:id`
- [x] `readonly-strict` 对 deploy 写接口的 `403` 保护
- [x] deploy 执行并发冲突 `409` 保护（与 version/release 共用执行互斥）
- [x] production promotion 一致性校验（默认 `staging -> production`，优先 digest，对无 digest 情况回退 version 对比）

待完成：

- [ ] 独立的 `GET /api/deploy/status` 路由（当前复用 `GET /api/execution/status`）
- [ ] 六类强制 Provider（Vercel/Cloudflare/1Panel/宝塔/SSH/Rancher）全量集成冒烟用例
- [ ] 文档中提到的 `idempotencyKey` 全链路持久化与重放返回（目前为部署 ID 级别记录，不是完整幂等协议）

---

## 13. 验收标准

- 相同输入 + 相同 git/release 状态下部署计划可重复且一致。
- 硬门禁始终阻断部署，不受 `--skipChecks` 影响。
- 对有效历史记录执行回滚能够成功。
- workspace 部署顺序满足依赖拓扑约束。
- `--json` 输出稳定、可被机器消费。
- 日志与落盘记录不泄露敏感信息。
- `staging -> production` 晋级使用同一产物标识，不允许重新构建替换。
- workspace 失败语义与退出码可预测（见 15.1）。

---

## 14. 测试计划

单元测试：

- 分支/环境解析
- 部署门禁（策略、产物存在性、锁冲突）
- adapter 结果归一化
- 部署记录读写完整性

集成测试：

- 命令矩阵（`plan/dry/execute/rollback/json`）
- workspace 排序与并发上限
- in-flight 锁冲突行为
- 回滚到不存在 deployment id 的错误路径
- 每个强制 Provider 至少 1 条部署冒烟用例
- 每个强制 Provider 至少 1 条失败后回滚用例

端到端（可选）：

- release -> deploy staging -> verify -> deploy production
- deploy 失败 -> rollback -> 状态恢复

---

## 15. 待决策事项

- deploy 是否强制要求“同会话先执行过 release”，还是允许直接按版本查询 registry 产物？
- workspace 部署默认 `fail-fast`，可选 `--allow-partial`（后续）启用部分成功模式。
- MVP 是否纳入审批钩子（本地确认 vs 外部 webhook）？

### 15.2 审批模型（建议默认实现）

审批触发条件（任一命中）：

- 目标环境为 `production`
- 使用 `--rollback`（生产回滚）
- 使用 `--strategy canary` 并请求最终全量提升

审批流程：

1. 进入 `waiting_approval` 状态
2. 在限定时间内等待确认（默认 30 分钟）
3. 确认通过：继续执行
4. 超时/拒绝：结束为 `blocked`，退出码为 `3`

审批来源（MVP）：

- 本地交互确认（CLI prompt）
- 可选 webhook 适配（后续）

### 15.1 退出码与失败语义（默认约定）

- `0`：全部成功
- `1`：执行失败（含回滚失败）
- `2`：配置/参数错误
- `3`：门禁阻断（策略、产物、锁冲突）
- `4`：部分成功（仅在未来 `--allow-partial` 启用时使用）

---

## 16. 立即可执行任务

1. 在配置 schema 与文档中新增 `deploy` 配置段。
2. 脚手架 `src/commands/deploy.ts` 与 `src/deploy/*` 模块。
3. 实现 file-lock 与 deploy-record 存储工具。
4. 增加 MVP `custom` shell adapter 与配套集成测试。

---

## 17. 向后兼容与迁移策略

无 `deploy` 配置的旧项目：

- `nxspub deploy` 默认失败并给出清晰指引：
  - 提示缺少 `deploy` 配置段
  - 输出最小配置模板路径建议

已有配置迁移：

- 旧字段命名可在一个小版本内给出 deprecate 提示（仅提示，不自动改写文件）。
- 新字段优先级高于旧字段，冲突时打印警告并以新字段为准。

错误提示规范：

- 必须包含：错误类别、受影响字段、修复建议示例。
- JSON 模式下返回结构化 `code/message/details`，便于 CI 消费。
