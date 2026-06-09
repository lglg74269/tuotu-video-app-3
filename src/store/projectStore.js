import { reactive } from 'vue';
import { Projects } from '../api/client.js';

// 当前激活项目的全局响应式状态
export const activeProject = reactive({
  name: '',         // 项目唯一ID
  title: '',        // 项目名称
  mode: 'narration',// narration | script
  createdAt: '',
  updatedAt: '',
  
  // 工作流流转数据
  inputText: '',
  voiceLibrary: '', // 音色库设置
  globalStyle: '', // 全局风格
  episodes: [],
  episodeAppearance: [],
  episodeAssets: [], // 每集资产快照
  episodeStoryboard: [], // 每集原始分镜
  groupedStoryboardPerEpisode: [], // 每集归并分镜
  assets: { characters: [], scenes: [], items: [], narrator: '', meta_info: null },
  analysis: null,
  
  // 原始分镜与归并分镜
  storyboard: { storys: [] },
  groupedStoryboard: { storys: [] },
  
  classifications: [],
  videoPrompts: [],
  
  // 执行状态与档案
  stepMeta: {},
  payloads: {},
  s2FailedTasks: [], // 2b提取失败的任务
  
  // 各步骤的状态，如：pending, processing, completed 等
  episodeStatus: {}, // { 0: 'completed', 1: 'pending' }
  epState: {
    s2: [],
    ready: [],
    sb: [],
    sbSplit: [],
    sbShots: [],
    s4x: [],
    s4a: [],
    s4c: []
  },

  // 流程设置与模版
  s2bConcurrency: 20,
  s2bRetries: 2,
  s2bRetryDelayMs: 2000,
  sbConcurrency: 4,
  s4cConcurrency: 10,
  scriptMergeMaxSec: 10,
  narrationMergeMaxSec: 15,
  creativeOverrideSplit: '',
  creativeOverrideShots: '',
  creativeOverrides: {},

  // 选择标记
  extractSelected: [],
  s4xSelected: [],
  s4aSelected: [],
  s4cSelected: [],
  sbSelected: [],
  uploadHistory: []
});

// 重置状态
export function resetActiveProject() {
  activeProject.name = '';
  activeProject.title = '';
  activeProject.mode = 'narration';
  activeProject.inputText = '';
  activeProject.voiceLibrary = '';
  activeProject.globalStyle = '';
  activeProject.episodes = [];
  activeProject.episodeAppearance = [];
  activeProject.episodeAssets = [];
  activeProject.episodeStoryboard = [];
  activeProject.groupedStoryboardPerEpisode = [];
  activeProject.assets = { characters: [], scenes: [], items: [], narrator: '', meta_info: null };
  activeProject.analysis = null;
  activeProject.storyboard = { storys: [] };
  activeProject.groupedStoryboard = { storys: [] };
  activeProject.classifications = [];
  activeProject.videoPrompts = [];
  activeProject.stepMeta = {};
  activeProject.payloads = {};
  activeProject.s2FailedTasks = [];
  activeProject.episodeStatus = {};
  activeProject.epState = { s2: [], ready: [], sb: [], sbSplit: [], sbShots: [], s4x: [], s4a: [], s4c: [] };

  // 配置重置
  activeProject.s2bConcurrency = 20;
  activeProject.s2bRetries = 2;
  activeProject.s2bRetryDelayMs = 2000;
  activeProject.sbConcurrency = 4;
  activeProject.s4cConcurrency = 10;
  activeProject.scriptMergeMaxSec = 10;
  activeProject.narrationMergeMaxSec = 15;
  activeProject.creativeOverrideSplit = '';
  activeProject.creativeOverrideShots = '';
  activeProject.creativeOverrides = {};

  // 选中重置
  activeProject.extractSelected = [];
  activeProject.s4xSelected = [];
  activeProject.s4aSelected = [];
  activeProject.s4cSelected = [];
  activeProject.sbSelected = [];
  activeProject.uploadHistory = [];
}

