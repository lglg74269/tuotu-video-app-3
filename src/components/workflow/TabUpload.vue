<script setup>
import { ref } from 'vue';
import { activeProject, autoSave } from '../../store/projectStore.js';
import { runSegment, busy } from '../../store/workflowEngine.js';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Clock } from '@element-plus/icons-vue';
import PayloadPreviewModal from './PayloadPreviewModal.vue';

const payloadVisible = ref(false);
const emit = defineEmits(['next']);

async function confirmInput() {
  if (!activeProject.inputText) {
    ElMessage.warning('请输入剧本或解说文本');
    return;
  }
  
  autoSave();
  ElMessage.success('文本已确认，开始分析');
  
  // Run segment immediately
  try {
    // If there's an error, it will be caught in withBusy and shown via Toast
    await runSegment();
  } catch(e) {
    console.error(e);
  }
}

function nextStep() {
  emit('next', 'episodes');
}

function restoreHistory(item) {
  ElMessageBox.confirm('是否将该历史记录覆盖到当前输入框？', '提示', { type: 'info' })
    .then(() => {
      activeProject.inputText = item.text;
      autoSave();
    })
    .catch(() => {});
}

function deleteHistory(idx) {
  activeProject.uploadHistory.splice(idx, 1);
  autoSave();
}
</script>

<template>
  <div class="tab-container">
    <div class="main-content">
      <el-input
        v-model="activeProject.inputText"
        type="textarea"
        :rows="18"
        placeholder="请在此粘贴您的剧本或长文解说内容..."
        class="mb20 text-input"
        @input="autoSave"
        :disabled="busy.s1"
      />
      
      <div class="actions">
        <template v-if="busy.s1">
          <el-button type="info" size="large" disabled>
            <el-icon class="is-loading" style="margin-right: 8px"><loading /></el-icon>
            分集分析中，请稍候...
          </el-button>
        </template>
        <template v-else>
          <el-button type="primary" size="large" @click="confirmInput">确 认 并 分 集</el-button>
          <el-button 
            v-if="activeProject.episodes.length > 0" 
            type="success" 
            size="large" 
            @click="nextStep"
          >
            进 入 分 集
          </el-button>
          <el-button 
            v-if="activeProject.payloads.s1" 
            type="info" 
            size="large" 
            @click="payloadVisible = true"
            plain
          >
            提示词预览
          </el-button>
        </template>
      </div>
    </div>
    
    <div class="history-sidebar">
      <div class="history-header">
        <el-icon><Clock /></el-icon>
        <span>粘贴记录</span>
      </div>
      
      <div class="history-list">
        <div v-if="!activeProject.uploadHistory || activeProject.uploadHistory.length === 0" class="muted-hint" style="text-align: center; padding-top: 20px;">
          暂无记录
        </div>
        
        <div 
          v-for="(item, idx) in activeProject.uploadHistory" 
          :key="item.id" 
          class="history-item"
        >
          <div class="history-content" @click="restoreHistory(item)">
            <div class="history-time">{{ item.timestamp }}</div>
            <div class="history-text">{{ item.text }}</div>
          </div>
          <el-button type="danger" link @click="deleteHistory(idx)" title="删除记录">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    <PayloadPreviewModal 
      v-model:visible="payloadVisible" 
      title="分集提示词" 
      :payloads="activeProject.payloads.s1" 
    />
  </div>
</template>

<style scoped>
.tab-container {
  display: flex;
  gap: 20px;
  max-width: 1200px;
  margin: 0 auto;
  height: calc(100vh - 160px);
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.text-input {
  flex: 1;
  font-size: 14px;
}

.text-input :deep(textarea) {
  height: 100%;
  resize: none;
}

.mb20 {
  margin-bottom: 20px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
}

.history-sidebar {
  width: 300px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.history-header {
  padding: 16px;
  font-weight: bold;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  align-items: center;
  gap: 8px;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.history-item {
  display: flex;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 12px;
  background: var(--bg-1);
  transition: all 0.2s;
}

.history-item:hover {
  border-color: var(--primary);
}

.history-content {
  flex: 1;
  cursor: pointer;
  overflow: hidden;
}

.history-time {
  font-size: 12px;
  color: var(--primary);
  margin-bottom: 4px;
}

.history-text {
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
