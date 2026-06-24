<script setup>
import { ref, computed } from 'vue';
import { activeProject } from '../../store/projectStore.js';
import { runAssetExtractionDaemon, runStoryboard } from '../../store/workflowEngine.js';

const charsCount = computed(() => activeProject.assets?.characters?.length || 0);
const scenesCount = computed(() => activeProject.assets?.scenes?.length || 0);
const itemsCount = computed(() => activeProject.assets?.items?.length || 0);
const epsCount = computed(() => activeProject.episodes?.length || 0);

const s2DoneCount = computed(() => activeProject.epState?.s2?.filter(s => s === 'done').length || 0);
const fullyDoneCount = computed(() => {
  if (!activeProject.episodes) return 0;
  let count = 0;
  for (let i = 0; i < activeProject.episodes.length; i++) {
    if (activeProject.epState?.sb?.[i] === 'done' && activeProject.epState?.s4c?.[i] === 'done') {
      count++;
    }
  }
  return count;
});
const totalCount = computed(() => activeProject.episodes?.length || 0);
const allSbDone = computed(() => totalCount.value > 0 && fullyDoneCount.value === totalCount.value);

const appendModalVisible = ref(false);
const appendScriptText = ref('');
const isAppending = ref(false);

import { runSegment } from '../../store/workflowEngine.js';

async function handleAppend(mode) {
  if (!appendScriptText.value.trim()) return;
  appendModalVisible.value = false;
  isAppending.value = true;
  
  const oldLength = activeProject.episodes.length;
  try {
    await runSegment(appendScriptText.value);
    
    const newLength = activeProject.episodes.length;
    if (newLength > oldLength) {
      const newIndices = [];
      for (let i = oldLength; i < newLength; i++) {
        newIndices.push(i);
      }
      
      if (mode === 'analyze-all') {
        // Automatically start asset extraction for all new episodes
        runAssetExtractionDaemon(newIndices, false, 'all');
        // And automatically start storyboard generation for all new episodes
        activeProject.sbSelected = [...newIndices];
        runStoryboard();
      } else if (mode === 'analyze-one') {
        // Run asset extraction for ALL new episodes (up to the batch limit automatically)
        runAssetExtractionDaemon(newIndices, false, 'all');
        // But only run storyboard for the FIRST new episode
        activeProject.sbSelected = [newIndices[0]];
        runStoryboard();
      }
    }
  } catch (e) {
    console.error('追加分集失败', e);
  } finally {
    isAppending.value = false;
    appendScriptText.value = '';
  }
}

const statsMap = computed(() => {
  const map = { character: {}, scene: {}, item: {} };
  
  const isRunning = activeProject.isAssetExtractionLoopRunning;
  const countMsg = isRunning ? `更多资产提取中...` : '';
  
  ['characters', 'scenes', 'items'].forEach((key) => {
    const typeKey = key === 'characters' ? 'character' : key === 'scenes' ? 'scene' : 'item';
    
    if (isRunning) {
      map[typeKey].statusText = countMsg;
      map[typeKey].statusColor = 'var(--warning)';
    } else {
      const baseList = activeProject.assets[key] || [];
      const liveList = activeProject.liveAssets[key] || [];
      const isScene = key === 'scenes';
      const nameKey = isScene ? 's' : 'n';
      const subKey = key === 'characters' ? 'looks' : key === 'scenes' ? 'states' : 'variants';
      const subNameKey = key === 'characters' ? 'ln' : key === 'scenes' ? 'sn' : 'vn';
      
      let newEntities = 0;
      let newLooks = 0;
      for (const liveE of liveList) {
        const baseE = baseList.find(e => e[nameKey] === liveE[nameKey]);
        if (!baseE) {
          newEntities++;
        } else {
          const baseSubs = baseE[subKey] || [];
          const liveSubs = liveE[subKey] || [];
          for (const liveS of liveSubs) {
            if (!baseSubs.find(s => s[subNameKey] === liveS[subNameKey])) {
              newLooks++;
            }
          }
        }
      }
      
      const total = newEntities + newLooks;
      if (total > 0) {
        map[typeKey].statusText = `已提取更新${total}项，可合并更新`;
        map[typeKey].statusColor = 'var(--danger)';
      } else {
        map[typeKey].statusText = '';
        map[typeKey].statusColor = '';
      }
    }
  });
  
  return map;
});

function goTo(tab) {
  activeProject.uiState.currentView = tab;
}

function isRunning(idx) {
  const st = activeProject.epState;
  if (!st) return false;
  return st.sb?.[idx] === 'running' || 
         st.sbSplit?.[idx] === 'running' || 
         st.sbShots?.[idx] === 'running' || 
         st.s4a?.[idx] === 'running' || 
         st.s4c?.[idx] === 'running' || 
         st.s4x?.[idx] === 'running';
}