// 从 Schema v3 格式反序列化到 activeProject
export function deserializeProject(data) {
  if (!data) return;
  activeProject.name = data.name || '';
  activeProject.title = data.title || data.name || '';
  activeProject.mode = data.mode || data.input?.mode || 'narration';
  activeProject.createdAt = data.createdAt || '';
  activeProject.updatedAt = data.updatedAt || '';

  if (data.schemaVersion >= 2 && data.steps) {
    activeProject.inputText = data.input?.currentText || '';
    activeProject.voiceLibrary = data.input?.voiceLibrary || '';
    activeProject.globalStyle = data.input?.globalStyle || '';
    activeProject.creativeOverrideSplit = data.creativeOverrideSplit || '';
    activeProject.creativeOverrideShots = data.creativeOverrideShots || '';
    activeProject.creativeOverrides = data.creativeOverrides || {};

    if (data.pipelineSettings) {
      activeProject.s2bConcurrency = data.pipelineSettings.s2bConcurrency ?? 20;
      activeProject.s2bRetries = data.pipelineSettings.s2bRetries ?? 2;
      activeProject.s2bRetryDelayMs = data.pipelineSettings.s2bRetryDelayMs ?? 2000;
      activeProject.sbConcurrency = data.pipelineSettings.sbConcurrency ?? 4;
      activeProject.s4cConcurrency = data.pipelineSettings.s4cConcurrency ?? 10;
      activeProject.scriptMergeMaxSec = data.pipelineSettings.scriptMergeMaxSec ?? 10;
      activeProject.narrationMergeMaxSec = data.pipelineSettings.narrationMergeMaxSec ?? 15;
    }

    const s = data.steps;
    activeProject.episodes = s.step1?.result?.episodes || [];
    activeProject.assets = s.step2?.result?.assets || { characters: [], scenes: [], items: [], narrator: '', meta_info: null };
    activeProject.episodeAppearance = s.step2?.result?.episodeAppearance || [];
    activeProject.analysis = s.step3a?.result?.analysis || null;
    activeProject.storyboard = s.step3b?.result?.storyboard || { storys: [] };
    activeProject.classifications = s.step4a?.result?.classifications || [];
    activeProject.groupedStoryboard = s.step4x?.result?.groupedStoryboard || { storys: [] };
    activeProject.groupedStoryboardPerEpisode = s.step4x?.result?.groupedStoryboardPerEpisode || [];
    activeProject.videoPrompts = s.step4c?.result?.videoPrompts || [];

    // 还原档案与提示词
    const pmap = { step1: 's1', step2: 's2', step3a: 's3a', step3b: 's3b', step4x: 's4x', step4a: 's4a', step4c: 's4c' };
    for (const [stepKey, st] of Object.entries(s)) {
      if (st && (st.ranAt || st.model)) {
        activeProject.stepMeta[stepKey] = {
          ranAt: st.ranAt,
          model: st.model,
          prompts: st.prompts || [],
          runs: st.runs,
          note: st.note,
          elapsedMs: st.elapsedMs || 0
        };
      }
      if (st?.payloads?.length && pmap[stepKey]) activeProject.payloads[pmap[stepKey]] = st.payloads;
    }

    if (data.session) {
      const sess = data.session;
      activeProject.episodeAssets = sess.episodeAssets || [];
      activeProject.episodeStoryboard = sess.episodeStoryboard || [];
      activeProject.groupedStoryboardPerEpisode = sess.groupedStoryboardPerEpisode || [];
      if (sess.episodeStatus) Object.assign(activeProject.episodeStatus, sess.episodeStatus);
      if (sess.epState) {
        activeProject.epState.s2 = sess.epState.s2 || [];
        activeProject.epState.ready = sess.epState.ready || [];
        activeProject.epState.sb = sess.epState.sb || [];
        activeProject.epState.sbSplit = sess.epState.sbSplit || [];
        activeProject.epState.sbShots = sess.epState.sbShots || [];
        activeProject.epState.s4x = sess.epState.s4x || [];
        activeProject.epState.s4a = sess.epState.s4a || [];
        activeProject.epState.s4c = sess.epState.s4c || [];
      }
      activeProject.s2FailedTasks = sess.s2FailedTasks || [];
      activeProject.extractSelected = sess.extractSelected || [];
      activeProject.s4xSelected = sess.s4xSelected || [];
      activeProject.s4aSelected = sess.s4aSelected || [];
      activeProject.s4cSelected = sess.s4cSelected || [];
      activeProject.sbSelected = sess.sbSelected || [];
      activeProject.uploadHistory = sess.uploadHistory || [];
    }
  } else {
    // 兼容扁平结构
    activeProject.inputText = data.inputText || '';
    activeProject.voiceLibrary = data.voiceLibrary || '';
    activeProject.globalStyle = data.globalStyle || '';
    activeProject.episodes = data.episodes || [];
    activeProject.episodeAppearance = data.episodeAppearance || [];
    activeProject.episodeAssets = data.episodeAssets || [];
    activeProject.episodeStoryboard = data.episodeStoryboard || [];
    activeProject.groupedStoryboardPerEpisode = data.groupedStoryboardPerEpisode || [];
    activeProject.assets = data.assets || { characters: [], scenes: [], items: [], narrator: '', meta_info: null };
    activeProject.analysis = data.analysis || null;
    activeProject.storyboard = data.storyboard || { storys: [] };
    activeProject.groupedStoryboard = data.groupedStoryboard || { storys: [] };
    activeProject.classifications = data.classifications || [];
    activeProject.videoPrompts = data.videoPrompts || [];
    activeProject.stepMeta = data.stepMeta || {};
    activeProject.payloads = data.payloads || {};
    activeProject.s2FailedTasks = data.s2FailedTasks || [];
    activeProject.episodeStatus = data.episodeStatus || {};
    activeProject.uploadHistory = data.uploadHistory || [];
    if (data.epState) Object.assign(activeProject.epState, data.epState);
  }

  // Cleanup any lingering 'running' states caused by page refresh interruption
  const cleanupRunning = (arr, fallback = '') => {
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === 'running') arr[i] = fallback;
    }
  };
  cleanupRunning(activeProject.epState.s2, 'pending');
  cleanupRunning(activeProject.epState.sb);
  cleanupRunning(activeProject.epState.sbSplit);
  cleanupRunning(activeProject.epState.sbShots);
  cleanupRunning(activeProject.epState.s4a);
  cleanupRunning(activeProject.epState.s4c);
  cleanupRunning(activeProject.epState.s4x);

  // Clean up global asset '_status' flags
  if (activeProject.assets) {
    const cleanAssets = (list) => {
      for (const e of list || []) {
        if (e._status === 'extracting' || e._status === 'updating') e._status = null;
      }
    };
    cleanAssets(activeProject.assets.characters);
    cleanAssets(activeProject.assets.scenes);
    cleanAssets(activeProject.assets.items);
  }
}

