<script setup>
import { ref, onMounted } from 'vue';
import { Settings, Providers } from '../api/client.js';

const emit = defineEmits(['close', 'toast']);
const form = ref({ provider: 'volcengine', apiKey: '', baseUrl: '', model: '', maxTokens: 36000, temperature: 0.7 });
const testing = ref(false);
const providers = ref({});

onMounted(async () => {
  const [s, p] = await Promise.all([Settings.get(), Providers.list()]);
  providers.value = p.providers || {};
  form.value = { ...form.value, ...s };
});

function onProviderChange() {
  const provider = providers.value[form.value.provider];
  if (provider) {
    form.value.baseUrl = provider.defaultBaseUrl;
    form.value.model = provider.defaultModel;
  }
}

async function save() {
  await Settings.save(form.value);
  emit('toast', { type: 'success', msg: '设置已保存' });
  emit('close');
}
async function test() {
  testing.value = true;
  try {
    await Settings.save(form.value);
    const r = await Settings.test();
    emit('toast', { type: 'success', msg: '连通正常：' + (r.reply || '').slice(0, 20) });
  } catch (e) {
    emit('toast', { type: 'error', msg: '连通失败：' + e.message });
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <div class="inline-panel">
    <label class="field">
      <span class="lab">平台</span>
      <select v-model="form.provider" @change="onProviderChange" class="form-select">
        <option v-for="(p, key) in providers" :key="key" :value="key">{{ p.label }}</option>
      </select>
    </label>
    <label class="field">
      <span class="lab">API Key</span>
      <input v-model="form.apiKey" type="password" placeholder="留空则保留原 key，已配置显示 ***" autocomplete="off" />
    </label>
    <label class="field">
      <span class="lab">Base URL</span>
      <input v-model="form.baseUrl" placeholder="https://ark.cn-beijing.volces.com/api/v3" />
    </label>
    <label class="field">
      <span class="lab">模型</span>
      <input v-model="form.model" placeholder="doubao-seed-2-0-pro-260215" />
    </label>
    <div class="row">
      <label class="field" style="flex:1">
        <span class="lab">max_tokens</span>
        <input v-model.number="form.maxTokens" type="number" />
      </label>
      <label class="field" style="flex:1">
        <span class="lab">temperature</span>
        <input v-model.number="form.temperature" type="number" step="0.1" />
      </label>
    </div>
    <div class="row mt8">
      <button class="btn" @click="test" :disabled="testing">
        <span v-if="testing" class="spinner"></span> 连通测试
      </button>
      <div class="spacer" style="flex:1"></div>
      <button class="btn primary" @click="save">保存设置</button>
    </div>
  </div>
</template>

<style scoped>
.form-select {
  width: 100%;
  background: rgba(8, 12, 20, 0.6);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 8px 12px;
  font-size: 0.85rem;
  outline: none;
  cursor: pointer;
}
.form-select:focus {
  border-color: var(--border-glow);
}
.form-select option {
  background: var(--surface-2);
  color: var(--text);
}
</style>
