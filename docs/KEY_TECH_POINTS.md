# Jarvis Office Clean 关键技术点

这个目录是从旧项目里抽取核心能力后，重新组织出来的最小可维护版本。当前只保留文本版状态看板真正需要的技术点。

## 1. 为什么改成文件型持久化

当前数据规模很小，目标是：

- 本地一把跑起来
- 不引入数据库
- 调试时可以直接打开文件看状态

因此运行态只保留 4 份 JSON：

- `state.json`：主 Agent 当前状态
- `agents-state.json`：所有 Agent 当前状态
- `agents-history.json`：历史记录
- `join-keys.json`：访客接入密钥

## 2. 为什么前端用 SSE

文本看板最重要的是“轻量实时”。

- `GET /events` 用 SSE 推送变更
- 无变化时发 heartbeat
- 前端不需要自己做高频轮询
- 浏览器原生支持 `EventSource`

这比 WebSocket 更省实现复杂度，也比每几秒 `fetch` 一次更省带宽。

## 3. 为什么保留 `GET /status` 和 `POST /set_state`

主 Agent 的状态切换仍然是最常见入口。

- `GET /status` 方便本机脚本 / 其他工具读取
- `POST /set_state` 方便服务间调用
- `scripts/set_state.py` 方便本地直接切状态

这三层一起保留，能兼顾人工切换、脚本切换和服务端读取。

## 4. 为什么历史记录做成“懒加载 + 前端分页”

历史是辅助信息，不应该阻塞首屏。

- 列表先只显示当前状态
- 展开成员时才请求 `/agent/<name>/history`
- 前端每次展示 15 条
- 请求默认拉 50 条，足够当前看板使用

这样可以同时保证首屏快和历史可读。

## 5. 为什么 join key 仍然保留

多 Agent 协作是这个项目的核心，不应该因为 UI 变成文本版就丢掉。

join key 负责解决两个问题：

- 谁能加入
- 同一个 key 允许多少人同时在线

当前 clean 版保留：

- key 是否存在
- key 是否过期
- key 的并发上限
- agent 离线后自动标记 `offline`

## 6. 这版和旧版最关键的边界

这版不再负责：

- canvas / Phaser 场景渲染
- 像素人物移动
- 桌面壳
- 资产替换
- AI 生图装修

这版只做：

- 文本状态展示
- SSE 实时刷新
- 历史记录
- 多 Agent 加入 / 推送 / 离开

## 7. 后续如果继续扩展，建议顺序

1. 先把 `backend/app.py` 拆成 `store` / `service` / `routes`
2. 再给 `join-agent` / `agent-push` 加测试
3. 如果状态源变复杂，再考虑引入数据库
4. 如果需要鉴权，再在反向代理或 token 层加，不要先把代码搞重
