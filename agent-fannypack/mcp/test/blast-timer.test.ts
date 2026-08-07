import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { BlastTimer, withCheckIn } from '../src/blast-timer.js';

test('detonates at zero and runs expire callbacks', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const timer = new BlastTimer();
    let detonations = 0;
    timer.onExpire(() => {
      detonations += 1;
    });
    timer.start({ duration: 5 });
    assert.equal(timer.armed, true);
    mock.timers.tick(4_999);
    assert.equal(timer.detonated, false);
    mock.timers.tick(2);
    await Promise.resolve();
    assert.equal(timer.detonated, true);
    assert.equal(timer.armed, false);
    assert.equal(detonations, 1);
    assert.throws(() => timer.checkIn(), /detonated/);
  } finally {
    mock.timers.reset();
  }
});

test('check-in resets the full window', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const timer = new BlastTimer();
    timer.start({ duration: 5 });
    mock.timers.tick(4_000);
    const remaining = timer.checkIn('heartbeat');
    assert.equal(remaining, 5_000);
    mock.timers.tick(4_999);
    assert.equal(timer.detonated, false);
    assert.equal(timer.status().check_ins, 1);
    assert.equal(timer.status().last_signal, 'heartbeat');
    timer.stop();
    mock.timers.tick(60_000);
    assert.equal(timer.detonated, false);
  } finally {
    mock.timers.reset();
  }
});

test('unit override and invalid durations', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const timer = new BlastTimer();
    const { durationMs } = timer.start({ duration: 250, unit: 'ms' });
    assert.equal(durationMs, 250);
    const minutes = timer.start({ duration: 2, unit: 'm' });
    assert.equal(minutes.durationMs, 120_000);
    assert.throws(() => timer.start({ duration: 0 }), RangeError);
    assert.throws(() => timer.start({ duration: -3 }), RangeError);
  } finally {
    mock.timers.reset();
  }
});

test('withCheckIn resets only while armed', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const timer = new BlastTimer();
    let calls = 0;
    const handler = (async () => {
      calls += 1;
      return { content: [] };
    }) as never;
    const wrapped = withCheckIn(timer, handler) as unknown as () => Promise<unknown>;

    await wrapped(); // unarmed: no throw, no check-in
    assert.equal(timer.status().check_ins, 0);

    timer.start({ duration: 5 });
    mock.timers.tick(4_000);
    await wrapped(); // armed: action call doubles as check-in
    assert.equal(timer.status().check_ins, 1);
    assert.equal(timer.remainingMs(), 5_000);
    assert.equal(calls, 2);
  } finally {
    mock.timers.reset();
  }
});
