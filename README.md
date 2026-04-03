# Jarvis Office

OpenClaw 多 Agent 看板

> 参考了 https://github.com/ringhyacinth/Star-Office-UI

## 功能

- `GET /events` SSE 实时刷新
- `GET /agents` / `GET /status` 读取当前状态
- `POST /set_state` / `POST /join-agent` / `POST /agent-push` / `POST /leave-agent`
- 成员历史记录与懒加载分页
- 基于 JSON 文件的最小持久化

## 给 OpenClaw 安装

如果你是让 OpenClaw 来部署，直接把下面这段发给它：

```text
请进入这个项目目录，按 SKILL.md 帮我安装并启动 Jarvis Office
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
jarvis-office-clean/
├── backend/
│   ├── app.py
│   └── requirements.txt
├── frontend/
│   └── index.html
├── scripts/
│   ├── set_state.py
│   └── office_agent_push.py
├── docs/
│   └── KEY_TECH_POINTS.md
├── SKILL.md
├── .gitignore
├── state.sample.json
└── join-keys.sample.json
```

## 启动

```bash
cd jarvis-office
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cp state.sample.json state.json
cp join-keys.sample.json join-keys.json
.venv/bin/python backend/app.py
```

默认端口是 `19010`，打开：

```text
http://127.0.0.1:19010
```

运行后会自动生成这些运行时文件，它们已经被 `.gitignore` 排除：

- `agents-state.json`
- `agents-history.json`
- `.agent-push-state.json`

## 切状态

```bash
python3 scripts/set_state.py writing "正在重写项目"
python3 scripts/set_state.py idle "待命中"
```

## Agent 规范

OpenClaw 需要按下面的规则配 agent，完整说明看 [`SKILL.md`](./SKILL.md)。

### 角色命名

以下名称会被前端识别并按固定分组展示：

- `CEO`
- `Tech Lead`
- `Legal Advisor`
- `Fullstack Dev`
- `Web Designer`
- `Security Auditor`
- `QA Engineer`

其他名字也能显示，但会落到 `Contributors` 区。

### 状态取值

只允许这 6 个标准状态：

- `idle`
- `writing`
- `researching`
- `executing`
- `syncing`
- `error`

### detail 要求

- 要短，直接写当前正在做什么
- 不要写空话，比如“处理中”“稍等”
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
