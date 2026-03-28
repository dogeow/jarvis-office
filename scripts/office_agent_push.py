#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path


JOIN_KEY = ""
AGENT_NAME = ""
OFFICE_URL = "https://claw.dogeow.com"
PUSH_INTERVAL_SECONDS = 15
STALE_STATE_TTL_SECONDS = 600

PROJECT_DIR = Path(__file__).resolve().parents[1]
LOCAL_STATE_FILE = PROJECT_DIR / "state.json"
LOCAL_CACHE_FILE = PROJECT_DIR / ".agent-push-state.json"


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


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


def normalize_state(value: str) -> str:
    normalized = (value or "").strip().lower()
    aliases = {
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
    normalized = aliases.get(normalized, normalized)
    if normalized in {"idle", "writing", "researching", "executing", "syncing", "error"}:
        return normalized
    return "idle"


def read_local_state() -> dict[str, str]:
    payload = load_json(LOCAL_STATE_FILE, {"state": "idle", "detail": "待命中", "updated_at": now_iso()})
    detail = str(payload.get("detail") or "")
    state_value = normalize_state(str(payload.get("state") or "idle"))
    try:
        age = (datetime.now() - datetime.fromisoformat(str(payload.get("updated_at")))).total_seconds()
    except Exception:
        age = None
    if age is not None and age > STALE_STATE_TTL_SECONDS:
        return {"state": "idle", "detail": "本地状态长期未更新，自动回待命"}
    return {"state": state_value, "detail": detail}


def request_json(method: str, url: str, payload: dict) -> tuple[int, dict]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        method=method,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore")
        try:
            return exc.code, json.loads(raw or "{}")
        except Exception:
            return exc.code, {"ok": False, "msg": raw}


def ensure_join(local_cache: dict) -> dict:
    if local_cache.get("agentId"):
        return local_cache
    status, payload = request_json(
        "POST",
        urllib.parse.urljoin(OFFICE_URL, "/join-agent"),
        {
            "name": AGENT_NAME,
            "joinKey": JOIN_KEY,
            "state": "idle",
            "detail": "刚刚加入",
        },
    )
    if status >= 400 or not payload.get("ok"):
        raise RuntimeError(payload.get("msg") or f"join 失败: {status}")
    local_cache["agentId"] = payload.get("agentId")
    save_json(LOCAL_CACHE_FILE, local_cache)
    return local_cache


def main() -> int:
    if not JOIN_KEY or not AGENT_NAME:
        print("请先在脚本顶部填写 JOIN_KEY 和 AGENT_NAME")
        return 1

    local_cache = load_json(LOCAL_CACHE_FILE, {"agentId": None})
    local_cache = ensure_join(local_cache)
    print(f"已加入办公室，agentId={local_cache['agentId']}")

    while True:
        state_payload = read_local_state()
        status, payload = request_json(
            "POST",
            urllib.parse.urljoin(OFFICE_URL, "/agent-push"),
            {
                "agentId": local_cache["agentId"],
                "name": AGENT_NAME,
                "joinKey": JOIN_KEY,
                "state": state_payload["state"],
                "detail": state_payload["detail"],
            },
        )
        if status >= 400 or not payload.get("ok"):
            print(payload.get("msg") or f"push 失败: {status}")
            return 1
        print(f"[{now_iso()}] pushed {state_payload['state']} - {state_payload['detail']}")
        time.sleep(PUSH_INTERVAL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