function isAssetRunning(idx) {
  const st = activeProject.epState;
  if (!st) return false;
  return st.s2?.[idx] === 'running';
}

const assetUpdateDialogVisible = ref(false);
const selectedEpisodesForUpdate = ref([]);

const unextractedEpisodes = computed(() => {
  if (!activeProject.episodes) return [];
  return activeProject.episodes
    .map((_, idx) => idx)
    .filter(idx => activeProject.epState.s2[idx] !== 'done' && !activeProject.pendingAssetExtractionIndices?.includes(idx));
});

function openAssetUpdateDialog() {
  selectedEpisodesForUpdate.value = [];
  assetUpdateDialogVisible.value = true;
}

function handleSelectAll() {
  if (selectedEpisodesForUpdate.value.length === unextractedEpisodes.value.length) {
    selectedEpisodesForUpdate.value = [];
  } else {
    selectedEpisodesForUpdate.value = [...unextractedEpisodes.value];
  }
}

function handleSelect10() {
  if (selectedEpisodesForUpdate.value.length === unextractedEpisodes.value.length) {
    selectedEpisodesForUpdate.value = [];
    return;
  }
  
  const available = unextractedEpisodes.value.filter(idx => !selectedEpisodesForUpdate.value.includes(idx));
  let batch = [];
  let currentChars = 0;
  const MAX_EPS = 10;
  const MAX_CHARS = 40000;

  for (const idx of available) {
    if (batch.length >= MAX_EPS) break;
    const textLen = (activeProject.episodes[idx]?.title?.length || 0) + (activeProject.episodes[idx]?.text?.length || 0);
    if (currentChars + textLen > MAX_CHARS) {
      if (batch.length === 0) batch.push(idx);
      break;
    }
    batch.push(idx);
    currentChars += textLen;
  }

  selectedEpisodesForUpdate.value = [...selectedEpisodesForUpdate.value, ...batch];
}

function startAssetUpdate() {
  if (selectedEpisodesForUpdate.value.length === 0) return;
  
  if (activeProject.isAssetExtractionLoopRunning) {
    for (const idx of selectedEpisodesForUpdate.value) {
      if (!activeProject.pendingAssetExtractionIndices.includes(idx)) {
        activeProject.pendingAssetExtractionIndices.push(idx);
      }
    }
  } else {
    runAssetExtractionDaemon([...selectedEpisodesForUpdate.value], false, 'all');
  }
  
  assetUpdateDialogVisible.value = false;
}

const storyboardUpdateDialogVisible = ref(false);
const selectedEpisodesForStoryboard = ref([]);

const unstoryboardedEpisodes = computed(() => {
  if (!activeProject.episodes) return [];
  return activeProject.episodes
    .map((_, idx) => idx)
    .filter(idx => {
      const isAssetsDone = activeProject.epState.s2[idx] === 'done';
      const isSbDone = activeProject.epState.sb[idx] === 'done';
      const isS4cDone = activeProject.epState.s4c[idx] === 'done';
      const isFullyDone = isSbDone && isS4cDone;
      
      // 显示已经提取完资产的，且未完整生成分镜和提示词的集数，且不在运行中的集数
      return isAssetsDone && !isFullyDone && !isRunning(idx);
    });
});

function openStoryboardUpdateDialog() {
  selectedEpisodesForStoryboard.value = [];
  storyboardUpdateDialogVisible.value = true;
}

function handleSelectAllStoryboard() {
  if (selectedEpisodesForStoryboard.value.length === unstoryboardedEpisodes.value.length) {
    selectedEpisodesForStoryboard.value = [];
  } else {
    selectedEpisodesForStoryboard.value = [...unstoryboardedEpisodes.value];
  }
}

function handleSelect10Storyboard() {
  if (selectedEpisodesForStoryboard.value.length === unstoryboardedEpisodes.value.length) {
    selectedEpisodesForStoryboard.value = [];
    return;
  }
  
  const available = unstoryboardedEpisodes.value.filter(idx => !selectedEpisodesForStoryboard.value.includes(idx));
  let batch = [];
  let currentChars = 0;
  const MAX_EPS = 10;
  const MAX_CHARS = 40000;

  for (const idx of available) {
    if (batch.length >= MAX_EPS) break;
    const textLen = (activeProject.episodes[idx]?.title?.length || 0) + (activeProject.episodes[idx]?.text?.length || 0);
    if (currentChars + textLen > MAX_CHARS) {
      if (batch.length === 0) batch.push(idx);
      break;
    }
    batch.push(idx);
    currentChars += textLen;
  }

  selectedEpisodesForStoryboard.value = [...selectedEpisodesForStoryboard.value, ...batch];
}

