import {
  STORAGE_KEYS,
  createId,
  shouldBreakDown,
  getTaskSuggestions,
  formatTime,
  rescueCategoryPrompt
} from './domain.js';
import { startTimer, getRemainingSeconds, getActualFocusSeconds, pauseSession, resumeSession } from './timer.js';
import {
  initStorage,
  taskRepository,
  sessionRepository,
  feedbackRepository,
  rescueRepository,
  clearAllData
} from './storage.js';

const app = document.getElementById('app');
const overlay = document.getElementById('overlay-root');
let intervalId = null;
let isSubmitting = false;
let currentHash = location.hash || '#/';
let bypassRouteGuard = false;
let pendingExitFromBack = false;

initStorage();
registerServiceWorker();

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function now() { return Date.now(); }
function dateKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function parseHash(hash = location.hash) {
  const raw = (hash || '#/').replace(/^#/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { path: path || '/', parts, query: new URLSearchParams(query) };
}
function navigate(path, { replace = false } = {}) {
  const hash = `#${path.startsWith('/') ? path : `/${path}`}`;
  bypassRouteGuard = true;
  currentHash = hash;
  if (replace) history.replaceState(null, '', hash);
  else location.hash = hash;
  queueMicrotask(() => { bypassRouteGuard = false; });
  renderRoute();
}
function clearTimerLoop() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}
function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  overlay.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}
function showSheet({ title, body, primaryLabel, secondaryLabel, onPrimary, onSecondary, onBackdrop }) {
  overlay.innerHTML = `
    <div class="sheet-backdrop" id="sheet-backdrop">
      <section class="sheet fade-in" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <h2 id="sheet-title">${escapeHtml(title)}</h2>
        ${body ? `<p>${escapeHtml(body)}</p>` : ''}
        <button class="primary-btn" id="sheet-primary">${escapeHtml(primaryLabel)}</button>
        ${secondaryLabel ? `<button class="text-btn" id="sheet-secondary">${escapeHtml(secondaryLabel)}</button>` : ''}
      </section>
    </div>`;
  document.getElementById('sheet-primary').onclick = () => { overlay.innerHTML = ''; onPrimary?.(); };
  const secondary = document.getElementById('sheet-secondary');
  if (secondary) secondary.onclick = () => { overlay.innerHTML = ''; onSecondary?.(); };
  document.getElementById('sheet-backdrop').onclick = e => {
    if (e.target.id === 'sheet-backdrop') {
      overlay.innerHTML = '';
      (onBackdrop || onPrimary)?.();
    }
  };
}


function createTask(originalText) {
  const t = now();
  const task = {
    id: createId('task'), originalText: originalText.trim(), actionText: null,
    actionSource: 'none', status: 'created', breakdownCount: 0,
    createdAt: t, updatedAt: t
  };
  taskRepository.create(task);
  return task;
}
function createFocusSession({ taskId = null, parentSessionId = null, parentRescueSessionId = null, source, plannedSeconds, chainId = null }) {
  const t = now();
  const timer = startTimer(plannedSeconds, t);
  const session = {
    id: createId('focus'), chainId: chainId || createId('chain'), taskId, parentSessionId, parentRescueSessionId,
    source, plannedSeconds, startedAt: timer.startedAt, endAt: timer.endAt,
    endedAt: null, status: 'running', remainingAtPause: null, pauseStartedAt: null,
    pauseCount: 0, totalPauseSeconds: 0, actualFocusSeconds: 0,
    createdAt: t, updatedAt: t
  };
  sessionRepository.create(session);
  sessionRepository.setActive(session.id);
  rescueRepository.setActive(null);
  return session;
}
function finishFocusSession(session, status = 'completed') {
  const t = now();
  const actual = status === 'completed'
    ? session.plannedSeconds
    : Math.min(session.plannedSeconds, getActualFocusSeconds(session.startedAt, t, session.totalPauseSeconds || 0));
  const updated = { ...session, status, endedAt: t, actualFocusSeconds: actual, updatedAt: t };
  sessionRepository.update(updated);
  sessionRepository.setActive(null);
  return updated;
}
function getTaskForSession(session) {
  return session.taskId ? taskRepository.getById(session.taskId) : null;
}
function taskDisplayText(session) {
  const task = getTaskForSession(session);
  if (task) return task.actionText || task.originalText;
  if (session.source === 'rescue_continue') return '继续刚才的事';
  return '继续当前这件事';
}

function successfulChainIds() {
  const ids = new Set();
  sessionRepository.list().forEach(s => {
    const success = (s.status === 'completed' && (s.plannedSeconds === 300 || s.plannedSeconds === 120)) ||
      (s.status === 'early_end' && s.actualFocusSeconds >= 120);
    if (success && s.chainId) ids.add(`${dateKey(s.endedAt || s.updatedAt)}::${s.chainId}`);
  });
  rescueRepository.list().forEach(r => {
    const success = r.status === 'completed' || (r.status === 'early_end' && r.actualSeconds >= 60);
    if (success && r.chainId) ids.add(`${dateKey(r.endedAt || r.updatedAt)}::${r.chainId}`);
  });
  return ids;
}
function todayStartCount() {
  const prefix = `${dateKey()}::`;
  return [...successfulChainIds()].filter(x => x.startsWith(prefix)).length;
}
function weeklyStats() {
  const sevenDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
  const chains = new Set();
  let total = 0;
  let continued = 0;
  sessionRepository.list().forEach(s => {
    if ((s.endedAt || s.updatedAt) >= sevenDaysAgo) {
      total += s.actualFocusSeconds || 0;
      if (s.source === 'five_min_completion' && s.status === 'completed') continued += 1;
      const success = (s.status === 'completed' && (s.plannedSeconds === 300 || s.plannedSeconds === 120)) || (s.status === 'early_end' && s.actualFocusSeconds >= 120);
      if (success && s.chainId) chains.add(s.chainId);
    }
  });
  rescueRepository.list().forEach(r => {
    if ((r.endedAt || r.updatedAt) >= sevenDaysAgo && r.status === 'completed') {
      total += r.actualSeconds || 120;
      if (r.chainId) chains.add(r.chainId);
    }
  });
  return { starts: chains.size, continued, totalSeconds: total };
}

