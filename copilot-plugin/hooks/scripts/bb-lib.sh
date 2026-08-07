#!/usr/bin/env bash
# bb-lib.sh — shared helpers for copilot-home blackboard hooks.
# Sourced by the hook scripts; not executed directly.
# Requires: jq, md5sum|md5, od. Fails soft (hooks other than preToolUse are
# logged-continue on non-zero exit; we still guard every step).

bb_dir() {
  printf '%s/agent_blackboard' "${COPILOT_PLUGIN_DATA:-$HOME/.copilot/plugin-data/copilot-home}"
}

# Deterministic session-stable trace_id: md5(session_id) → 32 hex.
# Every writer (hook, orchestrator, peer) derives the same trace_id
# without coordination — the OTel phase joins streams on it.
bb_trace_id() {
  local sid="$1"
  if command -v md5sum >/dev/null 2>&1; then
    printf '%s' "$sid" | md5sum | cut -c1-32
  else
    printf '%s' "$sid" | md5 | tail -c 33 | cut -c1-32
  fi
}

# Fresh 16-hex span_id per entry.
bb_span_id() {
  od -An -N8 -tx1 /dev/urandom | tr -d ' \n'
}

bb_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

# bb_append SESSION_ID AGENT_ID AGENT_NAME ROLE EVENT PAYLOAD_JSON
bb_append() {
  local sid="$1" aid="$2" aname="$3" role="$4" event="$5" payload="$6"
  local dir file trace span
  dir="$(bb_dir)" || return 0
  mkdir -p "$dir" || return 0
  file="$dir/$sid.jsonl"
  trace="$(bb_trace_id "$sid")"
  span="$(bb_span_id)"
  jq -cn \
    --arg ts "$(bb_now)" \
    --arg bb "bb-$sid" \
    --arg sid "$sid" \
    --arg aid "$aid" \
    --arg aname "$aname" \
    --arg role "$role" \
    --arg event "$event" \
    --argjson payload "$payload" \
    --arg tp "00-$trace-$span-01" \
    '{ts:$ts, blackboard_id:$bb, session_id:$sid, agent_id:$aid, agent_name:$aname,
      primary_agent_id:$aid, role:$role, event:$event, payload:$payload,
      trace:{traceparent:$tp, tracestate:""}}' >> "$file" 2>/dev/null || return 0
}
