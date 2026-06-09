<script setup>
import { ref, onMounted, computed } from 'vue';
import { VoiceLib } from '../api/client.js';

const emit = defineEmits(['close', 'toast', 'saved']);
const content = ref('');
const loading = ref(true);
const saving = ref(false);
const filter = ref('');

onMounted(async () => {
  try {
    const r = await VoiceLib.get();
    content.value = r.content || '';
  } catch (e) {
    emit('toast', { type: 'error', msg: '读取音色库失败：' + e.message });
  } finally {
    loading.value = false;
  }
});

// 统计有效音色行（排除以 > 开头的说明行与表头）
const count = computed(() =>
  content.value
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('>') && !l.includes('名称丨'))
    .length
);

const previewRows = computed(() => {
  const kw = filter.value.trim().toLowerCase();
  return content.value
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('>') && !l.includes('名称丨'))
    .map((l) => l.split(/\t|丨|\|/).map((x) => x.trim()))
    .filter((cols) => !kw || cols.join(' ').toLowerCase().includes(kw))
    .slice(0, 200);
});

async function save() {
  saving.value = true;
  try {
    await VoiceLib.save(content.value);
    emit('toast', { type: 'success', msg: `音色库已保存（${count.value} 个音色）` });
    emit('saved', content.value);
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
    <div class="row" style="margin-bottom:10px">
      <h2 style="margin:0;flex:1">🎵 音色库（全局保存，所有项目共用）</h2>
      <span class="badge blue">{{ count }} 个音色</span>
    </div>
    <p class="muted" style="margin-top:0">格式：名称丨性别丨年龄丨标识（支持 Tab 或 | 分隔）。Step2 资产提取会自动使用此处保存的音色库。</p>

    <div v-if="loading" class="muted">加载中…</div>
    <template v-else>
      <label class="field" style="flex:1; display:flex; flex-direction:column; min-height:0;">
        <span class="lab">音色库内容（可直接编辑）</span>
        <textarea v-model="content" class="code" style="flex:1; resize:none"></textarea>
      </label>

      <label class="field mt12">
        <span class="lab">快速检索预览（最多显示 200 条）</span>
        <input v-model="filter" placeholder="按名称/标识/性别筛选…" />
      </label>
      <div class="output" style="height:200px; overflow-y:auto; flex-shrink:0;">
        <div v-for="(cols, i) in previewRows" :key="i" class="row" style="gap:10px">
          <span style="width:160px">{{ cols[0] }}</span>
          <span class="pill">{{ cols[1] }}/{{ cols[2] }}</span>
          <span class="muted">{{ cols[3] }}</span>
        </div>
      </div>

      <div class="row mt12">
        <div class="spacer" style="flex:1"></div>
        <button class="btn primary" @click="save" :disabled="saving">
          <span v-if="saving" class="spinner"></span> 保存音色库
        </button>
      </div>
    </template>
  </div>
</template>
