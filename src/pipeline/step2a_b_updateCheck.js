// ============================================================
// Step2a_b 资产更新检查：检查已有资产在新增文本中是否出现新造型/新状态/新形态
// ============================================================
import { callLLM, fillTemplate, getNodeModel } from '../services/llmClient.js';
import { getActiveVersion } from '../services/promptStore.js';
import { pickVer } from './_shared.js';
import { toExistingData } from './step2_merge.js';

/**
 * @param {{ currentText: string, existingAssets: object, textType: string }} args
 */
export async function checkUpdates({ currentText, previousText, existingAssets, textType }) {
  // 若资产为空，直接返回空结果
  const hasExisting = (existingAssets?.characters?.length || 0) +
                      (existingAssets?.scenes?.length || 0) +
                      (existingAssets?.items?.length || 0) > 0;
  if (!hasExisting) {
    return {
      payload: null,
      raw: '',
      parsed: {
        existing_character_updates: [],
        existing_scene_updates: [],
        existing_item_updates: [],
        existing_character_appearances: [],
        existing_scene_appearances: [],
        existing_item_appearances: [],
      },
      meta: { model: '(skipped)', prompts: [] },
    };
  }

  const sysVer = await getActiveVersion('step2a_b.system');
  const prompt = fillTemplate(sysVer.content, {
    existing_data: toExistingData(existingAssets),
    previous_text: previousText || '',
    current_text: currentText || '',
    text_type: textType || '解说文案',
  });

  const { content, parsed } = await callLLM(prompt, { expectJson: true, nodeKey: 'step2a_b' });
  const meta = { model: await getNodeModel('step2a_b'), prompts: [pickVer(sysVer)] };
  return {
    payload: prompt,
    raw: content,
    parsed: {
      existing_character_updates: parsed?.existing_character_updates || [],
      existing_scene_updates: parsed?.existing_scene_updates || [],
      existing_item_updates: parsed?.existing_item_updates || [],
      existing_character_appearances: parsed?.existing_character_appearances || [],
      existing_scene_appearances: parsed?.existing_scene_appearances || [],
      existing_item_appearances: parsed?.existing_item_appearances || [],
    },
    meta,
  };
}
