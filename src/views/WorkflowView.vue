<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loadProject, activeProject } from '../store/projectStore.js';
import { ElMessage } from 'element-plus';

// 导入子组件
import TabUpload from '../components/workflow/TabUpload.vue';
import TabEpisodes from '../components/workflow/TabEpisodes.vue';
import TabAssets from '../components/workflow/TabAssets.vue';
import TabStoryboard from '../components/workflow/TabStoryboard.vue';
import TabVideo from '../components/workflow/TabVideo.vue';
import PayloadPreviewModal from '../components/workflow/PayloadPreviewModal.vue';

// 导入引擎控制
import { 
  fullPipelineRunning, 
  runFullPipeline, 
  stopFullPipeline,
  busy
} from '../store/workflowEngine.js';

const route = useRoute();
const router = useRouter();
const currentTab = ref('upload');
const logsDialogVisible = ref(false);
const rawJsonVisible = ref(false);

onMounted(async () => {
  const name = route.params.id;
  try {
    await loadProject(name);
  } catch (e) {
    ElMessage.error('项目加载失败');
    router.push('/');
  }
});

function goHome() {
  router.push('/');
}

function goToSettings() {
  router.push('/settings');
}

// 格式化时间
function fmtElapsed(ms) {
  if (!ms || ms <= 0) return '0ms';
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}秒`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}分${rem}秒`;
}

// 最近运行步骤
const latestStep = computed(() => {
  const steps = [
    { key: 'step1', name: '分集' },
    { key: 'step2', name: '资产提取' },
    { key: 'step3a', name: '剧本分析' },
    { key: 'step3b', name: '分镜创作' },
    { key: 'step4x', name: '单元归并' },
    { key: 'step4a', name: '镜头分类' },
    { key: 'step4c', name: '生成提示词' },
    { key: 'step4d', name: '提示词校验' },
  ];
  let latest = null;
  for (const s of steps) {
    const meta = activeProject.stepMeta?.[s.key];
    if (meta?.ranAt) {
      if (!latest || new Date(meta.ranAt) > new Date(latest.ranAt)) {
        latest = { ...meta, name: s.name };
      }
    }
  }
  return latest;
});

// 各步骤详细运行档案列表
const stepLogs = computed(() => {
  const steps = [
    { key: 'step1', name: '① 分集' },
    { key: 'step2', name: '② 资产提取' },
    { key: 'step3a', name: '③-a 剧本分析' },
    { key: 'step3b', name: '③-b 分镜创作' },
    { key: 'step4x', name: '④-x 单元归并' },
    { key: 'step4a', name: '④-a 镜头分类' },
    { key: 'step4c', name: '④-c 提示词生成' },
    { key: 'step4d', name: '④-d 提示词校验' },
  ];
  return steps.map((s) => {
    const meta = activeProject.stepMeta?.[s.key] || {};
    return {
      name: s.name,
      ranAt: meta.ranAt || '',
      model: meta.model || '—',
      elapsedMs: meta.elapsedMs || 0,
      runs: meta.runs || 0,
    };
  });
});
</script>

