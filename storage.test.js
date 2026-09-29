import test from 'node:test';
import assert from 'node:assert/strict';

class FakeStorage {
  constructor(){ this.map = new Map(); }
  getItem(k){ return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k,v){ this.map.set(k,String(v)); }
  removeItem(k){ this.map.delete(k); }
  clear(){ this.map.clear(); }
}

globalThis.localStorage = new FakeStorage();
const { STORAGE_KEYS } = await import('../src/domain.js');
const { initStorage, taskRepository, sessionRepository, feedbackRepository } = await import('../src/storage.js');

test('storage initializes schema', () => {
  initStorage();
  assert.equal(localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION), '1');
});

test('task repository upserts and reads', () => {
  const task = { id:'task_1', originalText:'test' };
  taskRepository.create(task);
  assert.equal(taskRepository.getById('task_1').originalText, 'test');
  taskRepository.update({ ...task, originalText:'updated' });
  assert.equal(taskRepository.getById('task_1').originalText, 'updated');
  assert.equal(taskRepository.list().length, 1);
});

test('active session missing entity cleans active id', () => {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_FOCUS_ID, 'missing');
  assert.equal(sessionRepository.getActive(), null);
  assert.equal(localStorage.getItem(STORAGE_KEYS.ACTIVE_FOCUS_ID), null);
});

test('feedback is idempotent per session', () => {
  const a = { id:'fb_1', sessionId:'s1', result:'continued', createdAt:1 };
  const b = { id:'fb_2', sessionId:'s1', result:'stuck', createdAt:2 };
  feedbackRepository.create(a);
  const result = feedbackRepository.create(b);
  assert.equal(result.id, 'fb_1');
  assert.equal(feedbackRepository.list().filter(x=>x.sessionId==='s1').length, 1);
});

test('corrupt array data degrades to empty collection', () => {
  localStorage.setItem(STORAGE_KEYS.TASKS, '{bad json');
  assert.deepEqual(taskRepository.list(), []);
});
