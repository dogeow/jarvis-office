---
name: jarvis-office
description: 帮主人安装并维护 Jarvis Office 多 Agent 看板，适配 OpenClaw，包含 Agent 命名、状态同步、join key 和协作规范。
---

# Skill for Jarvis Office

这个 Skill 是给 OpenClaw 用的。

你的目标不是只解释文档，而是尽量替主人把安装、启动、验证、基础配置一次做完，然后把访问地址和后续使用方法告诉主人。

---

## 1. 先理解这是什么

- 多 Agent 状态看板
- SSE 实时刷新
- 历史记录查看
- 多 Agent join / push / leave

---

## 2. 安装时你应该怎么做

优先少问问题，先把本地可访问版本跑起来。

如果这是独立仓库，则直接在仓库根目录操作。

按顺序执行：

```bash
cd backend && npm install && cd ..
cp state.sample.json state.json
cp join-keys.sample.json join-keys.json
node backend/app.js
```

启动成功后，告诉主人：

> 现在可以打开 http://127.0.0.1:19010 查看 Jarvis Office。

---

## 3. 安装后必须做的验证

至少验证这 3 项：

```bash
curl -s http://127.0.0.1:19010/health
curl -s http://127.0.0.1:19010/status
curl -s http://127.0.0.1:19010/agents
```

如果主人要你进一步自检，再做：

1. `POST /join-agent`
2. `POST /agent-push`
3. `POST /leave-agent`

确认多 agent 链路是通的。

---

## 4. 你要怎么设置 CEO

主控 agent 固定叫：

- `CEO`

不要改这个名字。

主控 agent 通过本地脚本切状态：

```bash
python3 scripts/set_state.py writing "正在实现接口"
python3 scripts/set_state.py researching "在查问题原因"
python3 scripts/set_state.py executing "执行本地验证"
python3 scripts/set_state.py syncing "同步结果"
python3 scripts/set_state.py error "发现异常，正在排查"
python3 scripts/set_state.py idle "待命中"
```

你应把这条规则写进自己的 `SOUL.md` 或 `AGENTS.md`：

```markdown
## Jarvis Office 状态同步规则
- 开始任务前，先执行 `python3 scripts/set_state.py <state> "<detail>"`
- 完成任务后，先执行 `python3 scripts/set_state.py idle "待命中"`
- 如果执行失败或受阻，改成 `error` 并写明原因
```

---

## 5. 其他 Agent 怎么设

远端或访客 Agent 不直接写 `state.json`，而是走：

- `POST /join-agent`
- `POST /agent-push`
- `POST /leave-agent`

仓库里已经提供脚本：

- [`scripts/office_agent_push.py`](./scripts/office_agent_push.py)

访客至少要填这 3 项：

```python
JOIN_KEY = "ocj_example_team_01"
AGENT_NAME = "QA Engineer"
OFFICE_URL = "https://your-office.example.com"
```

然后运行：

```bash
python3 scripts/office_agent_push.py
```

---

## 6. Agent 命名规范

如果主人希望看板按预设组织结构显示，名称必须严格使用以下之一：

- `CEO`
- `Tech Lead`
- `Legal Advisor`
- `Fullstack Dev`
- `Web Designer`
- `Security Auditor`
- `QA Engineer`

显示规则如下：

- `CEO` 会显示在 `Executive`
- `Tech Lead` 和 `Legal Advisor` 会显示在 `Leadership`
- `Fullstack Dev`、`Web Designer`、`Security Auditor`、`QA Engineer` 会挂在 `Tech Lead` 下
- 其他名字仍然能加入，但会显示在 `Contributors` 区。

命名要求：

- 名称不能超过 **40 个字符**（服务端会拒绝超长名称）
- 一个 Agent 长期使用一个稳定名字
- 不要今天叫 `QA`，明天叫 `Tester`
- 不要把两个人共用一个 Agent 名称
- 不要在名字里塞情绪、时间戳、任务名

推荐：

- `Tech Lead`
- `QA Engineer`

不推荐：

- `技术负责人1号`
- `今天负责测试的人`
- `QA Engineer 20260328`

---

## 7. 状态规范

只允许使用这 6 个状态：

- `idle`
- `writing`
- `researching`
- `executing`
- `syncing`
- `error`

语义要求：

- `idle`：待命、已完成、在等下一步
- `writing`：写代码、写文档、改配置
- `researching`：查资料、读代码、做分析
- `executing`：跑命令、联调接口、做实际操作
- `syncing`：整理结果、同步状态、交付输出
- `error`：遇到阻塞、失败或异常

不要自造状态名。

虽然服务端会把 `working`、`busy`、`run` 之类别名归一化，但你不应该依赖这个宽容行为。

---

## 8. detail 写法要求

`detail` 是给主人看的，不是写给程序看的。

要求：

- 简短具体，直接描述当前动作
- 一次只表达一件事
- 不写空泛词
- 不泄露敏感信息
- 不要把整段思考过程都塞进去

推荐写法：

- `正在写 README`
- `在查 SSE 断流`
- `执行 smoke test`
- `联调 join-agent`
- `发现 403，正在排查`

不推荐写法：

- `处理中`
- `忙碌中`
- `有点复杂我先看看`
- `正在处理一个很重要的事情暂时不方便透露`

---

## 9. join key 规则

`join key` 是多人接入控制，不是摆设。

你要遵守：

- 没有 key 不允许加入
- key 过期后不允许加入
- `reusable = false` 的 key，被占用后不能给另一个 agent 再用
- 同一个 key 的在线人数不能超过 `maxConcurrent`
- agent 离开时要调用 `leave-agent`

如果只是改 agent 名称，不要悄悄换 identity。

一个 agent identity 至少应保持：

- 稳定的 `AGENT_NAME`
- 稳定的 `agentId`
- 对应自己的 `join key`

---

## 10. 协作要求

你要主动维护状态准确性。

规则：

- 开始任务前先切状态，不要做完再补
- 完成任务后立刻回 `idle`
- 出错就用 `error`，不要假装还在 `executing`
- 不要长时间把 detail 停留在过期内容

已知机制：

- 远端 push 脚本如果发现本地状态长期未更新，会自动回 `idle`
- 后端如果超过 300 秒没有收到访客 push，会把访客标成 `offline`

---

## 11. 安装完成后你要告诉主人什么

至少告诉主人这 4 件事：

1. 本地访问地址
2. 如何切 `CEO` 状态
3. 如果要加其他 agent，用哪个 `join key`
4. 预设角色名必须写成什么，才能按组织结构显示

你可以直接这样总结给主人：

> 服务已经跑起来了。你现在打开 http://127.0.0.1:19010 就能看。
> 主控 agent 用 `python3 scripts/set_state.py` 切状态。
> 其他 agent 用 `scripts/office_agent_push.py` 加入。
> 如果你想按组织结构显示，请严格使用 `CEO`、`Tech Lead`、`Legal Advisor`、`Fullstack Dev`、`Web Designer`、`Security Auditor`、`QA Engineer` 这些名字。
