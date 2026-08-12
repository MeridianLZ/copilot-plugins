import type { ProjectedStatus } from './trace-projector.js';

/**
 * Reconciles native transcript status against hook lifecycle status into
 * one terminal state, instead of letting a document/session-node/header
 * silently pick whichever lane happened to set a value first. Both lanes
 * are authoritative for different things (native = verbatim transcript
 * completion, hooks = governance lifecycle), so disagreement is preserved
 * as explicit evidence rather than hidden by precedence order.
 *
 * Rules:
 *  1. Any 'error' evidence wins outright.
 *  2. Otherwise any 'recovered' evidence wins (an anomaly, but not a hard
 *     failure — a later explicit error would still take precedence per 1).
 *  3. Otherwise any 'ok' evidence wins.
 *  4. With no explicit evidence from either lane, the session is 'open'.
 */

export type TerminalSource = 'native' | 'hook';

export interface TerminalStatusInput {
  source: TerminalSource;
  status?: ProjectedStatus;
  reason?: string;
}

export interface TerminalStatusEvidence {
  source: TerminalSource;
  status: ProjectedStatus;
  reason?: string;
}

export interface TerminalState {
  status: ProjectedStatus;
  /** True when native and hook evidence disagree on terminal status. */
  conflict: boolean;
  /** Every explicit (non-'open') status observation that fed the decision. */
  evidence: TerminalStatusEvidence[];
}

const RANK: Readonly<Record<ProjectedStatus, number>> = {
  open: -1,
  ok: 0,
  recovered: 1,
  error: 2
};

export function reconcileTerminalStatus(...inputs: readonly TerminalStatusInput[]): TerminalState {
  const evidence: TerminalStatusEvidence[] = [];
  for (const input of inputs) {
    if (input.status === undefined || input.status === 'open') continue;
    evidence.push({
      source: input.source,
      status: input.status,
      ...(input.reason !== undefined ? { reason: input.reason } : {})
    });
  }

  if (evidence.length === 0) return { status: 'open', conflict: false, evidence };

  const status = evidence.reduce<ProjectedStatus>(
    (winner, entry) => (RANK[entry.status] > RANK[winner] ? entry.status : winner),
    evidence[0]!.status
  );
  const distinctStatuses = new Set(evidence.map((entry) => entry.status));
  const conflict = distinctStatuses.size > 1;

  return { status, conflict, evidence };
}
