<script setup>
import { ref, computed } from 'vue';
import { activeProject, autoSave } from '../../store/projectStore.js';
import { 
  busy, 
  getSeg, 
  runSegment, 
  stopStep, 
  textType,
  runExtractForEpisodes
} from '../../store/workflowEngine.js';
import { Plus, Document, Delete, VideoPlay } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PayloadPreviewModal from './PayloadPreviewModal.vue';
import { deleteEpisode, enqueueEpisodePipeline, activeEpisodeTasks, episodePipelineQueue } from '../../store/workflowEngine.js';

const currentSeg = computed(() => getSeg());
const payloadVisible = ref(false);

const props = defineProps(['onNext']);

// ---- Episode Details Modal ----
const detailsVisible = ref(false);
const activeEpisode = ref(null);
const activeEpisodeIndex = ref(-1);

function showEpisodeDetails(ep, idx) {
  activeEpisode.value = ep;
  activeEpisodeIndex.value = idx;
  detailsVisible.value = true;
}

async function handleDeleteEpisode(idx, event) {
  event.stopPropagation();
  try {
    await ElMessageBox.confirm(
      `确定要清空第 ${idx + 1} 集的原文吗？\n清空后该集将变成空位，可以重新填补。该集相关的资产和分镜暂不清理。`,
      '清空原文',
      { confirmButtonText: '确定清空', cancelButtonText: '取消', type: 'warning' }
    );
    deleteEpisode(idx, false);
    ElMessage.success(`第 ${idx + 1} 集原文已清空`);
  } catch (e) {
    // cancelled
  }
}

async function handleHardDeleteEpisode(idx) {
  try {
    await ElMessageBox.confirm(
      `确定要彻底删除第 ${idx + 1} 集并重排后续集数吗？\n【极其危险】：这会导致后续集数索引偏移，您必须重新提取后续所有集的资产和分镜以防数据错乱！`,
      '彻底重排 (危险)',
      { confirmButtonText: '强制删除并重排', cancelButtonText: '取消', type: 'warning' }
    );
    deleteEpisode(idx, true);
    ElMessage.success(`第 ${idx + 1} 集已彻底移除`);
    detailsVisible.value = false;
  } catch (e) {
    // cancelled
  }
}

// ---- Run Single Episode Storyboard ----
function handleRunSingleEpisodeStoryboard(idx, event) {
  event.stopPropagation();
  if (!activeProject.episodes[idx].text) {
    ElMessage.warning('空集位，请先填写原文');
    return;
  }
  
  // Clean storyboard states for this episode to force full regeneration
  activeProject.epState.sb[idx] = '';
  activeProject.epState.sbSplit[idx] = '';
  activeProject.epState.sbShots[idx] = '';
  activeProject.epState.s4a[idx] = '';
  activeProject.epState.s4c[idx] = '';
  activeProject.epState.s4x[idx] = '';
  activeProject.episodeStoryboard[idx] = null;
  activeProject.groupedStoryboardPerEpisode[idx] = null;
  
  // Rebuild global storyboard to wipe out old data from UI immediately
  import('../../store/workflowEngine.js').then(m => {
    if (m.rebuildStoryboard) m.rebuildStoryboard();
  });
  
  enqueueEpisodePipeline([idx]);
  ElMessage.success(`第 ${idx + 1} 集已加入分镜创作队列`);
}

function isEpisodeExecutingOrQueued(idx) {
  if (activeProject.episodeStatus && activeProject.episodeStatus[idx] === 'processing') return true;
  if (activeEpisodeTasks.has(idx)) return true;
  if (episodePipelineQueue.value.some(q => q.idx === idx)) return true;
  return false;
}

// ---- Add Script Modal ----
const addScriptVisible = ref(false);
const newScriptText = ref('');

function openAddModal() {
  newScriptText.value = '';
  addScriptVisible.value = true;
}

async function handleAddScript() {
  if (!newScriptText.value.trim()) {
    ElMessage.warning('请输入要添加的剧本内容');
    return;
  }
  
  const textToSegment = newScriptText.value;
  addScriptVisible.value = false;
  
  try {
    await runSegment(textToSegment);
  } catch(e) {
    console.error(e);
  }
}

// ---- Asset Analysis Modal ----
const analysisDialogVisible = ref(false);
const selectedEpisodesForAnalysis = ref([]);

function openAnalysisDialog() {
  // 默认预先选中未提取完的分集
  selectedEpisodesForAnalysis.value = activeProject.episodes
    .map((_, i) => i)
    .filter(i => activeProject.epState.s2[i] !== 'done');
  analysisDialogVisible.value = true;
}

