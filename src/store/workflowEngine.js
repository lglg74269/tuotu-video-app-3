import { ref, reactive, computed, watch } from 'vue';
import { Pipeline } from '../api/client.js';
import { activeProject, autoSave } from './projectStore.js';
import { segmentTextByChars, tempUnitId } from '../utils/textSegment.js';
import { calculateSimilarity } from '../utils/textSimilarity.js';
import { ElMessage, ElMessageBox } from 'element-plus';

// ---------------- 提示通知 ----------------
function showToast(type, msg) {
  if (type === 'success') ElMessage.success(msg);
  else if (type === 'warning') ElMessage.warning(msg);
  else if (type === 'error') ElMessage.error(msg);
  else ElMessage.info(msg);
}

// ---------------- 引擎状态 ----------------
export const busy = reactive({
  s1: false, s2: false, s3a: false, s3b: false, s3c: false, s3d: false,
  s4x: false, s4a: false, s4c: false, s4d: false,
});
export const progress = reactive({});
export const pipe = reactive({ s2Running: false });

// 校验结果
export const vpValidation = ref(null);
export const sbValidation = ref(null);

// 共享的全局参数设置（跨项目共享，存放在 localStorage 中）
export const segNarration = reactive({ useModel: true, maxChars: 0 });
export const segScript = reactive({ useModel: true, maxChars: 0 });
export const splitNarration = reactive({ maxUnitChars: 500, concurrency: 10, maxRetries: 2 });
export const splitScript = reactive({ maxUnitChars: 1000, concurrency: 10, maxRetries: 2 });
export const shotNarration = reactive({ batchSize: 10, concurrency: 10 });
export const shotScript = reactive({ batchSize: 5, concurrency: 10 });
export const sbConcurrencyNarration = ref(2);
export const sbConcurrencyScript = ref(2);

// 停止标志与控制器
export const stopFlags = reactive({
  s1: false, s2: false, s3a: false, s3b: false, s3c: false, s3d: false,
  s4x: false, s4a: false, s4c: false, s4d: false,
});
export const abortControllers = reactive({
  s1: null, s2: null, s3a: null, s3b: null, s3c: null, s3d: null,
  s4x: null, s4a: null, s4c: null, s4d: null,
});

// 便捷访问方法
export const textType = computed(() => (activeProject.mode === 'script' ? '剧本' : '解说文案'));
export function getSeg() { return activeProject.mode === 'script' ? segScript : segNarration; }
export function getSplit() { return activeProject.mode === 'script' ? splitScript : splitNarration; }
export function getShot() { return activeProject.mode === 'script' ? shotScript : shotNarration; }
export function getSbC() { return activeProject.mode === 'script' ? sbConcurrencyScript.value : sbConcurrencyNarration.value; }

// Helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function setProg(k, cur, total) { progress[k] = { cur, total }; }

export function stopStep(k) {
  stopFlags[k] = true;
  const ac = abortControllers[k];
  if (ac) { ac.abort(); abortControllers[k] = null; }
  resetRunningStates(k);
}

function resetRunningStates(k) {
  const stateMap = {
    s4x: ['s4x'], s4a: ['s4a'], s4c: ['s4c'],
    s3b: ['sb', 'sbSplit', 'sbShots', 's4x'],
    s2: ['s2'],
  };
  const keys = stateMap[k] || [];
  for (const stateKey of keys) {
    if (activeProject.epState[stateKey]) {
      for (let i = 0; i < activeProject.epState[stateKey].length; i++) {
        if (activeProject.epState[stateKey][i] === 'running') activeProject.epState[stateKey][i] = 'idle';
      }
    }
  }
}

function resetStopFlag(k) { stopFlags[k] = false; }
function shouldStop(k) { return !!stopFlags[k]; }
function getController(k) {
  if (!abortControllers[k]) abortControllers[k] = new AbortController();
  return abortControllers[k];
}
function clearController(k) { abortControllers[k] = null; }

async function withBusy(k, fn) {
  busy[k] = true;
  resetStopFlag(k);
  try { await fn(); } catch (e) {
    if (shouldStop(k)) showToast('warning', '已停止运行');
    else showToast('error', e.message);
  } finally { busy[k] = false; clearController(k); }
}

// ---------------- 步骤元数据与记录 ----------------
function recordMeta(step, meta, runs, elapsedMs) {
  activeProject.stepMeta[step] = {
    ranAt: new Date().toISOString(),
    model: meta?.model || '',
    prompts: meta?.prompts || [],
    runs: runs ?? 1,
    elapsedMs: elapsedMs ?? 0,
  };
}
function recordProgramStep(step, note, elapsedMs) {
  activeProject.stepMeta[step] = {
    ranAt: new Date().toISOString(),
    model: '（程序计算，无模型）',
    prompts: [],
    note,
    elapsedMs: elapsedMs ?? 0
  };
}

// ---------------- 分集生命周期 ----------------
function getProcessingIndices() {
  return Object.entries(activeProject.episodeStatus)
    .filter(([, v]) => v === 'processing')
    .map(([k]) => Number(k));
}
function getPendingIndices() {
  return Object.entries(activeProject.episodeStatus)
    .filter(([, v]) => v === 'pending')
    .map(([k]) => Number(k));
}
function hasIncompleteEpisodes() {
  return Object.values(activeProject.episodeStatus).some((v) => v === 'pending' || v === 'processing');
}
function markEpisodesProcessing(indices) {
  for (const i of indices) activeProject.episodeStatus[i] = 'processing';
}
function markEpisodesCompleted(indices) {
  for (const i of indices) activeProject.episodeStatus[i] = 'completed';
}
function initEpisodeStatus(startIndex, count) {
  for (let i = startIndex; i < startIndex + count; i++) {
    if (!activeProject.episodeStatus.hasOwnProperty(i)) activeProject.episodeStatus[i] = 'pending';
  }
}

function initEpisodeStatusForIndex(i) {
  if (!activeProject.episodeStatus.hasOwnProperty(i)) activeProject.episodeStatus[i] = 'pending';
}

