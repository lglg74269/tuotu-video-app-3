<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import SettingsModal from '../components/SettingsModal.vue';
import VoiceLibraryModal from '../components/VoiceLibraryModal.vue';
import ModelConfigModal from '../components/ModelConfigModal.vue';
import PromptManager from '../components/PromptManager.vue';

const router = useRouter();
const activeTab = ref('api');

function goBack() {
  router.back();
}

function handleToast(t) {
  if (t.type === 'success') ElMessage.success(t.msg);
  else if (t.type === 'error') ElMessage.error(t.msg);
  else ElMessage.info(t.msg);
}
</script>

<template>
  <div class="settings-container">
    <div class="header">
      <el-button :icon="'ArrowLeft'" circle @click="goBack"></el-button>
      <h2>全局设置</h2>
    </div>
    
    <div class="main-content">
      <el-tabs v-model="activeTab" class="settings-tabs">
        
        <el-tab-pane label="接口设置" name="api">
          <SettingsModal class="inline-mgr" @toast="handleToast" />
        </el-tab-pane>
        
        <el-tab-pane label="模型配置" name="models">
          <ModelConfigModal class="inline-mgr" @toast="handleToast" />
        </el-tab-pane>

        <el-tab-pane label="音色库设置" name="voice">
          <VoiceLibraryModal class="inline-mgr" @toast="handleToast" />
        </el-tab-pane>

        <el-tab-pane label="提示词管理" name="prompts">
          <PromptManager class="inline-mgr" @toast="handleToast" />
        </el-tab-pane>
        
      </el-tabs>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  padding: 20px 40px;
  height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
  color: var(--text);
}

.header h2 {
  margin: 0;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 10px;
}

.settings-tabs {
  height: 100%;
}

.inline-mgr {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  height: calc(100vh - 180px); /* 占据屏幕剩余高度 */
  overflow-y: auto;
  padding: 20px;
  background: var(--bg-2);
}

:deep(.el-card) {
  background-color: var(--bg-2);
  border-color: var(--border);
  color: var(--text);
}
:deep(.el-card__header) {
  border-bottom-color: var(--border);
}
:deep(.el-tabs__item) {
  color: var(--text-2);
}
:deep(.el-tabs__item.is-active) {
  color: var(--primary);
}
</style>

<style scoped>
.settings-container {
  padding: 20px 40px;
  height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
  color: var(--text);
}

.header h2 {
  margin: 0;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 10px;
}

.mb20 {
  margin-bottom: 20px;
}

:deep(.el-card) {
  background-color: var(--bg-2);
  border-color: var(--border);
  color: var(--text);
}
:deep(.el-card__header) {
  border-bottom-color: var(--border);
}
</style>
