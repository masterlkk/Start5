export const STORAGE_KEYS = {
  TASKS: 'sfm_tasks',
  FOCUS_SESSIONS: 'sfm_focus_sessions',
  FEEDBACK: 'sfm_feedback',
  RESCUE_SESSIONS: 'sfm_rescue_sessions',
  ACTIVE_FOCUS_ID: 'sfm_active_focus_session_id',
  ACTIVE_RESCUE_ID: 'sfm_active_rescue_session_id',
  USER_META: 'sfm_user_meta',
  SCHEMA_VERSION: 'sfm_schema_version'
};

export const LARGE_TASK_KEYWORDS = [
  '论文','学习','复习','考试','报告','PPT','ppt','收拾','整理','打扫','健身','运动','工作','项目','找工作','求职'
];

export const TASK_TEMPLATES = [
  {
    category: 'writing',
    keywords: ['论文','文章','报告','作业','文案','PPT','ppt'],
    suggestions: ['打开相关文件','修改一小段','写一个小标题','写第一句话']
  },
  {
    category: 'study',
    keywords: ['学习','复习','考试','看书','背书'],
    suggestions: ['打开资料','看一页','复习一个知识点','做一道题']
  },
  {
    category: 'tidy',
    keywords: ['收拾','整理','打扫','清理'],
    suggestions: ['只收拾桌面','扔掉5件垃圾','整理一个抽屉','把5件东西归位']
  },
  {
    category: 'work',
    keywords: ['工作','汇报','项目','邮件'],
    suggestions: ['打开工作文件','列3个要点','写第一页标题','回复一封消息']
  },
  {
    category: 'exercise',
    keywords: ['健身','运动','跑步','锻炼'],
    suggestions: ['换好运动服','做10个深蹲','走出门','热身2分钟']
  }
];

export const GENERIC_SUGGESTIONS = ['打开相关东西','做最简单的一小步','准备需要的东西'];

export function createId(prefix = 'id') {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${uuid}`;
}

export function shouldBreakDown(text) {
  const normalized = String(text || '').trim();
  return LARGE_TASK_KEYWORDS.some(keyword => normalized.includes(keyword));
}

export function getTaskSuggestions(text) {
  const normalized = String(text || '').trim();
  const matched = TASK_TEMPLATES.find(t => t.keywords.some(k => normalized.includes(k)));
  return matched
    ? { category: matched.category, suggestions: matched.suggestions.slice(0, 4) }
    : { category: 'generic', suggestions: GENERIC_SUGGESTIONS.slice(0, 4) };
}

export function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function rescueCategoryPrompt(category) {
  return {
    study_writing: '打开书、文档或资料。',
    work: '打开电脑或工作文件。',
    housework: '走到你最想收拾的地方。',
    exercise: '换鞋，或者站到空一点的地方。',
    other: '把和这件事有关的东西放到手边。'
  }[category] || '把和这件事有关的东西放到手边。';
}