async function handleRunAnalysis(mode) {
  let indices = [];
  let resumeOnly = false;
  
  if (mode === 'all') {
    indices = activeProject.episodes.map((_, i) => i);
  } else if (mode === 'selected') {
    indices = [...selectedEpisodesForAnalysis.value];
  } else if (mode === 'unextracted') {
    indices = activeProject.episodes.map((_, i) => i).filter(i => activeProject.epState.s2[i] !== 'done');
    resumeOnly = false; // 必须跑完整流程(2a+2b)，不能仅仅 resumeOnly
  }
  
  if (!indices.length) {
    ElMessage.info('没有需要提取的分集');
    return;
  }
  
  analysisDialogVisible.value = false;
  try {
    await runExtractForEpisodes(indices, resumeOnly);
  } catch(e) {
    console.error(e);
  }
}

function getS2StatusLabel(status) {
  if (status === 'done') return '资产已提取';
  if (status === 'running') return '提取中...';
  if (status === 'error') return '提取失败';
  if (status === 'partial') return '部分提取';
  return '未提取';
}

function getS2StatusClass(status) {
  if (status === 'done') return 's2-done';
  if (status === 'running') return 's2-running';
  if (status === 'error') return 's2-error';
  if (status === 'partial') return 's2-partial';
  return 's2-none';
}
</script>

