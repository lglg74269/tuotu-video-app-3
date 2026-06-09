// ============================================================
// 提示词版本管理 (Pure Frontend)
// ============================================================
import { promptStore } from './storage.js';

// 使用 Vite 的 import.meta.glob 批量静态引入种子文件
const seedFiles = import.meta.glob('../prompts-seed/*.md', { query: '?raw', import: 'default' });

export const PROMPT_REGISTRY = [
  // Step1 分集（识别章节锚点，沿用分集器策略）
  { key: 'step1.system', kind: 'system', step: 'step1', mode: 'common', label: '分集·章节锚点识别', seedFile: 'step1.system.md' },

  // Step2a 名称提取
  { key: 'step2a.system', kind: 'system', step: 'step2a', mode: 'common', label: '资产·名称提取', seedFile: 'step2a.system.md' },
  // Step2a_b 更新检查
  { key: 'step2a_b.system', kind: 'system', step: 'step2a_b', mode: 'common', label: '资产·更新检查', seedFile: 'step2a_b.system.md' },
  // Step2b 详情提取（按实体类型）
  { key: 'step2b.system.character', kind: 'system', step: 'step2b', mode: 'common', label: '资产·角色详情', seedFile: 'step2b.system.character.md' },
  { key: 'step2b.system.scene', kind: 'system', step: 'step2b', mode: 'common', label: '资产·场景详情', seedFile: 'step2b.system.scene.md' },
  { key: 'step2b.system.item', kind: 'system', step: 'step2b', mode: 'common', label: '资产·物品详情', seedFile: 'step2b.system.item.md' },

  // Step3a 剧本类型分析（新增）
  { key: 'step3a.system', kind: 'system', step: 'step3a', mode: 'common', label: '剧本类型分析·系统', seedFile: 'step3a.system.md' },

  // Step3b-split 原文拆分
  { key: 'step3b-split.system.narration', kind: 'system', step: 'step3b-split', mode: 'narration', label: '解说·原文拆分·系统', seedFile: 'step3b-split.system.narration.md' },
  { key: 'step3b-split.system.script', kind: 'system', step: 'step3b-split', mode: 'script', label: '剧本·原文拆分·系统', seedFile: 'step3b-split.system.script.md' },
  { key: 'step3b-split.creative.narration', kind: 'creative', step: 'step3b-split', mode: 'narration', label: '解说·原文拆分·创作', seedFile: 'step3b-split.creative.narration.md' },

  // Step3b-shots 镜头创作
  { key: 'step3b-shots.system.narration', kind: 'system', step: 'step3b-shots', mode: 'narration', label: '解说·镜头创作·系统', seedFile: 'step3b-shots.system.narration.md' },
  { key: 'step3b-shots.system.script', kind: 'system', step: 'step3b-shots', mode: 'script', label: '剧本·镜头创作·系统', seedFile: 'step3b-shots.system.script.md' },
  { key: 'step3b-shots.creative.narration', kind: 'creative', step: 'step3b-shots', mode: 'narration', label: '解说·镜头创作·创作', seedFile: 'step3b-shots.creative.narration.md' },
  { key: 'step3b-shots.creative.script', kind: 'creative', step: 'step3b-shots', mode: 'script', label: '剧本·镜头创作·创作', seedFile: 'step3b-shots.creative.script.md' },

  // Step4a 镜头分类
  { key: 'step4a.system', kind: 'system', step: 'step4a', mode: 'common', label: '镜头分类·系统', seedFile: 'step4a.system.md' },

  // Step4c 视频提示词（系统：解说/剧本各一）
  { key: 'step4c.system.narration', kind: 'system', step: 'step4c', mode: 'narration', label: '解说视频提示词·系统', seedFile: 'step4c.system.narration.md' },
  { key: 'step4c.system.script', kind: 'system', step: 'step4c', mode: 'script', label: '剧本视频提示词·系统', seedFile: 'step4c.system.script.md' },
  // Step4c 视频提示词（创作模版：按镜头类型，前端可编辑）
  { key: 'step4c.creative.基础文戏', kind: 'creative', step: 'step4c', mode: 'common', label: '创作模版·基础文戏', seedFile: 'step4c.creative.wenxi.md' },
  { key: 'step4c.creative.动作戏', kind: 'creative', step: 'step4c', mode: 'common', label: '创作模版·动作戏', seedFile: 'step4c.creative.action.md' },
  { key: 'step4c.creative.表情情感戏', kind: 'creative', step: 'step4c', mode: 'common', label: '创作模版·表情情感戏', seedFile: 'step4c.creative.emotion.md' },
  { key: 'step4c.creative.特殊运镜戏', kind: 'creative', step: 'step4c', mode: 'common', label: '创作模版·特殊运镜戏', seedFile: 'step4c.creative.camera.md' },
];

