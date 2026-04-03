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

export function registerRoutes(app, frontendDir) {
  app.get("/", (_req, res) => res.sendFile(`${frontendDir}/index.html`));

  app.get("/health", async (_req, res) => {
    const agents = await getAllAgents();
    res.json({ status: "ok", service: "jarvis-office", timestamp: nowIso(), agentCount: agents.length });
  });

  app.get("/status", async (_req, res) => {
    res.json(await getMainState());
  });

  app.get("/agents", async (_req, res) => {
    res.json(await getAllAgents());
  });

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

  app.post("/set_state", async (req, res) => {
    const { state, detail } = req.body;
    const result = await setMainState({ state, detail });
    if (result.error) return res.status(400).json({ ok: false, msg: result.error });
    if (result.changed) await recordHistory("CEO", result.nextState.state, result.nextState.detail, result.nextState.updated_at);
    res.json(result.nextState);
  });

  app.get("/agent/:name/history", async (req, res) => {
    const entries = await getAgentHistory(req.params.name, req.query.limit);
    res.json(annotateHistory(entries));
  });

  app.post("/join-agent", async (req, res) => {
    const result = await joinAgent(req.body);
    if (result.error) return res.status(result.status).json({ ok: false, msg: result.error });
    res.json({ ok: true, agentId: result.agentId, authStatus: result.authStatus });
  });

  app.post("/agent-push", async (req, res) => {
    const result = await pushAgent(req.body);
    if (result.error) return res.status(result.status).json({ ok: false, msg: result.error });
    res.json({ ok: true, agentId: result.agentId, state: result.state });
  });

  app.post("/leave-agent", async (req, res) => {
    const result = await leaveAgent(req.body);
    if (result.error) return res.status(result.status).json({ ok: false, msg: result.error });
    res.json({ ok: true });
  });
}
