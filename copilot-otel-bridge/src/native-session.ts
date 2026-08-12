import { homedir } from 'node:os';
import path from 'node:path';
import { redactSecrets, truncateUtf8 } from './security.js';
import { normalizeConversationIdentity } from './conversation-identity.js';
import type { ConversationContent, ConversationNode } from './conversation-projector.js';
import type { JsonValue } from './types.js';

/**
 * Reader/projector for Copilot CLI's native per-session transcript at
 * ~/.copilot/session-state/<session_id>/events.jsonl — the only surface that
 * carries verbatim assistant prose, exact toolCallId/turnId correlation,
 * reasoning, models, and usage. The file format is undocumented upstream
 * (github/copilot-cli#3551) but mirrors the documented Copilot SDK session
 * event model; parse defensively and ignore what we don't know.
 *
 * Correlation rules (parentId is unreliable upstream — never use it):
 * - assistant.message chunks reassemble by messageId ordered by chunkIndex
 * - tools join execution_start → execution_complete by toolCallId
 * - subagents join by toolCallId; that id doubles as the child hook-lane
 *   session_id (exposed as child_session_id for cross-linking)
 * - permissions join requested → completed by requestId
 * - envelope-level agentId scopes an event to a subagent's own stream
 */

export interface NativeEvent {
  type: string;
  data: Record<string, JsonValue>;
  id: string;
  timestamp: string;
  agent_id?: string;
  identity?: import('./conversation-identity.js').ConversationIdentity;
}

export interface NativeUsage {
  total_nano_aiu?: number;
  total_premium_requests?: number;
  output_tokens?: number;
}

export interface NativeProjection {
  root: ConversationNode;
  model?: string;
  usage?: NativeUsage;
  turn_count: number;
  tool_count: number;
  subagent_count: number;
  error_count: number;
  started_at_ms?: number;
  last_event_at_ms?: number;
}

export function resolveSessionStatePath(sessionId: string, copilotHome?: string): string {
  const home = copilotHome ?? process.env['COPILOT_HOME'] ?? path.join(homedir(), '.copilot');
  if (sessionId.length === 0 || sessionId === '.' || sessionId === '..' || /[\\/]/.test(sessionId)) {
    throw new Error('invalid session id');
  }
  const sessionRoot = path.resolve(home, 'session-state');
  const resolved = path.resolve(sessionRoot, sessionId, 'events.jsonl');
  if (!resolved.startsWith(`${sessionRoot}${path.sep}`)) throw new Error('invalid session id');
  return resolved;
}

export function parseNativeLines(lines: readonly string[]): NativeEvent[] {
  const events: NativeEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue; // known upstream corruption: U+2028/U+2029, multiline output
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const record = parsed as Record<string, unknown>;
    if (typeof record['type'] !== 'string' || typeof record['timestamp'] !== 'string') continue;
    const data = record['data'];
    const dataObject = data !== null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, JsonValue>)
      : {};
    const identity = normalizeConversationIdentity({
      ...record,
      ...dataObject,
      agentId: record['agentId']
    });
    events.push({
      type: record['type'],
      data: dataObject,
      id: typeof record['id'] === 'string' ? record['id'] : '',
      timestamp: record['timestamp'],
      ...(typeof record['agentId'] === 'string' ? { agent_id: record['agentId'] } : {}),
      ...(Object.keys(identity).length > 0 ? { identity } : {})
    });
  }
  return events;
}