function startStoryboardUpdate() {
  if (selectedEpisodesForStoryboard.value.length === 0) return;
  activeProject.sbSelected = [...selectedEpisodesForStoryboard.value];
  runStoryboard();
  storyboardUpdateDialogVisible.value = false;
}
</script>

<template>
  <div class="dashboard-container">
    <div class="stats-cards">
      <div class="stat-card" @click="goTo('character')">
        <div class="stat-num">{{ charsCount }}</div>
        <div class="stat-label">角色数量</div>
        <div class="stat-status" v-if="statsMap.character.statusText" :style="{ color: statsMap.character.statusColor }">
          <el-icon v-if="activeProject.isAssetExtractionLoopRunning" class="is-loading mr5"><Loading /></el-icon>
          {{ statsMap.character.statusText }}
        </div>
      </div>
      <div class="stat-card" @click="goTo('scene')">
        <div class="stat-num">{{ scenesCount }}</div>
        <div class="stat-label">场景数量</div>
        <div class="stat-status" v-if="statsMap.scene.statusText" :style="{ color: statsMap.scene.statusColor }">
          <el-icon v-if="activeProject.isAssetExtractionLoopRunning" class="is-loading mr5"><Loading /></el-icon>
          {{ statsMap.scene.statusText }}
        </div>
      </div>
      <div class="stat-card" @click="goTo('item')">
        <div class="stat-num">{{ itemsCount }}</div>
        <div class="stat-label">物品数量</div>
        <div class="stat-status" v-if="statsMap.item.statusText" :style="{ color: statsMap.item.statusColor }">
          <el-icon v-if="activeProject.isAssetExtractionLoopRunning" class="is-loading mr5"><Loading /></el-icon>
          {{ statsMap.item.statusText }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ epsCount }}</div>
        <div class="stat-label">分镜剧集</div>
      </div>
    </div>

    <div class="episodes-section">
      <div class="episodes-header">
        <span class="title">选择剧集制作</span>
        <div class="header-actions">
          <el-button type="warning" plain @click="openAssetUpdateDialog">更新资产</el-button>
          <el-button type="primary" plain @click="openStoryboardUpdateDialog">分镜创作</el-button>
        </div>
      </div>
      
      <div class="episodes-grid">
        <div 
          class="ep-card" 
          v-for="(ep, idx) in activeProject.episodes" 
          :key="idx"
          :class="{
            'no-assets': activeProject.epState.s2[idx] !== 'done' && !isAssetRunning(idx),
            'no-sb': activeProject.epState.s2[idx] === 'done' && activeProject.epState.s4c[idx] !== 'done' && !isRunning(idx) && !isAssetRunning(idx),
            'running-anim': isRunning(idx),
            'asset-running-anim': isAssetRunning(idx)
          }"
          @click="goTo('storyboard')"
        >
          <div class="ep-num">{{ idx + 1 }}</div>
        </div>
        
        <!-- 追加分集 卡片 -->
        <div 
          class="ep-card append-card" 
          @click="!isAppending && (appendModalVisible = true)"
          :class="{ 'is-loading-state': isAppending }"
        >
          <template v-if="isAppending">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span class="append-text">添加分集中</span>
          </template>
          <template v-else>
            <el-icon class="plus-icon"><Plus /></el-icon>
          </template>
        </div>
      </div>

      <!-- 底部状态图例统计条 -->
      <div class="episodes-legend">
        <div class="legend-item">
          <div class="legend-color blue"></div>
          <span>已完成分镜: {{ fullyDoneCount }} 集</span>
        </div>
        <div class="legend-item">
          <div class="legend-color green"></div>
          <span>已完成资产: {{ s2DoneCount }} 集</span>
        </div>
        <div class="legend-item">
          <div class="legend-color yellow"></div>
          <span>共: {{ totalCount }} 集</span>
        </div>
      </div>
    </div>

    <!-- 追加分集弹窗 -->
    <el-dialog
      v-model="appendModalVisible"
      title="追加分集文本"
      width="700px"
    >
      <el-input
        v-model="appendScriptText"
        type="textarea"
        :rows="12"
        placeholder="请在此粘贴要追加的分集文本内容..."
      />
      <template #footer>
        <span class="dialog-footer" style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="appendModalVisible = false">取消</el-button>
          
          <el-button type="primary" @click="handleAppend('add-only')">
            开始添加分集
          </el-button>
          
          <template v-if="allSbDone">
            <el-button type="warning" @click="handleAppend('analyze-one')">
              只分析一集
            </el-button>
            <el-button type="success" @click="handleAppend('analyze-all')">
              分析全部
            </el-button>
          </template>
        </span>
      </template>
    </el-dialog>

    <!-- 更新资产弹窗 -->
    <el-dialog
      v-model="assetUpdateDialogVisible"
      title="选择更新资产集数"
      width="600px"
    >
      <div class="selection-actions" style="margin-bottom: 15px; display: flex; gap: 10px;">
        <el-button type="primary" plain @click="handleSelectAll">全选</el-button>
        <el-button type="success" plain @click="handleSelect10">选10集</el-button>
      </div>
      
      <div style="max-height: 300px; overflow-y: auto; padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
        <el-checkbox-group v-model="selectedEpisodesForUpdate">
          <el-checkbox 
            v-for="epIdx in unextractedEpisodes" 
            :key="epIdx" 
            :label="epIdx"
            style="margin-right: 15px; margin-bottom: 10px;"
          >
            第 {{ epIdx + 1 }} 集
          </el-checkbox>
        </el-checkbox-group>
        <div v-if="unextractedEpisodes.length === 0" style="color: var(--text-2); text-align: center;">
          所有集数都已在提取队列中或已完成提取。
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="assetUpdateDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="startAssetUpdate" :disabled="selectedEpisodesForUpdate.length === 0">
            开始更新
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 分镜创作弹窗 -->
    <el-dialog
      v-model="storyboardUpdateDialogVisible"
      title="选择分镜创作集数"
      width="600px"
    >
      <div class="selection-actions" style="margin-bottom: 15px; display: flex; gap: 10px;">
        <el-button type="primary" plain @click="handleSelectAllStoryboard">全选</el-button>
        <el-button type="success" plain @click="handleSelect10Storyboard">选10集</el-button>
      </div>
      
      <div style="max-height: 300px; overflow-y: auto; padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
        <el-checkbox-group v-model="selectedEpisodesForStoryboard">
          <el-checkbox 
            v-for="epIdx in unstoryboardedEpisodes" 
            :key="epIdx" 
            :label="epIdx"
            style="margin-right: 15px; margin-bottom: 10px;"
          >
            第 {{ epIdx + 1 }} 集
          </el-checkbox>
        </el-checkbox-group>
        <div v-if="unstoryboardedEpisodes.length === 0" style="color: var(--text-2); text-align: center;">
          没有可执行分镜创作的集数（需要先完成资产提取）。
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="storyboardUpdateDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="startStoryboardUpdate" :disabled="selectedEpisodesForStoryboard.length === 0">
            开始创作
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dashboard-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  transition: all 0.3s ease;
  cursor: pointer;
  position: relative;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: var(--primary);
}

