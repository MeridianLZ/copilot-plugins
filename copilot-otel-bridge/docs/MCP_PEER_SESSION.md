# Conversation `d9d26f83-8845-451a-919a-797dbf51f8d5`

- generated_at: `2026-08-06T06:35:32.268Z`
- status: `recovered (complete)`
- cwd: `C:\Users\me\dev\fintech-marketplace\copilot-otel-bridge`
- started_at: `2026-08-06T06:33:48.410Z`
- ended_at: `2026-08-06T06:33:48.410Z`
- events: `34` · turns: `2` · tools: `8` · subagents: `0` · errors: `0`

## Verbatim chronological transcript

# Session

- time: `2026-08-06T06:33:48.410Z`
- status: `ok (complete)`
- duration_ms: `73527`

- **Session started** (2026-08-06T06:33:48.410Z)
  - **source**: new
  - **initial_prompt**: `[redacted sha256:eecb390dcda9… 424 B]`
- **Turn complete** (2026-08-06T06:35:00.623Z · ok)
  - **stop_reason**: end_turn
- **Session ended** (2026-08-06T06:35:01.937Z · ok)
  - **reason**: complete
- **Session ended** (2026-08-06T06:35:01.937Z · ok)
  - **reason**: complete

## Raw event ledger

```json
[
  {
    "schema_version": "1.0.0",
    "event_id": "538d32a7-a07a-4d9b-860d-2afdfc90197b",
    "observed_at": "2026-08-06T06:33:44.713Z",
    "observed_at_unix_ms": 1785998024713,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "userPromptSubmitted",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:33:42.716Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "prompt": {
        "redacted": true,
        "sha256": "eecb390dcda971f16c1e7b24a2bdb104d15448d05cf457b64f9530c72ed36076",
        "bytes": 424
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "4eef80b9-bb55-4603-9b33-2c404e79f9fa",
    "observed_at": "2026-08-06T06:33:45.393Z",
    "observed_at_unix_ms": 1785998025393,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "userPromptSubmitted",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:33:42.716Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "prompt": {
        "redacted": true,
        "sha256": "eecb390dcda971f16c1e7b24a2bdb104d15448d05cf457b64f9530c72ed36076",
        "bytes": 424
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "bb6527b3-7b53-46b2-bd34-0081fba713f4",
    "observed_at": "2026-08-06T06:33:47.671Z",
    "observed_at_unix_ms": 1785998027671,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "userPromptTransformed",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:33:47.044Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "prompt": {
        "redacted": true,
        "sha256": "eecb390dcda971f16c1e7b24a2bdb104d15448d05cf457b64f9530c72ed36076",
        "bytes": 424
      },
      "transformed_prompt": {
        "redacted": true,
        "sha256": "cd28f3d72b7281ea1ae7242457c090e1a11ef90f9cbe362198a56c9a30c6527f",
        "bytes": 1079
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "d12b587e-2805-409c-9a75-c6cc366dff69",
    "observed_at": "2026-08-06T06:33:48.265Z",
    "observed_at_unix_ms": 1785998028265,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "userPromptTransformed",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:33:47.044Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "prompt": {
        "redacted": true,
        "sha256": "eecb390dcda971f16c1e7b24a2bdb104d15448d05cf457b64f9530c72ed36076",
        "bytes": 424
      },
      "transformed_prompt": {
        "redacted": true,
        "sha256": "cd28f3d72b7281ea1ae7242457c090e1a11ef90f9cbe362198a56c9a30c6527f",
        "bytes": 1079
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "0e7a76dc-0cfd-4017-a7f4-4508e4caaa0d",
    "observed_at": "2026-08-06T06:33:48.903Z",
    "observed_at_unix_ms": 1785998028903,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "sessionStart",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:33:48.410Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "source": "new",
      "initial_prompt": {
        "redacted": true,
        "sha256": "eecb390dcda971f16c1e7b24a2bdb104d15448d05cf457b64f9530c72ed36076",
        "bytes": 424
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "b62f220c-d98c-44b0-b41f-a2298197b940",
    "observed_at": "2026-08-06T06:33:49.644Z",
    "observed_at_unix_ms": 1785998029644,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "sessionStart",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:33:48.410Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "source": "new",
      "initial_prompt": {
        "redacted": true,
        "sha256": "eecb390dcda971f16c1e7b24a2bdb104d15448d05cf457b64f9530c72ed36076",
        "bytes": 424
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "9e5c6bfe-93c8-4f15-b71f-e4c1da58c322",
    "observed_at": "2026-08-06T06:33:57.612Z",
    "observed_at_unix_ms": 1785998037612,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "preToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:33:57.001Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp-ping",
      "tool_input": {
        "redacted": true,
        "sha256": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        "bytes": 2
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "e04f7047-fb78-4586-9583-d990b5535600",
    "observed_at": "2026-08-06T06:33:58.262Z",
    "observed_at_unix_ms": 1785998038262,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "preToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:33:57.001Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp-ping",
      "tool_input": {
        "redacted": true,
        "sha256": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        "bytes": 2
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "b1ed2d2a-99d0-488b-a0ca-d8d77ab88120",
    "observed_at": "2026-08-06T06:33:58.892Z",
    "observed_at_unix_ms": 1785998038892,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "permissionRequest",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:33:58.393Z",
      "hookName": "permissionRequest",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp/ping",
      "toolInput": {},
      "permissionSuggestions": []
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "f1857c7e-5be4-49b3-8197-fa59483304e7",
    "observed_at": "2026-08-06T06:33:59.626Z",
    "observed_at_unix_ms": 1785998039626,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "permissionRequest",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:33:58.393Z",
      "hookName": "permissionRequest",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp/ping",
      "toolInput": {},
      "permissionSuggestions": []
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "1a437bfc-4662-41e9-8ba0-ac891df3975d",
    "observed_at": "2026-08-06T06:34:00.353Z",
    "observed_at_unix_ms": 1785998040353,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "postToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:33:59.828Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp-ping",
      "tool_input": {
        "redacted": true,
        "sha256": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        "bytes": 2
      },
      "tool_result": {
        "redacted": true,
        "sha256": "238053499712ccd191978e972b8192b0224d640dcefe1e072bd5b587d2262f03",
        "bytes": 181
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "28ed920f-f428-4252-930a-281c42009856",
    "observed_at": "2026-08-06T06:34:01.080Z",
    "observed_at_unix_ms": 1785998041080,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "postToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:33:59.828Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp-ping",
      "tool_input": {
        "redacted": true,
        "sha256": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        "bytes": 2
      },
      "tool_result": {
        "redacted": true,
        "sha256": "238053499712ccd191978e972b8192b0224d640dcefe1e072bd5b587d2262f03",
        "bytes": 181
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "b603eef4-febf-4c66-a825-8eb4074d6287",
    "observed_at": "2026-08-06T06:34:04.461Z",
    "observed_at_unix_ms": 1785998044461,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "preToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:03.800Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp-marco",
      "tool_input": {
        "redacted": true,
        "sha256": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        "bytes": 2
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "e715a352-42cc-46a0-9d57-929ca4837dca",
    "observed_at": "2026-08-06T06:34:05.112Z",
    "observed_at_unix_ms": 1785998045112,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "preToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:03.800Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp-marco",
      "tool_input": {
        "redacted": true,
        "sha256": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        "bytes": 2
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "e9809615-1e7d-4950-be53-d3f577679c7a",
    "observed_at": "2026-08-06T06:34:05.684Z",
    "observed_at_unix_ms": 1785998045684,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "permissionRequest",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:05.234Z",
      "hookName": "permissionRequest",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp/marco",
      "toolInput": {},
      "permissionSuggestions": []
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "69990101-4618-4dc9-889d-b3b96c5f23ee",
    "observed_at": "2026-08-06T06:34:06.292Z",
    "observed_at_unix_ms": 1785998046292,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "permissionRequest",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:05.234Z",
      "hookName": "permissionRequest",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp/marco",
      "toolInput": {},
      "permissionSuggestions": []
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "8da01d47-17bf-4968-bf71-0308ca36e3de",
    "observed_at": "2026-08-06T06:34:29.179Z",
    "observed_at_unix_ms": 1785998069179,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "postToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:28.665Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp-marco",
      "tool_input": {
        "redacted": true,
        "sha256": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        "bytes": 2
      },
      "tool_result": {
        "redacted": true,
        "sha256": "0c449a3f799ac6b10318a85e66014ea348408ad020c357addbe42ab1bb4ec376",
        "bytes": 95
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "8e407e7a-60fe-40fd-b407-5291467fafa2",
    "observed_at": "2026-08-06T06:34:29.785Z",
    "observed_at_unix_ms": 1785998069785,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "postToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:28.665Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp-marco",
      "tool_input": {
        "redacted": true,
        "sha256": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        "bytes": 2
      },
      "tool_result": {
        "redacted": true,
        "sha256": "0c449a3f799ac6b10318a85e66014ea348408ad020c357addbe42ab1bb4ec376",
        "bytes": 95
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "88a3b3bf-6e45-4ce5-a38a-6a240507a44d",
    "observed_at": "2026-08-06T06:34:33.935Z",
    "observed_at_unix_ms": 1785998073935,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "preToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:33.427Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp-ask",
      "tool_input": {
        "redacted": true,
        "sha256": "350aeb3997ef77409df8b27593f11a1d420e57729c7813fd65d6d8209c26b9e5",
        "bytes": 57
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "ff1938ef-cd87-44fd-8ae9-986fccfba4f7",
    "observed_at": "2026-08-06T06:34:34.518Z",
    "observed_at_unix_ms": 1785998074518,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "preToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:33.427Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp-ask",
      "tool_input": {
        "redacted": true,
        "sha256": "350aeb3997ef77409df8b27593f11a1d420e57729c7813fd65d6d8209c26b9e5",
        "bytes": 57
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "49533d63-b3b3-40f2-bd69-a63469eefb64",
    "observed_at": "2026-08-06T06:34:35.107Z",
    "observed_at_unix_ms": 1785998075107,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "permissionRequest",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:34.642Z",
      "hookName": "permissionRequest",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp/ask",
      "toolInput": {
        "prompt": {
          "redacted": true,
          "sha256": "ad8e8c2a97c63adf6b11a6b85dab15bf99798922215319f36630e6f319857de3",
          "bytes": 46
        }
      },
      "permissionSuggestions": []
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "e7803ead-300e-496a-b9ae-9e9a1a395685",
    "observed_at": "2026-08-06T06:34:35.659Z",
    "observed_at_unix_ms": 1785998075659,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "permissionRequest",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:34.642Z",
      "hookName": "permissionRequest",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp/ask",
      "toolInput": {
        "prompt": {
          "redacted": true,
          "sha256": "ad8e8c2a97c63adf6b11a6b85dab15bf99798922215319f36630e6f319857de3",
          "bytes": 46
        }
      },
      "permissionSuggestions": []
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "2ab39e77-90be-4e95-b031-f0ed5c1971c3",
    "observed_at": "2026-08-06T06:34:46.425Z",
    "observed_at_unix_ms": 1785998086425,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "postToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:45.940Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp-ask",
      "tool_input": {
        "redacted": true,
        "sha256": "350aeb3997ef77409df8b27593f11a1d420e57729c7813fd65d6d8209c26b9e5",
        "bytes": 57
      },
      "tool_result": {
        "redacted": true,
        "sha256": "287b30aa7e88301673de2fde304e3a2828ba27c2b46da745ceab56643bd63c75",
        "bytes": 159
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "46d8c03a-b0db-4724-bb27-aabae5bb6015",
    "observed_at": "2026-08-06T06:34:47.106Z",
    "observed_at_unix_ms": 1785998087106,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "postToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:45.940Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "copilot-mcp-ask",
      "tool_input": {
        "redacted": true,
        "sha256": "350aeb3997ef77409df8b27593f11a1d420e57729c7813fd65d6d8209c26b9e5",
        "bytes": 57
      },
      "tool_result": {
        "redacted": true,
        "sha256": "287b30aa7e88301673de2fde304e3a2828ba27c2b46da745ceab56643bd63c75",
        "bytes": 159
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "6b5f8225-6d54-4af5-92a7-804b152a35c8",
    "observed_at": "2026-08-06T06:34:50.056Z",
    "observed_at_unix_ms": 1785998090056,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "preToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:49.487Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "powershell",
      "tool_input": {
        "redacted": true,
        "sha256": "63c17c971edb7c8a28817b9cdf32999edf292cb063d54da59d2bcc4f9dbc1902",
        "bytes": 79
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "9c524798-43ee-45d2-a529-fc9b34c5a38b",
    "observed_at": "2026-08-06T06:34:50.731Z",
    "observed_at_unix_ms": 1785998090731,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "preToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:49.487Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "powershell",
      "tool_input": {
        "redacted": true,
        "sha256": "63c17c971edb7c8a28817b9cdf32999edf292cb063d54da59d2bcc4f9dbc1902",
        "bytes": 79
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "c2611500-64cf-4b51-8cf0-7d6a8b4abcff",
    "observed_at": "2026-08-06T06:34:51.484Z",
    "observed_at_unix_ms": 1785998091484,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "permissionRequest",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:50.892Z",
      "hookName": "permissionRequest",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "powershell",
      "toolInput": {
        "command": {
          "redacted": true,
          "sha256": "bd5d149837235de1ad1b72cbce77b5eedc7773c098da42755d88293d2312165b",
          "bytes": 20
        }
      },
      "permissionSuggestions": []
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "e9c15100-7c13-438b-a8bc-99ca5da354d3",
    "observed_at": "2026-08-06T06:34:52.256Z",
    "observed_at_unix_ms": 1785998092256,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "permissionRequest",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:50.892Z",
      "hookName": "permissionRequest",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "powershell",
      "toolInput": {
        "command": {
          "redacted": true,
          "sha256": "bd5d149837235de1ad1b72cbce77b5eedc7773c098da42755d88293d2312165b",
          "bytes": 20
        }
      },
      "permissionSuggestions": []
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "fa1252a9-3c90-4ae4-b06c-744d8622ebae",
    "observed_at": "2026-08-06T06:34:54.579Z",
    "observed_at_unix_ms": 1785998094579,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "postToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:54.015Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "powershell",
      "tool_input": {
        "redacted": true,
        "sha256": "63c17c971edb7c8a28817b9cdf32999edf292cb063d54da59d2bcc4f9dbc1902",
        "bytes": 79
      },
      "tool_result": {
        "redacted": true,
        "sha256": "477587bf9990c74f31fc325f55fa26778536d9cd06fb7b7d6ca04a4c681e0312",
        "bytes": 120
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "c07073fc-bc92-4c1d-9366-8841098e22c1",
    "observed_at": "2026-08-06T06:34:55.219Z",
    "observed_at_unix_ms": 1785998095219,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "postToolUse",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:34:54.015Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "tool_name": "powershell",
      "tool_input": {
        "redacted": true,
        "sha256": "63c17c971edb7c8a28817b9cdf32999edf292cb063d54da59d2bcc4f9dbc1902",
        "bytes": 79
      },
      "tool_result": {
        "redacted": true,
        "sha256": "477587bf9990c74f31fc325f55fa26778536d9cd06fb7b7d6ca04a4c681e0312",
        "bytes": 120
      }
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "2b366838-1684-40c7-9b60-615a5c2d9f86",
    "observed_at": "2026-08-06T06:35:01.123Z",
    "observed_at_unix_ms": 1785998101123,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "agentStop",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:35:00.623Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "transcript_path": "C:\\Users\\me\\.copilot\\session-state\\d9d26f83-8845-451a-919a-797dbf51f8d5\\events.jsonl",
      "stop_reason": "end_turn",
      "stop_hook_active": false
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "71456622-0a42-4618-b099-07423e59c98b",
    "observed_at": "2026-08-06T06:35:01.795Z",
    "observed_at_unix_ms": 1785998101795,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "agentStop",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:35:00.623Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "transcript_path": "C:\\Users\\me\\.copilot\\session-state\\d9d26f83-8845-451a-919a-797dbf51f8d5\\events.jsonl",
      "stop_reason": "end_turn",
      "stop_hook_active": false
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "017df531-94e2-409c-bf6b-7a437da5f9da",
    "observed_at": "2026-08-06T06:35:02.535Z",
    "observed_at_unix_ms": 1785998102535,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "sessionEnd",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:35:01.937Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "reason": "complete"
    }
  },
  {
    "schema_version": "1.0.0",
    "event_id": "f9cbf52d-8cbf-4d1d-ba25-985f56616f0c",
    "observed_at": "2026-08-06T06:35:03.140Z",
    "observed_at_unix_ms": 1785998103140,
    "source": "command-hook",
    "payload": {
      "hook_event_name": "sessionEnd",
      "session_id": "d9d26f83-8845-451a-919a-797dbf51f8d5",
      "payload_format": "camelCase",
      "timestamp": "2026-08-06T06:35:01.937Z",
      "cwd": "C:\\Users\\me\\dev\\fintech-marketplace\\copilot-otel-bridge",
      "reason": "complete"
    }
  }
]
```

