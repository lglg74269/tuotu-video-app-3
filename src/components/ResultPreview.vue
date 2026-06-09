<script setup>
import { ref, computed } from 'vue';
import AutoRender from './AutoRender.vue';

// 接收整条流程数据；任何字段都可能后续变化，渲染层用通用 AutoRender 兜底
const props = defineProps({
  episodes: { type: Array, default: () => [] },
  episodeAppearance: { type: Array, default: () => [] },
  assets: { type: Object, default: () => ({}) },
  analysis: { type: Object, default: null },
  storyboard: { type: Object, default: () => ({ storys: [] }) },
  classifications: { type: Array, default: () => [] },
  videoPrompts: { type: Array, default: () => [] },
  stepMeta: { type: Object, default: () => ({}) },
  payloads: { type: Object, default: () => ({}) },
  sbValidation: { type: Object, default: null },
  vpValidation: { type: Object, default: null },
});

// 字段中文标签（未命中则回退到原始键名，保证结构变化也能渲染）
const LABELS = {
  id: '编号', n: '名称', v: '音色/状态值', vd: '描述', s: '性别', r: '人种', a: '年龄', rt: '定位',
  ae: '基础外貌', c: '泛化装扮', d: '简介/描述', looks: '造型列表', ln: '造型名', ld: '造型描述',
  scenes: '场景', states: '状态列表', sn: '状态名', sd: '状态描述',
  items: '物品', variants: '形态列表', vn: '形态名',
  characters: '角色', meta_info: '元信息', narrator: '旁白', genre: '题材', era: '年代',
  storys: '分镜单元', loc: '场景', ct: '原文', shots: '镜头', sc: '景别', ag: '角度', mv: '运镜', ds: '画面描述',
  dlg: '对白', vo: '音色', dur: '时长(s)', chars: '出场角色', itm: '物品', l: '造型',
  title: '标题', text: '正文', content: '正文', charCount: '字数',
  recommended_strategy: '推荐策略', audience: '受众', pacing: '节奏', visual_focus: '视觉重心',
  emotion_style: '情绪风格', notes: '备注',
  unit_id: '单元', type: '戏份类型', p: '提示词', dlgs: '对白角色',
  existing_character_new_looks: '已存在角色·新造型', existing_scene_new_states: '已存在场景·新状态',
  existing_item_new_variants: '已存在物品·新形态',
};

const sub = ref('archive');
const tabs = [
  { key: 'archive', label: '执行档案' },
  { key: 'episodes', label: '分集' },
  { key: 'assets', label: '资产库' },
  { key: 'storyboard', label: '分镜' },
  { key: 'video', label: '视频提示词' },
  { key: 'raw', label: '原始 JSON' },
];

// 执行档案：按步骤汇总 运行时间/模型/提示词版本/结果摘要
const STEP_ORDER = [
  { key: 'step1', pk: 's1', label: '① 分集' },
  { key: 'step2', pk: 's2', label: '② 资产提取' },
  { key: 'step3a', pk: 's3a', label: '③-a 类型分析' },
  { key: 'step3b', pk: 's3b', label: '③-b 分镜创作' },
  { key: 'step3c', pk: null, label: '③-c 程序校验' },
  { key: 'step4a', pk: 's4a', label: '④-a 镜头分类' },
  { key: 'step4x', pk: 's4x', label: '④-x 单元归并' },
  { key: 'step4c', pk: 's4c', label: '④-c 视频提示词' },
  { key: 'step4d', pk: null, label: '④-d 视频校验' },
];
// 出场清单兼容两种形式：字符串数组 或 [{n, looks/states/variants}]
function omitEps(obj) {
  if (!obj) return obj;
  const { eps, ...rest } = obj;
  return rest;
}

function fmtAppear(arr, key) {
  if (!arr || !arr.length) return '—';
  return arr
    .map((it) => {
      if (typeof it === 'string') return it;
      const variants = (it[key] || []).join('、');
      return variants ? `${it.n}（${variants}）` : it.n;
    })
    .join('；');
}
function fmtTime(t) {
  if (!t) return '';
  try { return new Date(t).toLocaleString('zh-CN'); } catch { return t; }
}
function fmtElapsed(ms) {
  if (!ms || ms <= 0) return '';
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}秒`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}分${rem}秒`;
}
function resultSummary(key) {
  if (key === 'step1') return `${props.episodes.length} 集`;
  if (key === 'step2') return `角${props.assets.characters?.length || 0}/景${props.assets.scenes?.length || 0}/物${props.assets.items?.length || 0}`;
  if (key === 'step3a') return props.analysis ? props.analysis.recommended_strategy : '';
  if (key === 'step3b') return `${props.storyboard.storys?.length || 0} 单元`;
  if (key === 'step3c') return props.sbValidation ? (props.sbValidation.pass ? '通过' : props.sbValidation.failedUnitIds.length + ' 单元失败') : '';
  if (key === 'step4a') return `${props.classifications.length} 单元已分类`;
  if (key === 'step4c') return `${props.videoPrompts.length} 条`;
  if (key === 'step4d') return props.vpValidation ? (props.vpValidation.pass ? '通过' : props.vpValidation.issues.length + ' 提示') : '';
  return '';
}

