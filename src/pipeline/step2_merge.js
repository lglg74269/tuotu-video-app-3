// ============================================================
// Step2 资产合并：2a 名称 + 2b 详情 + 出场集数
// ============================================================

/** 把已累积资产库压缩为 existing_data 文本 */
export function toExistingData(assets, entityType = null, entityName = null) {
  if (!assets || (!assets.characters?.length && !assets.scenes?.length && !assets.items?.length)) {
    return '（无）';
  }

  // 如果指定了实体类型和名称，只返回该实体相关的资料
  const filtered = {
    characters: [],
    scenes: [],
    items: [],
  };

  if (entityType && entityName) {
    if (entityType === 'character') {
      const c = assets.characters?.find((x) => x.n === entityName);
      if (c) filtered.characters.push({ n: c.n, v: c.v || '', looks: (c.looks || []).map((l) => l.ln), eps: c.eps || [] });
    } else if (entityType === 'scene') {
      const s = assets.scenes?.find((x) => x.s === entityName);
      if (s) filtered.scenes.push({ s: s.s, states: (s.states || []).map((st) => st.sn), eps: s.eps || [] });
    } else if (entityType === 'item') {
      const i = assets.items?.find((x) => x.n === entityName);
      if (i) filtered.items.push({ n: i.n, variants: (i.variants || []).map((v) => v.vn), eps: i.eps || [] });
    }
  } else {
    // 未指定实体，返回全部（兼容旧版）
    filtered.characters = (assets.characters || []).map((c) => ({
      n: c.n,
      v: c.v || '',
      looks: (c.looks || []).map((l) => l.ln),
      eps: c.eps || [],
    }));
    filtered.scenes = (assets.scenes || []).map((s) => ({
      s: s.s,
      states: (s.states || []).map((st) => st.sn),
      eps: s.eps || [],
    }));
    filtered.items = (assets.items || []).map((i) => ({
      n: i.n,
      variants: (i.variants || []).map((v) => v.vn),
      eps: i.eps || [],
    }));
  }

  if (!filtered.characters.length && !filtered.scenes.length && !filtered.items.length) {
    return '（无）';
  }

  return JSON.stringify(filtered, null, 2);
}

function dedupLooks(a = [], b = []) {
  const map = new Map();
  for (const x of a) map.set(x.ln, { ...x });
  for (const x of b || []) {
    if (map.has(x.ln)) {
      const prev = map.get(x.ln);
      // 合并 looks_appear_episodes
      if (x.looks_appear_episodes || prev.looks_appear_episodes) {
        prev.looks_appear_episodes = mergeEps(prev.looks_appear_episodes, x.looks_appear_episodes);
      }
      // 用新数据覆盖其他字段（除 ln 外）
      Object.assign(prev, x);
      prev.ln = x.ln; // 确保 ln 不被覆盖
    } else {
      map.set(x.ln, { ...x });
    }
  }
  return [...map.values()];
}
function dedupBy(a = [], b = [], key, appearKey) {
  const map = new Map();
  for (const x of a) map.set(x[key], { ...x });
  for (const x of b || []) {
    const val = x[key];
    if (map.has(val)) {
      const prev = map.get(val);
      // 合并 states_appear_episodes / variants_appear_episodes
      if (appearKey && (x[appearKey] || prev[appearKey])) {
        prev[appearKey] = mergeEps(prev[appearKey], x[appearKey]);
      }
      Object.assign(prev, x);
      prev[key] = val; // 确保 key 不被覆盖
    } else {
      map.set(val, { ...x });
    }
  }
  return [...map.values()];
}
function mergeEps(a = [], b = []) {
  return [...new Set([...(a || []), ...(b || [])])].sort((x, y) => x - y);
}

/** 合并 2a 名称提取结果 */
export function mergeNamesResult(base, delta) {
  const lib = base || { characters: [], scenes: [], items: [] };
  lib.characters ||= [];
  lib.scenes ||= [];
  lib.items ||= [];

  if (delta?.meta_info && !lib.meta_info) lib.meta_info = delta.meta_info;

  // 2a 只登记待提取名称（骨架）
  for (const name of delta?.new_character_names || []) {
    if (!lib.characters.find((c) => c.n === name)) {
      lib.characters.push({ n: name, _pending: true, looks: [], eps: [] });
    }
  }
  for (const name of delta?.new_scene_names || []) {
    if (!lib.scenes.find((s) => s.s === name)) {
      lib.scenes.push({ s: name, _pending: true, states: [], eps: [] });
    }
  }
  for (const name of delta?.new_item_names || []) {
    if (!lib.items.find((i) => i.n === name)) {
      lib.items.push({ n: name, _pending: true, variants: [], eps: [] });
    }
  }

  return lib;
}