function renderHome() {
  clearTimerLoop();
  const count = todayStartCount();
  app.innerHTML = `
    <section class="page fade-in">
      <header class="topbar">
        <div class="brand-name">先做5分钟</div>
        <button class="top-link" id="history-link">记录</button>
      </header>
      <div class="hero">
        <h1>别想着做完。<br>先做5分钟。</h1>
        <p>把现在最不想开始的事写下来。</p>
      </div>
      <div class="task-input-wrap">
        <textarea id="task-input" class="task-input" maxlength="60" rows="3" aria-label="当前要开始的任务" placeholder="你现在最不想开始的是什么？"></textarea>
        <div class="input-meta"><span id="task-count"></span></div>
      </div>
      <button class="primary-btn" id="start-btn" aria-label="开始5分钟任务" disabled>先做5分钟</button>
      <button class="text-btn center" id="rescue-btn">我完全不想动 →</button>
      <div class="today-summary" id="today-summary">${count ? `今天已经开始 <strong>${count}</strong> 次` : '今天还没有开始过。'}</div>
      <div class="privacy-note">所有任务默认仅保存在你的设备中。</div>
    </section>`;
  const input = document.getElementById('task-input');
  const start = document.getElementById('start-btn');
  const counter = document.getElementById('task-count');
  input.addEventListener('input', () => {
    const len = input.value.length;
    start.disabled = input.value.trim().length === 0;
    counter.textContent = len >= 45 ? `${len} / 60` : '';
  });
  input.addEventListener('blur', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  start.onclick = () => {
    if (isSubmitting) return;
    const text = input.value.trim();
    if (!text) return toast('先写下你要开始的事。');
    isSubmitting = true;
    start.disabled = true;
    start.textContent = '正在开始…';
    try {
      const task = createTask(text);
      if (shouldBreakDown(text)) {
        navigate(`/breakdown/${task.id}?source=home`);
      } else {
        task.actionText = task.originalText;
        task.status = 'in_progress';
        task.updatedAt = now();
        taskRepository.update(task);
        const session = createFocusSession({ taskId: task.id, source: 'home', plannedSeconds: 300 });
        navigate(`/focus/${session.id}`);
      }
    } finally { isSubmitting = false; }
  };
  document.getElementById('rescue-btn').onclick = () => navigate('/rescue');
  document.getElementById('history-link').onclick = () => navigate('/history');
  document.getElementById('today-summary').onclick = () => navigate('/history');
}

function renderBreakdown(taskId, query) {
  clearTimerLoop();
  const task = taskRepository.getById(taskId);
  if (!task) { toast('这次任务没有正确读取。'); navigate('/', { replace: true }); return; }
  const source = query.get('source') || 'home';
  const { suggestions } = getTaskSuggestions(task.originalText);
  let selected = null;
  let customOpen = false;
  app.innerHTML = `
    <section class="page fade-in">
      <header class="topbar"><button class="icon-btn" id="back-btn" aria-label="返回">‹</button><span></span></header>
      <div class="content-header">
        <div class="eyebrow">你刚才写的是：</div>
        <div class="task-recap">${escapeHtml(task.originalText)}</div>
      </div>
      <div class="content-header" style="margin-top:38px">
        <h1 class="page-title">先把它缩小一点。</h1>
        <p class="subtitle">选一个5分钟内能开始的第一步。</p>
      </div>
      <div class="suggestion-list" id="suggestions">
        ${suggestions.map((s,i)=>`<button class="suggestion-card" data-index="${i}" data-text="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}
      </div>
      <button class="custom-link" id="custom-link">都不合适？自己写第一步</button>
      <div id="custom-box"></div>
      <div class="helper">小到觉得“这也算任务？”就差不多了。</div>
      <div class="sticky-action"><button class="primary-btn" id="breakdown-start" disabled>就从这个开始</button></div>
    </section>`;
  const startBtn = document.getElementById('breakdown-start');
  function refreshSelection() {
    document.querySelectorAll('.suggestion-card').forEach((el, i) => el.classList.toggle('selected', selected?.type === 'preset' && selected.index === i));
    startBtn.disabled = !selected?.text?.trim();
  }
  document.querySelectorAll('.suggestion-card').forEach((el, i) => {
    el.onclick = () => {
      selected = { type:'preset', index:i, text: suggestions[i] };
      const customInput = document.getElementById('custom-action');
      if (customInput) customInput.value = '';
      refreshSelection();
    };
  });
  document.getElementById('custom-link').onclick = () => {
    if (customOpen) return document.getElementById('custom-action')?.focus();
    customOpen = true;
    document.getElementById('custom-box').innerHTML = `
      <div class="custom-box">
        <textarea class="task-input custom-input" id="custom-action" maxlength="40" rows="2" placeholder="例如：先把文件打开"></textarea>
        <div class="input-meta"><span id="custom-count"></span></div>
      </div>`;
    const input = document.getElementById('custom-action');
    input.focus();
    input.oninput = () => {
      const text = input.value.trim();
      document.getElementById('custom-count').textContent = input.value.length >= 30 ? `${input.value.length} / 40` : '';
      selected = text ? { type:'custom', text } : null;
      refreshSelection();
    };
  };
  document.getElementById('back-btn').onclick = () => source === 'stuck' && task.lastFeedbackSessionId ? navigate(`/feedback/${task.lastFeedbackSessionId}`) : navigate('/');
  startBtn.onclick = () => {
    if (isSubmitting || !selected?.text?.trim()) return;
    isSubmitting = true; startBtn.disabled = true; startBtn.textContent = '正在开始…';
    task.actionText = selected.text.trim();
    task.actionSource = selected.type;
    task.status = 'in_progress';
    task.breakdownCount = (task.breakdownCount || 0) + 1;
    task.updatedAt = now();
    taskRepository.update(task);
    const session = createFocusSession({ taskId: task.id, source: 'task_breakdown', plannedSeconds: 300 });
    isSubmitting = false;
    navigate(`/focus/${session.id}`);
  };
}

function focusProgress(session, remaining) {
  return Math.max(0, Math.min(1, (session.plannedSeconds - remaining) / session.plannedSeconds));
}

function renderFocus(sessionId) {
  clearTimerLoop();
  let session = sessionRepository.getById(sessionId);
  if (!session) { toast('这次计时没有正确读取。'); navigate('/', { replace:true }); return; }
  if (session.status === 'completed' || session.status === 'early_end') { navigate(`/feedback/${session.id}`, { replace:true }); return; }
  if (session.status === 'running' && (!session.endAt || !session.startedAt)) return renderTimerError(session);
  if (session.status === 'running' && session.endAt <= now()) {
    session = finishFocusSession(session, 'completed');
    navigate(`/feedback/${session.id}`, { replace:true }); return;
  }
  const isPaused = session.status === 'paused';
  const remaining = isPaused ? Math.ceil((session.remainingAtPause || 0)/1000) : getRemainingSeconds(session.endAt);
  const label = session.plannedSeconds === 120 && session.source === 'stuck_recovery' ? '再试这一点点' : (session.plannedSeconds === 600 ? '顺着刚才继续' : '现在只做这一件事');
  const hint = isPaused ? '暂停一下也没关系。' : (session.plannedSeconds === 600 ? '不用重新计划，就继续做刚才那件事。' : '不用做完，只做到时间结束。');
  const circumference = 2 * Math.PI * 92;
  const progress = focusProgress(session, remaining);
  app.innerHTML = `
    <section class="page focus-page fade-in">
      <div class="focus-top"><button class="icon-btn" id="focus-close" aria-label="退出本次计时">×</button></div>
      <div class="focus-center">
        <div class="focus-label">${label}</div>
        <div class="focus-task">${escapeHtml(taskDisplayText(session))}</div>
        <div class="timer-wrap">
          <svg class="progress-ring" viewBox="0 0 200 200" aria-hidden="true">
            <circle class="track" cx="100" cy="100" r="92"></circle>
            <circle class="progress" id="progress-circle" cx="100" cy="100" r="92" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1-progress)}"></circle>
          </svg>
          <div class="timer" id="timer-value">${formatTime(remaining)}</div>
        </div>
        <div class="focus-hint" id="focus-hint">${hint}</div>
      </div>
      <div class="focus-controls">
        <button class="primary-btn" id="pause-btn" aria-label="${isPaused ? '继续计时' : '暂停计时'}">${isPaused ? '继续' : '暂停'}</button>
        <button class="text-btn center" id="early-btn">${isPaused ? '结束这次' : '提前结束'}</button>
      </div>
    </section>`;

  const timerEl = document.getElementById('timer-value');
  const progressEl = document.getElementById('progress-circle');
  const hintEl = document.getElementById('focus-hint');
  let lastSecond = remaining;

  function tick() {
    session = sessionRepository.getById(sessionId);
    if (!session) return;
    if (session.status === 'paused') return;
    const seconds = getRemainingSeconds(session.endAt);
    if (seconds !== lastSecond) {
      lastSecond = seconds;
      timerEl.textContent = formatTime(seconds);
      const p = focusProgress(session, seconds);
      progressEl.style.strokeDashoffset = String(circumference * (1-p));
    }
    if (seconds <= 0) {
      clearTimerLoop();
      finishFocusSession(session, 'completed');
      if (navigator.vibrate) navigator.vibrate(70);
      setTimeout(() => navigate(`/feedback/${session.id}`, { replace:true }), 500);
    }
  }
  if (!isPaused) intervalId = setInterval(tick, 250);

  document.getElementById('pause-btn').onclick = () => {
    session = sessionRepository.getById(sessionId);
    if (!session) return;
    if (session.status === 'running') {
      session = pauseSession(session);
      sessionRepository.update(session);
      clearTimerLoop();
      renderFocus(sessionId);
    } else if (session.status === 'paused') {
      session = resumeSession(session);
      sessionRepository.update(session);
      renderFocus(sessionId);
    }
  };
  const requestEarlyEnd = () => showFocusExitSheet(sessionId);
  document.getElementById('focus-close').onclick = requestEarlyEnd;
  document.getElementById('early-btn').onclick = requestEarlyEnd;
}

function showFocusExitSheet(sessionId) {
  const session = sessionRepository.getById(sessionId);
  if (!session) return;
  showSheet({
    title: `现在结束这${session.plannedSeconds === 120 ? '2' : session.plannedSeconds === 600 ? '10' : '5'}分钟吗？`,
    body: '已经做的时间也会被记录。',
    primaryLabel: '继续做',
    secondaryLabel: '结束这次',
    onPrimary: () => pendingExitFromBack = false,
    onSecondary: () => {
      pendingExitFromBack = false;
      const latest = sessionRepository.getById(sessionId);
      if (!latest) return navigate('/');
      finishFocusSession(latest, 'early_end');
      navigate(`/feedback/${sessionId}`);
    }
  });
}

function renderTimerError(session) {
  clearTimerLoop();
  app.innerHTML = `
    <section class="page"><div class="error-state">
      <h1>这次计时没有正确恢复。</h1>
      <p>可以重新开始，之前的异常计时不会继续运行。</p>
      <button class="primary-btn" id="restart">重新开始${session.plannedSeconds === 120 ? '2' : '5'}分钟</button>
      <button class="text-btn center" id="home">回首页</button>
    </div></section>`;
  document.getElementById('restart').onclick = () => {
    session.status = 'abandoned'; session.updatedAt = now(); sessionRepository.update(session); sessionRepository.setActive(null);
    const fresh = createFocusSession({ taskId: session.taskId, source: session.source, plannedSeconds: session.plannedSeconds, chainId: session.chainId });
    navigate(`/focus/${fresh.id}`);
  };
  document.getElementById('home').onclick = () => navigate('/');
}

function createFeedback(session, result, stuckReason = null, nextAction = null) {
  return feedbackRepository.create({
    id: createId('feedback'), sessionId: session.id, taskId: session.taskId || null,
    result, stuckReason, nextAction, createdAt: now()
  });
}

function renderFeedback(sessionId) {
  clearTimerLoop();
  const session = sessionRepository.getById(sessionId);
  if (!session) { toast('这次计时没有正确读取。'); navigate('/', { replace:true }); return; }
  if (!['completed','early_end'].includes(session.status)) { navigate(`/focus/${session.id}`, { replace:true }); return; }
  const existing = feedbackRepository.getBySessionId(sessionId);
  if (existing?.nextAction === 'continue_10min' || existing?.nextAction === 'retry_2min') {
    const child = sessionRepository.list().find(s => s.parentSessionId === session.id && ['running','paused'].includes(s.status));
    if (child) return navigate(`/focus/${child.id}`, { replace:true });
  }

  if (existing?.nextAction === 'stop_today' || existing?.nextAction === 'home') {
    return renderFeedbackAlreadyDone();
  }
  if (existing?.nextAction === 'break_down_task' && session.taskId) {
    return navigate(`/breakdown/${session.taskId}?source=stuck`, { replace:true });
  }

  if (session.plannedSeconds === 600) return renderExtendedDone(session);
  if (session.plannedSeconds === 120 && session.source === 'stuck_recovery') return renderRetryFeedback(session);
  const task = getTaskForSession(session);
  if (task) { task.lastFeedbackSessionId = session.id; task.updatedAt = now(); taskRepository.update(task); }

  if (session.status === 'early_end') return renderEarlyFeedback(session);
  renderMainFeedback(session);
}

function renderMainFeedback(session) {
  app.innerHTML = `
    <section class="page feedback-page fade-in">
      <div class="content-header">
        <div class="eyebrow">5分钟到了</div>
        <div class="eyebrow" style="margin-top:22px">你刚才在做：</div>
        <div class="task-recap">${escapeHtml(taskDisplayText(session))}</div>
      </div>
      <div class="feedback-question">
        <h1>现在怎么样？</h1>
        <p class="subtitle">选最接近你现在状态的一项。</p>
      </div>
      <div class="feedback-actions">
        <button class="choice-btn primary" id="continue10">进入状态了，继续10分钟</button>
        <button class="choice-btn soft" id="stop">做了一点，今天先这样</button>
        <button class="choice-btn textual" id="stuck">还是不想做</button>
      </div>
    </section>`;
  document.getElementById('continue10').onclick = () => continueFromFeedback(session, 600, 'continued', 'continue_10min', 'five_min_completion');
  document.getElementById('stop').onclick = () => stopAfterFeedback(session);
  document.getElementById('stuck').onclick = () => renderStuckReasons(session);
}

function continueFromFeedback(session, seconds, result, nextAction, source) {
  if (isSubmitting) return;
  isSubmitting = true;
  const existing = feedbackRepository.getBySessionId(session.id);
  if (existing) {
    const child = sessionRepository.list().find(s => s.parentSessionId === session.id);
    isSubmitting = false;
    return child ? navigate(`/focus/${child.id}`) : navigate('/');
  }
  createFeedback(session, result, null, nextAction);
  const child = createFocusSession({
    taskId: session.taskId, parentSessionId: session.id, source,
    plannedSeconds: seconds, chainId: session.chainId
  });
  isSubmitting = false;
  navigate(`/focus/${child.id}`);
}

function stopAfterFeedback(session, label = '已经开始过，就不算没做。') {
  if (!feedbackRepository.getBySessionId(session.id)) createFeedback(session, 'partial_stop', null, 'stop_today');
  const task = getTaskForSession(session);
  if (task) { task.status = 'partial'; task.updatedAt = now(); taskRepository.update(task); }
  app.innerHTML = `
    <section class="page fade-in"><div class="done-state">
      <div class="done-check">✓</div>
      <h1>${escapeHtml(label)}</h1>
      <p>今天成功启动了一次。</p>
      <button class="primary-btn" id="home-btn">回到首页</button>
    </div></section>`;
  document.getElementById('home-btn').onclick = () => navigate('/');
}

function renderStuckReasons(session) {
  app.innerHTML = `
    <section class="page feedback-page fade-in">
      <header class="topbar"><button class="icon-btn" id="back-feedback">‹</button><span></span></header>
      <div class="feedback-question" style="margin-top:40px">
        <h1>卡在哪里？</h1>
        <p class="subtitle">不用分析太多，选一个最接近的。</p>
      </div>
      <div class="reason-grid">
        <button class="choice-btn" data-reason="too_hard">太难</button>
        <button class="choice-btn" data-reason="too_tired">太累</button>
        <button class="choice-btn" data-reason="dont_know_how">不知道从哪开始</button>
        <button class="choice-btn" data-reason="too_big">任务太大</button>
        <button class="choice-btn" data-reason="interrupted">被打断了</button>
        <button class="choice-btn" data-reason="other">其他</button>
      </div>
    </section>`;
  document.getElementById('back-feedback').onclick = () => renderMainFeedback(session);
  document.querySelectorAll('[data-reason]').forEach(btn => btn.onclick = () => renderRecoveryAction(session, btn.dataset.reason));
}

function renderRecoveryAction(session, reason) {
  const map = {
    too_hard: { title:'那就先别解决它。', body:'只找出一个你不会的地方。', action:'retry' },
    too_tired: { title:'那今天不用硬撑。', body:'先把这件事留到下一次。', action:'stop' },
    dont_know_how: { title:'把第一步缩小。', body:'找到一个小到现在就能开始的动作。', action:'breakdown' },
    too_big: { title:'那就再缩小一点。', body:'任务越小，开始越容易。', action:'breakdown' },
    interrupted: { title:'没关系，回来就算继续。', body:'再给自己两分钟就好。', action:'retry' },
    other: { title:'那就先做最小的一点。', body:'不用解决全部，只再试两分钟。', action:'retry' }
  };
  const c = map[reason];
  app.innerHTML = `
    <section class="page fade-in">
      <header class="topbar"><button class="icon-btn" id="back-reason">‹</button><span></span></header>
      <div class="recovery-card">
        <h2>${c.title}</h2><p>${c.body}</p>
        ${c.action === 'retry' ? '<button class="primary-btn" id="recovery-main">再试2分钟</button><button class="text-btn center" id="recovery-stop">今天先这样</button>' : ''}
        ${c.action === 'breakdown' ? '<button class="primary-btn" id="recovery-main">重新拆一下</button>' : ''}
        ${c.action === 'stop' ? '<button class="primary-btn" id="recovery-stop">今天先这样</button>' : ''}
      </div>
    </section>`;
  document.getElementById('back-reason').onclick = () => renderStuckReasons(session);
  const main = document.getElementById('recovery-main');
  const stop = document.getElementById('recovery-stop');
  if (main && c.action === 'retry') main.onclick = () => {
    if (feedbackRepository.getBySessionId(session.id)) return;
    createFeedback(session, 'stuck', reason, 'retry_2min');
    const child = createFocusSession({ taskId:session.taskId, parentSessionId:session.id, source:'stuck_recovery', plannedSeconds:120, chainId:session.chainId });
    navigate(`/focus/${child.id}`);
  };
  if (main && c.action === 'breakdown') main.onclick = () => {
    if (!feedbackRepository.getBySessionId(session.id)) createFeedback(session, 'stuck', reason, 'break_down_task');
    const task = getTaskForSession(session);
    if (!task) return navigate('/');
    task.lastFeedbackSessionId = session.id; task.updatedAt = now(); taskRepository.update(task);
    navigate(`/breakdown/${task.id}?source=stuck`);
  };
  if (stop) stop.onclick = () => {
    if (!feedbackRepository.getBySessionId(session.id)) createFeedback(session, 'stuck', reason, 'stop_today');
    stopAfterFeedback(session, '今天先这样，也可以。');
  };
}

function renderRetryFeedback(session) {
  app.innerHTML = `
    <section class="page feedback-page fade-in">
      <div class="feedback-question" style="margin-top:32vh">
        <div class="eyebrow">2分钟到了</div>
        <h1 style="margin-top:10px">现在呢？</h1>
      </div>
      <div class="feedback-actions">
        <button class="choice-btn primary" id="retry-continue">可以继续</button>
        <button class="choice-btn soft" id="retry-stop">今天到这里</button>
      </div>
    </section>`;
  document.getElementById('retry-continue').onclick = () => {
    if (feedbackRepository.getBySessionId(session.id)) return;
    createFeedback(session, 'continued', null, 'continue_10min');
    const child = createFocusSession({ taskId:session.taskId, parentSessionId:session.id, source:'stuck_recovery', plannedSeconds:300, chainId:session.chainId });
    navigate(`/focus/${child.id}`);
  };
  document.getElementById('retry-stop').onclick = () => stopAfterFeedback(session, '做了一点，今天就到这里。');
}

function renderFeedbackAlreadyDone() {
  app.innerHTML = `
    <section class="page fade-in"><div class="done-state">
      <div class="done-check">✓</div>
      <h1>这次已经记录好了。</h1>
      <p>不用再处理这一页，回去继续自己的节奏。</p>
      <button class="primary-btn" id="done-home">回到首页</button>
    </div></section>`;
  document.getElementById('done-home').onclick = () => navigate('/');
}

function renderExtendedDone(session) {
  app.innerHTML = `
    <section class="page fade-in"><div class="done-state">
      <div class="done-check">✓</div>
      <h1>10分钟到了。</h1>
      <p>你已经顺着刚才继续了一段时间，今天可以先到这里。</p>
      <button class="primary-btn" id="extended-home">回到首页</button>
    </div></section>`;
  document.getElementById('extended-home').onclick = () => navigate('/');
}

function renderEarlyFeedback(session) {
  app.innerHTML = `
    <section class="page feedback-page fade-in">
      <div class="content-header"><div class="eyebrow">这次先到这里</div><div class="task-recap" style="margin-top:12px">${escapeHtml(taskDisplayText(session))}</div></div>
      <div class="feedback-question"><h1>现在怎么样？</h1></div>
      <div class="feedback-actions">
        <button class="choice-btn primary" id="early-partial">做了一点，先停</button>
        <button class="choice-btn soft" id="early-retry">再试2分钟</button>
        <button class="choice-btn textual" id="early-stuck">还是不想做</button>
      </div>
    </section>`;
  document.getElementById('early-partial').onclick = () => stopAfterFeedback(session, '已经做了一点，先停也可以。');
  document.getElementById('early-retry').onclick = () => {
    if (!feedbackRepository.getBySessionId(session.id)) createFeedback(session, 'stuck', 'other', 'retry_2min');
    const child = createFocusSession({ taskId:session.taskId, parentSessionId:session.id, source:'stuck_recovery', plannedSeconds:120, chainId:session.chainId });
    navigate(`/focus/${child.id}`);
  };
  document.getElementById('early-stuck').onclick = () => renderStuckReasons(session);
}

function createRescue() {
  const t = now();
  const rescue = {
    id:createId('rescue'), chainId:createId('chain'), step:'intro', status:'not_started', selectedCategory:null,
    plannedSeconds:120, startedAt:null, endAt:null, endedAt:null, remainingAtPause:null, pauseStartedAt:null,
    pauseCount:0, totalPauseSeconds:0, actualSeconds:0, result:null, nextAction:null,
    createdAt:t, updatedAt:t
  };
  rescueRepository.create(rescue); rescueRepository.setActive(rescue.id); sessionRepository.setActive(null);
  return rescue;
}
function updateRescue(rescue, patch) {
  const updated = { ...rescue, ...patch, updatedAt:now() };
  rescueRepository.update(updated); return updated;
}

function renderRescue() {
  clearTimerLoop();
  let rescue = rescueRepository.getActive();
  if (!rescue || ['done','abandoned'].includes(rescue.step) || ['early_end'].includes(rescue.status)) rescue = createRescue();
  if (rescue.step === 'timer' && rescue.status === 'running' && rescue.endAt <= now()) {
    rescue = completeRescue(rescue); rescue.step = 'complete'; rescueRepository.update(rescue);
  }
  const renderers = {
    intro: renderRescueIntro, prepare: renderRescuePrepare, open_target: renderRescueOpenTarget,
    category_select: renderRescueCategory, ready: renderRescueReady, timer: renderRescueTimer,
    complete: renderRescueComplete, still_stuck: renderRescueStillStuck, done: () => navigate('/')
  };
  (renderers[rescue.step] || renderRescueIntro)(rescue);
}
function rescueShell(content) {
  app.innerHTML = `<section class="page rescue-page fade-in">${content}</section>`;
}
function renderRescueIntro(rescue) {
  rescueShell(`<div class="rescue-step"><div class="eyebrow">没关系，先什么都别计划。</div><h1>我们只做一个很小的动作。</h1><p class="lead">不需要想任务，也不用做完。</p><button class="primary-btn" id="r-main">开始</button><button class="text-btn" id="r-home">回首页</button></div>`);
  document.getElementById('r-main').onclick = () => { updateRescue(rescue,{step:'prepare'}); renderRescue(); };
  document.getElementById('r-home').onclick = () => { updateRescue(rescue,{step:'done',status:'abandoned'}); rescueRepository.setActive(null); navigate('/'); };
}
function renderRescuePrepare(rescue) {
  rescueShell(`<div class="rescue-step"><h1>先让自己动一下。</h1><p class="lead">坐好，或者站起来。</p><button class="primary-btn" id="r-main">好了</button></div>`);
  document.getElementById('r-main').onclick = () => { updateRescue(rescue,{step:'open_target'}); renderRescue(); };
}
function renderRescueOpenTarget(rescue) {
  rescueShell(`<div class="rescue-step"><h1>现在，把要做的东西打开。</h1><p class="lead">文件、书、电脑、运动鞋，哪个都可以。</p><button class="primary-btn" id="r-opened">打开了</button><button class="text-btn" id="r-unknown">我不知道要打开什么</button></div>`);
  document.getElementById('r-opened').onclick = () => { updateRescue(rescue,{step:'ready'}); renderRescue(); };
  document.getElementById('r-unknown').onclick = () => { updateRescue(rescue,{step:'category_select'}); renderRescue(); };
}
function renderRescueCategory(rescue) {
  const cats = [['study_writing','学习 / 写作'],['work','工作 / 汇报'],['housework','收拾 / 家务'],['exercise','运动'],['other','其他']];
  rescueShell(`<div class="rescue-step"><h1>你大概想做哪类事？</h1><div class="category-list">${cats.map(([v,l])=>`<button class="choice-btn" data-cat="${v}">${l}</button>`).join('')}</div></div>`);
  document.querySelectorAll('[data-cat]').forEach(btn => btn.onclick = () => {
    updateRescue(rescue,{selectedCategory:btn.dataset.cat,step:'ready'}); renderRescue();
  });
}
function renderRescueReady(rescue) {
  const prompt = rescue.selectedCategory ? rescueCategoryPrompt(rescue.selectedCategory) : '两分钟后你可以停。';
  rescueShell(`<div class="rescue-step"><h1>很好。现在只做2分钟。</h1><p class="lead">${escapeHtml(prompt)}</p><button class="primary-btn" id="r-start">开始2分钟</button><div class="helper" style="margin-top:12px">不需要做完。</div></div>`);
  document.getElementById('r-start').onclick = () => {
    const t = now(); const timer = startTimer(120,t);
    updateRescue(rescue,{step:'timer',status:'running',plannedSeconds:120,startedAt:t,endAt:timer.endAt,remainingAtPause:null,pauseStartedAt:null});
    renderRescue();
  };
}
function renderRescueTimer(rescue) {
  if (rescue.status === 'running' && rescue.endAt <= now()) { completeRescue(rescue); return renderRescue(); }
  const paused = rescue.status === 'paused';
  const remaining = paused ? Math.ceil((rescue.remainingAtPause||0)/1000) : getRemainingSeconds(rescue.endAt);
  rescueShell(`
    <div class="focus-top"><button class="icon-btn" id="r-close">×</button></div>
    <div class="focus-center">
      <div class="focus-label">就做这一点点。</div>
      <div class="timer-wrap"><div class="timer" id="r-timer">${formatTime(remaining)}</div></div>
      <div class="focus-hint">${paused ? '停一下也可以。' : '两分钟后你可以停。'}</div>
    </div>
    <div class="focus-controls"><button class="primary-btn" id="r-pause">${paused?'继续':'暂停'}</button><button class="text-btn center" id="r-early">${paused?'今天先这样':'提前结束'}</button></div>`);
  let last = remaining;
  function tick() {
    rescue = rescueRepository.getById(rescue.id);
    if (!rescue || rescue.status !== 'running') return;
    const seconds = getRemainingSeconds(rescue.endAt);
    if (seconds !== last) { last = seconds; document.getElementById('r-timer').textContent = formatTime(seconds); }
    if (seconds <= 0) { clearTimerLoop(); completeRescue(rescue); if(navigator.vibrate)navigator.vibrate(70); setTimeout(renderRescue,400); }
  }
  if (!paused) intervalId = setInterval(tick,250);
  document.getElementById('r-pause').onclick = () => {
    rescue = rescueRepository.getById(rescue.id);
    if (rescue.status === 'running') {
      const p = pauseSession({ ...rescue, endAt:rescue.endAt, status:'running' });
      updateRescue(rescue,{status:'paused',remainingAtPause:p.remainingAtPause,pauseStartedAt:p.pauseStartedAt,pauseCount:p.pauseCount});
    } else {
      const r = resumeSession({ ...rescue, status:'paused' });
      updateRescue(rescue,{status:'running',endAt:r.endAt,remainingAtPause:null,pauseStartedAt:null,totalPauseSeconds:r.totalPauseSeconds});
    }
    renderRescue();
  };
  const exit = () => showSheet({ title:'现在先停下来吗？', body:'已经做的时间也算开始。', primaryLabel:'继续做', secondaryLabel:'今天先这样', onSecondary:()=>{
    rescue = rescueRepository.getById(rescue.id); const t=now();
    const actual = Math.max(0,getActualFocusSeconds(rescue.startedAt,t,rescue.totalPauseSeconds||0));
    updateRescue(rescue,{status:'early_end',step:'done',endedAt:t,actualSeconds:actual,result:'early_stop',nextAction:'home'});
    rescueRepository.setActive(null); navigate('/');
  }});
  document.getElementById('r-close').onclick = exit; document.getElementById('r-early').onclick = exit;
}
function completeRescue(rescue) {
  const t=now();
  const updated=updateRescue(rescue,{status:'completed',step:'complete',endedAt:t,actualSeconds:120});
  return updated;
}
function renderRescueComplete(rescue) {
  rescueShell(`<div class="rescue-step"><div class="eyebrow">2分钟到了</div><h1 style="margin-top:10px">现在感觉怎么样？</h1><div class="category-list"><button class="choice-btn primary" id="r-continue">好像能继续</button><button class="choice-btn soft" id="r-stop">做了一点，先这样</button><button class="choice-btn textual" id="r-stuck">还是不想动</button></div></div>`);
  document.getElementById('r-continue').onclick = () => {
    if(isSubmitting)return; isSubmitting=true;
    updateRescue(rescue,{result:'continue',nextAction:'continue_5min',step:'done'}); rescueRepository.setActive(null);
    const child=createFocusSession({source:'rescue_continue',plannedSeconds:300,parentRescueSessionId:rescue.id,chainId:rescue.chainId});
    isSubmitting=false; navigate(`/focus/${child.id}`);
  };
  document.getElementById('r-stop').onclick = () => { updateRescue(rescue,{result:'partial_stop',nextAction:'home',step:'done'}); rescueRepository.setActive(null); renderRescueDone('今天已经启动过一次。','够了，先到这里。'); };
  document.getElementById('r-stuck').onclick = () => { updateRescue(rescue,{result:'still_stuck',step:'still_stuck'}); renderRescue(); };
}
function renderRescueStillStuck(rescue) {
  rescueShell(`<div class="rescue-step"><h1>那今天先别逼自己继续。</h1><p class="lead">至少你已经动过一下。</p><button class="primary-btn" id="r-home">回到首页</button><button class="text-btn" id="r-later">稍后再试</button></div>`);
  const go = action => { updateRescue(rescue,{nextAction:action,step:'done'}); rescueRepository.setActive(null); navigate('/'); };
  document.getElementById('r-home').onclick=()=>go('home'); document.getElementById('r-later').onclick=()=>go('retry_later');
}
function renderRescueDone(title,body) {
  rescueShell(`<div class="done-state"><div class="done-check">✓</div><h1>${title}</h1><p>${body}</p><button class="primary-btn" id="r-done-home">回到首页</button></div>`);
  document.getElementById('r-done-home').onclick=()=>navigate('/');
}

function renderHistory() {
  clearTimerLoop();
  const focus = sessionRepository.list().filter(s => ['completed','early_end'].includes(s.status)).sort((a,b)=>(b.endedAt||0)-(a.endedAt||0));
  const rescues = rescueRepository.list().filter(r => ['completed','early_end'].includes(r.status)).sort((a,b)=>(b.endedAt||0)-(a.endedAt||0));
  const items = [
    ...focus.map(s=>({time:s.endedAt||s.updatedAt,title:taskDisplayText(s),mins:Math.max(1,Math.round((s.actualFocusSeconds||0)/60)),meta:s.status==='completed'?'完成计时':'提前结束'})),
    ...rescues.map(r=>({time:r.endedAt||r.updatedAt,title:'救急启动',mins:Math.max(1,Math.round((r.actualSeconds||0)/60)),meta:r.status==='completed'?'做了一点':'提前结束'}))
  ].sort((a,b)=>b.time-a.time).slice(0,30);
  const stats=weeklyStats();
  app.innerHTML=`
    <section class="page fade-in">
      <header class="topbar"><button class="icon-btn" id="history-back">‹</button><div class="brand-name">记录</div><span style="width:44px"></span></header>
      <div class="content-header"><h1 class="page-title">你已经开始过这些。</h1><p class="subtitle">不统计“自律值”，只记录真实启动。</p></div>
      <div class="stats-row"><div class="stat"><strong>${stats.starts}</strong><span>本周启动</span></div><div class="stat"><strong>${stats.continued}</strong><span>进入状态</span></div><div class="stat"><strong>${Math.round(stats.totalSeconds/60)}</strong><span>行动分钟</span></div></div>
      <div class="history-list">${items.length?items.map(i=>`<div class="history-card"><div class="time">${new Date(i.time).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div><div class="title">${escapeHtml(i.title)}</div><div class="meta">${i.mins}分钟 · ${i.meta}</div></div>`).join(''):'<div class="history-card"><div class="title">还没有记录。</div><div class="meta">下次不想开始的时候，先做5分钟。</div></div>'}</div>
      <button class="text-btn center" id="clear-data" style="margin-top:28px">清除所有本地数据</button>
    </section>`;
  document.getElementById('history-back').onclick=()=>navigate('/');
  document.getElementById('clear-data').onclick=()=>showSheet({title:'确定清除所有记录吗？',body:'此操作无法恢复。',primaryLabel:'取消',secondaryLabel:'清除',onSecondary:()=>{clearAllData();toast('本地记录已清除。');navigate('/');}});
}

function isRouteGuarded(hash = currentHash) {
  const {parts} = parseHash(hash);
  if (parts[0] === 'focus' && parts[1]) {
    const s = sessionRepository.getById(parts[1]);
    return s && ['running','paused'].includes(s.status);
  }
  if (parts[0] === 'rescue') {
    const r = rescueRepository.getActive();
    return r && r.step === 'timer' && ['running','paused'].includes(r.status);
  }
  return false;
}

function renderRoute() {
  clearTimerLoop();
  const route = parseHash();
  currentHash = location.hash || '#/';
  if (route.path === '/' || route.parts.length === 0) return renderHome();
  if (route.parts[0] === 'breakdown' && route.parts[1]) return renderBreakdown(route.parts[1], route.query);
  if (route.parts[0] === 'focus' && route.parts[1]) return renderFocus(route.parts[1]);
  if (route.parts[0] === 'feedback' && route.parts[1]) return renderFeedback(route.parts[1]);
  if (route.parts[0] === 'rescue') return renderRescue();
  if (route.parts[0] === 'history') return renderHistory();
  navigate('/', {replace:true});
}

function recoverInitialRoute() {
  let focus = sessionRepository.getActive();
  let rescue = rescueRepository.getActive();
  if (focus && rescue) {
    if ((focus.updatedAt||0) >= (rescue.updatedAt||0)) {
      rescue = updateRescue(rescue,{status:'abandoned',step:'done'}); rescueRepository.setActive(null); rescue=null;
    } else {
      focus.status='abandoned'; focus.updatedAt=now(); sessionRepository.update(focus); sessionRepository.setActive(null); focus=null;
    }
  }
  if (focus) {
    if (focus.status === 'running' && focus.endAt <= now()) {
      focus = finishFocusSession(focus,'completed');
      history.replaceState(null,'',`#/feedback/${focus.id}`);
    } else if (['running','paused'].includes(focus.status)) {
      history.replaceState(null,'',`#/focus/${focus.id}`);
    }
    return;
  }
  if (rescue) {
    if (rescue.step === 'timer' && rescue.status === 'running' && rescue.endAt <= now()) completeRescue(rescue);
    history.replaceState(null,'','#/rescue');
    return;
  }
  if (!location.hash) history.replaceState(null,'','#/');
}