// ---------------- Step 1: 分集 ----------------
export function runSegment(customText = null) {
  return withBusy('s1', async () => {
    if (!activeProject.name) throw new Error('请先选择或创建一个项目');
    
    const textToSegment = customText || activeProject.inputText;
    if (!textToSegment.trim()) throw new Error('请先填写原文');


    const start = Date.now();
    const ctrl = getController('s1');
    const r = await Pipeline.segment({
      text: textToSegment,
      useModel: getSeg().useModel,
      maxChars: Number(getSeg().maxChars) || 0,
    }, ctrl.signal);
    const elapsed = Date.now() - start;

    const formatTitleForIndex = (title, targetIndex) => {
      const prefix = `第${targetIndex + 1}集`;
      if (/^第\d+集/.test(title || '')) {
        return title.replace(/^第\d+集/, prefix);
      }
      return `${prefix} · ${title || '无标题'}`;
    };

    let appendedCount = 0;
    let replacedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < r.episodes.length; i++) {
      const incomingEp = r.episodes[i];
      let bestMatchIdx = -1;
      let highestSim = 0;

      for (let j = 0; j < activeProject.episodes.length; j++) {
        const existingEp = activeProject.episodes[j];
        if (!existingEp.text) continue; // Skip empty slots
        const sim = calculateSimilarity(incomingEp.text, existingEp.text);
        if (sim > highestSim) {
          highestSim = sim;
          bestMatchIdx = j;
        }
      }

      if (highestSim > 0.85) {
        const existingEp = activeProject.episodes[bestMatchIdx];
        if (incomingEp.text.length > existingEp.text.length * 1.05) {
          try {
            await ElMessageBox.confirm(
              `检测到新切分的第 ${i + 1} 集是对现有第 ${bestMatchIdx + 1} 集的扩充（字数 ${existingEp.text.length} -> ${incomingEp.text.length}）。\n是否替换该集的原文？（相关资产不会被自动清理，需稍后手动点击重新分析）`,
              '检测到内容扩充',
              { confirmButtonText: '替换原文', cancelButtonText: '忽略', type: 'warning' }
            );
            activeProject.episodes[bestMatchIdx].text = incomingEp.text;
            activeProject.episodes[bestMatchIdx].title = formatTitleForIndex(incomingEp.title, bestMatchIdx);
            replacedCount++;
          } catch {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      } else {
        const emptyIdx = activeProject.episodes.findIndex(ep => !ep.text);
        if (emptyIdx !== -1) {
          activeProject.episodes[emptyIdx].text = incomingEp.text;
          activeProject.episodes[emptyIdx].title = formatTitleForIndex(incomingEp.title, emptyIdx);
        } else {
          incomingEp.title = formatTitleForIndex(incomingEp.title, activeProject.episodes.length);
          activeProject.episodes.push(incomingEp);
          const newIndex = activeProject.episodes.length - 1;
          initEpisodeStatusForIndex(newIndex);
        }
        appendedCount++;
      }
    }

    if (r.samplePrompt) activeProject.payloads.s1 = [{ label: '批次提示词样例', text: r.samplePrompt }];
    recordMeta('step1', r.meta, r.batchCount, elapsed);
    const extra = r.batchCount ? `（${r.batchCount} 批次 / 锚点 ${r.markers ? r.markers.length : 0}）` : '';
    autoSave();
    
    // Always save into uploadHistory
    activeProject.uploadHistory.unshift({
      id: Date.now(),
      text: textToSegment,
      timestamp: new Date().toLocaleString()
    });
    // Limit history to 50 items
    if (activeProject.uploadHistory.length > 50) {
      activeProject.uploadHistory = activeProject.uploadHistory.slice(0, 50);
    }

    let resultMsg = `已处理完毕。新增追加 ${appendedCount} 集`;
    if (replacedCount > 0) resultMsg += `，更新替换 ${replacedCount} 集`;
    if (skippedCount > 0) resultMsg += `，忽略重复 ${skippedCount} 集`;
    resultMsg += `。当前共计 ${activeProject.episodes.length} 集。${extra}`;

    if (!customText) {
      activeProject.inputText = '';
    }

    showToast('success', resultMsg);
  });
}

export function deleteEpisode(index, hardDelete = false) {
  if (index < 0 || index >= activeProject.episodes.length) return;
  
  if (!hardDelete) {
    // Soft delete: keep the slot, clear text
    activeProject.episodes[index].text = '';
    activeProject.episodes[index].title = '';
    
    // Clear all associated states for this slot so it is truly treated as empty/pending
    activeProject.epState.s2[index] = 'pending';
    activeProject.epState.ready[index] = false;
    activeProject.epState.sb[index] = '';
    activeProject.epState.sbSplit[index] = '';
    activeProject.epState.sbShots[index] = '';
    activeProject.epState.s4a[index] = '';
    activeProject.epState.s4c[index] = '';
    activeProject.epState.s4x[index] = '';
    activeProject.episodeAssets[index] = null;
    activeProject.episodeStoryboard[index] = null;
    activeProject.groupedStoryboardPerEpisode[index] = null;
    
    autoSave();
    
    // Rebuild global storyboard
    import('./workflowEngine.js').then(m => {
      if (m.rebuildStoryboard) m.rebuildStoryboard();
    });
    
    return;
  }

  // Hard delete: Remove from parallel arrays and shift downstream indices
  activeProject.episodes.splice(index, 1);
  activeProject.episodeStatus.splice(index, 1);
  activeProject.episodeAssets.splice(index, 1);
  activeProject.episodeAppearance.splice(index, 1);
  activeProject.episodeStoryboard.splice(index, 1);
  activeProject.groupedStoryboardPerEpisode.splice(index, 1);
  
  const stateKeys = ['sb', 's2', 's4a', 's4c', 's4x', 'ready', 'sbSplit', 'sbShots'];
  for (const k of stateKeys) {
    if (activeProject.epState[k] && activeProject.epState[k].length > index) {
      activeProject.epState[k].splice(index, 1);
    }
  }
  
  // Shift episodeIndices in video prompts
  activeProject.videoPrompts = activeProject.videoPrompts.filter(vp => vp.episodeIndex !== index);
  activeProject.videoPrompts.forEach(vp => {
    if (vp.episodeIndex > index) vp.episodeIndex--;
  });

  autoSave();
  
  // Rebuild global storyboard
  import('./workflowEngine.js').then(m => {
    if (m.rebuildStoryboard) m.rebuildStoryboard();
  });
  
  autoSave();
}

// ---------------- Step 2: 资产提取 ----------------
let assetMergeChain = Promise.resolve();
function enqueueAssetMerge(fn) {
  const run = assetMergeChain.then(() => fn());
  assetMergeChain = run.catch((e) => {
    console.warn('asset merge error', e);
  });
  return run;
}

function entityTaskKey(task) {
  return `${task.entityType}:${task.entityName}`;
}

function isEntityDetailComplete(entityType, entity) {
  if (!entity || entity._pending) return false;
  if (entityType === 'character') {
    return !!(entity.looks?.length && entity.looks.some((l) => l.ln && String(l.ld || '').trim()));
  }
  if (entityType === 'scene') {
    return !!(entity.states?.length && entity.states.some((s) => s.sn && String(s.sd || '').trim()));
  }
  if (entityType === 'item') {
    return !!(entity.variants?.length && entity.variants.some((v) => v.vn && String(v.vd || '').trim()));
  }
  return false;
}

function findEntityInAssets(entityType, name, acc = activeProject.assets) {
  if (entityType === 'character') return acc.characters?.find((c) => c.n === name) || null;
  if (entityType === 'scene') return acc.scenes?.find((s) => s.s === name) || null;
  return acc.items?.find((i) => i.n === name) || null;
}

function dedupeTasks(tasks) {
  const map = new Map();
  for (const t of tasks) map.set(entityTaskKey(t), t);
  return [...map.values()];
}

function filterIncompleteTasks(tasks) {
  return tasks.filter((task) => {
    const ent = findEntityInAssets(task.entityType, task.entityName);
    if (!task.isUpdate && isEntityDetailComplete(task.entityType, ent)) return false;
    task.existingEntity = ent || task.existingEntity || null;
    return true;
  });
}

function collectPendingFromAssets(episodeIndices) {
  const tasks = [];
  const add = (entityType, entityName, existingEntity) => {
    tasks.push({ entityType, entityName, existingEntity, episodeIndices });
  };
  for (const c of activeProject.assets.characters || []) {
    if (!isEntityDetailComplete('character', c)) add('character', c.n, c);
  }
  for (const s of activeProject.assets.scenes || []) {
    if (!isEntityDetailComplete('scene', s)) add('scene', s.s, s);
  }
  for (const it of activeProject.assets.items || []) {
    if (!isEntityDetailComplete('item', it)) add('item', it.n, it);
  }
  return tasks;
}

function markTaskFailed(task, error) {
  const key = entityTaskKey(task);
  const msg = error?.message || String(error);
  activeProject.s2FailedTasks = [
    ...activeProject.s2FailedTasks.filter((t) => entityTaskKey(t) !== key),
    { entityType: task.entityType, entityName: task.entityName, error: msg, episodeIndices: task.episodeIndices },
  ];
}

function markTaskDone(task) {
  const key = entityTaskKey(task);
  activeProject.s2FailedTasks = activeProject.s2FailedTasks.filter((t) => entityTaskKey(t) !== key);
}

async function callWithRetry(fn, maxRetries, delayMs, stopKey = null) {
  let lastErr;
  const max = Math.max(0, Number(maxRetries) ?? 2);
  const delay = Math.max(500, Number(delayMs) || 2000);
  for (let i = 0; i <= max; i++) {
    if (stopKey && shouldStop(stopKey)) throw new Error('用户已停止');
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (stopKey && shouldStop(stopKey)) throw new Error('用户已停止');
      const isRetryable = /500|502|503|429|timeout|aborted|API 错误/i.test(e.message || '');
      if (i < max && isRetryable) {
        await sleep(delay * (i + 1));
        continue;
      }
      if (i < max) await sleep(delay);
    }
  }
  throw lastErr;
}

