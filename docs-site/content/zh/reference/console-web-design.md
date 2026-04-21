# nxspub console --web 设计方案（MVP）

## 1. 背景与目标

`nxspub console` 是统一的发布决策入口。在多分支与多包工作区场景中，用户需要频繁切换分支策略、比较版本路径、查看 changelog 草稿健康度。

`--web` 的目标是提供本地可视化「发布前控制台」，让用户在执行 `nxspub version/release` 前完成风险确认。

目标：

- 降低误发布风险（分支策略、tag 冲突、registry 已发布冲突）。
- 降低认知负担（依赖传播链、被动升级链）。
- 与 CLI 逻辑一致（复用同一计算核心，不重复定义规则）。

非目标（MVP）：

- 不做远程协作 SaaS（仅本地运行）。
- 不做账号体系。

---

## 2. 命令与运行模式

```bash
nxspub console
nxspub console --web
nxspub console --web --port 4173
nxspub console --web --host 127.0.0.1
nxspub console --web --open
nxspub console --json
```

规则：

- `console`：终端模式。
- `console --web`：启动本地 HTTP 服务与前端页面。
- 默认监听：`127.0.0.1:4173`。
- 默认不自动打开浏览器，需显式传 `--open`。

参数矩阵（扩展）：

| 命令 | 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| console | `--cwd` | string | `process.cwd()` | 工作目录 |
| console | `--json` | boolean | false | 机器可读输出 |
| console | `--branch` | string | 当前分支 | 模拟分支策略 |
| console --web | `--host` | string | 127.0.0.1 | 监听地址 |
| console --web | `--port` | number | 4173 | 监听端口 |
| console --web | `--open` | boolean | false | 自动打开浏览器 |
| console --web | `--readonly-strict` | boolean | false | 严格只读（禁写接口） |
| console --web | `--allow-remote` | boolean | false | 允许远程访问（需配合 `0.0.0.0`） |

---

## 3. 典型场景

1. 单包项目：查看目标版本、changelog 预览、tag/registry 风险。  
2. workspace 项目：查看每个包升级来源（commit/被动）、依赖传播路径、根 changelog 汇总。  
3. 多分支对比：比较 `main/alpha/hotfix` 下同一代码的发布结果。  
4. 草稿治理：查看 `matching/behind/ahead/invalid` 并执行 behind 清理。  

---

## 4. 页面信息架构（MVP）

### 4.1 顶部控制区

- `cwd`
- 模拟分支
- 模式（single/workspace）
- 刷新计算
- 导出 JSON

### 4.2 概览卡片

- 当前版本 / 目标版本
- 变更提交数
- 待发布包数量
- 风险数量

### 4.3 版本计划区

- 单包：bump 类型、目标版本、触发提交。
- workspace：包表格（current -> next、bumpType、isPassive、passiveReasons、private）。

### 4.4 Changelog 预览

- 根条目或包条目预览
- 草稿导入信息（来源分支与版本）

### 4.5 发布前检查

- 分支策略合法性
- 本地/远端 tag 冲突
- registry 版本冲突
- git 同步状态（ahead/behind/dirty）

### 4.6 草稿健康

- `matching/behind/ahead/invalid` 统计
- behind 样本列表
- `Prune behind drafts` 按钮

### 4.7 执行工作台（version/release）

- Version Runner：`dry-run` 与 apply 执行（含二次确认）
- Release Runner：发布参数输入（registry/tag/access/provenance 等）
- Execution Timeline：`validate -> plan -> execute -> finalize`

---

## 5. 服务架构与技术选型

服务层（Node）：

- 运行时：Node.js
- HTTP：`h3`
- 启动：`nxspub console --web` 同进程启动

前端层：

- React + Vite
- TailwindCSS
- 状态与请求：React state + React Query（可选）

与 CLI 的关系：

- 必须复用同一计算核心
- Web 不得自行重写版本计算逻辑

---

## 6. API（MVP）

基础：

- `GET /api/health`
- `GET /api/context`

预览：

- `POST /api/preview`
- `POST /api/checks`

草稿：

- `GET /api/drafts?target=1.3.0`
- `POST /api/drafts/prune`

导出：

- `GET /api/export.json`

执行（vNext）：

- `POST /api/version/run`
- `POST /api/release/run`
- `GET /api/execution/status`

---

## 7. 安全与鲁棒性

- 默认绑定 `127.0.0.1`。
- 默认本地 token 鉴权（请求头 `x-nxspub-console-token`）。
- `--readonly-strict` 下禁止写接口。
- `--host 0.0.0.0` 必须配合 `--allow-remote`。

执行安全门禁：

- 分支策略不合法 -> 阻断
- 已有 in-flight 执行 -> `409`
- 只读模式写入 -> `403`
- 发布/版本执行必须持有锁

---

## 8. 里程碑

### Milestone 1（MVP）

- `console --web` 服务启动
- `/api/preview`、`/api/drafts`、`/api/drafts/prune`
- 版本计划、草稿健康、JSON 导出

### Milestone 2

- 风险面板（tag/registry/git sync）
- 分支切换实时重算
- 依赖传播可视化

### Milestone 3

- 历史对比（与前一次预览差异）
- 报告快照导出

### Milestone 4

- 执行工作台（version/release）
- 执行时间线、日志流
- 锁/只读/并发保护

---

## 9. 验收标准（摘要）

- `nxspub console --web` 在 single/workspace 下均可启动。
- 页面结果与 `nxspub console --json` 一致。
- 草稿清理结果可复读可验证。
- `readonly-strict` 与并发冲突返回码符合约定（`403/409`）。

