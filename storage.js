import { STORAGE_KEYS } from './domain.js';

function safeParse(raw, fallback) {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readArray(key) {
  const value = safeParse(localStorage.getItem(key), []);
  if (!Array.isArray(value)) {
    localStorage.removeItem(key);
    return [];
  }
  return value;
}

function writeArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function upsert(key, item) {
  const items = readArray(key);
  const index = items.findIndex(x => x.id === item.id);
  if (index >= 0) items[index] = item;
  else items.push(item);
  writeArray(key, items);
  return item;
}

export const taskRepository = {
  list: () => readArray(STORAGE_KEYS.TASKS),
  getById(id) { return this.list().find(x => x.id === id) || null; },
  create(task) { return upsert(STORAGE_KEYS.TASKS, task); },
  update(task) { return upsert(STORAGE_KEYS.TASKS, task); }
};

export const sessionRepository = {
  list: () => readArray(STORAGE_KEYS.FOCUS_SESSIONS),
  getById(id) { return this.list().find(x => x.id === id) || null; },
  create(session) { return upsert(STORAGE_KEYS.FOCUS_SESSIONS, session); },
  update(session) { return upsert(STORAGE_KEYS.FOCUS_SESSIONS, session); },
  getActive() {
    const id = localStorage.getItem(STORAGE_KEYS.ACTIVE_FOCUS_ID);
    if (!id) return null;
    const item = this.getById(id);
    if (!item) localStorage.removeItem(STORAGE_KEYS.ACTIVE_FOCUS_ID);
    return item;
  },
  setActive(id) {
    if (id) localStorage.setItem(STORAGE_KEYS.ACTIVE_FOCUS_ID, id);
    else localStorage.removeItem(STORAGE_KEYS.ACTIVE_FOCUS_ID);
  }
};

export const feedbackRepository = {
  list: () => readArray(STORAGE_KEYS.FEEDBACK),
  getBySessionId(sessionId) { return this.list().find(x => x.sessionId === sessionId) || null; },
  create(feedback) {
    const existing = this.getBySessionId(feedback.sessionId);
    if (existing) return existing;
    return upsert(STORAGE_KEYS.FEEDBACK, feedback);
  }
};

export const rescueRepository = {
  list: () => readArray(STORAGE_KEYS.RESCUE_SESSIONS),
  getById(id) { return this.list().find(x => x.id === id) || null; },
  create(session) { return upsert(STORAGE_KEYS.RESCUE_SESSIONS, session); },
  update(session) { return upsert(STORAGE_KEYS.RESCUE_SESSIONS, session); },
  getActive() {
    const id = localStorage.getItem(STORAGE_KEYS.ACTIVE_RESCUE_ID);
    if (!id) return null;
    const item = this.getById(id);
    if (!item) localStorage.removeItem(STORAGE_KEYS.ACTIVE_RESCUE_ID);
    return item;
  },
  setActive(id) {
    if (id) localStorage.setItem(STORAGE_KEYS.ACTIVE_RESCUE_ID, id);
    else localStorage.removeItem(STORAGE_KEYS.ACTIVE_RESCUE_ID);
  }
};

export function initStorage() {
  if (!localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION)) {
    localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, '1');
  }
}

export function clearAllData() {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  initStorage();
}
