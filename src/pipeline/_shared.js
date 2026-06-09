// ============================================================
// 流程节点共享工具：资产库注入 / 分镜台账文本化 / id 重排
// ============================================================

const J = (v) => JSON.stringify(v ?? [], null, 2);

/** 从 getActiveVersion 结果提取版本元信息（去掉 content，用于项目档案记录） */
export function pickVer(verObj, overrideNote) {
  return {
    key: verObj.key,
    label: verObj.label,
    versionId: overrideNote ? null : verObj.versionId,
    versionName: overrideNote || verObj.versionName,
  };
}

/**
 * 把资产库拆成下游提示词需要的 characters_looks / scenes / items 文本块
 * （对齐现有 HTML 工具 buildPrompt 的注入方式，并合并 existing_* 增量）
 * @param {import('../types.js').AssetLibrary} assets
 */
export function assetBlocks(assets = {}) {
  let charactersLooks = J(assets.characters);
  let scenes = J(assets.scenes);
  let items = J(assets.items);

  if (assets.existing_character_new_looks?.length) {
    charactersLooks += '\n\n// 已存在角色新造型:\n' + J(assets.existing_character_new_looks);
  }
  if (assets.existing_scene_new_states?.length) {
    scenes += '\n\n// 已存在场景新状态:\n' + J(assets.existing_scene_new_states);
  }
  if (assets.existing_item_new_variants?.length) {
    items += '\n\n// 已存在物品新形态:\n' + J(assets.existing_item_new_variants);
  }

  return {
    characters_looks: charactersLooks,
    scenes,
    items,
    global_style: J(assets.meta_info || {}),
  };
}

/**
 * 把分镜 JSON 转为 step4 需要的「格式化分镜文本台账」
 * @param {import('../types.js').Storyboard} sb
 */
export function storyboardToLedger(sb) {
  const lines = [];
  for (const u of sb.storys || []) {
    // 兼容原始 loc 对象和归并后的 locs 数组
    const locText = u.locs
      ? u.locs.map(l => `[s:${l.n}#${l.v}]`).join(' + ')
      : `[s:${u.loc?.n}#${u.loc?.v}]`;
    lines.push(`剧情单元${u.id} | 总时长:- | 场景${locText}`);
    lines.push('---');

    // Flatten nested shots if this is a grouped unit structure (narration or script)
    const rawShots = [];
    if (u.shots && u.shots.length > 0) {
      if (u.shots[0] && u.shots[0].shots && Array.isArray(u.shots[0].shots)) {
        for (const ou of u.shots) {
          if (ou.shots && Array.isArray(ou.shots)) {
            rawShots.push(...ou.shots);
          }
        }
      } else {
        rawShots.push(...u.shots);
      }
    }

    rawShots.forEach((s, i) => {
      const chars = (s.chars || []).map((c) => `[p:${c.n}#${c.l}]`).join(' ');
      const itm = (s.itm || []).map((it) => `[t:${it.n}#${it.v}]`).join(' ');
      lines.push(
        `子镜头${i + 1} | time:${s.dur ?? '-'} | 景别:${s.sc} | 角度:${s.ag} | 运镜:${s.mv} | 角色:${chars || '无'} | 物品:${itm || '无'}`
      );
      lines.push(`画面描述: ${s.ds}`);
      const dlgEntries = Object.entries(s.dlg || {});
      if (dlgEntries.length) {
        lines.push('对白: ' + dlgEntries.map(([k, v]) => `${k}："${v}"`).join(' / '));
      } else {
        lines.push('对白: 无');
      }
      lines.push('---');
    });
  }
  return lines.join('\n');
}

/**
 * 合并多集分镜并按全局顺序重排 id（每集分镜各自从 1 起，合并时需连续）
 * @param {import('../types.js').Storyboard[]} parts
 */
export function mergeStoryboards(parts) {
  const storys = [];
  let nextId = 1;
  for (const p of parts) {
    for (const u of p.storys || []) {
      storys.push({ ...u, id: nextId++ });
    }
  }
  return { storys };
}

/**
 * 把出场清单元素归一为 { n, variants:Set }
 * 支持两种形式：字符串(主体名) 或 { n, looks|states|variants:[...] }
 */
function normAppearItems(arr, variantKey) {
  const map = new Map();
  for (const it of arr || []) {
    if (typeof it === 'string') {
      if (!map.has(it)) map.set(it, new Set());
    } else if (it && it.n) {
      const set = map.get(it.n) || new Set();
      for (const v of it[variantKey] || []) set.add(v);
      map.set(it.n, set);
    }
  }
  return map;
}

/**
 * 按「本集出场清单」过滤出资产子集：
 * - 只保留本集出场的角色/场景/物品（主体名匹配）
 * - 每个主体只保留本集实际使用的造型/状态/形态（带完整描述），未指明则保留该主体全部
 * - meta_info / narrator 始终保留
 * 这样下游分镜既不随集数累积全量资产，又能拿到「基础资料 + 本集实际造型完整描述」。
 * @param {object} full 全量资产库
 * @param {{characters?:any[],scenes?:any[],items?:any[]}} appearance
 */
export function subsetByAppearance(full, appearance) {
  if (!appearance) return full;
  const cmap = normAppearItems(appearance.characters, 'looks');
  const smap = normAppearItems(appearance.scenes, 'states');
  const imap = normAppearItems(appearance.items, 'variants');

  const filterChild = (arr, wanted, nameKey) => {
    if (!wanted || wanted.size === 0) return arr || []; // 未指明具体造型 -> 保留全部
    const sub = (arr || []).filter((x) => wanted.has(x[nameKey]));
    return sub.length ? sub : arr || []; // 名称对不上时兜底保留全部，避免漏传
  };

  const characters = cmap.size
    ? (full.characters || [])
        .filter((c) => cmap.has(c.n))
        .map((c) => ({ ...c, looks: filterChild(c.looks, cmap.get(c.n), 'ln') }))
    : (full.characters || []);

  const scenes = smap.size
    ? (full.scenes || [])
        .filter((s) => smap.has(s.s))
        .map((s) => ({ ...s, states: filterChild(s.states, smap.get(s.s), 'sn') }))
    : (full.scenes || []);

  const items = imap.size
    ? (full.items || [])
        .filter((i) => imap.has(i.n))
        .map((i) => ({ ...i, variants: filterChild(i.variants, imap.get(i.n), 'vn') }))
    : (full.items || []);

  return { meta_info: full.meta_info, narrator: full.narrator, characters, scenes, items };
}