window.addEventListener('hashchange', () => {
  if (bypassRouteGuard) return renderRoute();
  const old = currentHash;
  const next = location.hash || '#/';
  if (old !== next && isRouteGuarded(old) && !pendingExitFromBack) {
    pendingExitFromBack = true;
    bypassRouteGuard = true;
    history.replaceState(null,'',old);
    bypassRouteGuard = false;
    const {parts}=parseHash(old);
    if(parts[0]==='focus') showFocusExitSheet(parts[1]);
    else {
      const r=rescueRepository.getActive();
      showSheet({title:'现在先停下来吗？',body:'已经做的时间也算开始。',primaryLabel:'继续做',secondaryLabel:'今天先这样',onPrimary:()=>pendingExitFromBack=false,onSecondary:()=>{pendingExitFromBack=false;if(r){const t=now();updateRescue(r,{status:'early_end',step:'done',endedAt:t,actualSeconds:getActualFocusSeconds(r.startedAt,t,r.totalPauseSeconds||0),result:'early_stop',nextAction:'home'});rescueRepository.setActive(null);}navigate('/');}});
    }
    return;
  }
  renderRoute();
});

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const {parts}=parseHash();
    if(parts[0]==='focus'||parts[0]==='rescue') renderRoute();
  }
});

window.addEventListener('beforeunload', e => {
  if (isRouteGuarded()) { e.preventDefault(); e.returnValue=''; }
});

recoverInitialRoute();
renderRoute();
