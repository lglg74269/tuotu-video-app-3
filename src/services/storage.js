// ============================================================
// 纯前端本地存储：使用 localforage (IndexedDB)
// ============================================================
import localforage from 'localforage';

// 创建不同存储空间的实例
const projectStore = localforage.createInstance({ name: 'VideoPipeline', storeName: 'projects' });
const promptStore = localforage.createInstance({ name: 'VideoPipeline', storeName: 'prompts' });
const globalStore = localforage.createInstance({ name: 'VideoPipeline', storeName: 'global' });

export async function initStorage() {
  // indexedDB 自动初始化，无需显式创建目录
}

export { projectStore, promptStore, globalStore };

// ---------------- 设置 ----------------
export async function readSettings(fallback) {
  const s = await globalStore.getItem('settings');
  return s || fallback;
}
export async function writeSettings(settings) {
  await globalStore.setItem('settings', settings);
}

// ---------------- 音色库 ----------------
export async function readVoiceLibrary() {
  const saved = await globalStore.getItem('voiceLibrary');
  if (saved && typeof saved.content === 'string') return saved.content;
  
  // 首次读取种子：因为是纯前端，我们需要在构建时打包 seed，或者作为常量
  // 为简单起见，我们直接发起 fetch 获取 public 目录下的 seed 或者返回默认空字符串
  try {
    const res = await fetch('/voice_library.txt'); // 需要在构建时将此文件放在 public 目录
    if (res.ok) {
      return await res.text();
    }
  } catch (e) {
    // 忽略
  }
  return '';
}

export async function writeVoiceLibrary(content) {
  await globalStore.setItem('voiceLibrary', { content: content ?? '', updatedAt: new Date().toISOString() });
}

// ---------------- 项目 ----------------
export async function listProjects() {
  const keys = await projectStore.keys();
  const list = [];
  for (const k of keys) {
    const p = await projectStore.getItem(k);
    if (p) list.push({ name: p.name, title: p.title || p.name, mode: p.mode, updatedAt: p.updatedAt, createdAt: p.createdAt });
  }
  return list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

export async function readProject(name) {
  return await projectStore.getItem(name) || null;
}

export async function writeProject(project) {
  project.updatedAt = new Date().toISOString();
  await projectStore.setItem(project.name, project);
  return project;
}

export async function deleteProject(name) {
  try {
    await projectStore.removeItem(name);
    return true;
  } catch (e) {
    return false;
  }
}
