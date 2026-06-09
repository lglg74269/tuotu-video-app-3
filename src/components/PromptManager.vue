<script setup>
import { ref, onMounted, computed } from 'vue';
import { Prompts } from '../api/client.js';

const emit = defineEmits(['toast']);
const nodes = ref([]);
const activeKey = ref('');
const node = ref(null);
const editVid = ref('');
const editName = ref('');
const editContent = ref('');
const newName = ref('');

const modeTab = ref('narration');

const stepLabel = {
  step1: 'Step1 章节分集',
  step2a: 'Step2a 资产名称提取',
  step2a_b: 'Step2a_b 资产更新检查',
  step2b: 'Step2b 资产详情提取',
  step3a: 'Step3a 类型分析',
  'step3b-split': 'Step3b-split 原文拆分',
  'step3b-shots': 'Step3b-shots 镜头创作',
  step4a: 'Step4a 镜头分类',
  step4c: 'Step4c 视频提示词',
};

const commonStepsOrder = ['step1', 'step2a', 'step2a_b', 'step2b', 'step3a'];
const workflowStepsOrder = ['step3b-split', 'step3b-shots', 'step4a', 'step4c'];

const commonNodesGrouped = computed(() => {
  const g = {};
  for (const step of commonStepsOrder) {
    g[step] = [];
  }
  for (const n of nodes.value) {
    if (commonStepsOrder.includes(n.step)) {
      g[n.step].push(n);
    }
  }
  return Object.fromEntries(Object.entries(g).filter(([_, list]) => list.length > 0));
});

const workflowNodesGrouped = computed(() => {
  const g = {};
  for (const step of workflowStepsOrder) {
    g[step] = [];
  }
  for (const n of nodes.value) {
    if (workflowStepsOrder.includes(n.step)) {
      if (n.mode === modeTab.value || n.mode === 'common') {
        g[n.step].push(n);
      }
    }
  }
  return Object.fromEntries(Object.entries(g).filter(([_, list]) => list.length > 0));
});

onMounted(load);
async function load() {
  nodes.value = await Prompts.nodes();
  if (nodes.value.length && !activeKey.value) selectNode(nodes.value[0].key);
}
async function selectNode(key) {
  activeKey.value = key;
  node.value = await Prompts.node(key);
  const active = node.value.versions.find((v) => v.active) || node.value.versions[0];
  pickVersion(active);
}
function pickVersion(v) {
  editVid.value = v.id;
  editName.value = v.name;
  editContent.value = v.content;
}
async function saveVersion() {
  await Prompts.updateVersion(activeKey.value, editVid.value, { name: editName.value, content: editContent.value });
  emit('toast', { type: 'success', msg: '已保存版本' });
  node.value = await Prompts.node(activeKey.value);
}
async function activate(v) {
  await Prompts.activate(activeKey.value, v.id);
  node.value = await Prompts.node(activeKey.value);
  await load();
  emit('toast', { type: 'success', msg: '已激活：' + v.name });
}
async function addVersion() {
  const r = await Prompts.addVersion(activeKey.value, { name: newName.value || '新版本', content: editContent.value });
  newName.value = '';
  node.value = r;
  const act = r.versions.find((v) => v.active);
  if (act) pickVersion(act);
  await load();
  emit('toast', { type: 'success', msg: '已新增并激活版本' });
}
async function delVersion(v) {
  if (!confirm('删除版本：' + v.name + ' ?')) return;
  node.value = await Prompts.delVersion(activeKey.value, v.id);
  emit('toast', { type: 'success', msg: '已删除' });
}
async function reset() {
  if (!confirm('重置为种子版本（新增一个种子内容版本并激活）？')) return;
  node.value = await Prompts.reset(activeKey.value);
  const act = node.value.versions.find((v) => v.active);
  if (act) pickVersion(act);
  emit('toast', { type: 'success', msg: '已重置为种子版本' });
}
</script>