async function runOne2bTask(task, indices, onMeta) {
  const start = Date.now();
  const processingIndices = getProcessingIndices();
  const episodesForPrompt = processingIndices.length
    ? processingIndices.map((i) => ({ title: activeProject.episodes[i].title, text: activeProject.episodes[i].text, episode_index: i }))
    : activeProject.episodes.map((e, i) => ({ title: e.title, text: e.text, episode_index: i }));
  
  // Set status before extraction
  const listKey = task.entityType === 'character' ? 'characters' : task.entityType === 'scene' ? 'scenes' : 'items';
  const entityListPre = activeProject.assets[listKey] || [];
  const entityPre = entityListPre.find(e => e.n === task.entityName || e.s === task.entityName);
  if (entityPre) {
    entityPre._status = entityPre._pending ? 'extracting' : 'updating';
  }

  try {
    const r = await callWithRetry(
      async () => {
        const res = await Pipeline.extractDetail({
          entityType: task.entityType,
          entityName: task.entityName,
          existingEntity: task.existingEntity || findEntityInAssets(task.entityType, task.entityName),
          allEpisodes: episodesForPrompt,
          newEpisodeIndices: task.episodeIndices || indices,
          voiceLibrary: activeProject.voiceLibrary,
          textType: textType.value,
          metaInfo: activeProject.assets.meta_info,
          existingAssets: activeProject.assets,
        }, getController('s2').signal);

        if (!res.parsed) throw new Error('模型未返回有效 JSON');
        
        // 校验返回数据是否为空壳
        const p = res.parsed;
        let hasData = false;
        if (task.entityType === 'character') {
          const c = p.character || p.characters?.[0] || {};
          const ex = p.existing_character_new_looks || [];
          if (c.s || c.a || c.ae || c.c || (c.looks && c.looks.length > 0) || ex.length > 0) hasData = true;
        } else if (task.entityType === 'scene') {
          const s = p.scene || p.scenes?.[0] || {};
          const ex = p.existing_scene_new_states || [];
          if (s.d || (s.states && s.states.length > 0) || ex.length > 0) hasData = true;
        } else if (task.entityType === 'item') {
          const i = p.item || p.items?.[0] || {};
          const ex = p.existing_item_new_variants || [];
          if (i.d || (i.variants && i.variants.length > 0) || ex.length > 0) hasData = true;
        }

        if (!hasData) {
          throw new Error('API 错误: 提取数据不完整，大模型仅返回了名称无具体资料');
        }

        return res;
      },
      activeProject.s2bRetries,
      activeProject.s2bRetryDelayMs,
      's2'
    );
    const elapsed = Date.now() - start;
    if (!activeProject.payloads.s2) activeProject.payloads.s2 = [];
    if (r.payload) activeProject.payloads.s2.push({ label: `2b·${task.entityType}·${task.entityName}`, text: r.payload });
    if (r.meta) onMeta(r.meta);
  
  await enqueueAssetMerge(async () => {
    const listKey = task.entityType === 'character' ? 'characters' : task.entityType === 'scene' ? 'scenes' : 'items';
    const oldEntityList = activeProject.assets[listKey] || [];
    const oldEntity = oldEntityList.find(e => e.n === task.entityName || e.s === task.entityName);
    const oldKeys = new Set();
    if (oldEntity) {
      if (task.entityType === 'character') (oldEntity.looks || []).forEach(l => oldKeys.add(l.ln));
      else if (task.entityType === 'scene') (oldEntity.states || []).forEach(s => oldKeys.add(s.sn));
      else if (task.entityType === 'item') (oldEntity.variants || []).forEach(v => oldKeys.add(v.vn));
    }

    const m = await Pipeline.mergeDetail({
      existingAssets: activeProject.assets,
      entityType: task.entityType,
      entityName: task.entityName,
      parsed: r.parsed,
      episodeIndices: task.episodeIndices || indices,
    }, getController('s2').signal);
    activeProject.assets = m.merged;

    const newEntityList = activeProject.assets[listKey] || [];
    const newEntity = newEntityList.find(e => e.n === task.entityName || e.s === task.entityName);
    if (newEntity) {
      newEntity._status = null;
      const added = [];
      if (task.entityType === 'character') {
        (newEntity.looks || []).forEach(l => { if (!oldKeys.has(l.ln)) added.push(`造型:${l.ln}`) });
      } else if (task.entityType === 'scene') {
        (newEntity.states || []).forEach(s => { if (!oldKeys.has(s.sn)) added.push(`状态:${s.sn}`) });
      } else if (task.entityType === 'item') {
        (newEntity.variants || []).forEach(v => { if (!oldKeys.has(v.vn)) added.push(`形态:${v.vn}`) });
      }
      if (added.length > 0) newEntity._updates = added;
    }

    if (r.parsed.per_episode_appearance?.length) {
      for (const epa of r.parsed.per_episode_appearance) {
        const epIdx = (epa.episode_index ?? epa.episodeIndex ?? 0) - 1;
        if (epIdx >= 0) {
          activeProject.episodeAppearance = mergeEpisodeAppearanceLocal(activeProject.episodeAppearance, epIdx, {
            characters: epa.characters,
            scenes: epa.scenes,
            items: epa.items,
          });
        }
      }
    } else {
      for (const epIdx of (r.parsed.appear_episodes || task.episodeIndices || []).map(i => i - 1)) {
        if (epIdx >= 0) {
          activeProject.episodeAppearance = mergeEpisodeAppearanceLocal(activeProject.episodeAppearance, epIdx, r.parsed.appearance);
        }
      }
    }
  });
  autoSave();

  if (entityPre) delete entityPre._status; // 成功后清除状态
  markTaskDone(task);
  } catch (e) {
    if (entityPre) entityPre._status = 'error'; // 失败后标记错误
    throw e;
  }
}

export async function runManualDetailExtraction(entityType, entityName, episodeIndices, overwrite) {
  return withBusy('s2', async () => {
    const episodesForPrompt = episodeIndices.map(i => ({ 
      title: activeProject.episodes[i].title, 
      text: activeProject.episodes[i].text, 
      episode_index: i 
    }));
    
    // If overwrite is true, we pass null as existingEntity so the LLM regenerates the details
    const existingEntity = overwrite ? null : findEntityInAssets(entityType, entityName);

    const r = await Pipeline.extractDetail({
      entityType,
      entityName,
      existingEntity,
      allEpisodes: episodesForPrompt,
      newEpisodeIndices: episodeIndices,
      voiceLibrary: activeProject.voiceLibrary,
      textType: textType.value,
      metaInfo: activeProject.assets.meta_info,
      existingAssets: activeProject.assets,
    }, getController('s2').signal);

    if (!activeProject.payloads.s2) activeProject.payloads.s2 = [];
    if (r.payload) activeProject.payloads.s2.push({ label: `手动分析·${entityType}·${entityName}`, text: r.payload });
    if (!r.parsed) throw new Error('模型未返回有效 JSON');

    await enqueueAssetMerge(async () => {
      // If overwrite, we might need to remove the entity from existingAssets first?
      // Actually, mergeDetail will merge into existing. To overwrite, we should just let mergeDetail handle it. 
      // But if overwrite, we should replace the entity in existingAssets before passing to mergeDetail?
      // Or we can just splice it out of activeProject.assets.
      if (overwrite) {
        if (entityType === 'character') {
          const idx = activeProject.assets.characters.findIndex(c => c.n === entityName);
          if (idx !== -1) activeProject.assets.characters.splice(idx, 1);
        } else if (entityType === 'scene') {
          const idx = activeProject.assets.scenes.findIndex(s => s.s === entityName);
          if (idx !== -1) activeProject.assets.scenes.splice(idx, 1);
        } else if (entityType === 'item') {
          const idx = activeProject.assets.items.findIndex(i => i.n === entityName);
          if (idx !== -1) activeProject.assets.items.splice(idx, 1);
        }
      }
      
      const m = await Pipeline.mergeDetail({
        existingAssets: activeProject.assets,
        entityType,
        entityName,
        parsed: r.parsed,
        episodeIndices,
      }, getController('s2').signal);
      activeProject.assets = m.merged;

      if (r.parsed.per_episode_appearance?.length) {
        for (const epa of r.parsed.per_episode_appearance) {
          const epIdx = (epa.episode_index ?? epa.episodeIndex ?? 0) - 1;
          if (epIdx >= 0) {
            activeProject.episodeAppearance = mergeEpisodeAppearanceLocal(activeProject.episodeAppearance, epIdx, {
              characters: epa.characters,
              scenes: epa.scenes,
              items: epa.items,
            });
          }
        }
      } else {
        for (const epIdx of (r.parsed.appear_episodes || episodeIndices || []).map(i => i - 1)) {
          if (epIdx >= 0) {
            activeProject.episodeAppearance = mergeEpisodeAppearanceLocal(activeProject.episodeAppearance, epIdx, r.parsed.appearance);
          }
        }
      }
      autoSave();
    });
    showToast('success', `已${overwrite ? '重写' : '追加'} ${entityName} 的分析数据`);
  });
}

async function run2bTaskPool(tasks, indices, onMeta) {
  let doneTasks = 0;
  let successCount = 0;
  const poolStart = Date.now();
  assetMergeChain = Promise.resolve();
  await runPool(tasks, Number(activeProject.s2bConcurrency) || 20, async (task) => {
    if (shouldStop('s2')) return;
    try {
      await runOne2bTask(task, indices, onMeta);
      successCount++;
    } catch (e) {
      markTaskFailed(task, e);
    }
    doneTasks++;
    setProg('s2', doneTasks, tasks.length);
  });
  await assetMergeChain;
  return { success: successCount, failed: activeProject.s2FailedTasks.length, total: tasks.length };
}

function getExtractIndices() {
  if (activeProject.extractSelected.length) return [...activeProject.extractSelected].sort((a, b) => a - b);
  const processing = getProcessingIndices();
  if (processing.length) return processing;
  const pending = getPendingIndices();
  if (pending.length) return pending;
  return activeProject.episodes.map((_, i) => i).filter((i) => activeProject.epState.s2[i] !== 'done');
}