/** 将已有资产在本集中的出现情况（无更新的造型/状态/形态）合并进主资产库 */
export function mergeExistingAppearancesToAssets(assets, appearance, episodeIndices = []) {
  if (!assets || !appearance || !episodeIndices.length) return;
  const eps = episodeIndices.map(i => i + 1); // 统一转为 1 起索引

  for (const c of appearance.characters || []) {
    const exist = assets.characters?.find(x => x.n === c.name);
    if (exist) {
      exist.eps = mergeEps(exist.eps, eps);
      for (const lName of c.looks || []) {
        const look = exist.looks?.find(l => l.ln === lName);
        if (look) look.looks_appear_episodes = mergeEps(look.looks_appear_episodes, eps);
      }
    }
  }
  for (const s of appearance.scenes || []) {
    const exist = assets.scenes?.find(x => x.s === s.name);
    if (exist) {
      exist.eps = mergeEps(exist.eps, eps);
      for (const stName of s.states || []) {
        const st = exist.states?.find(x => x.sn === stName);
        if (st) st.states_appear_episodes = mergeEps(st.states_appear_episodes, eps);
      }
    }
  }
  for (const i of appearance.items || []) {
    const exist = assets.items?.find(x => x.n === i.name);
    if (exist) {
      exist.eps = mergeEps(exist.eps, eps);
      for (const vName of i.variants || []) {
        const v = exist.variants?.find(x => x.vn === vName);
        if (v) v.variants_appear_episodes = mergeEps(v.variants_appear_episodes, eps);
      }
    }
  }
}

