#!/usr/bin/env bash
set -euo pipefail

bridge_url="${TRACE_BRIDGE_URL:-http://127.0.0.1:4319/hooks}"
flush_url="${TRACE_FLUSH_URL:-http://127.0.0.1:4319/flush}"
session_id="smoke-session-$(date +%s)"
prompt_id="550e8400-e29b-41d4-a716-446655440000"
tool_one="toolu_smoke_01"
tool_two="toolu_smoke_02"
traceparent="00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"

post() {
  local body="$1"
  curl --fail --silent --show-error \
    -H 'content-type: application/json' \
    -H "traceparent: ${traceparent}" \
    --data-binary "${body}" \
    "${bridge_url}" >/dev/null
}

post "$(jq -cn \
  --arg session "$session_id" --arg prompt "$prompt_id" \
  '{session_id:$session,prompt_id:$prompt,cwd:"/smoke/repo",permission_mode:"default",hook_event_name:"UserPromptSubmit",prompt:"Run a smoke-test tool batch"}')"

post "$(jq -cn \
  --arg session "$session_id" --arg prompt "$prompt_id" --arg id "$tool_one" \
  '{session_id:$session,prompt_id:$prompt,cwd:"/smoke/repo",permission_mode:"default",hook_event_name:"PreToolUse",tool_name:"Bash",tool_use_id:$id,tool_input:{command:"printf smoke-one",description:"Synthetic smoke tool"}}')"

post "$(jq -cn \
  --arg session "$session_id" --arg prompt "$prompt_id" \
  '{session_id:$session,prompt_id:$prompt,cwd:"/smoke/repo",permission_mode:"default",hook_event_name:"PermissionRequest",tool_name:"Bash",tool_input:{command:"printf smoke-one"},permission_suggestions:[]}')"

post "$(jq -cn \
  --arg session "$session_id" --arg prompt "$prompt_id" --arg id "$tool_one" \
  '{session_id:$session,prompt_id:$prompt,cwd:"/smoke/repo",permission_mode:"default",hook_event_name:"PostToolUse",tool_name:"Bash",tool_use_id:$id,duration_ms:12,tool_input:{command:"printf smoke-one"},tool_response:{stdout:"smoke-one",stderr:"",interrupted:false}}')"

post "$(jq -cn \
  --arg session "$session_id" --arg prompt "$prompt_id" --arg id "$tool_two" \
  '{session_id:$session,prompt_id:$prompt,cwd:"/smoke/repo",permission_mode:"default",hook_event_name:"PreToolUse",tool_name:"Read",tool_use_id:$id,tool_input:{file_path:"/smoke/repo/README.md"}}')"

post "$(jq -cn \
  --arg session "$session_id" --arg prompt "$prompt_id" --arg id "$tool_two" \
  '{session_id:$session,prompt_id:$prompt,cwd:"/smoke/repo",permission_mode:"default",hook_event_name:"PostToolUse",tool_name:"Read",tool_use_id:$id,duration_ms:4,tool_input:{file_path:"/smoke/repo/README.md"},tool_response:{filePath:"/smoke/repo/README.md",success:true}}')"

post "$(jq -cn \
  --arg session "$session_id" --arg prompt "$prompt_id" --arg id1 "$tool_one" --arg id2 "$tool_two" \
  '{session_id:$session,prompt_id:$prompt,cwd:"/smoke/repo",permission_mode:"default",hook_event_name:"PostToolBatch",tool_calls:[{tool_name:"Bash",tool_use_id:$id1,tool_input:{command:"printf smoke-one"},tool_response:"smoke-one"},{tool_name:"Read",tool_use_id:$id2,tool_input:{file_path:"/smoke/repo/README.md"},tool_response:"README content"}]}')"

post "$(jq -cn \
  --arg session "$session_id" --arg prompt "$prompt_id" \
  '{session_id:$session,prompt_id:$prompt,cwd:"/smoke/repo",hook_event_name:"MessageDisplay",turn_id:"turn-smoke",message_id:"message-smoke",index:0,final:false,delta:"Smoke"}')"

post "$(jq -cn \
  --arg session "$session_id" --arg prompt "$prompt_id" \
  '{session_id:$session,prompt_id:$prompt,cwd:"/smoke/repo",hook_event_name:"MessageDisplay",turn_id:"turn-smoke",message_id:"message-smoke",index:1,final:true,delta:" test complete."}')"

post "$(jq -cn \
  --arg session "$session_id" --arg prompt "$prompt_id" \
  '{session_id:$session,prompt_id:$prompt,cwd:"/smoke/repo",permission_mode:"default",hook_event_name:"Stop",stop_hook_active:false,last_assistant_message:"Smoke test complete.",background_tasks:[],session_crons:[]}')"

curl --fail --silent --show-error -X POST "$flush_url" >/dev/null
printf 'Smoke trace submitted. session_id=%s prompt_id=%s\n' "$session_id" "$prompt_id"
printf 'Inspect: docker compose logs --since=2m otel-collector\n'