const MAX_TEXT_BYTES = 32_768;

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return truncateUtf8(redactSecrets(value), MAX_TEXT_BYTES);
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function timeMs(event: NativeEvent): number {
  const parsed = Date.parse(event.timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function cleanJson(value: JsonValue | undefined): JsonValue | undefined {
  if (value === undefined) return undefined;
  const serialized = truncateUtf8(redactSecrets(JSON.stringify(value)), MAX_TEXT_BYTES);
  try {
    return JSON.parse(serialized) as JsonValue;
  } catch {
    return serialized;
  }
}

function makeNode(
  kind: ConversationNode['kind'],
  id: string,
  title: string,
  ms: number,
  depth: number
): ConversationNode {
  return {
    id,
    kind,
    timestamp_ms: ms,
    timestamp_iso: iso(ms),
    title,
    depth,
    content: [],
    children: []
  };
}

function pushText(node: ConversationNode, role: ConversationContent['role'], label: string, value: unknown): void {
  const text = clean(value);
  if (text !== undefined) node.content.push({ role, label, text });
}

interface AssembledMessage {
  message_id: string;
  ms: number;
  model?: string;
  turn_id?: string;
  agent_id?: string;
  chunks: { index: number; content: string }[];
  reasoning: string[];
  reasoning_encrypted: boolean;
  tool_requests: { toolCallId?: string; name?: string; intention?: string }[];
  output_tokens?: number;
}

/**
 * Projects the native event stream into the ConversationNode tree the UI and
 * markdown export already render. Root-agent events form the main timeline;
 * agent_id-scoped events nest under their subagent node.
 */
export function projectNativeConversation(events: readonly NativeEvent[], sessionId: string): NativeProjection {
  const root = makeNode('session', `native-session:${sessionId}`, 'Session', events[0] ? timeMs(events[0]) : 0, 0);
  root.status = 'open';
  root.identity = { session_id: sessionId };

  let model: string | undefined;
  const usage: NativeUsage = {};
  let turnCount = 0;
  let toolCount = 0;
  let subagentCount = 0;
  let errorCount = 0;

  let currentTurn: ConversationNode | undefined;
  const toolNodes = new Map<string, ConversationNode>();
  const subagentNodes = new Map<string, ConversationNode>();
  const permissionNodes = new Map<string, ConversationNode>();
  const messages = new Map<string, AssembledMessage>();
  const messageOrder: AssembledMessage[] = [];

  const hostFor = (event: NativeEvent): ConversationNode => {
    if (event.agent_id !== undefined) {
      const sub = subagentNodes.get(event.agent_id);
      if (sub) return sub;
    }
    return currentTurn ?? root;
  };

  const ensureTurn = (ms: number, turnId?: string): ConversationNode => {
    if (!currentTurn) {
      turnCount += 1;
      currentTurn = makeNode('turn', `native-turn:${turnId ?? turnCount}`, 'Turn', ms, 1);
      currentTurn.status = 'open';
      currentTurn.identity = normalizeConversationIdentity({
        session_id: sessionId,
        turn_id: turnId
      });
      root.children.push(currentTurn);
    }
    return currentTurn;
  };

  const flushMessage = (assembled: AssembledMessage): void => {
    const host = assembled.agent_id !== undefined ? subagentNodes.get(assembled.agent_id) ?? root : currentTurn ?? root;
    const node = makeNode('event', `native-msg:${assembled.message_id}`, 'Assistant', assembled.ms, host.depth + 1);
    node.identity = normalizeConversationIdentity({
      session_id: sessionId,
      message_id: assembled.message_id,
      turn_id: assembled.turn_id,
      agent_id: assembled.agent_id
    });
    if (assembled.model !== undefined) node.model = assembled.model;
    const text = assembled.chunks.sort((a, b) => a.index - b.index).map((chunk) => chunk.content).join('');
    if (text.length > 0) node.content.push({ role: 'agent', label: 'message', text });
    const reasoning = assembled.reasoning.join('');
    if (reasoning.length > 0) node.content.push({ role: 'agent', label: 'reasoning', text: reasoning });
    else if (assembled.reasoning_encrypted) node.reasoning_encrypted = true;
    for (const request of assembled.tool_requests) {
      const intent = request.intention ?? request.name ?? 'tool';
      node.content.push({ role: 'meta', label: 'tool_request', text: `${request.name ?? 'tool'} · ${intent}` });
    }
    if (text.length === 0 && reasoning.length === 0 && assembled.tool_requests.length === 0 && !assembled.reasoning_encrypted) {
      return; // nothing renderable
    }
    host.children.push(node);
  };

  for (const event of events) {
    const ms = timeMs(event);
    const data = event.data;
    root.timestamp_ms = Math.min(root.timestamp_ms || ms, ms);

    switch (event.type) {
      case 'session.start': {
        root.timestamp_ms = ms;
        root.timestamp_iso = iso(ms);
        pushText(root, 'system', 'copilot_version', data['copilotVersion']);
        break;
      }
      case 'session.model_change': {
        model = str(data['newModel']) ?? model;
        const host = hostFor(event);
        const node = makeNode('event', `native-model:${event.id}`, `Model → ${model ?? 'unknown'}`, ms, host.depth + 1);
        host.children.push(node);
        break;
      }
      case 'session.usage_checkpoint': {
        const aiu = num(data['totalNanoAiu']);
        if (aiu !== undefined) usage.total_nano_aiu = aiu;
        const premium = num(data['totalPremiumRequests']);
        if (premium !== undefined) usage.total_premium_requests = premium;
        break;
      }
      case 'user.message': {
        if (event.agent_id === undefined) currentTurn = undefined; // a user message opens a new root turn
        const turn = event.agent_id === undefined ? ensureTurn(ms) : hostFor(event);
        const node = makeNode('event', `native-user:${event.id}`, 'User', ms, turn.depth + 1);
        node.identity = normalizeConversationIdentity({
          ...data,
          session_id: sessionId,
          event_id: event.id,
          agent_id: event.agent_id
        });
        pushText(node, 'user', 'prompt', data['content']);
        turn.children.push(node);
        break;
      }
      case 'assistant.turn_start': {
        if (event.agent_id === undefined) ensureTurn(ms, str(data['turnId']));
        break;
      }
      case 'assistant.turn_end': {
        // turn_start/turn_end fire once per model interaction, several per
        // user exchange. A replica turn = one user exchange, so keep the turn
        // open (the next user.message closes it) and roll duration forward.
        if (event.agent_id === undefined && currentTurn) {
          currentTurn.status = 'ok';
          currentTurn.duration_ms = ms - currentTurn.timestamp_ms;
        }
        break;
      }
      case 'assistant.message': {
        const messageId = str(data['messageId']) ?? event.id;
        let assembled = messages.get(messageId);
        if (!assembled) {
          assembled = {
            message_id: messageId,
            ms,
            chunks: [],
            reasoning: [],
            reasoning_encrypted: false,
            tool_requests: []
          };
          if (event.agent_id !== undefined) assembled.agent_id = event.agent_id;
          messages.set(messageId, assembled);
          messageOrder.push(assembled);
        }
        const messageModel = str(data['model']);
        if (messageModel !== undefined) assembled.model = messageModel;
        if (assembled.model !== undefined && event.agent_id === undefined) model = assembled.model;
        const turnId = str(data['turnId']);
        if (turnId !== undefined) assembled.turn_id = turnId;
        const content = clean(data['content']);
        if (content !== undefined) assembled.chunks.push({ index: num(data['chunkIndex']) ?? assembled.chunks.length, content });
        const reasoning = clean(data['reasoningText']);
        if (reasoning !== undefined) assembled.reasoning.push(reasoning);
        if (str(data['reasoningOpaque']) !== undefined || str(data['encryptedContent']) !== undefined) {
          assembled.reasoning_encrypted = true;
        }
        const requests = data['toolRequests'];
        if (Array.isArray(requests)) {
          for (const request of requests) {
            if (request === null || typeof request !== 'object' || Array.isArray(request)) continue;
            const record = request as Record<string, JsonValue>;
            assembled.tool_requests.push({
              ...(str(record['toolCallId']) !== undefined ? { toolCallId: str(record['toolCallId'])! } : {}),
              ...(str(record['name']) !== undefined ? { name: str(record['name'])! } : {}),
              ...(clean(record['intentionSummary']) !== undefined ? { intention: clean(record['intentionSummary'])! } : {})
            });
          }
        }
        const tokens = num(data['outputTokens']);
        if (tokens !== undefined) usage.output_tokens = (usage.output_tokens ?? 0) + tokens;
        // Flush when the chunk set is complete (or the message is unchunked).
        const chunkCount = num(data['chunkCount']);
        if (chunkCount === undefined || assembled.chunks.length >= chunkCount) {
          flushMessage(assembled);
          messages.delete(messageId);
          const orderIndex = messageOrder.indexOf(assembled);
          if (orderIndex >= 0) messageOrder.splice(orderIndex, 1);
        }
        break;
      }
      case 'subagent.started': {
        const toolCallId = str(data['toolCallId']);
        const host = currentTurn ?? root;
        subagentCount += 1;
        const name = str(data['agentDisplayName']) ?? str(data['agentName']) ?? 'subagent';
        const node = makeNode('subagent', `native-subagent:${toolCallId ?? event.id}`, `Subagent ${name}`, ms, host.depth + 1);
        node.status = 'open';
        node.identity = normalizeConversationIdentity({
          ...data,
          session_id: sessionId,
          event_id: event.id,
          agent_id: event.agent_id
        });
        const agentName = str(data['agentName']);
        if (agentName !== undefined) node.agent_name = agentName;
        const subModel = str(data['model']);
        if (subModel !== undefined) node.model = subModel;
        if (toolCallId !== undefined) {
          node.child_session_id = toolCallId; // == the child hook-lane session_id
          subagentNodes.set(toolCallId, node);
        }
        host.children.push(node);
        break;
      }
      case 'subagent.completed': {
        const toolCallId = str(data['toolCallId']);
        const node = toolCallId !== undefined ? subagentNodes.get(toolCallId) : undefined;
        if (node) {
          node.status = 'ok';
          const duration = num(data['durationMs']);
          if (duration !== undefined) node.duration_ms = duration;
          const tokens = num(data['totalTokens']);
          if (tokens !== undefined) node.content.push({ role: 'meta', label: 'total_tokens', text: String(tokens) });
        }
        break;
      }
      case 'tool.execution_start': {
        const toolCallId = str(data['toolCallId']) ?? event.id;
        if (subagentNodes.has(toolCallId)) break; // the subagent node already represents this call
        const host = hostFor(event);
        toolCount += 1;
        const toolName = str(data['toolName']) ?? 'tool';
        const node = makeNode('tool', `native-tool:${toolCallId}`, `Tool ${toolName}`, ms, host.depth + 1);
        node.status = 'open';
        node.identity = normalizeConversationIdentity({
          ...data,
          session_id: sessionId,
          event_id: event.id,
          agent_id: event.agent_id
        });
        node.tool_name = toolName;
        const args = cleanJson(data['arguments']);
        if (args !== undefined) node.content.push({ role: 'tool', label: 'input', json: args });
        toolNodes.set(toolCallId, node);
        host.children.push(node);
        break;
      }
      case 'tool.execution_complete': {
        const toolCallId = str(data['toolCallId']) ?? '';
        if (subagentNodes.has(toolCallId)) break;
        const node = toolNodes.get(toolCallId);
        const success = data['success'] !== false;
        if (!success) errorCount += 1;
        if (node) {
          node.status = success ? 'ok' : 'error';
          node.duration_ms = ms - node.timestamp_ms;
          const result = cleanJson(data['result']);
          if (result !== undefined) node.content.push({ role: 'tool', label: 'result', json: result });
          const error = data['error'];
          if (error !== null && typeof error === 'object' && !Array.isArray(error)) {
            pushText(node, 'tool', 'error', (error as Record<string, JsonValue>)['message']);
          }
          toolNodes.delete(toolCallId);
        }
        break;
      }
      case 'permission.requested': {
        const requestId = str(data['requestId']) ?? event.id;
        const host = hostFor(event);
        const request = data['permissionRequest'];
        const record = request !== null && typeof request === 'object' && !Array.isArray(request)
          ? (request as Record<string, JsonValue>)
          : {};
        const node = makeNode('event', `native-permission:${requestId}`, `Permission · ${str(record['kind']) ?? 'request'}`, ms, host.depth + 1);
        node.identity = normalizeConversationIdentity({
          ...data,
          ...record,
          session_id: sessionId,
          event_id: event.id,
          agent_id: event.agent_id
        });
        pushText(node, 'system', 'command', record['fullCommandText']);
        pushText(node, 'system', 'intention', record['intention']);
        permissionNodes.set(requestId, node);
        host.children.push(node);
        break;
      }
      case 'permission.completed': {
        const requestId = str(data['requestId']) ?? '';
        const node = permissionNodes.get(requestId);
        if (node) {
          const result = data['result'];
          const kind = result !== null && typeof result === 'object' && !Array.isArray(result)
            ? str((result as Record<string, JsonValue>)['kind'])
            : undefined;
          node.status = kind === 'approved' || kind === 'approve-once' || kind === 'approve-session' ? 'ok' : 'error';
          if (kind !== undefined) node.content.push({ role: 'system', label: 'decision', text: kind });
          permissionNodes.delete(requestId);
        }
        break;
      }
      case 'session.shutdown': {
        const aiu = num(data['totalNanoAiu']);
        if (aiu !== undefined) usage.total_nano_aiu = aiu;
        const premium = num(data['totalPremiumRequests']);
        if (premium !== undefined) usage.total_premium_requests = premium;
        root.status = 'ok';
        break;
      }
      default:
        break;
    }
  }

  // Flush chunked messages that never reached chunkCount (stream cut mid-turn).
  for (const assembled of messageOrder) flushMessage(assembled);

  const lastMs = events.length > 0 ? timeMs(events[events.length - 1]!) : undefined;
  root.timestamp_iso = iso(root.timestamp_ms);
  return {
    root,
    ...(model !== undefined ? { model } : {}),
    ...(Object.keys(usage).length > 0 ? { usage } : {}),
    turn_count: turnCount,
    tool_count: toolCount,
    subagent_count: subagentCount,
    error_count: errorCount,
    ...(events[0] ? { started_at_ms: timeMs(events[0]) } : {}),
    ...(lastMs !== undefined ? { last_event_at_ms: lastMs } : {})
  };
}
