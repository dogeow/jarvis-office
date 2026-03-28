#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import os
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request, send_from_directory


PROJECT_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = PROJECT_DIR / "frontend"
STATE_FILE = PROJECT_DIR / "state.json"
AGENTS_STATE_FILE = PROJECT_DIR / "agents-state.json"
HISTORY_FILE = PROJECT_DIR / "agents-history.json"
JOIN_KEYS_FILE = PROJECT_DIR / "join-keys.json"

DATA_LOCK = threading.RLock()
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
MAX_HISTORY_LIMIT = 100
DEFAULT_HISTORY_LIMIT = 50
OFFLINE_AFTER_SECONDS = 300

MAIN_AGENT_TEMPLATE = {
    "agentId": "ceo",
    "name": "CEO",
    "isMain": True,
    "state": "idle",
    "detail": "待命中",
    "updated_at": "2026-01-01T00:00:00",
    "source": "local",
    "joinKey": None,
    "authStatus": "approved",
    "authApprovedAt": None,
    "authExpiresAt": None,
    "lastPushAt": None,
}

ROLE_GROUPS = {
    "leadership": ["Tech Lead", "Legal Advisor"],
    "reports": ["Fullstack Dev", "Web Designer", "Security Auditor", "QA Engineer"],
}

app = Flask(__name__, static_folder=None)


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def deep_copy(value: Any) -> Any:
    return copy.deepcopy(value)


def load_json(path: Path, default: Any) -> Any:
    if path.exists():
        try:
            with path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            pass
    return deep_copy(default)


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(value, fh, ensure_ascii=False, indent=2)


def normalize_state(raw: str | None, *, allow_offline: bool = False) -> str:
    value = (raw or "").strip().lower()
    if allow_offline and value == "offline":
        return "offline"
    value = STATE_ALIASES.get(value, value)
    if value in VALID_STATES:
        return value
    return "idle"


def load_state() -> dict[str, Any]:
    state = load_json(
        STATE_FILE,
        {
            "state": "idle",
            "detail": "待命中",
            "updated_at": now_iso(),
        },
    )
    return {
        "state": normalize_state(state.get("state")),
        "detail": str(state.get("detail") or ""),
        "updated_at": str(state.get("updated_at") or now_iso()),
    }


def build_main_agent(state: dict[str, Any] | None = None) -> dict[str, Any]:
    current = state or load_state()
    agent = deep_copy(MAIN_AGENT_TEMPLATE)
    agent["state"] = current["state"]
    agent["detail"] = current["detail"]
    agent["updated_at"] = current["updated_at"]
    return agent


def load_agents_raw() -> list[dict[str, Any]]:
    return load_json(AGENTS_STATE_FILE, [])


def merge_main_agent(agents: list[dict[str, Any]], state: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    main = build_main_agent(state)
    found_main = False

    for agent in agents:
        if agent.get("isMain") or (agent.get("name") == "CEO" and agent.get("agentId") == "ceo"):
            merged.append(main)
            found_main = True
        else:
            merged.append(agent)

    if not found_main:
        merged.insert(0, main)
    return merged


def save_agents(agents: list[dict[str, Any]]) -> None:
    save_json(AGENTS_STATE_FILE, agents)


def agent_age_seconds(agent: dict[str, Any]) -> float | None:
    timestamp = agent.get("lastPushAt") or agent.get("updated_at")
    if not timestamp:
        return None
    try:
        return (datetime.now() - datetime.fromisoformat(str(timestamp))).total_seconds()
    except Exception:
        return None


def cleanup_guest_agents(agents: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], bool]:
    changed = False
    cleaned: list[dict[str, Any]] = []

    for agent in agents:
        if agent.get("isMain"):
            cleaned.append(agent)
            continue

        normalized = deep_copy(agent)
        age = agent_age_seconds(normalized)
        if age is not None and age > OFFLINE_AFTER_SECONDS:
            if normalized.get("state") != "offline" or normalized.get("authStatus") != "offline":
                normalized["state"] = "offline"
                normalized["authStatus"] = "offline"
                changed = True
        cleaned.append(normalized)

    return cleaned, changed


