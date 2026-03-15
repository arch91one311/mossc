# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指引。

## 项目概述

MossC 是一个 AI 驱动的公司平台，基于 **Next.js 16 (App Router)** 构建，通过 **OpenClaw Gateway** 管理 AI Agent。提供聊天、多 Agent 协作、Cron 调度和实时流式推送。

## 开发命令

```bash
pnpm install          # 安装依赖
pnpm dev              # 开发服务器 localhost:3000
pnpm build            # 生产构建
pnpm start            # 生产服务器
pnpm lint             # ESLint 检查
npx tsc --noEmit      # TypeScript 类型检查（项目无测试框架）
```

## 架构

### 请求流程

```
浏览器 → proxy.ts (Edge 中间件，Session 认证)
      → 注入 x-mossc-user-id / x-mossc-user-role 请求头
      → API 路由 (src/app/api/)
```

- **Session 认证**：HMAC-SHA256 签名的 JWT，存储在 `mossc_session` cookie 中。密钥来自 `MOSSC_SECRET` 环境变量。
- **用户数据库**：SQLite，路径 `~/.openclaw/openclaw-studio/users.sqlite`，使用 better-sqlite3。

### 控制面板 (src/lib/controlplane/)

与 OpenClaw Gateway 的核心集成层：

- **openclaw-adapter.ts** — Gateway WebSocket 客户端。处理 `connect.challenge` 的 Ed25519 设备签名认证（密钥对来自 `~/.openclaw/identity/device.json`）。管理重连、方法白名单、legacy profile 降级（`gateway-client` → `openclaw-control-ui`）。
- **runtime.ts** — 按用户隔离的运行时单例（`getControlPlaneRuntimeForUser`），缓存在 `globalThis` 上。封装 adapter + SQLite 投影存储。
- **runtime-route-bootstrap.ts** — 为 API 路由引导运行时。返回 `mode-disabled | runtime-init-failed | start-failed | ready`。
- **intent-route.ts** — 基于 Intent 的命令模式，处理变更操作（chat-send、agent-create 等）。
- **projection-store.ts** — 事件溯源 + 事务性 outbox，用于 SSE 重放。

### 实时事件流

```
OpenClaw Gateway ←WebSocket→ OpenClawGatewayAdapter
                              → ControlPlaneRuntime（事件写入投影存储）
                              → /api/runtime/stream（SSE 推送到浏览器）
                              → useRuntimeEventStream() hook → app-context reducer
```

- SSE 支持 `Last-Event-ID` 断线重连重放。
- 每 15 秒心跳。启动阶段有 buffer 缓存初始回放期间的新事件。

### API 路由组织 (src/app/api/)

| 路径 | 用途 |
|------|------|
| `/auth/*` | 登录、登出、Session、初始化设置 |
| `/runtime/*` | Gateway 代理：stream、config、models、fleet、agents、cron |
| `/intents/*` | 变更命令：chat-send、agent-create/delete/rename、cron 操作 |
| `/studio/*` | 连接测试、模型健康检查 |
| `/admin/*` | 用户管理（CRUD） |

### 前端状态管理 (src/store/)

类 Redux 模式 + React Context：
- **app-context.tsx** — Provider + 事件分发
- **app-reducer.ts** — 处理 agents、conversations、messages、orchestration 状态
- **app-storage.ts** — localStorage 持久化 conversations/messages

### 多 Agent 协作 (src/lib/orchestration/)

四种路由策略：`all`、`skill-match`、`coordinator`、`round-robin`。支持 `@mention` 语法定向路由。

### OpenClaw 状态路径

`resolveStateDir()`（`src/lib/openclaw/paths.ts`）解析 `~/.openclaw/`（或 `$OPENCLAW_STATE_DIR`）。关键文件：
- `identity/device.json` — Ed25519 密钥对，用于设备认证
- `identity/device-auth.json` — 设备 auth token
- `devices/paired.json` — Gateway 的已配对设备注册表
- `openclaw-studio/users/*/settings.json` — 每用户的 Gateway URL + Token

## 关键约定

- **路径别名**：`@/*` 映射到 `./src/*`
- **UI 组件**：基于 shadcn，位于 `src/components/ui/`，通过 `components.json` 配置
- **样式**：Tailwind CSS v4 + CSS 变量，dark/light 主题通过 next-themes 切换
- **国际化**：`src/i18n/`，支持 RTL。Locale 优先从 cookie 读取，降级到 Accept-Language
- **Gateway 配置**：按用户加载（`loadUserStudioSettings(userId)`），不是全局配置

## 环境变量

参见 `.env.example`。关键变量：
- `MOSSC_SECRET` — 生产环境必填，用于 Session 签名
- `OPENCLAW_STATE_DIR_HOST` — `~/.openclaw` 的宿主机路径（Docker 部署用）
- `NEXT_PUBLIC_STUDIO_TRANSCRIPT_DEBUG` — 调试 transcript 渲染

## 设备认证协议 (Device Identity)

OpenClaw Gateway v2026.3.13+ 要求 Ed25519 challenge-response 认证：
1. Gateway 发送 `connect.challenge`，payload 含 `{ nonce, ts }`
2. 客户端构建 pipe 分隔的签名载荷：`v2|deviceId|clientId|clientMode|role|scopes|signedAt|token|nonce`
3. 用 `~/.openclaw/identity/device.json` 中的 Ed25519 私钥签名
4. 发送 `device: { id, publicKey (base64url), signature (base64url), signedAt, nonce }`

签名逻辑实现在 `src/lib/controlplane/openclaw-adapter.ts` 的 `signDeviceAuth()` 函数中。

### 新环境连接排障

新用户 clone 代码后的连接流程：

1. **前提**：本地必须已安装 OpenClaw 并启动 Gateway，否则 `~/.openclaw/identity/device.json` 不存在，`loadDeviceKeypair()` 返回 null，连接时不携带 device 字段，Gateway 会拒绝
2. **首次连接**：如果设备是本地连接（localhost），Gateway 通常会自动批准配对（`silent: true`）
3. **`NOT_PAIRED` 错误**：如果收到 `NOT_PAIRED` + `reason: "metadata-upgrade"`，说明设备已有旧配对记录但需要元数据升级。解决方法：
   ```bash
   openclaw devices list          # 查看 Pending 列表中的 requestId
   openclaw devices approve <requestId>   # 手动批准
   ```
4. **持续 503 在 `/api/runtime/stream`**：说明控制面板连接失败。检查 dev server 终端日志中的错误信息，常见原因：
   - Gateway 未启动 → 启动 OpenClaw
   - Gateway URL/Token 未配置 → 在 MossC 设置页面配置
   - 设备未配对 → 按上述步骤批准
   - 端口被占用 → `lsof -i :3000` 检查并 kill 旧进程
5. **Dev server 重启 / 热更新后显示"正在连接..."**：每次 dev server 重启或代码热更新导致服务端 WebSocket 重连时，Gateway 会触发 `repair` 类型的配对请求（Pending 列表中 Flags 为 `repair`）。必须手动批准后才能恢复连接：
   ```bash
   openclaw devices list          # 查看 Pending 列表中 repair 请求的 requestId
   openclaw devices approve <requestId>   # 批准后刷新页面即可
   ```
   修改 `openclaw.json`（如添加/删除 agent）也会触发同样的 repair 配对请求。