function genId() {
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function readSeed(seedFileName) {
  const seedPath = `../prompts-seed/${seedFileName}`;
  if (seedFiles[seedPath]) {
    try {
      const content = await seedFiles[seedPath]();
      return content;
    } catch (e) {
      console.error('Error loading seed file', seedPath, e);
    }
  }
  return `（缺少种子文件 ${seedFileName}，请在版本管理中填写内容）`;
}

function getRegistry(key) {
  return PROMPT_REGISTRY.find((r) => r.key === key);
}

export async function loadNode(key) {
  const reg = getRegistry(key);
  if (!reg) throw Object.assign(new Error(`未知提示词节点：${key}`), { status: 404 });

  let node = await promptStore.getItem(key);
  if (!node) {
    const seed = await readSeed(reg.seedFile);
    const now = new Date().toISOString();
    node = {
      key: reg.key,
      kind: reg.kind,
      step: reg.step,
      mode: reg.mode,
      label: reg.label,
      versions: [
        { id: genId(), name: '初始版本', content: seed, active: true, createdAt: now, updatedAt: now },
      ],
    };
    await promptStore.setItem(key, node);
  }
  return node;
}

export async function listNodes() {
  const result = [];
  for (const reg of PROMPT_REGISTRY) {
    const node = await loadNode(reg.key);
    const active = node.versions.find((v) => v.active) || node.versions[0];
    result.push({
      key: node.key,
      kind: node.kind,
      step: node.step,
      mode: node.mode,
      label: node.label,
      versionCount: node.versions.length,
      activeVersionId: active?.id,
      activeVersionName: active?.name,
    });
  }
  return result;
}

export async function getActiveContent(key) {
  const node = await loadNode(key);
  const active = node.versions.find((v) => v.active) || node.versions[0];
  return active?.content ?? '';
}

export async function getActiveVersion(key) {
  const node = await loadNode(key);
  const active = node.versions.find((v) => v.active) || node.versions[0];
  return {
    key,
    label: node.label,
    versionId: active?.id ?? null,
    versionName: active?.name ?? null,
    content: active?.content ?? '',
  };
}

export async function addVersion(key, name, content, setActive = true) {
  const node = await loadNode(key);
  const now = new Date().toISOString();
  const version = { id: genId(), name: name || `版本${node.versions.length + 1}`, content, active: false, createdAt: now, updatedAt: now };
  node.versions.push(version);
  if (setActive) {
    node.versions.forEach((v) => (v.active = v.id === version.id));
  }
  await promptStore.setItem(key, node);
  return node;
}

export async function updateVersion(key, versionId, patch) {
  const node = await loadNode(key);
  const v = node.versions.find((x) => x.id === versionId);
  if (!v) throw Object.assign(new Error('版本不存在'), { status: 404 });
  if (patch.name != null) v.name = patch.name;
  if (patch.content != null) v.content = patch.content;
  v.updatedAt = new Date().toISOString();
  await promptStore.setItem(key, node);
  return node;
}

export async function activateVersion(key, versionId) {
  const node = await loadNode(key);
  if (!node.versions.some((v) => v.id === versionId)) {
    throw Object.assign(new Error('版本不存在'), { status: 404 });
  }
  node.versions.forEach((v) => (v.active = v.id === versionId));
  await promptStore.setItem(key, node);
  return node;
}

export async function deleteVersion(key, versionId) {
  const node = await loadNode(key);
  if (node.versions.length <= 1) throw Object.assign(new Error('至少保留一个版本'), { status: 400 });
  const target = node.versions.find((v) => v.id === versionId);
  if (!target) throw Object.assign(new Error('版本不存在'), { status: 404 });
  node.versions = node.versions.filter((v) => v.id !== versionId);
  if (target.active) node.versions[0].active = true;
  await promptStore.setItem(key, node);
  return node;
}

export async function resetToSeed(key) {
  const reg = getRegistry(key);
  if (!reg) throw Object.assign(new Error('未知节点'), { status: 404 });
  const seed = await readSeed(reg.seedFile);
  return addVersion(key, '重置·种子版本', seed, true);
}
