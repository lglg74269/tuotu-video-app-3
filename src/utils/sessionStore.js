// 浏览器本地会话存档（刷新/关闭后恢复）
const SESSION_KEY = 'video-pipeline-session';
const LAST_PROJECT_KEY = 'video-pipeline-last-project';

export const AUTOSAVE_PROJECT = '__自动存档__';

export function saveLocalSession(data) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    const name = data.name || data.session?.selectedProject || '';
    if (name) localStorage.setItem(LAST_PROJECT_KEY, name);
  } catch (e) {
    console.warn('本地存档失败', e);
  }
}

export function loadLocalSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getLastProjectName() {
  return localStorage.getItem(LAST_PROJECT_KEY) || '';
}

export function hasSessionContent(p) {
  if (!p) return false;
  if (p.input?.currentText?.trim()) return true;
  const eps = p.steps?.step1?.result?.episodes || p.episodes;
  if (eps?.length) return true;
  const chars = p.steps?.step2?.result?.assets?.characters || p.assets?.characters;
  if (chars?.length) return true;
  const sb = p.steps?.step3b?.result?.storyboard?.storys || p.storyboard?.storys;
  if (sb?.length) return true;
  return false;
}