def load_agents() -> list[dict[str, Any]]:
    with DATA_LOCK:
        state = load_state()
        agents = merge_main_agent(load_agents_raw(), state)
        agents, changed = cleanup_guest_agents(agents)
        if changed:
            save_agents(agents)
        return agents


def load_history_store() -> dict[str, list[dict[str, Any]]]:
    return load_json(HISTORY_FILE, {})


def save_history_store(store: dict[str, list[dict[str, Any]]]) -> None:
    save_json(HISTORY_FILE, store)


def record_history(name: str, state: str, detail: str, updated_at: str | None = None) -> None:
    timestamp = updated_at or now_iso()
    with DATA_LOCK:
        store = load_history_store()
        entries = list(store.get(name, []))
        if entries and entries[0].get("state") == state and entries[0].get("detail") == detail:
            return
        entries.insert(
            0,
            {
                "state": state,
                "detail": detail,
                "updated_at": timestamp,
            },
        )
        store[name] = entries[:MAX_HISTORY_LIMIT]
        save_history_store(store)


def get_history(name: str) -> list[dict[str, Any]]:
    store = load_history_store()
    return list(store.get(name, []))


def annotate_history(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    annotated: list[dict[str, Any]] = []
    for index, entry in enumerate(entries):
        item = dict(entry)
        duration = None
        try:
            current = datetime.fromisoformat(str(entry["updated_at"]))
            if index + 1 < len(entries):
                previous = datetime.fromisoformat(str(entries[index + 1]["updated_at"]))
                seconds = max(0, int((current - previous).total_seconds()))
            else:
                seconds = max(0, int((datetime.now() - current).total_seconds()))
            if seconds >= 3600:
                duration = f"{seconds // 3600}h"
            elif seconds >= 60:
                duration = f"{seconds // 60}m"
            else:
                duration = f"{seconds}s"
        except Exception:
            duration = None
        item["duration"] = duration
        annotated.append(item)
    return annotated


def load_join_keys() -> dict[str, Any]:
    return load_json(JOIN_KEYS_FILE, {"keys": []})


def find_join_key(key_value: str) -> dict[str, Any] | None:
    keys = load_join_keys().get("keys", [])
    return next((item for item in keys if item.get("key") == key_value), None)


def key_is_expired(key_item: dict[str, Any]) -> bool:
    expires_at = key_item.get("expiresAt")
    if not expires_at:
        return False
    try:
        return datetime.now() > datetime.fromisoformat(str(expires_at))
    except Exception:
        return False


def count_active_agents_for_key(agents: list[dict[str, Any]], join_key: str, exclude_agent_id: str | None = None) -> int:
    active = 0
    for agent in agents:
        if agent.get("isMain"):
            continue
        if agent.get("joinKey") != join_key:
            continue
        if exclude_agent_id and agent.get("agentId") == exclude_agent_id:
            continue
        age = agent_age_seconds(agent)
        if age is None or age <= OFFLINE_AFTER_SECONDS:
            active += 1
    return active


def key_allows_join(
    key_item: dict[str, Any],
    *,
    existing_agent_id: str | None = None,
) -> tuple[bool, str | None]:
    if key_is_expired(key_item):
        return False, "join key 已过期"

    reusable = bool(key_item.get("reusable", True))
    used = bool(key_item.get("used"))
    used_by_agent_id = str(key_item.get("usedByAgentId") or "")
    if not reusable and used and used_by_agent_id and used_by_agent_id != (existing_agent_id or ""):
        return False, "join key 已被占用"

    return True, None


def generate_agent_id() -> str:
    return f"agent_{int(time.time() * 1000)}"


def payload_agents() -> list[dict[str, Any]]:
    agents = load_agents()
    payload: list[dict[str, Any]] = []
    for agent in agents:
        item = dict(agent)
        item["lastSeen"] = item.get("lastPushAt") or item.get("updated_at")
        payload.append(item)
    return payload


def payload_signature(payload: list[dict[str, Any]]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def update_main_agent(state_value: str, detail: str) -> dict[str, Any]:
    current = load_state()
    changed = current["state"] != state_value or current["detail"] != detail
    updated_at = now_iso() if changed else current["updated_at"]
    next_state = {
        "state": state_value,
        "detail": detail,
        "updated_at": updated_at,
    }

    with DATA_LOCK:
        save_json(STATE_FILE, next_state)
        agents = merge_main_agent(load_agents_raw(), next_state)
        save_agents(agents)
    if changed:
        record_history("CEO", state_value, detail, updated_at)
    return next_state


def update_guest(agent: dict[str, Any], state_value: str, detail: str) -> dict[str, Any]:
    changed = agent.get("state") != state_value or agent.get("detail") != detail or agent.get("authStatus") != "approved"
    if changed:
        agent["updated_at"] = now_iso()
        record_history(str(agent.get("name") or ""), state_value, detail, agent["updated_at"])
    agent["state"] = state_value
    agent["detail"] = detail
    agent["authStatus"] = "approved"
    agent["lastPushAt"] = now_iso()
    return agent


@app.after_request
def add_cache_headers(response):  # type: ignore[override]
    path = request.path or ""
    if path in {"/", "/health"} or path.startswith("/frontend/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


@app.route("/")
def home():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/health")
def health():
    agents = payload_agents()
    return jsonify(
        {
            "status": "ok",
            "service": "jarvis-office-clean",
            "timestamp": now_iso(),
            "agentCount": len(agents),
        }
    )


@app.route("/status")
def get_status():
    return jsonify(load_state())


@app.route("/set_state", methods=["POST"])
def set_state():
    payload = request.get_json(silent=True) or {}
    state_value = normalize_state(payload.get("state"))
    detail = str(payload.get("detail") or "")
    return jsonify(update_main_agent(state_value, detail))


@app.route("/agents")
def get_agents():
    return jsonify(payload_agents())


@app.route("/events")
def events():
    def stream():
        previous_signature = ""
        while True:
            agents = payload_agents()
            signature = payload_signature(agents)
            if signature != previous_signature:
                previous_signature = signature
                yield f"data: {json.dumps(agents, ensure_ascii=False)}\n\n"
            else:
                yield ": heartbeat\n\n"
            time.sleep(3)

    response = Response(stream(), mimetype="text/event-stream")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["X-Accel-Buffering"] = "no"
    return response


@app.route("/agent/<name>/history")
def history(name: str):
    raw_limit = (request.args.get("limit") or "").strip()
    try:
        limit = int(raw_limit) if raw_limit else DEFAULT_HISTORY_LIMIT
    except ValueError:
        limit = DEFAULT_HISTORY_LIMIT
    limit = max(1, min(limit, MAX_HISTORY_LIMIT))
    entries = get_history(name)[:limit]
    return jsonify(annotate_history(entries))


@app.route("/join-agent", methods=["POST"])
def join_agent():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name") or "").strip()
    join_key = str(payload.get("joinKey") or "").strip()
    detail = str(payload.get("detail") or "")
    state_value = normalize_state(payload.get("state"))

    if not name or not join_key:
        return jsonify({"ok": False, "msg": "name 和 joinKey 必填"}), 400

    with DATA_LOCK:
        join_keys = load_join_keys()
        key_item = next((item for item in join_keys.get("keys", []) if item.get("key") == join_key), None)
        if not key_item:
            return jsonify({"ok": False, "msg": "join key 无效"}), 403

        agents = merge_main_agent(load_agents_raw())
        existing = next((item for item in agents if not item.get("isMain") and item.get("name") == name), None)
        allowed, error_message = key_allows_join(
            key_item,
            existing_agent_id=str(existing.get("agentId") or "") if existing else None,
        )
        if not allowed:
            return jsonify({"ok": False, "msg": error_message}), 403
        active_count = count_active_agents_for_key(agents, join_key, existing.get("agentId") if existing else None)
        max_concurrent = int(key_item.get("maxConcurrent", 3))
        if active_count >= max_concurrent:
            return jsonify({"ok": False, "msg": f"并发已达上限（{max_concurrent}）"}), 429

        if existing:
            agent = update_guest(existing, state_value, detail)
        else:
            agent = {
                "agentId": generate_agent_id(),
                "name": name,
                "isMain": False,
                "state": state_value,
                "detail": detail,
                "updated_at": now_iso(),
                "source": str(payload.get("source") or "remote"),
                "joinKey": join_key,
                "authStatus": "approved",
                "authApprovedAt": now_iso(),
                "authExpiresAt": None,
                "lastPushAt": now_iso(),
            }
            agents.append(agent)
            record_history(name, state_value, detail, agent["updated_at"])

        key_item["used"] = True
        key_item["usedBy"] = name
        key_item["usedByAgentId"] = agent["agentId"]
        key_item["usedAt"] = now_iso()

        save_json(JOIN_KEYS_FILE, join_keys)
        save_agents(agents)

    return jsonify({"ok": True, "agentId": agent["agentId"], "authStatus": "approved"})


@app.route("/agent-push", methods=["POST"])
def agent_push():
    payload = request.get_json(silent=True) or {}
    join_key = str(payload.get("joinKey") or "").strip()
    name = str(payload.get("name") or "").strip()
    agent_id = str(payload.get("agentId") or "").strip()
    detail = str(payload.get("detail") or "")
    state_value = normalize_state(payload.get("state"))

    if not join_key:
        return jsonify({"ok": False, "msg": "joinKey 必填"}), 400

    with DATA_LOCK:
        key_item = find_join_key(join_key)
        if not key_item:
            return jsonify({"ok": False, "msg": "join key 无效"}), 403
        if key_is_expired(key_item):
            return jsonify({"ok": False, "msg": "join key 已过期"}), 403

        agents = merge_main_agent(load_agents_raw())
        agent = next(
            (
                item
                for item in agents
                if not item.get("isMain")
                and (
                    (agent_id and item.get("agentId") == agent_id)
                    or (name and item.get("name") == name)
                )
            ),
            None,
        )
        if not agent:
            return jsonify({"ok": False, "msg": "agent 不存在，请先 join"}), 404
        if agent.get("joinKey") != join_key:
            return jsonify({"ok": False, "msg": "join key 不匹配"}), 403

        update_guest(agent, state_value, detail)
        save_agents(agents)

    return jsonify({"ok": True, "agentId": agent["agentId"], "state": state_value})


@app.route("/leave-agent", methods=["POST"])
def leave_agent():
    payload = request.get_json(silent=True) or {}
    agent_id = str(payload.get("agentId") or "").strip()
    name = str(payload.get("name") or "").strip()
    if not agent_id and not name:
        return jsonify({"ok": False, "msg": "agentId 或 name 必填"}), 400

    with DATA_LOCK:
        join_keys = load_join_keys()
        agents = merge_main_agent(load_agents_raw())
        target = next(
            (
                item
                for item in agents
                if not item.get("isMain")
                and ((agent_id and item.get("agentId") == agent_id) or (name and item.get("name") == name))
            ),
            None,
        )
        if not target:
            return jsonify({"ok": False, "msg": "agent 不存在"}), 404

        agents = [item for item in agents if item.get("agentId") != target.get("agentId")]
        for key_item in join_keys.get("keys", []):
            if key_item.get("usedByAgentId") == target.get("agentId"):
                key_item["used"] = False
                key_item["usedBy"] = None
                key_item["usedByAgentId"] = None
                key_item["usedAt"] = None
                break

        save_json(JOIN_KEYS_FILE, join_keys)
        save_agents(agents)

    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("JARVIS_OFFICE_PORT", "19010"))
    app.run(host="0.0.0.0", port=port, debug=False)
