<script setup>
import { ref, computed } from 'vue';
import { activeProject, autoSave } from '../../store/projectStore.js';
import { 
  busy, 
  progress, 
  runClassify, 
  runVideo, 
  runValidateVp,
  stopStep,
  vpValidation
} from '../../store/workflowEngine.js';
import PayloadPreviewModal from './PayloadPreviewModal.vue';

const props = defineProps(['onNext']);
const payloadVisible = ref(false);
const activeViewingEpisode = ref(0);

const viewingGroupedStorys = computed(() => {
  const epSb = activeProject.groupedStoryboardPerEpisode?.[activeViewingEpisode.value];
  return epSb?.storys || [];
});

const viewingClassifications = computed(() => {
  const storys = viewingGroupedStorys.value;
  const ids = new Set(storys.map(s => s.id));
  return (activeProject.classifications || []).filter(c => ids.has(c.unit_id));
});

const viewingVideoPrompts = computed(() => {
  return (activeProject.videoPrompts || []).filter(vp => vp.episodeIndex === activeViewingEpisode.value);
});

// 计算全选/半选集数
const checkAllClassify = computed({
  get() {
    return activeProject.s4aSelected.length === activeProject.episodes.length;
  },
  set(val) {
    if (val) activeProject.s4aSelected = activeProject.episodes.map((_, i) => i);
    else activeProject.s4aSelected = [];
  }
});

const checkAllVideo = computed({
  get() {
    return activeProject.s4cSelected.length === activeProject.episodes.length;
  },
  set(val) {
    if (val) activeProject.s4cSelected = activeProject.episodes.map((_, i) => i);
    else activeProject.s4cSelected = [];
  }
});

// 每集 S4 状态点颜色
function s4DotColor(i) {
  const state = activeProject.epState;
  const s4cDone = state.s4c[i] === 'done';
  const s4xDone = (activeProject.mode === 'narration' || activeProject.mode === 'script') ? state.s4x[i] === 'done' : true;
  const s4aDone = state.s4a[i] === 'done';
  const sbDone = state.sb[i] === 'done';
  
  if (s4cDone) return 'success';
  if (state.s4c[i] === 'running') return 'primary';
  if (state.s4c[i] === 'error') return 'danger';
  if (sbDone && s4xDone && s4aDone) return 'warning';
  return 'info';
}

function s4DotText(i) {
  const state = activeProject.epState;
  const classify = state.s4a[i] === 'done' ? '类' : '类·待';
  const video = state.s4c[i] === 'done' ? '视' : '视·待';
  return `${classify} | ${video}`;
}

function getUnitType(unitId) {
  const c = activeProject.classifications?.find((x) => x.unit_id === unitId);
  return c ? c.type : '未分类';
}

function getIssueType(level) {
  if (level === 'error') return 'danger';
  if (level === 'warning') return 'warning';
  return 'info';
}
</script>