/** 合并 2b 单实体详情 */
export function mergeEntityDetail(base, entityType, parsed, episodeIndices = [], entityName = null) {
  const lib = structuredClone(base || { characters: [], scenes: [], items: [] });
  lib.characters ||= [];
  lib.scenes ||= [];
  lib.items ||= [];

  if (parsed?.meta_info && !lib.meta_info) lib.meta_info = parsed.meta_info;
  if (parsed?.narrator?.n && !lib.narrator?.n) lib.narrator = parsed.narrator;

  // 优先使用模型返回的 appear_episodes（1 起索引），fallback 到 episodeIndices（前端传入的 0 起索引，需 +1 转为 1 起）
  const eps = parsed?.appear_episodes || (episodeIndices || []).map(i => i + 1);

  if (entityType === 'character') {
    const c = parsed?.character || parsed?.characters?.[0];
    if (c?.n) {
      // fallback：模型可能改写了名字，用 entityName 兜底匹配
      let exist = lib.characters.find((x) => x.n === c.n)
        || (entityName && lib.characters.find((x) => x.n === entityName));
      if (exist && exist.n !== c.n) c.n = exist.n; // 修正模型改写的名字
      if (!exist) {
        exist = { ...c, eps: [...eps] };
        delete exist._pending;
        lib.characters.push(exist);
      } else {
        const prevLooks = exist.looks;
        const prevEps = exist.eps;
        const { looks, eps: _cEps, ...restC } = c;
        Object.assign(exist, restC, { _pending: undefined });
        exist.looks = dedupLooks(prevLooks, c.looks);
        exist.eps = mergeEps(prevEps, eps);
      }
    }
    for (const grp of parsed?.existing_character_new_looks || []) {
      const e = lib.characters.find((x) => x.n === grp.n) || (entityName && lib.characters.find((x) => x.n === entityName));
      if (e) {
        e.looks = dedupLooks(e.looks, grp.looks);
        e.eps = mergeEps(e.eps, eps);
      }
    }
  } else if (entityType === 'scene') {
    const s = parsed?.scene || parsed?.scenes?.[0];
    if (s?.s) {
      // fallback：模型可能改写了场景名，用 entityName 兜底匹配
      let exist = lib.scenes.find((x) => x.s === s.s)
        || (entityName && lib.scenes.find((x) => x.s === entityName));
      if (exist && exist.s !== s.s) s.s = exist.s; // 修正模型改写的名字
      if (!exist) {
        exist = { ...s, eps: [...eps] };
        delete exist._pending;
        lib.scenes.push(exist);
      } else {
        const prevStates = exist.states;
        const prevEps = exist.eps;
        const { states, eps: _sEps, ...restS } = s;
        Object.assign(exist, restS, { _pending: undefined });
        exist.states = dedupBy(prevStates, s.states, 'sn', 'states_appear_episodes');
        exist.eps = mergeEps(prevEps, eps);
      }
    }
    for (const grp of parsed?.existing_scene_new_states || []) {
      const e = lib.scenes.find((x) => x.s === grp.n) || (entityName && lib.scenes.find((x) => x.s === entityName));
      if (e) {
        e.states = dedupBy(e.states, grp.states, 'sn', 'states_appear_episodes');
        e.eps = mergeEps(e.eps, eps);
      }
    }
  } else if (entityType === 'item') {
    const it = parsed?.item || parsed?.items?.[0];
    if (it?.n) {
      // fallback：模型可能改写了物品名，用 entityName 兜底匹配
      let exist = lib.items.find((x) => x.n === it.n)
        || (entityName && lib.items.find((x) => x.n === entityName));
      if (exist && exist.n !== it.n) it.n = exist.n; // 修正模型改写的名字
      if (!exist) {
        exist = { ...it, eps: [...eps] };
        delete exist._pending;
        lib.items.push(exist);
      } else {
        const prevVariants = exist.variants;
        const prevEps = exist.eps;
        const { variants, eps: _itEps, ...restIt } = it;
        Object.assign(exist, restIt, { _pending: undefined });
        exist.variants = dedupBy(prevVariants, it.variants, 'vn', 'variants_appear_episodes');
        exist.eps = mergeEps(prevEps, eps);
      }
    }
    for (const grp of parsed?.existing_item_new_variants || []) {
      const e = lib.items.find((x) => x.n === grp.n) || (entityName && lib.items.find((x) => x.n === entityName));
      if (e) {
        e.variants = dedupBy(e.variants, grp.variants, 'vn', 'variants_appear_episodes');
        e.eps = mergeEps(e.eps, eps);
      }
    }
  }

  return lib;
}

/** 合并每集 appearance（来自 2a 或 2b） */
export function mergeEpisodeAppearance(list, episodeIndex, appearance) {
  const arr = [...(list || [])];
  while (arr.length <= episodeIndex) arr.push(null);
  const prev = arr[episodeIndex] || { characters: [], scenes: [], items: [] };
  arr[episodeIndex] = {
    characters: mergeAppearList(prev.characters, appearance?.characters, 'looks'),
    scenes: mergeAppearList(prev.scenes, appearance?.scenes, 'states'),
    items: mergeAppearList(prev.items, appearance?.items, 'variants'),
  };
  return arr;
}

function mergeAppearList(a = [], b = [], variantKey) {
  const map = new Map();
  for (const it of a || []) {
    if (typeof it === 'string') map.set(it, new Set());
    else if (it?.n) map.set(it.n, new Set(it[variantKey] || []));
  }
  for (const it of b || []) {
    if (typeof it === 'string') {
      if (!map.has(it)) map.set(it, new Set());
    } else if (it?.n) {
      const set = map.get(it.n) || new Set();
      for (const v of it[variantKey] || []) set.add(v);
      map.set(it.n, set);
    }
  }
  return [...map.entries()].map(([n, set]) => ({
    n,
    [variantKey]: set.size ? [...set] : [],
  }));
}