<template>
  <div class="workflow-container">
    <div class="header">
      <div class="header-left">
        <el-button :icon="'ArrowLeft'" circle @click="goHome"></el-button>
        <span class="project-title">
          <el-tag size="small" :type="activeProject.mode === 'narration' ? 'primary' : 'success'" style="margin-right: 8px;">
            {{ activeProject.mode === 'narration' ? '解说' : '剧本' }}
          </el-tag>
          {{ activeProject.title }}
        </span>
      </div>
      
      <div class="header-center">
        <el-radio-group v-model="currentTab" size="large">
          <el-radio-button value="upload">上传剧本</el-radio-button>
          <el-radio-button value="episodes">分集</el-radio-button>
          <el-radio-button value="roles">角色</el-radio-button>
          <el-radio-button value="scenes">场景</el-radio-button>
          <el-radio-button value="items">物品</el-radio-button>
          <el-radio-button value="storyboard">分镜</el-radio-button>
          <el-radio-button value="video">视频</el-radio-button>
        </el-radio-group>
      </div>

      <div class="header-right">
        <el-button 
          v-if="fullPipelineRunning" 
          type="danger" 
          size="default" 
          @click="stopFullPipeline"
          class="mr10"
        >
          停止全流程
        </el-button>
        <el-button 
          v-else 
          type="primary" 
          size="default" 
          @click="runFullPipeline"
          :loading="fullPipelineRunning"
          class="mr10"
        >
          一键全流程
        </el-button>
        <el-button :icon="'Setting'" circle @click="goToSettings"></el-button>
      </div>
    </div>

    <div class="main-content">
      <div v-if="currentTab === 'upload'">
        <TabUpload :onNext="(tab) => currentTab = tab" />
      </div>
      <div v-else-if="currentTab === 'episodes'">
        <TabEpisodes :onNext="(tab) => currentTab = tab" />
      </div>
      <div v-else-if="currentTab === 'roles'">
        <TabAssets entityType="character" :onNext="(tab) => currentTab = tab" />
      </div>
      <div v-else-if="currentTab === 'scenes'">
        <TabAssets entityType="scene" :onNext="(tab) => currentTab = tab" />
      </div>
      <div v-else-if="currentTab === 'items'">
        <TabAssets entityType="item" :onNext="(tab) => currentTab = tab" />
      </div>
      <div v-else-if="currentTab === 'storyboard'">
        <TabStoryboard :onNext="(tab) => currentTab = tab" />
      </div>
      <div v-else-if="currentTab === 'video'">
        <TabVideo :onNext="(tab) => currentTab = tab" />
      </div>
    </div>
    
    <div class="footer">
      <div class="footer-left">
        <span v-if="latestStep" class="muted">
          最近运行步骤: <el-tag size="small" type="success" class="mr5">{{ latestStep.name }}</el-tag> 
          耗时: <span class="accent-text mr10">{{ fmtElapsed(latestStep.elapsedMs) }}</span> | 
          模型: <span class="accent-text">{{ latestStep.model }}</span>
        </span>
        <span v-else class="muted">暂无任何步骤的运行记录</span>
      </div>
      <div class="footer-right" style="display: flex; gap: 10px;">
        <el-button type="info" size="small" @click="rawJsonVisible = true">
          原数据预览
        </el-button>
        <el-button type="info" size="small" @click="logsDialogVisible = true">
          查看完整执行日志
        </el-button>
      </div>
    </div>

    <!-- 运行日志 Dialog -->
    <el-dialog 
      v-model="logsDialogVisible" 
      title="项目执行档案 (各阶段模型/耗时详情)" 
      width="750px"
      destroy-on-close
    >
      <el-table :data="stepLogs" size="default" border>
        <el-table-column prop="name" label="工作流步骤" width="150" />
        <el-table-column label="运行状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.ranAt ? 'success' : 'info'" size="small">
              {{ row.ranAt ? '已执行' : '未执行' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="model" label="使用模型" />
        <el-table-column label="执行耗时" width="100" align="right">
          <template #default="{ row }">
            {{ row.elapsedMs ? fmtElapsed(row.elapsedMs) : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="调用次数" prop="runs" width="90" align="center" />
        <el-table-column label="完成时间" width="170">
          <template #default="{ row }">
            {{ row.ranAt ? new Date(row.ranAt).toLocaleString('zh-CN') : '—' }}
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <PayloadPreviewModal 
      v-model:visible="rawJsonVisible" 
      title="底层 JSON 原数据预览" 
      :raw-data="activeProject" 
    />
  </div>
</template>

<style scoped>
.workflow-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 250px;
}
.project-title {
  font-weight: bold;
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.header-right {
  width: 250px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.main-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background: var(--bg);
}

.footer {
  height: 45px;
  background: var(--bg-2);
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  font-size: 12px;
}

.footer-left {
  display: flex;
  align-items: center;
}

.muted {
  color: var(--text-2);
}

.mr5 {
  margin-right: 5px;
}

.mr10 {
  margin-right: 10px;
}

.accent-text {
  color: var(--primary);
  font-weight: bold;
}
</style>
