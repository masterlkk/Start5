export function startTimer(plannedSeconds, now = Date.now()) {
  return {
    startedAt: now,
    endAt: now + plannedSeconds * 1000
  };
}

export function getRemainingSeconds(endAt, now = Date.now()) {
  return Math.max(0, Math.ceil((endAt - now) / 1000));
}

export function getActualFocusSeconds(startedAt, endedAt, totalPauseSeconds = 0) {
  if (!startedAt || !endedAt) return 0;
  return Math.max(0, Math.round((endedAt - startedAt) / 1000 - totalPauseSeconds));
}

export function pauseSession(session, now = Date.now()) {
  if (session.status !== 'running' || !session.endAt) return session;
  return {
    ...session,
    remainingAtPause: Math.max(0, session.endAt - now),
    pauseStartedAt: now,
    pauseCount: (session.pauseCount || 0) + 1,
    status: 'paused',
    updatedAt: now
  };
}

export function resumeSession(session, now = Date.now()) {
  if (session.status !== 'paused' || session.remainingAtPause == null) return session;
  const pausedMs = session.pauseStartedAt ? Math.max(0, now - session.pauseStartedAt) : 0;
  return {
    ...session,
    endAt: now + session.remainingAtPause,
    totalPauseSeconds: (session.totalPauseSeconds || 0) + Math.round(pausedMs / 1000),
    remainingAtPause: null,
    pauseStartedAt: null,
    status: 'running',
    updatedAt: now
  };
}
