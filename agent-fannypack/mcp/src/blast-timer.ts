import { z } from 'zod';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/server';

export type DurationUnit = 'ms' | 's' | 'm';

const UNIT_MS: Record<DurationUnit, number> = { ms: 1, s: 1_000, m: 60_000 };

export interface BlastTimerStatus {
  armed: boolean;
  detonated: boolean;
  duration_ms: number | null;
  remaining_ms: number | null;
  deadline: string | null;
  last_signal: string | null;
  check_ins: number;
}

/**
 * Dead-man watchdog. The primary agent starts a countdown; the secondary must
 * report *any* signal before it reaches zero, which resets the full window.
 * Zero means the secondary has failed and the connection is blown up to
 * nothing via the expire callbacks.
 */
export class BlastTimer {
  #durationMs: number | null = null;
  #deadline: number | null = null;
  #handle: ReturnType<typeof setTimeout> | null = null;
  #expireCbs: Array<() => void | Promise<void>> = [];
  #lastSignal: string | null = null;
  #checkIns = 0;
  #detonated = false;

  /** Arm (or re-arm) the countdown. Communicated once; check-ins only reset it. */
  start(opts: { duration: number; unit?: DurationUnit }): { durationMs: number; deadline: Date } {
    const unit = opts.unit ?? 's';
    const durationMs = Math.floor(opts.duration * UNIT_MS[unit]);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new RangeError(`blast timer duration must be positive, got ${opts.duration}${unit}`);
    }
    this.#durationMs = durationMs;
    this.#detonated = false;
    this.#checkIns = 0;
    this.#lastSignal = null;
    this.#arm();
    return { durationMs, deadline: new Date(this.#deadline as number) };
  }

  /**
   * Report a signal within the disappearing window; resets the countdown to
   * the full duration. Returns the new remaining span.
   */
  checkIn(signal?: string): number {
    if (this.#durationMs === null || this.#detonated) {
      throw new Error(this.#detonated ? 'blast timer already detonated' : 'blast timer not armed');
    }
    this.#checkIns += 1;
    this.#lastSignal = signal ?? null;
    this.#arm();
    return this.#durationMs;
  }

  /** Disarm without detonating. */
  stop(): void {
    if (this.#handle !== null) clearTimeout(this.#handle);
    this.#handle = null;
    this.#deadline = null;
    this.#durationMs = null;
  }

  onExpire(cb: () => void | Promise<void>): void {
    this.#expireCbs.push(cb);
  }

  remainingMs(): number | null {
    if (this.#deadline === null) return null;
    return Math.max(0, this.#deadline - Date.now());
  }

  get armed(): boolean {
    return this.#deadline !== null && !this.#detonated;
  }

  get detonated(): boolean {
    return this.#detonated;
  }

  status(): BlastTimerStatus {
    return {
      armed: this.armed,
      detonated: this.#detonated,
      duration_ms: this.#durationMs,
      remaining_ms: this.remainingMs(),
      deadline: this.#deadline === null ? null : new Date(this.#deadline).toISOString(),
      last_signal: this.#lastSignal,
      check_ins: this.#checkIns,
    };
  }

  #arm(): void {
    if (this.#handle !== null) clearTimeout(this.#handle);
    const durationMs = this.#durationMs as number;
    this.#deadline = Date.now() + durationMs;
    this.#handle = setTimeout(() => void this.#detonate(), durationMs);
    // A watchdog must never keep an otherwise-finished process alive.
    this.#handle.unref?.();
  }

  async #detonate(): Promise<void> {
    this.#detonated = true;
    this.#handle = null;
    for (const cb of this.#expireCbs) {
      try {
        await cb();
      } catch {
        // Detonation must run every callback; failures cannot resurrect the connection.
      }
    }
  }
}

export interface BlastTimerToolsOptions {
  /** Share an externally owned timer; a fresh one is created when omitted. */
  timer?: BlastTimer;
  /**
   * What "blown up to nothing" means for the host: close the transport,
   * destroy sessions, purge state. Runs when the countdown hits zero.
   */
  onDetonate?: () => void | Promise<void>;
  /** Tool-name prefix. Default "blast_timer" → blast_timer_start / blast_timer_status; check_in stays unprefixed. */
  prefix?: string;
}

export interface BlastTimerRegistration {
  timer: BlastTimer;
  tools: RegisteredTool[];
}

const startInput = z.object({
  duration: z.number().positive().describe('Countdown length'),
  unit: z.enum(['ms', 's', 'm']).optional().describe('Duration unit override. Default seconds.'),
});

const startOutput = z.object({
  armed: z.literal(true),
  duration_ms: z.number(),
  deadline: z.string(),
});

const checkInInput = z.object({
  signal: z.string().optional().describe('Any signal content; its arrival is what resets the countdown'),
});

const checkInOutput = z.object({
  remaining_ms: z.number(),
  check_ins: z.number(),
});

const statusOutput = z.object({
  armed: z.boolean(),
  detonated: z.boolean(),
  duration_ms: z.number().nullable(),
  remaining_ms: z.number().nullable(),
  deadline: z.string().nullable(),
  last_signal: z.string().nullable(),
  check_ins: z.number(),
});

/**
 * Registers the watchdog tool trio: `<prefix>_start` (primary communicates the
 * window once), `check_in` (secondary reports, resetting the countdown), and
 * `<prefix>_status` (read-only). Pair with {@link withCheckIn} so ordinary
 * action calls double as check-ins.
 */
export function registerBlastTimer(
  server: McpServer,
  opts: BlastTimerToolsOptions = {},
): BlastTimerRegistration {
  const timer = opts.timer ?? new BlastTimer();
  const prefix = opts.prefix ?? 'blast_timer';
  if (opts.onDetonate) timer.onExpire(opts.onDetonate);

  const tools: RegisteredTool[] = [];

  tools.push(
    server.registerTool(
      `${prefix}_start`,
      {
        title: 'Blast timer: start',
        description:
          'Arm the dead-man watchdog: countdown from the given duration to zero. The secondary agent must report a signal (check_in or any action call) before zero or the connection is blown up to nothing.',
        inputSchema: startInput,
        outputSchema: startOutput,
      },
      async ({ duration, unit }) => {
        const { durationMs, deadline } = timer.start({ duration, ...(unit !== undefined ? { unit } : {}) });
        const output = { armed: true as const, duration_ms: durationMs, deadline: deadline.toISOString() };
        return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
      },
    ),
  );

  tools.push(
    server.registerTool(
      'check_in',
      {
        title: 'Blast timer: check in',
        description:
          'Report a liveness signal within the disappearing window; resets the countdown to the full duration.',
        inputSchema: checkInInput,
        outputSchema: checkInOutput,
      },
      async ({ signal }) => {
        timer.checkIn(signal);
        const status = timer.status();
        const output = { remaining_ms: status.remaining_ms ?? 0, check_ins: status.check_ins };
        return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
      },
    ),
  );

  tools.push(
    server.registerTool(
      `${prefix}_status`,
      {
        title: 'Blast timer: status',
        description: 'Read-only view of the watchdog: armed/detonated, remaining time, check-in count.',
        inputSchema: z.object({}),
        outputSchema: statusOutput,
        annotations: { readOnlyHint: true },
      },
      async () => {
        const output = timer.status();
        return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
      },
    ),
  );

  return { timer, tools };
}

/**
 * Wrap an action-tool handler so every invocation doubles as an implicit
 * check-in ("check-in task in tandem with an action call"). No-ops while the
 * timer is unarmed, so hosts can wrap unconditionally.
 */
export function withCheckIn<F extends (...args: never[]) => unknown>(timer: BlastTimer, handler: F): F {
  const wrapped = ((...args: never[]) => {
    if (timer.armed) timer.checkIn('action-call');
    return (handler as (...a: never[]) => unknown)(...args);
  }) as F;
  return wrapped;
}
