"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import styles from "./OfficeClient.module.css";

interface Agent {
  agentId: string;
  name: string;
  isMain: boolean;
  state: string;
  detail: string;
  updated_at: string;
  source: string;
  joinKey: string | null;
  authStatus: string;
  lastPushAt: string | null;
  lastSeen?: string;
}

interface HistoryEntry {
  state: string;
  detail: string;
  updated_at: string;
  duration: string | null;
}

const PAGE_SIZE = 15;

const STATUS_META: Record<string, { label: string; cls: string }> = {
  idle: { label: "空闲", cls: styles.badgeIdle },
  writing: { label: "编码中", cls: styles.badgeBusy },
  researching: { label: "研究中", cls: styles.badgeBusy },
  executing: { label: "执行中", cls: styles.badgeBusy },
  syncing: { label: "同步中", cls: styles.badgeSync },
  error: { label: "错误", cls: styles.badgeError },
  offline: { label: "离线", cls: styles.badgeOffline },
};

const ROLE_ICON: Record<string, string> = {
  CEO: "👔",
  "Tech Lead": "🧑‍💻",
  "Fullstack Dev": "🏗️",
  "Web Designer": "🎨",
  "Security Auditor": "🔐",
  "QA Engineer": "🐛",
  "Legal Advisor": "⚖️",
};

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function timeAgo(value?: string | null): string {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface AgentRowProps {
  agent: Agent;
  tree?: string;
}

function AgentRow({ agent, tree = "" }: AgentRowProps) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const icon = ROLE_ICON[agent.name] || "🤖";
  const meta = STATUS_META[agent.state] || STATUS_META.idle;

  const uniqueHistory = (entries: HistoryEntry[]): HistoryEntry[] => {
    const result: HistoryEntry[] = [];
    let prevDetail: string | null = null;
    for (const entry of entries) {
      const d = entry.detail || "";
      if (d === prevDetail) continue;
      prevDetail = d;
      result.push(entry);
    }
    return result;
  };

  const visibleEntries = uniqueHistory(history);
  const pageEntries = visibleEntries.slice(0, (page + 1) * PAGE_SIZE);
  const hasMore = pageEntries.length < visibleEntries.length;

  const fetchHistory = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/agent/${encodeURIComponent(agent.name)}/history?limit=50`
      );
      const data: HistoryEntry[] = await res.json();
      setHistory(data);
      setHistoryLoaded(true);
    } catch {
      setHistory([]);
      setHistoryLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [agent.name, loading]);

  const toggleOpen = () => {
    if (!open) {
      setOpen(true);
      if (!historyLoaded) {
        fetchHistory();
      }
    } else {
      setOpen(false);
    }
  };

  // Auto-open non-idle agents with detail
  useEffect(() => {
    if (agent.state !== "idle" && agent.state !== "offline" && agent.detail) {
      setOpen(true);
    }
  }, [agent.state, agent.detail]);

  return (
    <details className={styles.agent} open={open}>
      <summary
        className={styles.agentRow}
        onClick={(e) => {
          e.preventDefault();
          toggleOpen();
        }}
      >
        <span className={styles.tree}>{tree}</span>
        <span>{icon}</span>
        <span className={styles.name}>{agent.name}</span>
        <span className={`${styles.badge} ${meta.cls}`}>{meta.label}</span>
        <span className={styles.detail}>{agent.detail}</span>
        <span className={styles.ago}>{timeAgo(agent.lastSeen || agent.updated_at)}</span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>›</span>
      </summary>
      <div className={styles.history}>
        {!historyLoaded ? (
          <div className={styles.historyLoading}>加载中…</div>
        ) : history.length === 0 ? (
          <div className={styles.historyEmpty}>暂无历史记录</div>
        ) : (
          <ul>
            {pageEntries.map((entry, i) => (
              <li key={i}>
                <span className={styles.historyDetail}>
                  {entry.detail || "无详情"}
                </span>
                <span className={styles.historyTime}>
                  {new Date(entry.updated_at).toLocaleString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
            {hasMore && (
              <li className={styles.historyEnd}>
                <button
                  className={styles.loadMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  加载更多
                </button>
              </li>
            )}
            {!hasMore && visibleEntries.length > PAGE_SIZE && (
              <li className={styles.historyEnd}>没有更多了</li>
            )}
          </ul>
        )}
      </div>
    </details>
  );
}

interface GroupedAgents {
  ceo: Agent | undefined;
  leadership: Agent[];
  reports: Agent[];
  others: Agent[];
}

function groupAgents(agents: Agent[]): GroupedAgents {
  const ceo = agents.find((a) => a.isMain);
  const leadershipNames = ["Tech Lead", "Legal Advisor"];
  const reportNames = ["Fullstack Dev", "Web Designer", "Security Auditor", "QA Engineer"];

  const leadership = leadershipNames
    .map((name) => agents.find((a) => a.name === name))
    .filter(Boolean) as Agent[];

  const reports = reportNames
    .map((name) => agents.find((a) => a.name === name))
    .filter(Boolean) as Agent[];

  const others = agents.filter(
    (a) =>
      !a.isMain &&
      !leadershipNames.includes(a.name) &&
      !reportNames.includes(a.name)
  );

  return { ceo, leadership, reports, others };
}

export default function OfficeClient() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [updated, setUpdated] = useState<string>("等待首个数据包…");
  const [lastRender, setLastRender] = useState<number>(0);
  const [renderCount, setRenderCount] = useState<number>(0);
  const sourceRef = useRef<EventSource | null>(null);
  const [key, setKey] = useState<number>(0);

  useEffect(() => {
    // Initial load
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: Agent[]) => {
        setAgents(data);
        setUpdated(new Date().toLocaleTimeString("zh-CN"));
      })
      .catch(() => {
        setAgents([]);
        setUpdated("加载失败");
      });

    // SSE connection
    const source = new EventSource("/api/events");
    sourceRef.current = source;

    source.onmessage = (event) => {
      try {
        const data: Agent[] = JSON.parse(event.data);
        setAgents(data);
        setUpdated(new Date().toLocaleTimeString("zh-CN"));
        setKey((k) => k + 1);
        setRenderCount((c) => c + 1);
      } catch {
        // ignore parse errors
      }
    };

    source.onerror = () => {
      // Reconnect is automatic with EventSource
    };

    return () => {
      source.close();
    };
  }, []);

  const { ceo, leadership, reports, others } = groupAgents(agents);

  const renderSection = (title: string, children: React.ReactNode) => (
    <section className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );

  return (
    <div className={styles.app}>
      <div className={styles.header}>
        <div>
          <h1>Jarvis Office Clean</h1>
          <p>多 Agent 状态看板，基于 SSE 实时刷新。</p>
        </div>
        <div className={styles.updated}>
          最近刷新：{updated}
        </div>
      </div>

      {agents.length === 0 ? (
        <div className={styles.notice}>暂无 Agent 数据</div>
      ) : (
        <div key={key}>
          {ceo && renderSection("Executive", <AgentRow agent={ceo} />)}

          {(leadership.length > 0 || reports.length > 0) &&
            renderSection(
              "Leadership",
              <>
                {leadership.map((agent, i) => (
                  <AgentRow
                    key={agent.agentId}
                    agent={agent}
                    tree={i < leadership.length - 1 ? "├" : "└"}
                  />
                ))}
                {reports.map((agent) => (
                  <AgentRow key={agent.agentId} agent={agent} tree="│" />
                ))}
              </>
            )}

          {others.length > 0 &&
            renderSection(
              "Contributors",
              others.map((agent) => (
                <AgentRow key={agent.agentId} agent={agent} tree="•" />
              ))
            )}
        </div>
      )}
    </div>
  );
}