<template>
  <div class="episodes-container">
    <!-- 顶部配置栏 -->
    <div class="toolbar-card">
      <div class="toolbar-title">
        <span>分集设置 ({{ textType }})</span>
      </div>
      <div class="toolbar-content">
        <el-checkbox v-model="currentSeg.useModel" label="模型智能分集" size="large" />
        
        <div class="input-group">
          <span class="label">每集最大字数:</span>
          <el-input-number 
            v-model="currentSeg.maxChars" 
            :min="0" 
            :step="100" 
            placeholder="无限制" 
            size="default" 
            controls-position="right"
          />
          <span class="muted-hint">（填0或不填表示不按字数硬性切割）</span>
        </div>

        <div class="input-group">
          <span class="label">处理并发数:</span>
          <el-input-number 
            v-model="currentSeg.concurrency" 
            :min="1" 
            :max="50" 
            :step="1" 
            size="default" 
            controls-position="right"
          />
        </div>

        <div class="actions">
          <el-button 
            v-if="busy.s1" 
            type="danger" 
            @click="stopStep('s1')"
          >
            停止分集
          </el-button>
          
          <el-button 
            v-if="activeProject.episodes.length > 0" 
            type="primary" 
            @click="openAnalysisDialog"
            :loading="busy.s2"
          >
            {{ busy.s2 ? '提取资产中...' : '资产分析' }}
          </el-button>

          <el-button 
            v-if="activeProject.payloads.s2 || activeProject.payloads.s2a" 
            type="info" 
            @click="payloadVisible = true"
            plain
          >
            提示词预览
          </el-button>
        </div>
      </div>
    </div>

    <!-- 列表展示 -->
    <div v-if="activeProject.episodes.length === 0 && !busy.s1" class="empty-state">
      <el-empty description="暂无分集数据，请在剧本页面粘贴并分集">
        <el-button type="primary" @click="openAddModal">立即添加</el-button>
      </el-empty>
    </div>

    <div v-else class="episodes-list">
      <div class="grid-layout">
        <!-- Existing Episodes -->
        <el-card 
          v-for="(ep, idx) in activeProject.episodes" 
          :key="idx" 
          class="episode-card compact-card" 
          :class="{ 'is-executing': isEpisodeExecutingOrQueued(idx) }"
          shadow="hover"
          @click="showEpisodeDetails(ep, idx)"
        >
          <div class="card-content">
            <div class="card-icon">
              <el-icon><Document /></el-icon>
            </div>
            <div class="card-info">
              <div class="ep-title" :title="ep.title || `第 ${idx + 1} 集`">
                <span v-if="!ep.text" style="color: #f56c6c;">[空] </span>
                {{ ep.title || `第 ${idx + 1} 集` }}
              </div>
              <div class="ep-meta">
                <span class="word-count">{{ ep.text?.length || 0 }} 字</span>
                <span class="s2-status" :class="getS2StatusClass(activeProject.epState.s2[idx])">
                  {{ getS2StatusLabel(activeProject.epState.s2[idx]) }}
                </span>
                <span class="sb-status" :class="activeProject.epState.s4c[idx] === 'done' ? 'success' : 'pending'">
                  {{ activeProject.epState.s4c[idx] === 'done' ? '分镜已完成' : '未分镜' }}
                </span>
              </div>
            </div>
            <div class="ep-status">
              <span 
                class="status-dot" 
                :class="activeProject.episodeStatus[idx] || 'pending'"
              ></span>
            </div>
            <div class="action-execute-wrapper">
              <el-button 
                v-if="!isEpisodeExecutingOrQueued(idx)"
                type="success" 
                :icon="VideoPlay" 
                circle 
                size="small" 
                title="执行单集分镜与视频"
                @click="handleRunSingleEpisodeStoryboard(idx, $event)" 
              />
              <el-button 
                v-else
                type="info" 
                :icon="VideoPlay"
                :loading="true"
                circle 
                size="small" 
                title="排队中或执行中..."
                @click.stop
              />
            </div>
            <div class="action-delete-wrapper" v-if="!isEpisodeExecutingOrQueued(idx)">
              <el-button type="danger" :icon="Delete" circle size="small" @click="handleDeleteEpisode(idx, $event)" />
            </div>
          </div>
        </el-card>

        <!-- Loading / Analyzing Card -->
        <el-card v-if="busy.s1" class="episode-card compact-card loading-card" shadow="never">
          <div class="card-content centered">
            <el-icon class="is-loading"><loading /></el-icon>
            <span>分集中...</span>
          </div>
        </el-card>

        <!-- Add Card -->
        <el-card v-else class="episode-card compact-card add-card" shadow="hover" @click="openAddModal">
          <div class="card-content centered">
            <el-icon class="plus-icon"><Plus /></el-icon>
          </div>
        </el-card>
      </div>
    </div>

    <!-- Episode Details Dialog -->
    <el-dialog 
      v-model="detailsVisible" 
      :title="activeEpisode ? (activeEpisode.title || `第 ${activeEpisodeIndex + 1} 集`) : '集数详情'"
      width="600px"
      append-to-body
    >
      <div class="ep-detail-text" v-if="activeEpisode">
        <template v-if="activeEpisode.text">
          {{ activeEpisode.text }}
        </template>
        <template v-else>
          <el-empty description="该集暂无原文，是一个空槽位" />
        </template>
      </div>
    
      <template #footer>
        <div class="dialog-footer" style="display: flex; justify-content: space-between; align-items: center;">
          <el-button type="danger" plain size="small" @click="handleHardDeleteEpisode(activeEpisodeIndex)">
            彻底移除并重排(危险)
          </el-button>
          <el-button @click="detailsVisible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Add Script Modal -->
    <el-dialog
      v-model="addScriptVisible"
      title="添加原文分集"
      width="700px"
      append-to-body
    >
      <el-input
        v-model="newScriptText"
        type="textarea"
        :rows="12"
        placeholder="请在此粘贴新增的剧本或解说文本..."
      />
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="addScriptVisible = false">取 消</el-button>
          <el-button type="primary" @click="handleAddScript">开 始 分 析</el-button>
        </span>
      </template>
    </el-dialog>

    <PayloadPreviewModal 
      v-model:visible="payloadVisible" 
      title="资产提取提示词" 
      :payloads="(activeProject.payloads.s2 || []).concat(activeProject.payloads.s2a || [])" 
    />

    <!-- Asset Analysis Modal -->
    <el-dialog
      v-model="analysisDialogVisible"
      title="资产分析设置"
      width="680px"
      append-to-body
    >
      <div class="analysis-options">
        <p style="margin-top:0; color:var(--text-2); font-size:14px;">请勾选需要进行实体提取（资产分析）的分集（支持多选）：</p>
        <el-checkbox-group v-model="selectedEpisodesForAnalysis" class="ep-checkbox-group">
          <el-checkbox 
            v-for="(ep, idx) in activeProject.episodes" 
            :key="idx" 
            :value="idx"
            class="ep-checkbox-item"
          >
            <span class="chk-label">{{ ep.title || `第 ${idx + 1} 集` }}</span>
            <span class="chk-status" :class="getS2StatusClass(activeProject.epState.s2[idx])">
              ({{ getS2StatusLabel(activeProject.epState.s2[idx]) }})
            </span>
          </el-checkbox>
        </el-checkbox-group>
      </div>
      <template #footer>
        <span class="dialog-footer" style="display: flex; justify-content: space-between; align-items: center;">
          <el-button @click="analysisDialogVisible = false">取 消</el-button>
          <div style="display:flex; gap:8px;">
            <el-button type="primary" @click="handleRunAnalysis('unextracted')">自动分析未提取</el-button>
            <el-button type="warning" @click="handleRunAnalysis('selected')" :disabled="!selectedEpisodesForAnalysis.length">重新分析选中</el-button>
            <el-button type="danger" @click="handleRunAnalysis('all')">重新分析全部</el-button>
          </div>
        </span>
      </template>
    </el-dialog>

  </div>
