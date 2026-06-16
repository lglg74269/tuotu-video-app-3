<script setup>
import { ref } from 'vue';
import { activeProject, autoSave } from '../../store/projectStore.js';
import { runFullPipeline, busy } from '../../store/workflowEngine.js';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Clock } from '@element-plus/icons-vue';

const dialogVisible = ref(false);

function handleConfirm() {
  if (!activeProject.inputText.trim()) {
    ElMessage.warning('请输入剧本内容');
    return;
  }
  autoSave();
  dialogVisible.value = true;
}

function startAnalyzeAll() {
  dialogVisible.value = false;
  runFullPipeline('all');
}

function startTryOne() {
  dialogVisible.value = false;
  runFullPipeline('one');
}
</script>

<template>
  <div class="upload-container">
    <div class="main-content">
      <el-input
        v-model="activeProject.inputText"
        type="textarea"
        :rows="25"
        placeholder="请在此粘贴您的剧本内容..."
        class="mb20 text-input"
        @input="autoSave"
      />
      
      <div class="actions">
        <el-button type="primary" size="large" @click="handleConfirm">确 定 上 传</el-button>
      </div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      title="选择处理模式"
      width="400px"
      center
    >
      <div class="dialog-content">
        <el-button type="primary" size="large" @click="startAnalyzeAll" style="width: 100%; margin-bottom: 15px;">全部分析</el-button>
        <p class="desc">按流程提取全部资产，提供分步确权确认。</p>
        
        <el-divider></el-divider>

        <el-button type="success" size="large" @click="startTryOne" style="width: 100%; margin-bottom: 15px;">试试一集</el-button>
        <p class="desc">只分析前10集资产，自动化分镜与视频第一集。</p>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.upload-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.text-input {
  flex: 1;
}

.text-input :deep(.el-textarea__inner) {
  height: 100%;
  font-size: 16px;
  line-height: 1.6;
}

.actions {
  margin-top: 20px;
  text-align: center;
}

.dialog-content {
  text-align: center;
}

.desc {
  font-size: 13px;
  color: var(--text-2);
  margin-top: 0;
  margin-bottom: 0;
}
</style>
