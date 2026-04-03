import { nowIso } from "./db.js";
import {
  getAllAgents,
  getMainState,
  payloadSignature,
  setMainState,
  recordHistory,
  getAgentHistory,
  annotateHistory,
  joinAgent,
  pushAgent,
  leaveAgent,
} from "./agents.js";

// 注册所有 HTTP 路由
export function registerRoutes(app, frontendDir) {

  // 静态页面
  app.get("/", (_req, res) => res.sendFile(`${frontendDir}/index.html`));

  // 健康检查
  app.get("/health", async (_req, res) => {
    const agents = await getAllAgents();
    res.json({ status: "ok", service: "jarvis-office", timestamp: nowIso(), agentCount: agents.length });
  });

  // 获取 CEO 状态
  app.get("/status", async (_req, res) => {
    res.json(await getMainState());
  });

  // 获取所有 Agent
  app.get("/agents", async (_req, res) => {
    res.json(await getAllAgents());
  });

  // SSE 实时推送（每 3 秒推送一次，有变化才发数据，否则发心跳）
  app.get("/events", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let previousSignature = "";
    const sendEvent = async () => {
      try {
        const agents = await getAllAgents();
        const signature = payloadSignature(agents);
        if (signature !== previousSignature) {
          previousSignature = signature;
          res.write(`data: ${JSON.stringify(agents)}\n\n`);
        } else {
          res.write(": heartbeat\n\n");
        }
      } catch {}
    };

    const interval = setInterval(sendEvent, 3000);
    sendEvent();
    req.on("close", () => clearInterval(interval));
  });

  // 设置 CEO 状态
  app.post("/set_state", async (req, res) => {
    const { state, detail } = req.body;
    const result = await setMainState({ state, detail });
    if (result.error) return res.status(400).json({ ok: false, msg: result.error });
    if (result.changed) await recordHistory("CEO", result.nextState.state, result.nextState.detail, result.nextState.updated_at);
    res.json(result.nextState);
  });

  // 获取指定 Agent 的历史记录
  app.get("/agent/:name/history", async (req, res) => {
    const entries = await getAgentHistory(req.params.name, req.query.limit);
    res.json(annotateHistory(entries));
  });

  // Agent 加入
  app.post("/join-agent", async (req, res) => {
    const result = await joinAgent(req.body);
    if (result.error) return res.status(result.status).json({ ok: false, msg: result.error });
    res.json({ ok: true, agentId: result.agentId, authStatus: result.authStatus });
  });

  // Agent 状态推送
  app.post("/agent-push", async (req, res) => {
    const result = await pushAgent(req.body);
    if (result.error) return res.status(result.status).json({ ok: false, msg: result.error });
    res.json({ ok: true, agentId: result.agentId, state: result.state });
  });

  // Agent 离开
  app.post("/leave-agent", async (req, res) => {
    const result = await leaveAgent(req.body);
    if (result.error) return res.status(result.status).json({ ok: false, msg: result.error });
    res.json({ ok: true });
  });
}