.stat-num {
  font-size: 32px;
  font-weight: bold;
  color: var(--primary);
  margin-bottom: 8px;
}

.stat-label {
  color: var(--text-2);
  font-size: 14px;
}

.stat-status {
  margin-top: 10px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.episodes-section {
  flex: 1;
  background: var(--bg-2);
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.episodes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.title {
  font-weight: bold;
  font-size: 16px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.episodes-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  overflow-y: auto;
}

.ep-card {
  width: 60px;
  height: 60px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--bg-3);
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--border);
  font-weight: bold;
}

.ep-card.no-assets {
  background: #3b3014;
  color: #e6a23c;
  border-color: #e6a23c;
}

.ep-card.no-sb {
  background: #143314;
  color: #67c23a;
  border-color: #67c23a;
}

.ep-card:not(.no-assets):not(.no-sb):not(.running-anim):not(.asset-running-anim) {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

@keyframes pulseColorSb {
  0% { background-color: #67c23a; border-color: #409eff; color: white; }
  50% { background-color: #409eff; border-color: #409eff; color: white; }
  100% { background-color: #67c23a; border-color: #409eff; color: white; }
}

@keyframes pulseColorAsset {
  0% { background-color: #e6a23c; border-color: #67c23a; color: white; }
  50% { background-color: #67c23a; border-color: #67c23a; color: white; }
  100% { background-color: #e6a23c; border-color: #67c23a; color: white; }
}

.ep-card.running-anim {
  animation: pulseColorSb 1.5s infinite ease-in-out;
}

.ep-card.asset-running-anim {
  animation: pulseColorAsset 1.5s infinite ease-in-out;
}

.append-card {
  background: transparent;
  border: 1px dashed var(--border);
  color: var(--text-2);
}

.append-card:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.append-card .plus-icon {
  font-size: 24px;
}

.append-card.is-loading-state {
  border-color: var(--primary);
  color: var(--primary);
  flex-direction: column;
  gap: 4px;
}

.append-text {
  font-size: 10px;
  text-align: center;
  white-space: nowrap;
}

.episodes-legend {
  display: flex;
  justify-content: flex-end;
  gap: 20px;
  margin-top: auto;
  padding-top: 15px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-color.blue { background-color: var(--primary); }
.legend-color.green { background-color: #67c23a; }
.legend-color.yellow { background-color: #e6a23c; }
</style>