<template>
  <div class="layout">
    <div class="sidebar">
      <!-- 前期准备 (Before Step3b) -->
      <div v-for="(list, step) in commonNodesGrouped" :key="step" class="mb8">
        <div class="muted" style="font-size:12px;margin:8px 0 4px">{{ stepLabel[step] || step }}</div>
        <div v-for="n in list" :key="n.key"
             class="ep-item" :style="{ borderColor: activeKey === n.key ? 'var(--primary)' : '' }"
             @click="selectNode(n.key)" style="cursor:pointer">
          <div class="row">
            <span class="badge" :class="n.kind === 'system' ? 'blue' : 'yellow'">{{ n.kind === 'system' ? '系统' : '创作' }}</span>
            <span style="flex:1">{{ n.label }}</span>
          </div>
          <div class="muted" style="font-size:11px;margin-top:3px">{{ n.versionCount }} 个版本 · 当前：{{ n.activeVersionName }}</div>
        </div>
      </div>

      <!-- 核心流程分隔线 -->
      <div class="muted" style="border-top: 1px solid var(--border); margin: 16px 0; padding-top: 12px; font-weight: bold; font-size: 13px;">
        核心创作流程 (Step 3b+)
      </div>

      <!-- 模式选择标签页 -->
      <div class="tabs mb12" style="margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px;">
        <div class="tab" :class="{ active: modeTab === 'narration' }" @click="modeTab = 'narration'" style="flex: 1; text-align: center; font-size: 12px; padding: 6px 0; border-radius: 6px;">
          解说模式
        </div>
        <div class="tab" :class="{ active: modeTab === 'script' }" @click="modeTab = 'script'" style="flex: 1; text-align: center; font-size: 12px; padding: 6px 0; border-radius: 6px;">
          剧本模式
        </div>
      </div>

      <!-- 工作流步骤 (From Step3b onwards) -->
      <div v-for="(list, step) in workflowNodesGrouped" :key="step" class="mb8">
        <div class="muted" style="font-size:12px;margin:8px 0 4px">{{ stepLabel[step] || step }}</div>
        <div v-for="n in list" :key="n.key"
             class="ep-item" :style="{ borderColor: activeKey === n.key ? 'var(--primary)' : '' }"
             @click="selectNode(n.key)" style="cursor:pointer">
          <div class="row">
            <span class="badge" :class="n.kind === 'system' ? 'blue' : 'yellow'">{{ n.kind === 'system' ? '系统' : '创作' }}</span>
            <span style="flex:1">{{ n.label }}</span>
          </div>
          <div class="muted" style="font-size:11px;margin-top:3px">{{ n.versionCount }} 个版本 · 当前：{{ n.activeVersionName }}</div>
        </div>
      </div>
    </div>

    <div class="main" v-if="node">
      <div class="card">
        <div class="card-head" style="cursor:default">
          <span class="badge" :class="node.kind === 'system' ? 'blue' : 'yellow'">{{ node.kind === 'system' ? '系统提示词' : '创作提示词' }}</span>
          <h3>{{ node.label }}</h3>
          <button class="btn sm danger" @click="reset">重置为种子</button>
        </div>
        <div class="card-body">
          <div class="row mb8">
            <span class="muted">版本：</span>
            <button v-for="v in node.versions" :key="v.id" class="btn sm"
                    :class="{ primary: v.id === editVid }"
                    @click="pickVersion(v)">
              {{ v.name }}<span v-if="v.active"> ✓</span>
            </button>
          </div>
          <label class="field">
            <span class="lab">版本名</span>
            <input v-model="editName" />
          </label>
          <label class="field">
            <span class="lab">提示词内容（占位符如 characters_looks、creative_block、target_text 等会被流程自动填充）</span>
            <textarea v-model="editContent" class="code" style="min-height:420px"></textarea>
          </label>
          <div class="row">
            <button class="btn primary" @click="saveVersion">保存当前版本</button>
            <button class="btn" @click="activate(node.versions.find(v=>v.id===editVid))">设为激活</button>
            <button class="btn danger" @click="delVersion(node.versions.find(v=>v.id===editVid))">删除此版本</button>
            <div class="spacer" style="flex:1"></div>
            <input v-model="newName" placeholder="另存为新版本名" style="width:160px" />
            <button class="btn" @click="addVersion">另存为新版本</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
