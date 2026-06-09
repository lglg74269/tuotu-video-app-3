<script setup>
import { ref, computed } from 'vue';

// items: [{ label, text }]  发送给模型的最终提示词（循环步骤为多条）
const props = defineProps({ items: { type: Array, default: () => [] } });
const open = ref(false);
const idx = ref(0);
const current = computed(() => props.items[idx.value] || null);

async function copy() {
  if (current.value) await navigator.clipboard.writeText(current.value.text || '');
}
</script>

<template>
  <div v-if="items.length" class="mt8">
    <button class="btn sm" @click="open = !open">
      {{ open ? '▾' : '▸' }} 查看发送的提示词（{{ items.length }} 条）
    </button>
    <div v-if="open" class="mt8">
      <div class="row mb8" v-if="items.length > 1">
        <span class="muted">选择：</span>
        <select v-model.number="idx" style="width:220px">
          <option v-for="(it, i) in items" :key="i" :value="i">{{ it.label }}</option>
        </select>
        <button class="btn sm" @click="copy">复制</button>
      </div>
      <button v-else class="btn sm mb8" @click="copy">复制</button>
      <div class="output" style="max-height:300px">{{ current ? current.text : '' }}</div>
    </div>
  </div>
</template>
