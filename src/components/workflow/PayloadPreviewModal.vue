<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';

const props = defineProps({
  visible: Boolean,
  title: String,
  payloads: {
    type: Array,
    default: () => []
  },
  rawData: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['update:visible']);

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
});

const activeRawTab = ref('overview');

const rawPartitions = computed(() => {
  if (!props.rawData) return {};
  const data = props.rawData;
  return {
    overview: {
      name: data.name,
      title: data.title,
      mode: data.mode,
      s2bConcurrency: data.s2bConcurrency,
      s2bRetries: data.s2bRetries,
      s2bRetryDelayMs: data.s2bRetryDelayMs,
      narrationMergeMaxSec: data.narrationMergeMaxSec,
      scriptMergeMaxSec: data.scriptMergeMaxSec,
      voiceLibrary: data.voiceLibrary,
    },
    episodes: {
      inputText: data.inputText,
      episodes: data.episodes,
      uploadHistory: data.uploadHistory,
    },
    assets: {
      assets: data.assets,
      episodeAssets: data.episodeAssets,
      episodeAppearance: data.episodeAppearance,
    },
    storyboard: {
      storyboard: data.storyboard,
      groupedStoryboard: data.groupedStoryboard,
      groupedStoryboardPerEpisode: data.groupedStoryboardPerEpisode,
      episodeStoryboard: data.episodeStoryboard,
      sbSelected: data.sbSelected,
    },
    video: {
      videoPrompts: data.videoPrompts,
    },
    misc: {
      epState: data.epState,
      stepLogs: data.stepLogs,
      payloads: data.payloads,
      s2FailedTasks: data.s2FailedTasks,
      episodeStatus: data.episodeStatus,
    }
  };
});

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制到剪贴板');
  } catch (err) {
    ElMessage.error('复制失败');
  }
}
</script>

<template>
  <el-dialog 
    v-model="dialogVisible" 
    :title="title" 
    width="900px" 
    top="5vh"
    class="payload-modal"
  >
    <div class="payload-content">
      <template v-if="rawData">
        <el-tabs v-model="activeRawTab" type="border-card">
          <el-tab-pane label="概况设置" name="overview">
            <div class="action-bar">
              <el-button size="small" @click="copyText(JSON.stringify(rawPartitions.overview, null, 2))" icon="CopyDocument">复制代码</el-button>
            </div>
            <pre class="json-pre">{{ JSON.stringify(rawPartitions.overview, null, 2) }}</pre>
          </el-tab-pane>
          <el-tab-pane label="分集原文" name="episodes">
            <div class="action-bar">
              <el-button size="small" @click="copyText(JSON.stringify(rawPartitions.episodes, null, 2))" icon="CopyDocument">复制代码</el-button>
            </div>
            <pre class="json-pre">{{ JSON.stringify(rawPartitions.episodes, null, 2) }}</pre>
          </el-tab-pane>
          <el-tab-pane label="分析资产" name="assets">
            <div class="action-bar">
              <el-button size="small" @click="copyText(JSON.stringify(rawPartitions.assets, null, 2))" icon="CopyDocument">复制代码</el-button>
            </div>
            <pre class="json-pre">{{ JSON.stringify(rawPartitions.assets, null, 2) }}</pre>
          </el-tab-pane>
          <el-tab-pane label="分镜剧本" name="storyboard">
            <div class="action-bar">
              <el-button size="small" @click="copyText(JSON.stringify(rawPartitions.storyboard, null, 2))" icon="CopyDocument">复制代码</el-button>
            </div>
            <pre class="json-pre">{{ JSON.stringify(rawPartitions.storyboard, null, 2) }}</pre>
          </el-tab-pane>
          <el-tab-pane label="视频提示词" name="video">
            <div class="action-bar">
              <el-button size="small" @click="copyText(JSON.stringify(rawPartitions.video, null, 2))" icon="CopyDocument">复制代码</el-button>
            </div>
            <pre class="json-pre">{{ JSON.stringify(rawPartitions.video, null, 2) }}</pre>
          </el-tab-pane>
          <el-tab-pane label="执行状态" name="misc">
            <div class="action-bar">
              <el-button size="small" @click="copyText(JSON.stringify(rawPartitions.misc, null, 2))" icon="CopyDocument">复制代码</el-button>
            </div>
            <pre class="json-pre">{{ JSON.stringify(rawPartitions.misc, null, 2) }}</pre>
          </el-tab-pane>
          <el-tab-pane label="完整数据" name="all">
            <div class="action-bar">
              <el-button size="small" @click="copyText(JSON.stringify(rawData, null, 2))" icon="CopyDocument">复制代码</el-button>
            </div>
            <pre class="json-pre">{{ JSON.stringify(rawData, null, 2) }}</pre>
          </el-tab-pane>
        </el-tabs>
      </template>
      
      <template v-else-if="payloads && payloads.length > 0">
        <el-collapse>
          <el-collapse-item 
            v-for="(p, idx) in payloads" 
            :key="idx" 
            :title="p.label || `Prompt ${idx + 1}`"
            :name="idx"
          >
            <div class="action-bar">
              <el-button size="small" @click="copyText(p.text)" icon="CopyDocument">复制提示词</el-button>
            </div>
            <pre class="prompt-pre">{{ p.text }}</pre>
          </el-collapse-item>
        </el-collapse>
      </template>

      <template v-else>
        <el-empty description="暂无提示词数据"></el-empty>
      </template>
    </div>
    
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogVisible = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.payload-content {
  max-height: 70vh;
  overflow-y: auto;
}

.action-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.prompt-pre, .json-pre {
  background: var(--bg-2, #1d1e1f);
  color: var(--text, #c9d1d9);
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--border, #30363d);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
</style>