function collectDetailTasks(parsed, acc, episodeIndices, updateCheckR) {
  const tasks = [];
  const seen = new Set();
  const add = (entityType, entityName, isUpdate = false) => {
    const key = `${entityType}:${entityName}`;
    if (seen.has(key)) {
      // If we see it again as an update, we should mark the existing task as update
      if (isUpdate) {
        const t = tasks.find(t => t.entityType === entityType && t.entityName === entityName);
        if (t) t.isUpdate = true;
      }
      return;
    }
    seen.add(key);
    let existingEntity = null;
    if (entityType === 'character') existingEntity = acc.characters?.find((c) => c.n === entityName) || null;
    else if (entityType === 'scene') existingEntity = acc.scenes?.find((s) => s.s === entityName) || null;
    else existingEntity = acc.items?.find((it) => it.n === entityName) || null;
    tasks.push({ entityType, entityName, existingEntity, episodeIndices, isUpdate });
  };
  
  const up = updateCheckR?.parsed || parsed || {};
  
  for (const n of parsed?.new_character_names || []) add('character', n, false);
  for (const n of up.existing_character_updates || []) add('character', n, true);
  for (const n of parsed?.new_scene_names || []) add('scene', n, false);
  for (const n of up.existing_scene_updates || []) add('scene', n, true);
  for (const n of parsed?.new_item_names || []) add('item', n, false);
  for (const n of up.existing_item_updates || []) add('item', n, true);
  return tasks;
}

function mergeEpisodeAppearanceLocal(list, episodeIndex, appearance) {
  const arr = [...(list || [])];
  while (arr.length <= episodeIndex) arr.push(null);
  const mergeList = (a = [], b = [], variantKey) => {
    const map = new Map();
    for (const it of a || []) {
      if (typeof it === 'string') map.set(it, new Set());
      else if (it?.n) map.set(it.n, new Set(it[variantKey] || []));
    }
    for (const it of b || []) {
      if (typeof it === 'string') { if (!map.has(it)) map.set(it, new Set()); }
      else if (it?.n) {
        const set = map.get(it.n) || new Set();
        for (const v of it[variantKey] || []) set.add(v);
        map.set(it.n, set);
      }
    }
    return [...map.entries()].map(([n, set]) => ({ n, [variantKey]: set.size ? [...set] : [] }));
  };
  const prev = arr[episodeIndex] || { characters: [], scenes: [], items: [] };
  arr[episodeIndex] = {
    characters: mergeList(prev.characters, appearance?.characters, 'looks'),
    scenes: mergeList(prev.scenes, appearance?.scenes, 'states'),
    items: mergeList(prev.items, appearance?.items, 'variants'),
  };
  return arr;
}

export async function produceAssets(options = {}) {
  const s2Start = Date.now();
  const { resumeOnly = false } = options;
  const N = activeProject.episodes.length;
  if (!N) throw new Error('请先完成分集');
  const indices = options.forceIndices ?? getExtractIndices();
  if (!indices.length && !resumeOnly) throw new Error('没有待提取的集数（可勾选集数或清除已完成标记）');

  if (!resumeOnly) markEpisodesProcessing(indices);

  pipe.s2Running = true;
  while (activeProject.epState.s2.length < N) activeProject.epState.s2.push('');
  while (activeProject.epState.ready.length < N) activeProject.epState.ready.push(false);
  if (!resumeOnly) activeProject.payloads.s2 = [];
  let lastMeta;

  for (const i of indices) {
    if (activeProject.epState.s2[i] !== 'done') activeProject.epState.s2[i] = 'running';
  }

  try {
    let tasks = [];

    if (resumeOnly) {
      tasks = dedupeTasks([
        ...activeProject.s2FailedTasks.map((t) => ({
          entityType: t.entityType,
          entityName: t.entityName,
          existingEntity: findEntityInAssets(t.entityType, t.entityName),
          episodeIndices: t.episodeIndices || indices,
        })),
        ...collectPendingFromAssets(indices),
      ]);
    } else {
      const processingIndices = getProcessingIndices();
      const targetIndices = processingIndices.length ? processingIndices : indices;
      const fullText = targetIndices
        .map((i) => `${activeProject.episodes[i].title || ''}\n${activeProject.episodes[i].text || ''}`)
        .join('\n\n');
      if (!fullText.trim()) throw new Error('请先填写原文或完成分集');

      setProg('s2', 0, 1);
      try {
        const s2aStart = Date.now();
        const hasExistingAssets = (activeProject.assets?.characters?.length || 0) +
                                  (activeProject.assets?.scenes?.length || 0) +
                                  (activeProject.assets?.items?.length || 0) > 0;
        const promises = [
          callWithRetry(
            () => Pipeline.extractNames({
              currentText: fullText,
              textType: textType.value,
              existingAssets: activeProject.assets,
            }, getController('s2').signal),
            activeProject.s2bRetries,
            activeProject.s2bRetryDelayMs,
            's2'
          ),
        ];
        if (hasExistingAssets) {
          promises.push(
            callWithRetry(
              () => Pipeline.checkUpdates({
                currentText: fullText,
                textType: textType.value,
                existingAssets: activeProject.assets,
              }, getController('s2').signal),
              activeProject.s2bRetries,
              activeProject.s2bRetryDelayMs,
              's2'
            ).catch((e) => {
              console.warn('⚠️ 2a_b 更新检查失败:', e.message);
              return { parsed: { existing_character_updates: [], existing_scene_updates: [], existing_item_updates: [] } };
            })
          );
        }

        const results = await Promise.all(promises);
        const namesR = results[0];
        const updateCheckR = results[1] || null;
        if (namesR.payload) activeProject.payloads.s2.push({ label: `2a·名称提取（第${targetIndices.map((i) => i + 1).join('、')}集）`, text: namesR.payload });
        if (updateCheckR?.payload) activeProject.payloads.s2.push({ label: `2a_b·更新检查（第${targetIndices.map((i) => i + 1).join('、')}集）`, text: updateCheckR.payload });
        lastMeta = namesR.meta;
        activeProject.assets = namesR.merged || activeProject.assets;
        tasks = collectDetailTasks(namesR.parsed, activeProject.assets, indices, updateCheckR);
      } catch (e) {
        showToast('warning', `2a 失败（${e.message}），将跳过并仅继续未完成的实体`);
        tasks = collectPendingFromAssets(indices);
      }
    }

    tasks = filterIncompleteTasks(dedupeTasks(tasks));
    if (!tasks.length) {
      for (const i of indices) {
        if (activeProject.s2FailedTasks.length === 0) {
          activeProject.epState.ready[i] = true;
          activeProject.epState.s2[i] = 'done';
          activeProject.episodeAssets[i] = JSON.parse(JSON.stringify(activeProject.assets));
        }
      }
      if (!resumeOnly) markEpisodesCompleted(indices);
      return { ok: true, failed: 0, skipped: true };
    }

    setProg('s2', 0, tasks.length);
    const { failed, total, success } = await run2bTaskPool(tasks, indices, (m) => (lastMeta = m));

    for (const i of indices) {
      if (failed === 0) {
        activeProject.epState.ready[i] = true;
        activeProject.epState.s2[i] = 'done';
      } else {
        activeProject.epState.s2[i] = 'partial';
        activeProject.epState.ready[i] = false;
      }
      activeProject.episodeAssets[i] = JSON.parse(JSON.stringify(activeProject.assets));
    }
    if (failed === 0) markEpisodesCompleted(indices);
    if (lastMeta) {
      const s2Elapsed = Date.now() - s2Start;
      recordMeta('step2', lastMeta, tasks.length, s2Elapsed);
    }
    autoSave();
    return { ok: failed === 0, failed, total, success };
  } catch (e) {
    for (const i of indices) {
      if (activeProject.epState.s2[i] === 'running') activeProject.epState.s2[i] = 'error';
    }
    throw e;
  } finally {
    pipe.s2Running = false;
  }
}

export function runExtract() {
  return withBusy('s2', async () => {
    const r = await produceAssets({ resumeOnly: false });
    autoSave();
    if (r.skipped) {
      showToast('success', '所有实体均已提取完成，无需重复运行');
    } else if (r.failed) {
      showToast('warning', `部分完成：${r.success}/${r.total} 个实体成功，${r.failed} 个失败，可点「继续未完成」`);
    } else {
      showToast('success', `资产提取完成：角色${activeProject.assets.characters.length}/场景${activeProject.assets.scenes.length}/物品${activeProject.assets.items.length}`);
    }
  });
}

export function runExtractForEpisodes(indices, resumeOnly = false) {
  return withBusy('s2', async () => {
    if (!indices || !indices.length) {
      showToast('warning', '请选择至少一集');
      return;
    }
    const r = await produceAssets({ resumeOnly, forceIndices: indices });
    autoSave();
    if (r.skipped) {
      showToast('success', '实体均已提取完成，无需重复运行');
    } else if (r.failed) {
      showToast('warning', `部分完成：${r.success}/${r.total} 成功，${r.failed} 失败，可重试`);
    } else {
      showToast('success', `指定集数资产提取完成`);
    }
  });
}