<template>
  <div class="video-container">
    <!-- 顶部操作控制栏 -->
    <div class="toolbar-card">
      <div class="toolbar-title">
        <span>④ 视频提示词生成 (分类 → 视频提示词 → 校验)</span>
      </div>
      <div class="toolbar-content">
        <div class="input-item">
          <span class="label">提示词生成并发:</span>
          <el-input-number v-model="activeProject.s4cConcurrency" :min="1" :max="20" size="small" />
        </div>

        <div class="actions">
          <el-button 
            v-if="busy.s4a" 
            type="danger" 
            @click="stopStep('s4a')"
          >
            停止分类
          </el-button>
          <el-button 
            v-else 
            type="primary" 
            @click="runClassify"
          >
            a.镜头分类
          </el-button>

          <el-button 
            v-if="busy.s4c" 
            type="danger" 
            @click="stopStep('s4c')"
          >
            停止生成
          </el-button>
          <el-button 
            v-else 
            type="primary" 
            @click="runVideo"
          >
            c.生成视频提示词
          </el-button>

          <el-button 
            v-if="activeProject.payloads?.s4c" 
            type="info" 
            @click="payloadVisible = true"
            plain
          >
            提示词预览
          </el-button>

          <el-button 
            type="primary" 
            @click="runValidateVp"
            :loading="busy.s4d"
          >
            d.提示词校验
          </el-button>

          <span class="progress-text" v-if="busy.s4c && progress.s4c">
            已生成: {{ progress.s4c.cur }} / {{ progress.s4c.total }}
          </span>
        </div>
      </div>
    </div>

    <!-- 运行指标 & 每集 Step4 运行监视 -->
    <div class="status-card" v-if="activeProject.episodes.length > 0">
      <div class="status-header">
        <span>每集提示词状态生命周期监视</span>
        <div class="bulk-checkboxes">
          <el-checkbox v-model="checkAllClassify" size="small">全选分类</el-checkbox>
          <el-checkbox v-model="checkAllVideo" size="small" class="ml10">全选生成</el-checkbox>
        </div>
      </div>
      <div class="episode-status-grid">
        <div 
          v-for="(ep, idx) in activeProject.episodes" 
          :key="idx" 
          class="ep-status-card"
          :class="{ 'is-viewing': activeViewingEpisode === idx }"
          @click="activeViewingEpisode = idx"
        >
          <div class="ep-header">
            <span class="title">第{{ idx + 1 }}集</span>
            <el-tag :type="s4DotColor(idx)" size="small">
              {{ activeProject.epState.s4c[idx] === 'done' ? '已完成' : activeProject.epState.s4c[idx] === 'running' ? '生成中' : '未生成' }}
            </el-tag>
          </div>
          <div class="ep-body">
            <span class="status-steps">{{ s4DotText(idx) }}</span>
            <div class="select-actions mt8">
              <el-checkbox v-model="activeProject.s4aSelected" :label="idx" size="small">重分类</el-checkbox>
              <el-checkbox v-model="activeProject.s4cSelected" :label="idx" size="small">重生成</el-checkbox>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 校验问题提示 -->
    <div class="validation-card" v-if="vpValidation && vpValidation.issues?.length > 0">
      <div class="validation-header">
        <span>④-d 校验反馈 (发现 {{ vpValidation.issues.length }} 个待优化项)</span>
        <el-tag :type="vpValidation.pass ? 'success' : 'warning'" size="small">
          {{ vpValidation.pass ? '通过' : '未完全通过' }}
        </el-tag>
      </div>
      <div class="issues-list">
        <el-alert
          v-for="(issue, idx) in vpValidation.issues"
          :key="idx"
          :title="`${issue.code} — ${issue.message}`"
          :type="getIssueType(issue.level)"
          show-icon
          :closable="false"
          class="mb8"
        />
      </div>
    </div>

    <!-- 分类标签概览 -->
    <div class="classifications-panel" v-if="viewingClassifications?.length > 0">
      <div class="panel-title">镜头分类标签库</div>
      <div class="tags-container">
        <el-tag 
          v-for="c in viewingClassifications" 
          :key="c.unit_id"
          class="m4"
          type="info"
          effect="plain"
        >
          #{{ c.unit_id }} — {{ c.type }}
        </el-tag>
      </div>
    </div>

    <!-- 视频提示词卡片列表 -->
    <div v-if="viewingVideoPrompts.length === 0" class="empty-state">
      <el-empty description="当前集暂无视频提示词数据，请先分类并生成提示词" />
    </div>

    <div v-else class="video-prompts-list">
      <div class="list-layout">
        <el-card 
          v-for="vp in viewingVideoPrompts" 
          :key="vp.n" 
          class="vp-card"
          shadow="hover"
        >
          <template #header>
            <div class="vp-card-header">
              <el-tag type="primary" effect="dark">单元 {{ vp.n }}</el-tag>
              <el-tag type="success" effect="plain" class="ml10">{{ getUnitType(vp.n) }}</el-tag>
              <span class="dlgs" v-if="vp.dlgs && vp.dlgs.length > 0">
                对白角色: <span class="dlg-char" v-for="char in vp.dlgs" :key="char">{{ char }}</span>
              </span>
              <span class="episode-index" v-if="vp.episodeIndex != null">第{{ vp.episodeIndex + 1 }}集</span>
            </div>
          </template>
          <div class="vp-card-body">
            <div class="prompt-text" v-if="typeof vp.p === 'string' && vp.p.trim() !== ''">
              {{ vp.p }}
            </div>
            <div class="prompt-text" v-else-if="Array.isArray(vp.prompts)">
              <div v-for="(pItem, pIdx) in vp.prompts" :key="pIdx" class="prompt-item">
                <el-tag size="small" type="info" class="mb8">分镜 {{ pItem.shot_id || pIdx + 1 }}</el-tag>
                <p>{{ pItem.p || pItem.prompt || pItem.text || pItem }}</p>
              </div>
            </div>
            <div class="prompt-text" v-else>
              <pre>{{ JSON.stringify(vp, null, 2) }}</pre>
            </div>
          </div>
        </el-card>
      </div>
    </div>

    <PayloadPreviewModal 
      v-model:visible="payloadVisible" 
      title="视频提示词生成提示词" 
      :payloads="activeProject.payloads?.s4c" 
    />
  </div>