// 将 activeProject 序列化为 Schema v3 格式
export function serializeProject() {
  const M = (k) => activeProject.stepMeta[k] || null;
  return {
    schemaVersion: 3,
    name: activeProject.name,
    title: activeProject.title,
    mode: activeProject.mode,
    createdAt: activeProject.createdAt,
    updatedAt: activeProject.updatedAt,
    input: {
      mode: activeProject.mode,
      currentText: activeProject.inputText,
      voiceLibrary: activeProject.voiceLibrary,
      globalStyle: activeProject.globalStyle,
    },
    creativeOverrideSplit: activeProject.creativeOverrideSplit,
    creativeOverrideShots: activeProject.creativeOverrideShots,
    creativeOverrides: { ...activeProject.creativeOverrides },
    pipelineSettings: {
      s2bConcurrency: activeProject.s2bConcurrency,
      s2bRetries: activeProject.s2bRetries,
      s2bRetryDelayMs: activeProject.s2bRetryDelayMs,
      sbConcurrency: activeProject.sbConcurrency,
      s4cConcurrency: activeProject.s4cConcurrency,
      scriptMergeMaxSec: activeProject.scriptMergeMaxSec,
      narrationMergeMaxSec: activeProject.narrationMergeMaxSec,
    },
    steps: {
      step1: { label: '① 分集', ...(M('step1') || {}), payloads: activeProject.payloads.s1 || [], result: { episodes: activeProject.episodes } },
      step2: { label: '② 资产提取', ...(M('step2') || {}), payloads: activeProject.payloads.s2 || [], result: { assets: activeProject.assets, episodeAppearance: activeProject.episodeAppearance } },
      step3a: { label: '③-a 类型分析', ...(M('step3a') || {}), payloads: activeProject.payloads.s3a || [], result: { analysis: activeProject.analysis } },
      step3b: { label: '③-b 分镜创作', ...(M('step3b') || {}), payloads: activeProject.payloads.s3b || [], result: { storyboard: activeProject.storyboard } },
      step4a: { label: '④-a 镜头分类', ...(M('step4a') || {}), payloads: activeProject.payloads.s4a || [], result: { classifications: activeProject.classifications } },
      step4x: { label: '④-x 单元归并', result: { groupedStoryboard: activeProject.groupedStoryboard, groupedStoryboardPerEpisode: activeProject.groupedStoryboardPerEpisode } },
      step4c: { label: '④-c 视频提示词', ...(M('step4c') || {}), payloads: activeProject.payloads.s4c || [], result: { videoPrompts: activeProject.videoPrompts } },
      step4d: { label: '④-d 视频校验', result: {} },
    },
    session: {
      episodeAssets: activeProject.episodeAssets,
      episodeStoryboard: activeProject.episodeStoryboard,
      groupedStoryboardPerEpisode: activeProject.groupedStoryboardPerEpisode,
      episodeStatus: { ...activeProject.episodeStatus },
      epState: {
        s2: [...activeProject.epState.s2],
        ready: [...activeProject.epState.ready],
        sb: [...activeProject.epState.sb],
        sbSplit: [...activeProject.epState.sbSplit],
        sbShots: [...activeProject.epState.sbShots],
        s4x: [...activeProject.epState.s4x],
        s4a: [...activeProject.epState.s4a],
        s4c: [...activeProject.epState.s4c],
      },
      extractSelected: [...activeProject.extractSelected],
      s4xSelected: [...activeProject.s4xSelected],
      s4aSelected: [...activeProject.s4aSelected],
      s4cSelected: [...activeProject.s4cSelected],
      sbSelected: [...activeProject.sbSelected],
      s2FailedTasks: activeProject.s2FailedTasks,
      uploadHistory: [...activeProject.uploadHistory],
    }
  };
}

// 加载项目
export async function loadProject(name) {
  const data = await Projects.get(name);
  if (!data) throw new Error('Project not found');
  resetActiveProject();
  deserializeProject(data);
}

// 保存当前项目
export async function saveActiveProject() {
  if (!activeProject.name) return;
  const structuredData = serializeProject();
  const saved = await Projects.save(activeProject.name, structuredData);
  activeProject.updatedAt = saved.updatedAt;
}

// 防抖保存机制
let autoSaveTimer = null;
export function autoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    await saveActiveProject();
  }, 1000);
}
