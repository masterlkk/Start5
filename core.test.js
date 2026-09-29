import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldBreakDown, getTaskSuggestions, formatTime } from '../src/domain.js';
import { startTimer, getRemainingSeconds, getActualFocusSeconds, pauseSession, resumeSession } from '../src/timer.js';

test('specific task does not require breakdown', () => {
  assert.equal(shouldBreakDown('回复老师邮件'), false);
});

test('large task requires breakdown', () => {
  assert.equal(shouldBreakDown('写毕业论文'), true);
  assert.equal(shouldBreakDown('复习考试'), true);
});

test('task suggestions match writing task', () => {
  const result = getTaskSuggestions('写毕业论文');
  assert.equal(result.category, 'writing');
  assert.ok(result.suggestions.length <= 4);
  assert.ok(result.suggestions.includes('修改一小段'));
});

test('formatTime always uses MM:SS', () => {
  assert.equal(formatTime(300), '05:00');
  assert.equal(formatTime(9), '00:09');
  assert.equal(formatTime(-1), '00:00');
});

test('timestamp timer remains accurate', () => {
  const start = 1_000_000;
  const timer = startTimer(300, start);
  assert.equal(timer.endAt, start + 300_000);
  assert.equal(getRemainingSeconds(timer.endAt, start + 30_000), 270);
  assert.equal(getRemainingSeconds(timer.endAt, start + 301_000), 0);
});

test('pause and resume preserve remaining time', () => {
  const base = {
    status: 'running', endAt: 1_300_000, pauseCount: 0,
    totalPauseSeconds: 0, remainingAtPause: null, pauseStartedAt: null
  };
  const paused = pauseSession(base, 1_100_000);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.remainingAtPause, 200_000);
  assert.equal(paused.pauseCount, 1);
  const resumed = resumeSession(paused, 1_130_000);
  assert.equal(resumed.status, 'running');
  assert.equal(resumed.endAt, 1_330_000);
  assert.equal(resumed.totalPauseSeconds, 30);
});

test('actual focus time excludes pauses', () => {
  assert.equal(getActualFocusSeconds(1_000_000, 1_180_000, 30), 150);
});