export function runExtractContinue() {
  withBusy('s2', async () => {
    if (!activeProject.s2FailedTasks.length && !collectPendingFromAssets(getExtractIndices()).length) {
      showToast('error', '没有未完成的实体');
      return;
    }
    const r = await produceAssets({ resumeOnly: true, forceIndices: activeProject.episodes.map((_, i) => i) });
    autoSave();
    if (r.failed) {
      showToast('warning', `仍有 ${r.failed} 个实体失败，可稍后再次继续`);
    } else {
      showToast('success', `未完成实体已全部补全：角${activeProject.assets.characters.length}/景${activeProject.assets.scenes.length}/物${activeProject.assets.items.length}`);
    }
  });
}

// ---------------- Step 3b: 分镜 ----------------
function localMergeStoryboards(parts) {
  const storys = [];
  let id = 1;
  for (let pi = 0; pi < parts.length; pi++) {
    const p = parts[pi];
    if (!p) continue;
    for (const u of p.storys || []) {
      storys.push({ ...u, id: id++, episodeIndex: u.episodeIndex ?? pi });
    }
  }
  return { storys };
}

export function rebuildStoryboard() {
  activeProject.storyboard = localMergeStoryboards(activeProject.episodeStoryboard);
}

function isEpisodeAssetReady(i) {
  return !!(activeProject.epState.ready[i] || activeProject.episodeAssets[i] || activeProject.epState.s2[i] === 'done');
}

export function syncEpisodeReady() {
  const N = activeProject.episodes.length;
  if (!N) return;
  while (activeProject.epState.ready.length < N) activeProject.epState.ready.push(false);
  const step2Done = !!activeProject.stepMeta.step2?.ranAt;
  for (let i = 0; i < N; i++) {
    if (activeProject.episodeAssets[i] || activeProject.episodeAppearance[i] || activeProject.epState.s2[i] === 'done') {
      activeProject.epState.ready[i] = true;
    } else if (step2Done && activeProject.assets?.characters?.length && activeProject.epState.s2[i] !== 'pending') {
      activeProject.epState.ready[i] = true;
      if (!activeProject.episodeAssets[i]) activeProject.episodeAssets[i] = activeProject.assets;
    }
  }
}