</template>

<style scoped>
.video-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.toolbar-card, .status-card, .validation-card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.toolbar-title, .status-header, .validation-header {
  font-size: 14px;
  font-weight: bold;
  color: var(--text);
  margin-bottom: 12px;
  border-left: 3px solid var(--primary);
  padding-left: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ep-status-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  min-width: 150px;
  cursor: pointer;
  transition: all 0.2s;
}

.ep-status-card:hover {
  border-color: var(--primary);
}

.ep-status-card.is-viewing {
  border-color: var(--primary);
  background: rgba(64, 158, 255, 0.05);
  box-shadow: 0 0 0 1px var(--primary);
}

.ep-header {
  font-size: 14px;
  font-weight: bold;
  color: var(--text);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar-content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
}

.input-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-item .label {
  font-size: 12px;
  color: var(--text-2);
}

.actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-text {
  font-size: 13px;
  color: var(--primary);
  font-weight: bold;
}

.bulk-checkboxes {
  display: flex;
  align-items: center;
}

.episode-status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.ep-status-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
}

.ep-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ep-header .title {
  font-weight: bold;
  font-size: 13px;
  color: var(--text);
}

.ep-body {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-2);
}

.status-steps {
  font-family: monospace;
}

.select-actions {
  display: flex;
  gap: 8px;
}

.select-actions :deep(.el-checkbox) {
  margin-right: 0;
}

.validation-card {
  border-color: rgba(230, 162, 60, 0.3);
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.classifications-panel {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.panel-title {
  font-size: 13px;
  font-weight: bold;
  color: var(--text);
  margin-bottom: 12px;
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tags-container .el-tag {
  flex-shrink: 0;
}

.m4 {
  margin: 4px;
}

.empty-state {
  padding: 40px;
  background: var(--bg-2);
  border-radius: 8px;
  border: 1px dashed var(--border);
}

.video-prompts-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.list-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 600px;
  overflow-y: auto;
  padding: 4px;
}

.vp-card {
  flex-shrink: 0;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.vp-card :deep(.el-card__header) {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
}

.vp-card-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.dlgs {
  font-size: 12px;
  color: var(--text-2);
  margin-left: 20px;
}

.dlg-char {
  background: rgba(255, 255, 255, 0.04);
  padding: 1px 6px;
  border-radius: 4px;
  margin-right: 4px;
  font-size: 11px;
}

.episode-index {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-2);
}

.prompt-text {
  font-family: monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
  background: rgba(0, 0, 0, 0.2);
  padding: 12px;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.prompt-text pre {
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  font-family: inherit;
}

.prompt-item {
  margin-bottom: 16px;
  border-bottom: 1px dashed var(--border-light, #ebeef5);
  padding-bottom: 12px;
}
.prompt-item:last-child {
  margin-bottom: 0;
  border-bottom: none;
  padding-bottom: 0;
}

.ml10 {
  margin-left: 10px;
}

.mt8 {
  margin-top: 8px;
}

.mb8 {
  margin-bottom: 8px;
}
</style>
