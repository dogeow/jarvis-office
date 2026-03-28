#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
STATE_FILE = PROJECT_DIR / "state.json"
AGENTS_STATE_FILE = PROJECT_DIR / "agents-state.json"
HISTORY_FILE = PROJECT_DIR / "agents-history.json"
VALID_STATES = {"idle", "writing", "researching", "executing", "syncing", "error"}
STATE_ALIASES = {
    "working": "writing",
    "busy": "writing",
    "write": "writing",
    "research": "researching",
    "search": "researching",
    "run": "executing",
    "running": "executing",
    "execute": "executing",
    "exec": "executing",
    "sync": "syncing",
}


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def normalize_state(value: str) -> str:
    normalized = STATE_ALIASES.get((value or "").strip().lower(), (value or "").strip().lower())
    return normalized


def load_json(path: Path, default):
    if path.exists():
        try:
            with path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            pass
    return default


def save_json(path: Path, value) -> None:
    with path.open("w", encoding="utf-8") as fh:
        json.dump(value, fh, ensure_ascii=False, indent=2)


def update_history(state_value: str, detail: str, updated_at: str) -> None:
    store = load_json(HISTORY_FILE, {})
    entries = list(store.get("CEO", []))
    if entries and entries[0].get("state") == state_value and entries[0].get("detail") == detail:
        return
    entries.insert(0, {"state": state_value, "detail": detail, "updated_at": updated_at})
    store["CEO"] = entries[:100]
    save_json(HISTORY_FILE, store)


def update_agents_state(state_value: str, detail: str, updated_at: str) -> None:
    agents = load_json(AGENTS_STATE_FILE, [])
    found = False
    for agent in agents:
        if agent.get("isMain") or agent.get("agentId") == "ceo" or agent.get("name") == "CEO":
            agent["isMain"] = True
            agent["agentId"] = "ceo"
            agent["name"] = "CEO"
            agent["state"] = state_value
            agent["detail"] = detail
            agent["updated_at"] = updated_at
            found = True
            break
    if not found:
        agents.insert(
            0,
            {
                "agentId": "ceo",
                "name": "CEO",
                "isMain": True,
                "state": state_value,
                "detail": detail,
                "updated_at": updated_at,
                "source": "local",
                "joinKey": None,
                "authStatus": "approved",
                "authApprovedAt": None,
                "authExpiresAt": None,
                "lastPushAt": None,
            },
        )
    save_json(AGENTS_STATE_FILE, agents)


def main() -> int:
    if len(sys.argv) < 2:
        print("用法: python3 scripts/set_state.py <state> [detail]")
        print("状态:", ", ".join(sorted(VALID_STATES)))
        return 1

    state_value = normalize_state(sys.argv[1])
    if state_value not in VALID_STATES:
        print(f"无效状态: {state_value}")
        return 1

    detail = sys.argv[2] if len(sys.argv) > 2 else ""
    current = load_json(STATE_FILE, {"state": "idle", "detail": "", "updated_at": now_iso()})
    changed = current.get("state") != state_value or current.get("detail") != detail
    updated_at = now_iso() if changed else current.get("updated_at", now_iso())

    save_json(
        STATE_FILE,
        {
            "state": state_value,
            "detail": detail,
            "updated_at": updated_at,
        },
    )
    update_agents_state(state_value, detail, updated_at)
    if changed:
        update_history(state_value, detail, updated_at)

    print(f"状态已更新: {state_value} - {detail}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
