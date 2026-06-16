<script setup>
import { computed } from 'vue';
import { activeProject } from '../../store/projectStore.js';

const emit = defineEmits(['nav-to', 'done']);

const uploadStateText = computed(() => {
  const p = activeProject.uiState.progressStage;
  if (p === 1) return '分析中...';
  if (p === 2) return `已分析出 ${activeProject.episodes.length} 集内容，请耐心等候...`;
  
  const isDone = !activeProject.isAssetExtractionLoopRunning && activeProject.pendingAssetExtractionIndices.length === 0;
  if (isDone || p >= 4) return '完成';
  
  if (p === 3) {
    const extractedCount = activeProject.epState.s2.filter(s => s === 'done').length;
    return `已提取前 ${extractedCount} 集资产，可进入资产确认，后台继续提取中...`;
  }
  
  return '等待开始...';
});

const isAssetsReady = computed(() => activeProject.uiState.progressStage >= 3);

const charsCount = computed(() => activeProject.liveAssets?.characters?.length || 0);
const scenesCount = computed(() => activeProject.liveAssets?.scenes?.length || 0);
const itemsCount = computed(() => activeProject.liveAssets?.items?.length || 0);

const canEnterDashboard = computed(() => {
  const uc = activeProject.uiState.userConfirmed;
  return isAssetsReady.value && uc.character && uc.scene && uc.item;
});

function goTo(tab) {
  if (!isAssetsReady.value) return;
  activeProject.uiState.currentView = tab;
}

</script>

<template>
  <div class="progress-modal-wrapper">
    <div class="progress-modal">
      <h2 style="text-align: center; margin-bottom: 30px;">项目进行中</h2>

      <div class="step-card" @click="() => {}">
        <div class="step-left">
          <span class="step-title">
            上传剧本
            <el-icon v-if="activeProject.uiState.progressStage >= 3" style="color: var(--success); margin-left: 5px; font-weight: bold;"><Check /></el-icon>
            <span v-else class="req">*</span>
          </span>
        </div>
        <div class="step-right">
          <span class="status-text">{{ uploadStateText }}</span>
        </div>
      </div>

      <div class="step-card" :class="{ disabled: !isAssetsReady, confirmed: activeProject.uiState.userConfirmed.character }" @click="goTo('character')">
        <div class="step-left">
          <span class="step-title">
            角色确认
            <el-icon v-if="activeProject.uiState.userConfirmed.character" style="color: var(--success); margin-left: 5px; font-weight: bold;"><Check /></el-icon>
            <span v-else class="req">*</span>
          </span>
        </div>
        <div class="step-right">
          <span class="status-text" v-if="!isAssetsReady">等待资产分析完成</span>
          <span class="status-text success" v-else>已提取 {{ charsCount }} 个角色 &gt;</span>
        </div>
      </div>

      <div class="step-card" :class="{ disabled: !isAssetsReady, confirmed: activeProject.uiState.userConfirmed.scene }" @click="goTo('scene')">
        <div class="step-left">
          <span class="step-title">
            场景确认
            <el-icon v-if="activeProject.uiState.userConfirmed.scene" style="color: var(--success); margin-left: 5px; font-weight: bold;"><Check /></el-icon>
            <span v-else class="req">*</span>
          </span>
        </div>
        <div class="step-right">
          <span class="status-text" v-if="!isAssetsReady">等待资产分析完成</span>
          <span class="status-text success" v-else>已提取 {{ scenesCount }} 个场景 &gt;</span>
        </div>
      </div>

      <div class="step-card" :class="{ disabled: !isAssetsReady, confirmed: activeProject.uiState.userConfirmed.item }" @click="goTo('item')">
        <div class="step-left">
          <span class="step-title">
            物品确认
            <el-icon v-if="activeProject.uiState.userConfirmed.item" style="color: var(--success); margin-left: 5px; font-weight: bold;"><Check /></el-icon>
            <span v-else class="req">*</span>
          </span>
        </div>
        <div class="step-right">
          <span class="status-text" v-if="!isAssetsReady">等待资产分析完成</span>
          <span class="status-text success" v-else>已提取 {{ itemsCount }} 个物品 &gt;</span>
        </div>
      </div>

      <div class="footer-action">
        <el-button 
          type="primary" 
          size="large" 
          style="width: 200px" 
          :disabled="!canEnterDashboard"
          @click="() => { activeProject.uiState.currentView = 'dashboard'; }"
        >
          搞定，进入下一步
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-modal-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  background: var(--bg);
}

.progress-modal {
  width: 600px;
  background: var(--bg-2);
  padding: 40px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.step-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: var(--bg-3);
  margin-bottom: 15px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid transparent;
}

.step-card:hover:not(.disabled) {
  border-color: var(--primary);
}

.step-card.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.step-card.confirmed {
  border-color: var(--success);
}

.step-title {
  font-size: 16px;
  font-weight: bold;
}

.req {
  color: var(--danger);
  margin-left: 5px;
}

.status-text {
  font-size: 14px;
  color: var(--text-2);
}

.status-text.success {
  color: var(--primary);
}

.footer-action {
  margin-top: 40px;
  text-align: center;
}
</style>
