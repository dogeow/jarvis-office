# Jarvis Office

OpenClaw 多 Agent 看板。

在线地址：<https://claw.dogeow.com/>（参考自 [Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI)）

## 功能

### API 列表

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/events` | SSE 实时推送（自动重连 + 指数退避） |
| `GET` | `/agents` | 读取所有 Agent 当前状态 |
| `GET` | `/status` | 读取当前状态（与 /agents 相同） |
| `GET` | `/health` | 健康检查 |
| `GET` | `/agent/<name>/history` | 成员历史记录（带时长标注，支持分页） |
| `POST` | `/set_state` | 设置 Agent 状态 |
| `POST` | `/join-agent` | Agent 加入 |
| `POST` | `/agent-push` | Agent 推送更新 |
| `POST` | `/leave-agent` | Agent 离开 |

### 核心特性

- 基于 JSON 文件的最小持久化
- 输入校验：name ≤ 40 字符，detail ≤ 200 字符，joinKey ≤ 128 字符

### 服务地址

- 默认端口：`19010`（可通过 `JARVIS_OFFICE_PORT` 环境变量覆盖）
- 访问地址：`http://127.0.0.1:19010`
- 运行数据目录：默认项目根目录，可通过 `JARVIS_OFFICE_DATA_DIR` 指到其他目录

## 给 OpenClaw 安装

如果你是让 OpenClaw 来部署，直接把下面这段发给它：

```text
请进入这个项目目录，按 SKILL.md 帮我安装并启动 Jarvis Office。
先把服务跑起来，再把访问地址和使用方式告诉我。
```

当前仓库内的 Skill 文件在：

- [`SKILL.md`](./SKILL.md)

它会告诉 OpenClaw：

- 怎么安装和启动
- 怎么验证服务是否正常
- 怎么配置 `CEO` 和其他 Agent
- 各个 Agent 的命名规范、状态规范、`detail` 写法要求
- 多 Agent 接入时的 `join key` 使用要求

## 目录

```text
jarvis-office/
├── backend/
│   ├── app.js         # 入口
│   ├── routes.js      # 所有路由
│   ├── agents.js      # Agent 状态 / join key / 历史管理
│   ├── db.js          # JSON 文件读写
│   ├── config.js      # 常量配置
│   └── package.json
├── frontend/
│   └── index.html
├── scripts/
│   ├── set_state.py
│   └── office_agent_push.py
├── docs/
│   └── KEY_TECH_POINTS.md
├── SKILL.md
├── LICENSE
├── .gitignore
├── state.sample.json
└── join-keys.sample.json
```

## 启动

```bash
cd jarvis-office
cd backend && npm install && npm test && cd ..
cp state.sample.json state.json
cp join-keys.sample.json join-keys.json
node backend/app.js
```

运行后会自动生成这些运行时文件，它们已经被 `.gitignore` 排除：

- `agents-state.json`
- `agents-history.json`
- `.agent-push-state.json`

## 验证服务

启动后可用以下方式验证：

```bash
# 健康检查
curl http://127.0.0.1:19010/health

# 查看所有 Agent 状态
curl http://127.0.0.1:19010/agents

# 查看指定 Agent 历史记录
curl http://127.0.0.1:19010/agent/CEO/history
```

## 切状态

```bash
python3 scripts/set_state.py writing "正在重写项目"
python3 scripts/set_state.py idle "待命中"
```

## Agent 规范

OpenClaw 需要按下面的规则配 Agent，完整说明看 [`SKILL.md`](./SKILL.md)。

### 角色命名

以下名称会被前端识别并按固定分组展示：

- `CEO`
- `Tech Lead`
- `Legal Advisor`
- `Fullstack Dev`
- `Web Designer`
- `Security Auditor`
- `QA Engineer`

其他名字也能显示，但会落到 `Contributors` 区。**名称不超过 40 个字符**（服务器强制校验）。

### 状态取值

只允许这 6 个标准状态：

- `idle`
- `writing`
- `researching`
- `executing`
- `syncing`
- `error`

### detail 要求

- 要短，**不超过 200 个字符**（服务器强制校验），直接写当前正在做什么
- 不要写空话，比如"处理中""稍等"
- 不要泄露密钥、内网地址、目录等隐私内容
- 建议一条 detail 只表达一件事

例子：

- `正在写 README`
- `在查 SSE 断线重连`
- `执行 join-agent 联调`
- `发现鉴权错误，正在排查`

## 关键技术点

看这里：

- [`docs/KEY_TECH_POINTS.md`](./docs/KEY_TECH_POINTS.md)
