import { parseEpisodes, segmentNovel } from '../pipeline/step1_segment.js';
import { extractNames } from '../pipeline/step2a_extractNames.js';
import { checkUpdates } from '../pipeline/step2a_b_updateCheck.js';
import { extractEntityDetail } from '../pipeline/step2b_extractDetail.js';
import { mergeNamesResult, mergeEntityDetail } from '../pipeline/step2_merge.js';
import { analyzeScript } from '../pipeline/step3a_scriptAnalysis.js';
import { splitEpisodeText, splitSingleChunk, segmentEpisodeText } from '../pipeline/step3b_splitUnits.js';
import { createShotsForUnits } from '../pipeline/step3b_createShots.js';
import { classifyShots } from '../pipeline/step4a_classify.js';
import { groupUnitsForNarration } from '../pipeline/step4x_groupUnits.js';
import { createVideoPromptForUnit } from '../pipeline/step4c_videoPrompt.js';
import { validateVideoPrompts } from '../pipeline/step4d_validate.js';
import { mergeStoryboards } from '../pipeline/_shared.js';

import * as Storage from '../services/storage.js';
import * as PromptStore from '../services/promptStore.js';
import { API_PROVIDERS, MODEL_NODES } from '../config/llm.config.js';

// ---- 设置 ----
export const Settings = {
  get: async () => await Storage.readSettings({}),
  save: async (s) => { 
    const existing = await Storage.readSettings({});
    const merged = { ...existing, ...JSON.parse(JSON.stringify(s)) };
    await Storage.writeSettings(merged); 
    return merged; 
  },
  test: async () => {
    const llm = await import('../services/llmClient.js');
    const { content } = await llm.callLLM('请只回复两个字：正常', { maxTokens: 20, retries: 0 });
    return { ok: true, reply: content };
  }
};

// ---- 平台配置 ----
export const Providers = {
  list: async () => ({ providers: API_PROVIDERS })
};

// ---- 模型配置 ----
export const Models = {
  nodes: async () => MODEL_NODES,
  fetch: async () => {
    const llm = await import('../services/llmClient.js');
    return { models: await llm.fetchModels() };
  }
};

// ---- 提示词版本 ----
export const Prompts = {
  nodes: async () => await PromptStore.listNodes(),
  node: async (key) => await PromptStore.loadNode(key),
  addVersion: async (key, b) => await PromptStore.addVersion(key, b.name, b.content, b.setActive !== false),
  updateVersion: async (key, vid, b) => await PromptStore.updateVersion(key, vid, b),
  activate: async (key, vid) => await PromptStore.activateVersion(key, vid),
  delVersion: async (key, vid) => await PromptStore.deleteVersion(key, vid),
  reset: async (key) => await PromptStore.resetToSeed(key)
};

// ---- 音色库 ----
export const VoiceLib = {
  get: async () => {
    const content = await Storage.readVoiceLibrary();
    return { content };
  },
  save: async (content) => {
    await Storage.writeVoiceLibrary(content);
    return { success: true };
  }
};

// ---- 项目 ----
export const Projects = {
  list: async () => await Storage.listProjects(),
  get: async (name) => await Storage.readProject(name),
  save: async (name, data) => {
    const project = { name, ...JSON.parse(JSON.stringify(data)) };
    if (!project.createdAt) project.createdAt = new Date().toISOString();
    return await Storage.writeProject(project);
  },
  del: async (name) => {
    await Storage.deleteProject(name);
    return { success: true };
  }
};

// ---- 流程 ----
export const Pipeline = {
  segment: async (body, signal) => {
    const { text, useModel = true, maxChars, concurrent } = body;
    if (useModel) {
      return await segmentNovel({ text, maxChars, concurrent });
    } else {
      return { episodes: parseEpisodes(text) };
    }
  },
  extractNames: async (b, signal) => {
    const { currentText, textType, existingAssets } = b;
    const result = await extractNames({ currentText, textType, existingAssets });
    const clonedAssets = existingAssets ? JSON.parse(JSON.stringify(existingAssets)) : { characters: [], scenes: [], items: [] };
    const merged = result.parsed ? mergeNamesResult(clonedAssets, result.parsed) : existingAssets;
    return { ...result, merged };
  },
  checkUpdates: async (b, signal) => await checkUpdates(b),
  extractDetail: async (b, signal) => await extractEntityDetail(b),
  mergeDetail: async (b, signal) => {
    const { existingAssets, entityType, entityName, parsed, episodeIndices } = b;
    const clonedAssets = existingAssets ? JSON.parse(JSON.stringify(existingAssets)) : { characters: [], scenes: [], items: [] };
    const merged = parsed
      ? mergeEntityDetail(clonedAssets, entityType, parsed, episodeIndices, entityName)
      : existingAssets;
    return { merged };
  },
  analyze: async (b, signal) => await analyzeScript({ ...b, signal }),
  splitStoryboard: async (b, signal) => await splitEpisodeText({ ...b, signal }),
  splitChunk: async (b, signal) => await splitSingleChunk({ ...b, signal }),
  segmentText: async (b, signal) => ({ chunks: segmentEpisodeText(b.episodeText, b.maxUnitChars) }),
  createShots: async (b, signal) => await createShotsForUnits({ ...b, signal }),
  mergeStoryboards: async (parts, signal) => mergeStoryboards(parts || []),
  validateSb: async (b, signal) => { throw new Error('Not implemented'); },
  classify: async (b, signal) => await classifyShots({ ...b, signal }),
  groupUnits: async (b, signal) => {
    const { storyboard, episodeCount, mode, maxSec } = b;
    return { grouped: groupUnitsForNarration(storyboard, episodeCount, mode, maxSec) };
  },
  video: async (b, signal) => await createVideoPromptForUnit(b),
  validateVp: async (b, signal) => await validateVideoPrompts(b)
};
