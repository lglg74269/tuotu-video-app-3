// ============================================================
// Step4x 单元归并（支持解说模式与剧本模式）
// - 解说模式：按原文时长进行贪心归并，目标时长 4~15s
// - 剧本模式：以场次为单位，对场次内镜头按对白字数校正时长，并在场次内贪心归并，目标时长 4~maxSec (10~15s)
// ============================================================

/**
 * 计算解说原文的时长（秒）
 * 中文字符（含标点）5.5 字/秒，英文字符（含标点）14 字/秒
 * 取整数
 */
function calcDuration(text) {
  if (!text) return 0;
  let cnCount = 0;
  let enCount = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    // CJK 统一汉字 + CJK 标点范围
    if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3000 && code <= 0x303F) || (code >= 0xFF00 && code <= 0xFFEF)) {
      cnCount++;
    } else {
      enCount++;
    }
  }
  const seconds = cnCount / 5.5 + enCount / 14;
  return Math.ceil(seconds);
}

function getShotTextForNarration(s) {
  if (s.dlg && Object.keys(s.dlg).length > 0) {
    let text = '';
    for (const sp in s.dlg) text += String(s.dlg[sp] || '');
    if (text.trim()) return text;
  }
  return s.ct || '';
}

export function correctShotsDurations(rawShots, mode = 'narration') {
  return rawShots.map(s => {
    const cloned = JSON.parse(JSON.stringify(s));
    let t_calc = 0;
    if (mode === 'script') {
      const hasDlg = cloned.dlg && Object.keys(cloned.dlg).length > 0;
      if (hasDlg) {
        t_calc = calcDlgDuration(cloned.dlg);
      }
    } else {
      const text = getShotTextForNarration(cloned);
      if (text) {
        t_calc = calcDuration(text);
      }
    }
    if (t_calc > 0) {
      const originalDur = typeof cloned.dur === 'number' ? cloned.dur : 1.5;
      cloned.dur = t_calc >= originalDur ? t_calc : originalDur;
    }
    return cloned;
  });
}

/**
 * 统计中文字符数与英文字符数（用于剧本对白）
 */
function countChars(text) {
  let zh = 0;
  let en = 0;
  for (const ch of String(text || '')) {
    if (/\s/.test(ch)) continue;
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef\u3000-\u303f]/.test(ch)) zh++;
    else en++;
  }
  return { zh, en };
}

/**
 * 计算剧本镜头对白的时长
 * 规则：6中文字符每秒，16英文字符每秒，向上取整，最小1秒
 */
function calcDlgDuration(dlg) {
  if (!dlg || typeof dlg !== 'object') return 0;
  let text = '';
  for (const sp in dlg) {
    text += String(dlg[sp] || '');
  }
  if (!text) return 0;
  const { zh, en } = countChars(text);
  const t = Math.ceil(zh / 6) + Math.ceil(en / 16);
  return Math.max(1, t);
}

/**
 * 解说模式归并算法：带回溯的贪心
 */
function greedyGroup(storys) {
  const durations = storys.map(unit => {
    if (unit.shots && unit.shots.length > 0) {
      return unit.shots.reduce((sum, s) => sum + (s.dur || 1.5), 0);
    }
    return calcDuration(unit.ct);
  });
  const n = durations.length;
  if (n === 0) return [];

  const groups = [];
  let i = 0;

  while (i < n) {
    let sum = durations[i];
    let end = i;

    while (end + 1 < n) {
      const nextSum = sum + durations[end + 1];
      if (nextSum <= 15) {
        sum = nextSum;
        end++;
      } else {
        break;
      }
    }

    if (sum < 4 && end + 1 < n) {
      sum += durations[end + 1];
      end++;
    }

    if (sum < 4 && end === n - 1 && groups.length > 0) {
      const lastGroup = groups[groups.length - 1];
      const mergedSum = lastGroup.totalTime + sum;
      if (mergedSum <= 15) {
        lastGroup.shotIndices.push(...Array.from({ length: end - i + 1 }, (_, k) => i + k));
        lastGroup.totalTime = mergedSum;
        i = end + 1;
        continue;
      }
    }

    const totalTime = sum < 4 ? 4 : sum;

    groups.push({
      shotIndices: Array.from({ length: end - i + 1 }, (_, k) => i + k),
      totalTime,
    });

    i = end + 1;
  }

  return groups;
}

/**
 * 对整集解说分镜进行归并
 */