const typeMap = computed(() => {
  const m = {};
  for (const c of props.classifications) m[c.unit_id] = c.type;
  return m;
});

const hasAssets = computed(
  () => (props.assets?.characters?.length || props.assets?.scenes?.length || props.assets?.items?.length)
);

const rawAll = computed(() =>
  JSON.stringify(
    {
      episodes: props.episodes,
      assets: props.assets,
      analysis: props.analysis,
      storyboard: props.storyboard,
      classifications: props.classifications,
      videoPrompts: props.videoPrompts,
    },
    null,
    2
  )
);
</script>

<template>
  <div class="main" style="width:100%">
    <div class="tabs mb8" style="flex-wrap:wrap">
      <div v-for="t in tabs" :key="t.key" class="tab" :class="{ active: sub === t.key }" @click="sub = t.key">{{ t.label }}</div>
    </div>

    <!-- 执行档案：每步运行时间/模型/提示词版本/结果摘要 -->
    <div v-show="sub === 'archive'">
      <div class="muted mb8">记录本项目每个步骤的运行时间、所用模型、所用提示词版本与结果摘要。保存项目后可随时回看。</div>
      <div v-for="st in STEP_ORDER" :key="st.key" class="card">
        <div class="card-head" style="cursor:default">
          <span class="badge" :class="stepMeta[st.key] ? 'green' : 'gray'">{{ stepMeta[st.key] ? '已执行' : '未执行' }}</span>
          <h3>{{ st.label }}</h3>
          <span class="muted">{{ resultSummary(st.key) }}</span>
        </div>
        <div class="card-body" v-if="stepMeta[st.key]">
          <div class="ar-obj">
            <div class="ar-kv"><div class="ar-key">运行时间</div><div class="ar-val">{{ fmtTime(stepMeta[st.key].ranAt) }}</div></div>
            <div class="ar-kv" v-if="stepMeta[st.key].elapsedMs"><div class="ar-key">耗时</div><div class="ar-val" style="color:var(--accent)">{{ fmtElapsed(stepMeta[st.key].elapsedMs) }}</div></div>
            <div class="ar-kv"><div class="ar-key">使用模型</div><div class="ar-val">{{ stepMeta[st.key].model || '—' }}<span v-if="stepMeta[st.key].runs > 1" class="muted">（共 {{ stepMeta[st.key].runs }} 次调用）</span></div></div>
            <div class="ar-kv" v-if="stepMeta[st.key].prompts && stepMeta[st.key].prompts.length">
              <div class="ar-key">提示词版本</div>
              <div class="ar-val">
                <div v-for="(pp, i) in stepMeta[st.key].prompts" :key="i">
                  <span class="pill">{{ pp.label || pp.key }}</span>
                  <span class="muted"> → {{ pp.versionName || '默认' }}</span>
                </div>
              </div>
            </div>
            <div class="ar-kv" v-if="st.pk && payloads[st.pk] && payloads[st.pk].length">
              <div class="ar-key">发送提示词</div>
              <div class="ar-val muted">{{ payloads[st.pk].length }} 条（见各步骤卡片「查看发送的提示词」）</div>
            </div>
          </div>
        </div>
        <div class="card-body muted" v-else>尚未执行。</div>
      </div>
    </div>

    <!-- 分集：标题 + 完整原文 -->
    <div v-show="sub === 'episodes'">
      <div v-if="!episodes.length" class="muted">暂无分集数据，请先在工作流执行「分集」。</div>
      <div v-for="ep in episodes" :key="ep.id" class="card">
        <div class="card-head" style="cursor:default">
          <span class="pill">{{ ep.title || ('第' + ep.id + '集') }}</span>
          <h3 style="flex:1"></h3>
          <span class="muted">{{ (ep.text || '').length }} 字</span>
        </div>
        <div class="card-body">
          <div v-if="episodeAppearance[ep.id - 1]" class="ar-obj mb8" style="font-size:12px">
            <div class="ar-kv"><div class="ar-key">本集角色</div><div class="ar-val">{{ fmtAppear(episodeAppearance[ep.id - 1].characters, 'looks') }}</div></div>
            <div class="ar-kv"><div class="ar-key">本集场景</div><div class="ar-val">{{ fmtAppear(episodeAppearance[ep.id - 1].scenes, 'states') }}</div></div>
            <div class="ar-kv"><div class="ar-key">本集物品</div><div class="ar-val">{{ fmtAppear(episodeAppearance[ep.id - 1].items, 'variants') }}</div></div>
          </div>
          <div class="output" style="max-height:300px">{{ ep.text }}</div>
        </div>
      </div>
    </div>

    <!-- 资产库：分组表格 -->
    <div v-show="sub === 'assets'">
      <div v-if="!hasAssets" class="muted">暂无资产数据。</div>
      <template v-else>
        <div class="card" v-if="assets.meta_info || assets.narrator">
          <div class="card-head" style="cursor:default"><h3>元信息 / 旁白</h3></div>
          <div class="card-body">
            <AutoRender :value="{ meta_info: assets.meta_info, narrator: assets.narrator }" :labels="LABELS" />
          </div>
        </div>
        <div class="card" v-if="assets.characters?.length">
          <div class="card-head" style="cursor:default"><h3>角色（{{ assets.characters.length }}）</h3></div>
          <div class="card-body">
            <div v-for="c in assets.characters" :key="c.n" class="asset-entity">
              <div class="asset-entity-head">
                <span class="asset-entity-name">{{ c.n }}</span>
                <span v-if="c.eps?.length" class="asset-eps">
                  出现集数：{{ c.eps.map(i => `第${i}集`).join('、') }}
                </span>
                <span v-else class="asset-eps muted">暂无集数信息</span>
              </div>
              <AutoRender :value="omitEps(c)" :labels="LABELS" />
            </div>
          </div>
        </div>
        <div class="card" v-if="assets.scenes?.length">
          <div class="card-head" style="cursor:default"><h3>场景（{{ assets.scenes.length }}）</h3></div>
          <div class="card-body">
            <div v-for="s in assets.scenes" :key="s.s" class="asset-entity">
              <div class="asset-entity-head">
                <span class="asset-entity-name">{{ s.s }}</span>
                <span v-if="s.eps?.length" class="asset-eps">
                  出现集数：{{ s.eps.map(i => `第${i}集`).join('、') }}
                </span>
                <span v-else class="asset-eps muted">暂无集数信息</span>
              </div>
              <AutoRender :value="omitEps(s)" :labels="LABELS" />
            </div>
          </div>
        </div>
        <div class="card" v-if="assets.items?.length">
          <div class="card-head" style="cursor:default"><h3>物品（{{ assets.items.length }}）</h3></div>
          <div class="card-body">
            <div v-for="it in assets.items" :key="it.n" class="asset-entity">
              <div class="asset-entity-head">
                <span class="asset-entity-name">{{ it.n }}</span>
                <span v-if="it.eps?.length" class="asset-eps">
                  出现集数：{{ it.eps.map(i => `第${i}集`).join('、') }}
                </span>
                <span v-else class="asset-eps muted">暂无集数信息</span>
              </div>
              <AutoRender :value="omitEps(it)" :labels="LABELS" />
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 分镜：每单元 场景+原文+镜头表 -->
    <div v-show="sub === 'storyboard'">
      <div v-if="!storyboard.storys || !storyboard.storys.length" class="muted">暂无分镜数据。</div>
      <div v-for="u in (storyboard.storys || [])" :key="u.id" class="card">
        <div class="card-head" style="cursor:default">
          <span class="pill green" v-if="u.episodeIndex != null">{{ episodes[u.episodeIndex]?.title || `第${u.episodeIndex + 1}集` }}</span>
          <span class="pill">单元 {{ u.id }}</span>
          <span class="pill" v-if="typeMap[u.id]">{{ typeMap[u.id] }}</span>
          <span class="muted">场景：{{ u.loc ? (u.loc.n + ' / ' + u.loc.v) : '—' }}</span>
          <div style="flex:1"></div>
          <span class="muted">{{ (u.shots || []).length }} 镜头</span>
        </div>
        <div class="card-body">
          <div class="ar-kv" style="margin-bottom:8px">
            <div class="ar-key" style="min-width:60px">原文</div>
            <div class="output" style="flex:1;max-height:140px">{{ u.ct }}</div>
          </div>
          <AutoRender :value="u.shots" :labels="LABELS" />
        </div>
      </div>
    </div>

    <!-- 视频提示词：每单元卡片 -->
    <div v-show="sub === 'video'">
      <div v-if="!videoPrompts.length" class="muted">暂无视频提示词数据。</div>
      <div v-for="vp in videoPrompts" :key="vp.n" class="card">
        <div class="card-head" style="cursor:default">
          <span class="pill">单元 {{ vp.n }}</span>
          <span class="pill" v-if="typeMap[vp.n]">{{ typeMap[vp.n] }}</span>
          <span class="muted">对白角色：{{ (vp.dlgs || []).join('、') || '无' }}</span>
        </div>
        <div class="card-body">
          <div class="output">{{ vp.p }}</div>
        </div>
      </div>
    </div>

    <!-- 原始 JSON -->
    <div v-show="sub === 'raw'">
      <div class="output" style="max-height:70vh">{{ rawAll }}</div>
    </div>
  </div>
</template>

<style scoped>
.ar-obj { display: flex; flex-direction: column; gap: 6px; }
.ar-kv { display: flex; gap: 10px; align-items: flex-start; }
.ar-key { min-width: 92px; color: var(--text-2); font-size: 12px; flex-shrink: 0; }
.ar-val { flex: 1; min-width: 0; word-break: break-word; }
.asset-entity { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
.asset-entity:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
.asset-entity-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
.asset-entity-name { font-weight: 600; font-size: 14px; color: var(--text-1); }
.asset-eps { font-size: 12px; color: var(--accent, #6c8ebf); background: var(--bg-2, #f0f4fa); padding: 2px 8px; border-radius: 10px; }
</style>
