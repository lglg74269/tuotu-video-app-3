// ============================================================
// Step2b 资产详情提取：按实体并发（角色一次一个，场景/物品可并发）
// 输入：带分集标题的全文 + 该实体已有完整资料
// ============================================================
import { callLLM, fillTemplate, getNodeModel } from '../services/llmClient.js';
import { getActiveVersion } from '../services/promptStore.js';
import { pickVer } from './_shared.js';
import { formatEpisodesWithTitles } from '../utils/textSegment.js';
import { toExistingData } from './step2_merge.js';

const PROMPT_KEY = {
  character: 'step2b.system.character',
  scene: 'step2b.system.scene',
  item: 'step2b.system.item',
};

/**
 * @param {{
 *   entityType: 'character'|'scene'|'item',
 *   entityName: string,
 *   existingEntity: object|null,
 *   allEpisodes: {title:string,text:string}[],
 *   newEpisodeIndices: number[],
 *   voiceLibrary: string,
 *   textType: string,
 *   metaInfo?: object,
 * }} args
 */
export async function extractEntityDetail(args) {
  const {
    entityType,
    entityName,
    existingEntity,
    allEpisodes,
    newEpisodeIndices,
    voiceLibrary,
    textType,
    metaInfo,
    existingAssets,
  } = args;

  const key = PROMPT_KEY[entityType];
  if (!key) throw new Error(`未知实体类型：${entityType}`);

  const sysVer = await getActiveVersion(key);
  const episodesText = formatEpisodesWithTitles(allEpisodes);

  // 音色库仅在角色首次提取（v 为空）时才传入，避免大文本重复传递
  const needVoiceLibrary = entityType === 'character' && !existingEntity?.v;

  const prompt = fillTemplate(sysVer.content, {
    voice_library: needVoiceLibrary ? (voiceLibrary || '（未提供音色库）') : '（无需分配音色）',
    entity_name: entityName,
    existing_entity: existingEntity ? JSON.stringify(existingEntity, null, 2) : '（无，全新实体）',
    existing_data: toExistingData(existingAssets || {}, entityType, entityName),
    episodes_text: episodesText,
    text_type: textType || '解说文案',
    meta_info: JSON.stringify(metaInfo || {}, null, 2),
  });

  const { content, parsed } = await callLLM(prompt, { expectJson: true, nodeKey: 'step2b', retries: 3 });
  const meta = { model: await getNodeModel('step2b'), prompts: [pickVer(sysVer)] };
  return { payload: prompt, raw: content, parsed, meta };
}