function groupEpisodeUnits(episodeData) {
  const { storys, episodeIndex } = episodeData;
  if (!storys || storys.length === 0) return [];

  for (const unit of storys) {
    if (unit.shots && unit.shots.length > 0) {
      unit.shots = correctShotsDurations(unit.shots, 'narration');
    }
  }

  const groups = greedyGroup(storys);
  let newId = 1;

  return groups.map(g => {
    const shots = g.shotIndices.map(idx => storys[idx]);
    const locSet = new Map();
    for (const s of shots) {
      if (s.loc && s.loc.n) {
        const key = `${s.loc.n}||${s.loc.v || ''}`;
        if (!locSet.has(key)) {
          locSet.set(key, { n: s.loc.n, v: s.loc.v || '' });
        }
      }
    }

    const hasUnitCt = shots.some(s => s.ct && s.ct.trim().length > 0);
    const groupCt = hasUnitCt ? shots.map(s => (s.ct || '').trim()).filter(Boolean).join('\n') : '';

    return {
      id: newId++,
      episodeIndex,
      originalSceneId: shots[0]?.id,
      shots: shots.map(s => ({
        originalId: s.id,
        ct: s.ct || '',
        loc: s.loc || { n: '', v: '' },
        shots: s.shots || [],
      })),
      ct: groupCt,
      locs: [...locSet.values()],
      totalTime: g.totalTime,
    };
  });
}

/**
 * 剧本模式：对单集内的场次及其镜头进行独立归并
 */
export function groupEpisodeScriptUnits(episodeData, maxSec = 10) {
  const { storys, episodeIndex } = episodeData;
  if (!storys || storys.length === 0) return [];

  const mergedStorys = [];
  let newId = 1;

  for (const scene of storys) {
    const rawShots = scene.shots || [];
    if (!rawShots.length) continue;

    // 1. 校正有对白的镜头时长
    const correctedShots = correctShotsDurations(rawShots, 'script');

    // 2. 在场次内独立进行贪心归并
    const groups = [];
    const n = correctedShots.length;
    let i = 0;

    while (i < n) {
      let sum = correctedShots[i].dur;
      let end = i;

      while (end + 1 < n) {
        const nextSum = sum + correctedShots[end + 1].dur;
        if (nextSum <= maxSec) {
          sum = nextSum;
          end++;
        } else {
          break;
        }
      }

      if (sum < 4 && end + 1 < n) {
        sum += correctedShots[end + 1].dur;
        end++;
      }

      if (sum < 4 && end === n - 1 && groups.length > 0) {
        const lastGroup = groups[groups.length - 1];
        const mergedSum = lastGroup.totalTime + sum;
        if (mergedSum <= maxSec) {
          lastGroup.shots.push(...correctedShots.slice(i, end + 1));
          lastGroup.totalTime = mergedSum;
          i = end + 1;
          continue;
        }
      }

      const totalTime = sum < 4 ? 4 : sum;
      groups.push({
        shots: correctedShots.slice(i, end + 1),
        totalTime,
      });
      i = end + 1;
    }

    // 3. 构建归并后的新单元，结构需与后续 step4a/4c 消费兼容
    for (const g of groups) {
      // 提取本组内所有镜头的原文，如果镜头有自己的 ct，则用镜头 ct，否则使用场次的 ct 兜底
      const hasShotCt = g.shots.some(s => s.ct && s.ct.trim().length > 0);
      let groupCt;
      if (hasShotCt) {
        groupCt = g.shots.map(s => (s.ct || '').trim()).filter(Boolean).join('\n');
      } else {
        groupCt = scene.ct || '';
      }

      mergedStorys.push({
        id: newId++,
        episodeIndex,
        originalSceneId: scene.id,
        loc: scene.loc || { n: '', v: '' },
        shots: g.shots, // 扁平的子镜头组，包含 corrected dur 属性
        ct: groupCt,
        totalTime: g.totalTime,
      });
    }
  }

  return mergedStorys;
}

/**
 * 主入口：对整个 storyboard 进行归并（按集分组，支持解说/剧本分流）
 */
export function groupUnitsForNarration(storyboard, episodeCount, mode = 'narration', maxSec = 10) {
  const allStorys = storyboard.storys || [];

  const episodes = new Map();
  for (const u of allStorys) {
    const epIdx = u.episodeIndex ?? 0;
    if (!episodes.has(epIdx)) episodes.set(epIdx, []);
    episodes.get(epIdx).push(u);
  }

  const mergedStorys = [];
  for (const ep of episodes.keys()) {
    const epStorys = episodes.get(ep);
    if (!epStorys) continue;
    
    if (mode === 'script') {
      const grouped = groupEpisodeScriptUnits({ storys: epStorys, episodeIndex: ep }, maxSec);
      mergedStorys.push(...grouped);
    } else {
      const grouped = groupEpisodeUnits({ storys: epStorys, episodeIndex: ep });
      mergedStorys.push(...grouped);
    }
  }

  return { storys: mergedStorys };
}