</template>

<style scoped>
.episodes-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.toolbar-card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.toolbar-title {
  font-size: 14px;
  font-weight: bold;
  color: var(--text);
  margin-bottom: 12px;
  border-left: 3px solid var(--primary);
  padding-left: 8px;
}

.toolbar-content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 24px;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-group .label {
  font-size: 13px;
  color: var(--text);
}

.muted-hint {
  font-size: 12px;
  color: var(--text-2);
}

.actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
}

.empty-state {
  padding: 40px;
  background: var(--bg-2);
  border-radius: 8px;
  border: 1px dashed var(--border);
}

.grid-layout {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.compact-card {
  min-height: 75px;
  border-radius: 8px;
  cursor: pointer;
  background: var(--bg-2);
  border: 1px solid var(--border);
  transition: all 0.2s ease;
}

.compact-card:hover {
  border-color: var(--primary);
  transform: translateY(-2px);
}

.compact-card :deep(.el-card__body) {
  padding: 0;
  height: 100%;
}

.card-content {
  display: flex;
  align-items: center;
  height: 100%;
  position: relative;
  padding: 0 12px;
  gap: 10px;
}

.action-execute-wrapper {
  position: absolute !important;
  top: 5px !important;
  right: 5px !important;
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-delete-wrapper {
  position: absolute !important;
  bottom: 5px !important;
  right: 5px !important;
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.compact-card:hover .action-execute-wrapper,
.compact-card.is-executing .action-execute-wrapper {
  opacity: 1;
}

.compact-card:hover .action-delete-wrapper {
  opacity: 1;
}

.card-content.centered {
  justify-content: center;
  color: var(--text-2);
  font-size: 14px;
  gap: 8px;
}

.card-icon {
  font-size: 20px;
  color: var(--primary);
  opacity: 0.8;
}

.card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.ep-title {
  font-size: 14px;
  font-weight: bold;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.ep-meta {
  font-size: 12px;
  color: var(--text-2);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.ep-status {
  display: flex;
  align-items: center;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-3);
}

.status-dot.completed { background-color: var(--el-color-success); }
.status-dot.error { background-color: var(--el-color-danger); }

.sb-status {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  margin-left: 2px;
  white-space: nowrap;
}
.sb-status.success {
  background-color: var(--el-color-success-light-9);
  color: var(--el-color-success);
}
.sb-status.pending {
  background-color: var(--el-color-info-light-9);
  color: var(--el-color-info);
}

.status-dot.processing {
  background: var(--primary);
  box-shadow: 0 0 8px var(--primary);
}

.status-dot.pending {
  background: var(--warning);
}

.loading-card {
  cursor: default;
  border-color: var(--primary);
  background: rgba(var(--primary-rgb), 0.05);
}

.loading-card:hover {
  transform: none;
}

.add-card {
  border-style: dashed;
  background: transparent;
}

.add-card:hover {
  background: var(--bg-2);
}

.add-card .plus-icon {
  font-size: 24px;
}

.ep-detail-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
  max-height: 50vh;
  overflow-y: auto;
  padding: 10px;
  background: var(--bg-1);
  border-radius: 4px;
  border: 1px solid var(--border);
}

/* 资产提取状态样式 */
.s2-status {
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 4px;
  margin-left: 6px;
  background: var(--bg-1);
  white-space: nowrap;
}
.s2-done { color: var(--success); background: rgba(var(--success-rgb), 0.15); }
.s2-running { color: var(--primary); background: rgba(var(--primary-rgb), 0.15); }
.s2-error { color: var(--danger); background: rgba(var(--danger-rgb), 0.15); }
.s2-partial { color: var(--warning); background: rgba(var(--warning-rgb), 0.15); }
.s2-none { color: var(--text-3); }

/* 多选组样式 */
.ep-checkbox-group {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 16px;
  max-height: 350px;
  overflow-y: auto;
  padding-right: 8px;
}

.ep-checkbox-item {
  margin-right: 0;
  display: flex;
  align-items: center;
  background: var(--bg-1);
  border: 1px solid var(--border);
  padding: 6px 12px;
  border-radius: 6px;
  transition: border-color 0.2s;
}

.ep-checkbox-item:hover {
  border-color: var(--primary);
}

.ep-checkbox-item :deep(.el-checkbox__label) {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.chk-label {
  font-size: 14px;
  margin-right: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.chk-status {
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