async function runPool(items, limit, fn, stopKey = null) {
  const queue = [...items];
  const n = Math.max(1, Math.min(limit, queue.length));
  const workers = Array.from({ length: n }, async () => {
    while (queue.length) {
      if (stopKey && shouldStop(stopKey)) { queue.length = 0; break; }
      const item = queue.shift();
      if (item === undefined) break;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function getEpisodeScenes(scopedAssets, appearance) {
  if (!appearance?.scenes?.length) return scopedAssets?.scenes || [];
  const names = new Set(appearance.scenes.map((s) => s.n || s.s));
  return (scopedAssets?.scenes || []).filter((s) => names.has(s.s));
}

async function runOneStoryboard(i, onMeta) {
  const sbStart = Date.now();
  activeProject.epState.sb[i] = 'running';
  activeProject.epState.sbSplit[i] = 'running';
  activeProject.epState.sbShots[i] = '';
  activeProject.epState.s4x[i] = '';
  if (!activeProject.payloads.s3b) activeProject.payloads.s3b = [];
  try {
    const scopedAssets = activeProject.episodeAssets[i] || activeProject.assets;
    const appearance = activeProject.episodeAppearance[i] || null;
    const epTitle = activeProject.episodes[i].title || `第${i + 1}集`;
    const episodeText = activeProject.episodes[i].text;
    const maxUnitChars = Number(getSplit().maxUnitChars) || 500;
    const chunks = segmentTextByChars(episodeText, maxUnitChars);
    const chunkUnitsStore = new Array(chunks.length);
    const shotMap = new Map();
    let shotsChain = Promise.resolve();
    let anySplitForced = false;

    const rebuildPartial = () => {
      const storys = [];
      let globalId = 1;
      for (let ci = 0; ci < chunkUnitsStore.length; ci++) {
        if (!chunkUnitsStore[ci]) continue;
        for (const u of chunkUnitsStore[ci]) {
          const groupedUnits = shotMap.get(u.id);
          if (groupedUnits && groupedUnits.length > 0) {
            for (const gu of groupedUnits) {
              storys.push({
                id: globalId++,
                episodeIndex: i,
                loc: gu.loc || u.loc || { n: '', v: '' },
                ct: gu.ct || u.ct,
                shots: gu.shots || [],
                totalTime: gu.totalTime
              });
            }
          } else {
            storys.push({
              id: globalId++,
              episodeIndex: i,
              loc: u.loc || { n: '', v: '' },
              ct: u.ct,
              shots: []
            });
          }
        }
      }
      activeProject.episodeStoryboard[i] = { storys };
      rebuildStoryboard();
    };

    const runShotsForUnits = async (units) => {
      if (!units.length) return;
      activeProject.epState.sbShots[i] = 'running';
      const batchSize = activeProject.mode === 'script' ? 1 : Math.max(1, Number(getShot().batchSize) || 5);
      const batches = [];
      for (let j = 0; j < units.length; j += batchSize) batches.push(units.slice(j, j + batchSize));

      await runPool(batches, Number(getShot().concurrency) || 4, async (batch) => {
        if (shouldStop('s3b')) return;
        const r = await Pipeline.createShots({
          mode: activeProject.mode,
          units: batch,
          assets: scopedAssets,
          appearance,
          analysis: activeProject.analysis,
          creativeOverride: activeProject.creativeOverrideShots,
          episodeText: episodeText || '',
          scriptMergeMaxSec: activeProject.scriptMergeMaxSec,
          narrationMergeMaxSec: activeProject.narrationMergeMaxSec,
        }, getController('s3b').signal);
        
        if (r.payload) {
          activeProject.payloads.s3b.push({
            label: activeProject.mode === 'script' ? `${epTitle}·场次${batch[0]?.id}镜头` : `${epTitle}·镜头·${batch[0]?.id}-${batch[batch.length - 1]?.id}`,
            text: r.payload,
          });
        }
        if (r.meta) onMeta?.(r.meta);
        for (const s of r.storys || []) {
          const sid = (activeProject.mode === 'script' && s.originalSceneId) ? s.originalSceneId : s.id;
          if (!shotMap.has(sid)) shotMap.set(sid, []);
          shotMap.get(sid).push(s);
        }
        rebuildPartial();
      }, 's3b');
    };

    if (activeProject.mode === 'script') {
      activeProject.epState.sbSplit[i] = 'running';
      const splitR = await Pipeline.splitStoryboard({
        mode: 'script',
        episodeText,
        scenes: getEpisodeScenes(scopedAssets, appearance),
        analysis: activeProject.analysis,
        creativeOverride: activeProject.creativeOverrideSplit,
      }, getController('s3b').signal);

      for (const p of splitR.payloads || []) {
        activeProject.payloads.s3b.push({ label: `${epTitle}·场次拆分`, text: p.text || p });
      }
      if (splitR.meta) onMeta?.(splitR.meta);
      activeProject.epState.sbSplit[i] = 'done';

      const units = (splitR.units || []).map((u) => ({
        id: u.id,
        ct: u.ct,
      }));
      chunkUnitsStore.length = 1;
      chunkUnitsStore[0] = units;

      await runShotsForUnits(units);
    } else {
      await runPool(
        chunks.map((text, ci) => ({ text, ci })),
        Number(getSplit().concurrency) || 4,
        async ({ text, ci }) => {
          if (shouldStop('s3b')) return;
          const splitR = await Pipeline.splitChunk({
            mode: activeProject.mode,
            chunkText: text,
            chunkIndex: ci,
            scenes: getEpisodeScenes(scopedAssets, appearance),
            maxUnitChars,
            maxRetries: Number(getSplit().maxRetries) ?? 2,
            analysis: activeProject.analysis,
            creativeOverride: activeProject.creativeOverrideSplit,
          }, getController('s3b').signal);
          
          for (const p of splitR.payloads || []) {
            activeProject.payloads.s3b.push({ label: `${epTitle}·拆分·段${ci + 1}`, text: p.text || p });
          }
          if (splitR.meta) onMeta?.(splitR.meta);
          if (splitR.forced) anySplitForced = true;

          const units = (splitR.units || []).map((u) => ({
            id: tempUnitId(ci, u.id),
            loc: u.loc,
            ct: u.ct,
          }));
          chunkUnitsStore[ci] = units;

          shotsChain = shotsChain.then(() => runShotsForUnits(units));
        },
        's3b'
      );

      await shotsChain;
    }

    const sbElapsed = Date.now() - sbStart;
    if (activeProject.mode !== 'script') {
      activeProject.epState.sbSplit[i] = anySplitForced ? 'partial' : 'done';
    }
    activeProject.epState.sbShots[i] = 'done';
    activeProject.epState.sb[i] = 'done';
    autoSave();

    if (activeProject.mode !== 'script' && anySplitForced) {
      showToast('warning', `第${i + 1}集部分段落拆分校验未通过，已强制继续镜头创作`);
    }
  } catch (e) {
    activeProject.epState.sb[i] = 'error';
    if (activeProject.epState.sbSplit[i] !== 'done' && activeProject.epState.sbSplit[i] !== 'partial') activeProject.epState.sbSplit[i] = 'error';
    if (activeProject.epState.sbShots[i] !== 'done') activeProject.epState.sbShots[i] = 'error';
    if (activeProject.epState.s4x[i] === 'running') activeProject.epState.s4x[i] = 'error';
    showToast('error', `第${i + 1}集分镜失败：${e.message}`);
    throw e;
  }
}

export function runStoryboard() {
  const N = activeProject.episodes.length;
  if (!N) { showToast('error', '请先完成分集'); return; }
  
  const selected = activeProject.sbSelected;
  const hasSelection = selected.length > 0;
  
  if (hasSelection) {
    for (const i of selected) {
      activeProject.episodeStoryboard[i] = null;
      activeProject.groupedStoryboardPerEpisode[i] = null;
      activeProject.epState.sb[i] = '';
      activeProject.epState.sbSplit[i] = '';
      activeProject.epState.sbShots[i] = '';
    }
    rebuildStoryboard();
  }

  const targetIndices = [];
  for (let i = 0; i < N; i++) {
    if (hasSelection && !selected.includes(i)) continue;
    if (activeProject.epState.sb[i] !== 'done') {
      targetIndices.push(i);
    }
  }

  if (!targetIndices.length) { 
    showToast('warning', '没有可生成分镜的剧集'); 
    return; 
  }
  
  enqueueEpisodePipeline(targetIndices, { runVideo: false });
  showToast('success', `已将 ${targetIndices.length} 集加入后台并发队列（仅生成分镜）`);
}

// ---------------- Step 3a: 类型分析 ----------------
export function runAnalyze() {
  return withBusy('s3a', async () => {
    if (shouldStop('s3a')) return;
    const start = Date.now();
    const fullText = activeProject.inputText || activeProject.episodes.map(e => `${e.title || ''}\n${e.text || ''}`).join('\n\n');
    const r = await Pipeline.analyze({ fullText, metaInfo: activeProject.assets.meta_info }, getController('s3a').signal);
    activeProject.analysis = r.parsed;
    if (r.payload) activeProject.payloads.s3a = [{ label: '类型分析', text: r.payload }];
    recordMeta('step3a', r.meta, 1, Date.now() - start);
    autoSave();
    showToast('success', `推荐策略：${r.parsed.recommended_strategy}`);
  });
}

// ---------------- Step 4x: 解说模式单元归并 ----------------
export function runGroupUnits() {
  return withBusy('s4x', async () => {
    const start = Date.now();
    const N = activeProject.episodes.length;
    const selected = activeProject.sbSelected || [];
    const hasSelection = selected.length > 0;

    if (hasSelection) {
      for (const i of selected) {
        if (activeProject.episodeStoryboard[i] && activeProject.episodeStoryboard[i].storys) {
          activeProject.groupedStoryboardPerEpisode[i] = null;
          activeProject.epState.s4x[i] = '';
        }
      }
    }

    const findReady = () => {
      const ready = [];
      for (let i = 0; i < N; i++) {
        if (hasSelection && !selected.includes(i)) continue;
        if (activeProject.epState.s4x[i] === 'done') continue;
        const epSb = activeProject.episodeStoryboard[i];
        if (epSb && epSb.storys && epSb.storys.length > 0) ready.push(i);
      }
      return ready;
    };

    let readyIndices = findReady();
    if (!readyIndices.length) {
      showToast('warning', hasSelection ? '勾选的集没有可归并的分镜数据' : '没有可归并的新剧集（上游分镜尚未完成或已全部归并）');
      return;
    }

    while (readyIndices.length) {
      for (const i of readyIndices) {
        if (shouldStop('s4x')) break;
        activeProject.epState.s4x[i] = 'running';
        const epSb = activeProject.episodeStoryboard[i];
        if (epSb && epSb.storys) {
          epSb.storys.forEach(s => { s.episodeIndex = i; });
        }
        const r = await Pipeline.groupUnits({
          storyboard: epSb,
          episodeCount: 1,
          mode: activeProject.mode,
          maxSec: activeProject.mode === 'script' ? activeProject.scriptMergeMaxSec : 15
        }, getController('s4x').signal);
        activeProject.groupedStoryboardPerEpisode[i] = r.grouped;
        activeProject.epState.s4x[i] = 'done';

        const allStorys = [];
        for (const ep of activeProject.groupedStoryboardPerEpisode) {
          if (ep && ep.storys) allStorys.push(...ep.storys);
        }
        activeProject.groupedStoryboard = { storys: allStorys };
      }

      if (shouldStop('s4x')) break;
      await sleep(1000);
      readyIndices = findReady();
    }

    recordProgramStep('step4x', `归并完成`, Date.now() - start);
    autoSave();
    if (hasSelection) {
      showToast('success', '所选集归并完成！(单元结构已更新，请进入下一步重新生成视频提示词)');
    } else {
      showToast('success', '单元归并完成');
    }
  });
}

// ---------------- Step 4a: 镜头分类 ----------------
export function runClassify() {
  return withBusy('s4a', async () => {
    const start = Date.now();
    const N = activeProject.episodes.length;
    const selected = activeProject.s4aSelected;
    const hasSelection = selected.length > 0;

    const findReady = () => {
      const ready = [];
      for (let i = 0; i < N; i++) {
        if (hasSelection && !selected.includes(i)) continue;
        if (!hasSelection && activeProject.epState.s4a[i] === 'done') continue;
        const sb = (activeProject.mode === 'narration' || activeProject.mode === 'script') ? activeProject.groupedStoryboardPerEpisode[i] : activeProject.episodeStoryboard[i];
        if (sb && sb.storys && sb.storys.length > 0) ready.push(i);
      }
      return ready;
    };

    let readyIndices = findReady();
    if (!readyIndices.length) {
      showToast('warning', hasSelection ? '勾选的集没有可分类的数据' : '没有可分类的新剧集（上游尚未完成或已全部分类）');
      return;
    }

    if (!hasSelection) {
      const unitIdsToRemove = new Set();
      for (const i of readyIndices) {
        const sb = (activeProject.mode === 'narration' || activeProject.mode === 'script') ? activeProject.groupedStoryboardPerEpisode[i] : activeProject.episodeStoryboard[i];
        if (sb && sb.storys) {
          for (const u of sb.storys) unitIdsToRemove.add(u.id);
        }
      }
      if (unitIdsToRemove.size) {
        activeProject.classifications = activeProject.classifications.filter((c) => !unitIdsToRemove.has(c.unit_id));
      }
    } else {
      const unitIdsToRemove = new Set();
      for (const i of selected) {
        const sb = (activeProject.mode === 'narration' || activeProject.mode === 'script') ? activeProject.groupedStoryboardPerEpisode[i] : activeProject.episodeStoryboard[i];
        if (sb && sb.storys) {
          for (const u of sb.storys) unitIdsToRemove.add(u.id);
        }
      }
      activeProject.classifications = activeProject.classifications.filter((c) => !unitIdsToRemove.has(c.unit_id));
    }

    while (readyIndices.length) {
      for (const i of readyIndices) {
        if (shouldStop('s4a')) break;
        activeProject.epState.s4a[i] = 'running';
        const sb = (activeProject.mode === 'narration' || activeProject.mode === 'script') ? activeProject.groupedStoryboardPerEpisode[i] : activeProject.episodeStoryboard[i];
        const r = await Pipeline.classify({ storyboard: sb, mode: activeProject.mode }, getController('s4a').signal);
        for (const c of r.parsed) activeProject.classifications.push(c);
        activeProject.epState.s4a[i] = 'done';
      }

      if (shouldStop('s4a')) break;
      if (hasSelection) break;
      await sleep(1000);
      readyIndices = findReady();
    }

    if (activeProject.classifications.length) activeProject.payloads.s4a = [{ label: '镜头分类', text: JSON.stringify(activeProject.classifications, null, 2) }];
    recordMeta('step4a', { model: activeProject.classifications[0]?.model }, activeProject.classifications.length, Date.now() - start);
    autoSave();
    showToast('success', `镜头分类完成：${activeProject.classifications.length} 条`);
  });
}

// ---------------- Step 4c: 视频提示词 ----------------
export function runVideo() {
  return withBusy('s4c', async () => {
    const start = Date.now();
    const N = activeProject.episodes.length;
    const selected = activeProject.s4cSelected;
    const hasSelection = selected.length > 0;
    activeProject.payloads.s4c = [];
    let lastMeta;

    const findReady = () => {
      const ready = [];
      for (let i = 0; i < N; i++) {
        if (hasSelection && !selected.includes(i)) continue;
        if (!hasSelection && activeProject.epState.s4c[i] === 'done') continue;
        const sb = (activeProject.mode === 'narration' || activeProject.mode === 'script') ? activeProject.groupedStoryboardPerEpisode[i] : activeProject.episodeStoryboard[i];
        if (sb && sb.storys && sb.storys.length > 0) ready.push(i);
      }
      return ready;
    };

    let readyIndices = findReady();
    if (!readyIndices.length) {
      showToast('warning', hasSelection ? '勾选的集没有可生成视频提示词的数据' : '没有可生成视频提示词的新剧集（上游尚未完成或已全部生成）');
      return;
    }

    if (hasSelection) {
      activeProject.videoPrompts = activeProject.videoPrompts.filter((vp) => !selected.includes(vp.episodeIndex));
    }

    while (readyIndices.length) {
      for (const i of readyIndices) {
        if (shouldStop('s4c')) break;
        activeProject.epState.s4c[i] = 'running';
        const sb = (activeProject.mode === 'narration' || activeProject.mode === 'script') ? activeProject.groupedStoryboardPerEpisode[i] : activeProject.episodeStoryboard[i];
        if (!sb || !sb.storys || !sb.storys.length) { activeProject.epState.s4c[i] = 'done'; continue; }

        const typeMap = new Map(activeProject.classifications.map((c) => [c.unit_id, c.type]));
        const units = sb.storys;
        const missingUnits = units.filter((u) => !typeMap.has(u.id));
        if (missingUnits.length) {
          const r = await Pipeline.classify({ storyboard: { storys: missingUnits }, mode: activeProject.mode }, getController('s4c').signal);
          for (const c of r.parsed) {
            activeProject.classifications.push(c);
            typeMap.set(c.unit_id, c.type);
          }
        }

        const out = new Array(units.length);
        let doneCount = 0;
        const scopedAssets = activeProject.episodeAssets[i] || activeProject.assets;

        await runPool(
          units.map((u, j) => ({ u, j })),
          Number(activeProject.s4cConcurrency) || 5,
          async ({ u, j }) => {
            if (shouldStop('s4c')) return;
            setProg('s4c', doneCount, units.length);
            const unitText = Array.isArray(u.ct) ? u.ct.join('\n') : (u.ct || '');
            const r = await Pipeline.video({
              mode: activeProject.mode,
              unit: u,
              type: typeMap.get(u.id) || '基础文戏',
              frozen: null,
              assets: scopedAssets,
              n: j + 1,
              creativeOverrides: activeProject.creativeOverrides,
              episodeText: activeProject.episodes[i]?.text || '',
              unitEpisodeIndex: i + 1,
              unitText,
            }, getController('s4c').signal);
            
            if (r.payload) activeProject.payloads.s4c.push({ label: `第${i + 1}集·单元 ${j + 1}（${typeMap.get(u.id) || '基础文戏'}）`, text: r.payload });
            lastMeta = r.meta;
            out[j] = { ...r.parsed, episodeIndex: i };
            doneCount++;
            setProg('s4c', doneCount, units.length);
          },
          's4c'
        );

        const epOut = out.filter(Boolean);
        activeProject.videoPrompts = [...activeProject.videoPrompts, ...epOut];
        activeProject.epState.s4c[i] = 'done';
      }

      if (shouldStop('s4c')) break;
      if (hasSelection) break;
      await sleep(1000);
      readyIndices = findReady();
    }

    recordMeta('step4c', lastMeta, activeProject.videoPrompts.length, Date.now() - start);
    autoSave();
    showToast('success', `视频提示词完成：${activeProject.videoPrompts.length} 条`);
    await runValidateVp();
  });
}

export function runValidateVp() {
  return withBusy('s4d', async () => {
    const r = await Pipeline.validateVp({
      videoPrompts: activeProject.videoPrompts,
      storyboard: activeProject.storyboard,
      assets: activeProject.assets,
    }, getController('s4d').signal);
    vpValidation.value = r;
    recordProgramStep('step4d', `${r.pass ? '通过' : r.issues.length + ' 项提示'}`);
    autoSave();
  });
}

// ---------------- 一键全流程自动化运行 ----------------
export const fullPipelineRunning = ref(false);
export const fullPipelineStop = ref(false);

async function runEpisodeStep3b(i) {
  const ep = activeProject.episodes[i];
  if (!ep) return;

  if (!activeProject.analysis && !busy.s3a) {
    await runAnalyze();
  } else if (!activeProject.analysis && busy.s3a) {
    while (busy.s3a) await sleep(200);
  }

  if (activeProject.epState.sb[i] !== 'done') {
    const sbStart = Date.now();
    let sbMeta = null;
    await runOneStoryboard(i, (m) => { if (m) sbMeta = m; });
    rebuildStoryboard();
    recordMeta('step3b', sbMeta, activeProject.episodeStoryboard[i]?.storys?.length || 1, Date.now() - sbStart);
  }
}

async function runEpisodeStep4(i) {
  const ep = activeProject.episodes[i];
  if (!ep) return;

  if (activeProject.epState.s4x[i] !== 'done') {
    activeProject.epState.s4x[i] = 'running';
    try {
      const epSb = activeProject.episodeStoryboard[i];
      const r = await Pipeline.groupUnits({
        storyboard: epSb,
        episodeCount: 1,
        mode: activeProject.mode,
        maxSec: activeProject.mode === 'script' ? activeProject.scriptMergeMaxSec : 15
      }, getController('s4x')?.signal);
      
      activeProject.groupedStoryboardPerEpisode[i] = r.grouped;
      activeProject.epState.s4x[i] = 'done';
      
      const allStorys = [];
      for (const ep of activeProject.groupedStoryboardPerEpisode) {
        if (ep && ep.storys) allStorys.push(...ep.storys);
      }
      activeProject.groupedStoryboard = { storys: allStorys };
    } catch (e) {
      activeProject.epState.s4x[i] = 'error';
      throw e;
    }
  }

  if (activeProject.epState.s4a[i] !== 'done') {
    activeProject.epState.s4a[i] = 'running';
    const s4aStart = Date.now();
    try {
      const sb = activeProject.groupedStoryboardPerEpisode[i];
      const r = await Pipeline.classify({ storyboard: sb, mode: activeProject.mode }, getController('s4a')?.signal);
      for (const c of r.parsed) activeProject.classifications.push(c);
      if (!activeProject.payloads.s4a) activeProject.payloads.s4a = [];
      if (r.payload) activeProject.payloads.s4a.push({ label: `第${i + 1}集·镜头分类`, text: r.payload });
      recordMeta('step4a', r.meta, r.parsed?.length || 1, Date.now() - s4aStart);
      activeProject.epState.s4a[i] = 'done';
    } catch (e) {
      activeProject.epState.s4a[i] = 'error';
      throw e;
    }
  }

  if (activeProject.epState.s4c[i] !== 'done') {
    activeProject.epState.s4c[i] = 'running';
    const s4cStart = Date.now();
    try {
      const sb = activeProject.groupedStoryboardPerEpisode[i];
      if (!sb) throw new Error(`第${i + 1}集分镜数据不存在，无法生成视频提示词`);
      const scopedAssets = activeProject.episodeAssets[i] || activeProject.assets;
      const units = sb.storys || [];

      const typeMap = new Map(activeProject.classifications.map((c) => [c.unit_id, c.type]));
      const missingUnits = units.filter((u) => !typeMap.has(u.id));
      if (missingUnits.length) {
        const r = await Pipeline.classify({ storyboard: { storys: missingUnits }, mode: activeProject.mode }, getController('s4a')?.signal);
        for (const c of r.parsed) {
          activeProject.classifications.push(c);
          typeMap.set(c.unit_id, c.type);
        }
      }

      const out = new Array(units.length);
      const payloadsOut = new Array(units.length);
      let lastMeta = null;
      let doneCount = 0;
      await runPool(
        units.map((u, j) => ({ u, j })),
        Number(activeProject.s4cConcurrency) || 5,
        async ({ u, j }) => {
          if (fullPipelineStop.value) return;
          const unitText = Array.isArray(u.ct) ? u.ct.join('\n') : (u.ct || '');
          const r = await Pipeline.video({
            mode: activeProject.mode,
            unit: u,
            type: typeMap.get(u.id) || '基础文戏',
            frozen: null,
            assets: scopedAssets,
            n: j + 1,
            creativeOverrides: activeProject.creativeOverrides,
            episodeText: activeProject.episodes[i]?.text || '',
            unitEpisodeIndex: i + 1,
            unitText,
          }, getController('s4c')?.signal);
          out[j] = r.parsed;
          if (r.meta) lastMeta = r.meta;
          if (r.payload) {
            payloadsOut[j] = { label: `第${i + 1}集·单元${j + 1}（${typeMap.get(u.id) || '基础文戏'}）`, text: r.payload };
          }
          doneCount++;
        },
        's4c'
      );
      
      for (let j = 0; j < units.length; j++) {
        if (out[j]) activeProject.videoPrompts.push({ ...out[j], episodeIndex: i });
        if (payloadsOut[j]) {
          if (!activeProject.payloads.s4c) activeProject.payloads.s4c = [];
          activeProject.payloads.s4c.push(payloadsOut[j]);
        }
      }
      activeProject.epState.s4c[i] = 'done';
      recordMeta('step4c', lastMeta, units.length, Date.now() - s4cStart);
    } catch (e) {
      activeProject.epState.s4c[i] = 'error';
      throw e;
    }
  }
}

export async function runFullPipeline() {
  if (fullPipelineRunning.value) return;
  if (!activeProject.name) {
    showToast('error', '请先选择或创建一个项目');
    return;
  }
  if (!activeProject.inputText.trim() && !activeProject.episodes.length) {
    showToast('error', '请先填写原文或手动添加集数');
    return;
  }

  fullPipelineRunning.value = true;
  fullPipelineStop.value = false;
  try {
    if (activeProject.inputText.trim()) {
      await runSegment();
    }
    if (fullPipelineStop.value) { showToast('warning', '全流程已停止'); return; }

    const N = activeProject.episodes.length;
    if (!N) { showToast('error', '分集失败，没有获得分集数据'); return; }

    try {
      // 只有在真的有待提取集数时才提取
      const pendingIndices = getExtractIndices();
      if (pendingIndices.length > 0) {
        await produceAssets();
      }
    } catch (e) {
      showToast('error', `资产提取失败: ${e.message}`);
      return;
    }
    if (fullPipelineStop.value) { showToast('warning', '全流程已停止'); return; }

    if (!activeProject.analysis) {
      await runAnalyze();
    }
    if (fullPipelineStop.value) { showToast('warning', '全流程已停止'); return; }

    const concurrency = Math.max(1, Math.min(Number(getSbC()) || 2, N));

    getController('s4x');
    getController('s4a');
    getController('s4c');

    if (!activeProject.payloads.s3b) activeProject.payloads.s3b = [];
    if (!activeProject.payloads.s4c) activeProject.payloads.s4c = [];

    // Identify all incomplete episodes that need processing
    const pendingIndices = [];
    for (let i = 0; i < N; i++) {
      if (activeProject.epState.s4c[i] !== 'done') {
        pendingIndices.push(i);
      }
    }
    
    if (pendingIndices.length === 0) {
      showToast('success', `全流程检测完成！${N} 集已全部处理完毕`);
    } else {
      enqueueEpisodePipeline(pendingIndices, { runVideo: true });
      showToast('success', `全流程已启动，共有 ${pendingIndices.length} 集加入后台处理队列`);
    }

  } catch (e) {
    showToast('error', `全流程启动出错：${e.message}`);
  }
}

// ---------------- 全局分集并发队列后台守护 ----------------
export const episodePipelineQueue = ref([]);
export const activeEpisodeTasks = reactive(new Set());
let daemonRunning = false;
let produceAssetsLock = false;

async function processEpisodePipelineDaemon() {
  if (daemonRunning) return;
  daemonRunning = true;
  fullPipelineRunning.value = true;

  while (true) {
    if (fullPipelineStop.value) {
      episodePipelineQueue.value = [];
      activeEpisodeTasks.clear();
      daemonRunning = false;
      fullPipelineRunning.value = false;
      return;
    }

    const concurrency = Math.max(1, Math.min(Number(getSbC()) || 2, activeProject.episodes.length));

    while (activeEpisodeTasks.size < concurrency && episodePipelineQueue.value.length > 0) {
      const taskObj = episodePipelineQueue.value.shift();
      const idx = taskObj.idx;
      if (activeEpisodeTasks.has(idx)) continue;
      
      activeEpisodeTasks.add(idx);
      
      (async (i, runVideo) => {
        try {
          // Check if assets need extraction for this episode
          if (activeProject.epState.s2[i] !== 'done') {
            while (produceAssetsLock) await sleep(500);
            if (fullPipelineStop.value) return;
            // Double check after lock
            if (activeProject.epState.s2[i] !== 'done') {
              produceAssetsLock = true;
              try {
                // Ensure the project still has episodes
                if (i < activeProject.episodes.length) {
                  await produceAssets({ forceIndices: [i] });
                }
              } catch(e) {
                console.warn(`自动补充提取资产失败 集数 ${i+1}:`, e);
              } finally {
                produceAssetsLock = false;
              }
            }
          }

          if (fullPipelineStop.value) return;

          // If assets successfully extracted or already done, proceed to storyboard
          if (activeProject.epState.s2[i] === 'done' || activeProject.episodeAssets[i]) {
            if (activeProject.epState.sb[i] !== 'done') {
              await runEpisodeStep3b(i);
            }
            if (fullPipelineStop.value) return;
            if (runVideo && activeProject.epState.s4c[i] !== 'done') {
              await runEpisodeStep4(i);
            }
          }
        } catch (e) {
          console.error(`并发执行管线失败 集数 ${i+1}:`, e);
        } finally {
          activeEpisodeTasks.delete(i);
        }
      })(idx, taskObj.runVideo);
    }

    if (episodePipelineQueue.value.length === 0 && activeEpisodeTasks.size === 0) {
      daemonRunning = false;
      fullPipelineRunning.value = false;
      if (!fullPipelineStop.value) {
        showToast('success', '全流程及所有后台队列任务已处理完成');
      }
      break;
    }

    await sleep(500);
  }
}

export function enqueueEpisodePipeline(indices, options = { runVideo: true }) {
  fullPipelineStop.value = false; // clear stop flag if previously set
  for (const i of indices) {
    if (!episodePipelineQueue.value.find(q => q.idx === i) && !activeEpisodeTasks.has(i)) {
      episodePipelineQueue.value.push({ idx: i, runVideo: options.runVideo });
    }
  }
  processEpisodePipelineDaemon();
}

export function stopFullPipeline() {
  fullPipelineStop.value = true;
  let s2Warning = '';
  
  if (busy.s1) stopStep('s1');
  if (busy.s2) {
    s2Warning = '\n\n注意：资产分析已经启动。为保证资产数据完整，系统将等待本次资产分析全部完成后，再自动停止后续的分镜和视频生成环节。';
  }
  if (busy.s3a) stopStep('s3a');
  if (busy.s3b) stopStep('s3b');
  if (busy.s4x) stopStep('s4x');
  if (busy.s4a) stopStep('s4a');
  if (busy.s4c) stopStep('s4c');
  
  showToast('warning', `全流程已收到停止指令${s2Warning}`);
}

// ---------------- 参数加载与持久化 ----------------
const GLOBAL_SETTINGS_KEY = 'video_prompt_studio_pipeline_settings';
export function saveGlobalSettings() {
  try {
    localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify({
      segNarration: { ...segNarration },
      segScript: { ...segScript },
      splitNarration: { ...splitNarration },
      splitScript: { ...splitScript },
      shotNarration: { ...shotNarration },
      shotScript: { ...shotScript },
      sbConcurrencyNarration: sbConcurrencyNarration.value,
      sbConcurrencyScript: sbConcurrencyScript.value,
    }));
  } catch { /* ignore */ }
}

export function loadGlobalSettings() {
  try {
    const raw = localStorage.getItem(GLOBAL_SETTINGS_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (s.segNarration) Object.assign(segNarration, s.segNarration);
    if (s.segScript) Object.assign(segScript, s.segScript);
    if (s.splitNarration) Object.assign(splitNarration, s.splitNarration);
    if (s.splitScript) Object.assign(splitScript, s.splitScript);
    if (s.shotNarration) Object.assign(shotNarration, s.shotNarration);
    if (s.shotScript) Object.assign(shotScript, s.shotScript);
    if (s.sbConcurrencyNarration != null) sbConcurrencyNarration.value = s.sbConcurrencyNarration;
    if (s.sbConcurrencyScript != null) sbConcurrencyScript.value = s.sbConcurrencyScript;
    return true;
  } catch { return false; }
}

loadGlobalSettings();

watch(
  () => [
    segNarration.useModel, segNarration.maxChars,
    segScript.useModel, segScript.maxChars,
    splitNarration.maxUnitChars, splitNarration.concurrency, splitNarration.maxRetries,
    splitScript.maxUnitChars, splitScript.concurrency, splitScript.maxRetries,
    shotNarration.batchSize, shotNarration.concurrency,
    shotScript.batchSize, shotScript.concurrency,
    sbConcurrencyNarration.value, sbConcurrencyScript.value,
  ],
  () => saveGlobalSettings(),
  { deep: true }
);

watch(
  () => activeProject.name,
  (newVal) => {
    if (newVal) {
      syncEpisodeReady();
      rebuildStoryboard();
    }
  }
);
