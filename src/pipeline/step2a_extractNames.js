// ============================================================
// Step2a 资产名称提取：一次 LLM 调用，完整原文单次输入（不分集、不含音色）
// ============================================================
import { callLLM, fillTemplate, getNodeModel } from '../services/llmClient.js';
import { getActiveVersion } from '../services/promptStore.js';
import { pickVer } from './_shared.js';
import { toExistingData } from './step2_merge.js';

/**
 * @param {{ currentText: string, existingAssets: object, textType: string }} args
 */
export async function extractNames({ currentText, existingAssets, textType }) {
  const sysVer = await getActiveVersion('step2a.system');
  const prompt = fillTemplate(sysVer.content, {
    existing_data: toExistingData(existingAssets),
    current_text: currentText || '',
    text_type: textType || '解说文案',
  });

  const { content, parsed } = await callLLM(prompt, { expectJson: true, nodeKey: 'step2a' });
  const meta = { model: await getNodeModel('step2a'), prompts: [pickVer(sysVer)] };
  return { payload: prompt, raw: content, parsed, meta };
}