/** 兼容旧版单步 extract 的 merge（保留） */
export function mergeAssets(base, delta) {
  const lib = base || { characters: [], scenes: [], items: [] };
  lib.characters ||= [];
  lib.scenes ||= [];
  lib.items ||= [];

  if (delta.meta_info && !lib.meta_info) lib.meta_info = delta.meta_info;
  if (delta.narrator && delta.narrator.n && !lib.narrator?.n) lib.narrator = delta.narrator;

  for (const c of delta.characters || []) {
    const exist = lib.characters.find((x) => x.n === c.n);
    if (!exist) lib.characters.push(c);
    else exist.looks = dedupLooks(exist.looks, c.looks);
  }
  for (const grp of delta.existing_character_new_looks || []) {
    const exist = lib.characters.find((x) => x.n === grp.n);
    if (exist) exist.looks = dedupLooks(exist.looks, grp.looks);
  }
  for (const s of delta.scenes || []) {
    const exist = lib.scenes.find((x) => x.s === s.s);
    if (!exist) lib.scenes.push(s);
    else exist.states = dedupBy(exist.states, s.states, 'sn');
  }
  for (const grp of delta.existing_scene_new_states || []) {
    const exist = lib.scenes.find((x) => x.s === grp.n);
    if (exist) exist.states = dedupBy(exist.states, grp.states, 'sn');
  }
  for (const it of delta.items || []) {
    const exist = lib.items.find((x) => x.n === it.n);
    if (!exist) lib.items.push(it);
    else exist.variants = dedupBy(exist.variants, it.variants, 'vn');
  }
  for (const grp of delta.existing_item_new_variants || []) {
    const exist = lib.items.find((x) => x.n === grp.n);
    if (exist) exist.variants = dedupBy(exist.variants, grp.variants, 'vn');
  }
  return lib;
}

/** 从 2a 结果收集待 2b 提取的实体任务 */
export function collectDetailTasks(assets, namesResult, episodeIndices, updateCheckResult) {
  const tasks = [];
  const names = namesResult?.parsed || namesResult || {};
  const updates = updateCheckResult?.parsed || updateCheckResult || {};

  const charNames = new Set([
    ...(names.new_character_names || []),
    ...(updates.existing_character_updates || []),
    ...(namesResult?.entities_to_update?.characters || []),
  ]);
  for (const n of charNames) {
    const exist = assets?.characters?.find((c) => c.n === n);
    tasks.push({ entityType: 'character', entityName: n, existingEntity: exist || null, episodeIndices });
  }

  const sceneNames = new Set([
    ...(names.new_scene_names || []),
    ...(updates.existing_scene_updates || []),
    ...(namesResult?.entities_to_update?.scenes || []),
  ]);
  for (const n of sceneNames) {
    const exist = assets?.scenes?.find((s) => s.s === n);
    tasks.push({ entityType: 'scene', entityName: n, existingEntity: exist || null, episodeIndices });
  }

  const itemNames = new Set([
    ...(names.new_item_names || []),
    ...(updates.existing_item_updates || []),
    ...(namesResult?.entities_to_update?.items || []),
  ]);
  for (const n of itemNames) {
    const exist = assets?.items?.find((i) => i.n === n);
    tasks.push({ entityType: 'item', entityName: n, existingEntity: exist || null, episodeIndices });
  }

  // 2a 也可能直接给出 per-episode appearance 里出现的已有实体需更新
  for (const epApp of names.episode_appearances || names.per_episode_appearance || []) {
    for (const c of epApp.characters || []) {
      if (!tasks.find((t) => t.entityType === 'character' && t.entityName === c.n)) {
        tasks.push({
          entityType: 'character',
          entityName: c.n,
          existingEntity: assets?.characters?.find((x) => x.n === c.n) || null,
          episodeIndices: [epApp.episode_index ?? epApp.episodeIndex ?? 0],
        });
      }
    }
    for (const s of epApp.scenes || []) {
      const name = s.n || s.s;
      if (!tasks.find((t) => t.entityType === 'scene' && t.entityName === name)) {
        tasks.push({
          entityType: 'scene',
          entityName: name,
          existingEntity: assets?.scenes?.find((x) => x.s === name) || null,
          episodeIndices: [epApp.episode_index ?? epApp.episodeIndex ?? 0],
        });
      }
    }
    for (const it of epApp.items || []) {
      if (!tasks.find((t) => t.entityType === 'item' && t.entityName === it.n)) {
        tasks.push({
          entityType: 'item',
          entityName: it.n,
          existingEntity: assets?.items?.find((x) => x.n === it.n) || null,
          episodeIndices: [epApp.episode_index ?? epApp.episodeIndex ?? 0],
        });
      }
    }
  }

  return tasks;
}
