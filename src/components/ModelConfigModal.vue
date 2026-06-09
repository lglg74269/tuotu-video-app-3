<script setup>
import { ref, onMounted, computed } from 'vue';
import { Settings, Models } from '../api/client.js';

const emit = defineEmits(['close', 'toast']);
const loading = ref(true);
const saving = ref(false);
const fetching = ref(false);

const defaultModel = ref('');
const modelsText = ref(''); // 模型列表，每行一个
const nodeModels = ref({}); // { nodeKey: model }
const nodes = ref([]);

const modelList = computed(() =>
  modelsText.value.split('\n').map((s) => s.trim()).filter(Boolean)
);

onMounted(async () => {
  try {
    const [s, n] = await Promise.all([Settings.get(), Models.nodes()]);
    defaultModel.value = s.model || '';
    modelsText.value = (s.models || []).join('\n');
    // 确保默认模型在列表里
    if (defaultModel.value && !modelList.value.includes(defaultModel.value)) {
      modelsText.value = (modelsText.value ? modelsText.value + '\n' : '') + defaultModel.value;
    }
    nodeModels.value = { ...(s.nodeModels || {}) };
    nodes.value = n;
  } catch (e) {
    emit('toast', { type: 'error', msg: '读取失败：' + e.message });
  } finally {
    loading.value = false;
  }
});

async function fetchModels() {
  fetching.value = true;
  try {
    const r = await Models.fetch();
    const merged = Array.from(new Set([...modelList.value, ...(r.models || [])]));
    modelsText.value = merged.join('\n');
    emit('toast', { type: 'success', msg: `获取到 ${r.models.length} 个模型` });
  } catch (e) {
    emit('toast', { type: 'error', msg: '获取失败：' + e.message });
  } finally {
    fetching.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    // 清理：空值表示用默认
    const nm = {};
    for (const [k, v] of Object.entries(nodeModels.value)) if (v) nm[k] = v;
    await Settings.save({ model: defaultModel.value, models: modelList.value, nodeModels: nm });
    emit('toast', { type: 'success', msg: '模型配置已保存' });
    emit('close');
  } catch (e) {
    emit('toast', { type: 'error', msg: '保存失败：' + e.message });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="inline-panel" style="display:flex; flex-direction:column; height:calc(100vh - 180px);">
    <h2 style="margin-top:0">🧠 模型配置</h2>
    <p class="muted" style="margin-top:0">维护可用模型/接入点列表，并为每个调用模型的环节单独指定型号（留空则用全局默认）。</p>

    <div v-if="loading" class="muted">加载中…</div>
    <template v-else>
      <div style="flex:1; overflow-y:auto; padding-right:10px;">
        <label class="field">
          <span class="lab">可用模型 / 接入点列表（每行一个，可为 doubao-... 或 ep-... 接入点ID）</span>
          <textarea v-model="modelsText" class="code" style="min-height:120px"
                    placeholder="doubao-seed-2-0-pro-260215&#10;ep-xxxxxxxx"></textarea>
        </label>
        <div class="row mb8">
          <button class="btn" @click="fetchModels" :disabled="fetching">
            <span v-if="fetching" class="spinner"></span> 从接口获取模型列表
          </button>
        </div>

        <label class="field mt12">
          <span class="lab">全局默认模型</span>
          <select v-model="defaultModel">
            <option v-for="m in modelList" :key="m" :value="m">{{ m }}</option>
          </select>
        </label>

        <div class="lab" style="margin:16px 0 6px 0; font-weight:bold;">各环节模型（覆盖默认）</div>
        <div v-for="node in nodes" :key="node.key" class="ep-item">
          <div class="row">
            <span style="flex:1">{{ node.label }}</span>
            <select v-model="nodeModels[node.key]" style="width:260px">
              <option value="">（用全局默认：{{ defaultModel || '未设置' }}）</option>
              <option v-for="m in modelList" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
        </div>
      </div>

      <div class="row mt12" style="flex-shrink:0;">
        <div class="spacer" style="flex:1"></div>
        <button class="btn primary" @click="save" :disabled="saving">
          <span v-if="saving" class="spinner"></span> 保存模型配置
        </button>
      </div>
    </template>
  </div>
</template>
