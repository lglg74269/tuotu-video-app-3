<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Projects } from '../api/client.js';
import { listProjects } from '../services/storage.js';
import { activeProject, loadProject, resetActiveProject } from '../store/projectStore.js';
import { v4 as uuidv4 } from 'uuid';
import { ElMessage, ElMessageBox } from 'element-plus';

const router = useRouter();
const projects = ref([]);
const modeTab = ref('narration'); // 'narration' or 'script'

async function fetchProjects() {
  const all = await listProjects();
  // 根据选中的 Tab 过滤
  projects.value = all.filter(p => p.mode === modeTab.value);
}

onMounted(() => {
  fetchProjects();
});

function handleTabChange() {
  fetchProjects();
}

async function createProject() {
  try {
    const timeStr = new Date().toLocaleString('zh-CN', { hour12: false });
    const defaultTitle = `${modeTab.value === 'narration' ? '解说' : '剧本'}项目 - ${timeStr}`;
    
    const { value } = await ElMessageBox.prompt('请输入项目名称', '新建项目', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValue: defaultTitle,
    });
    
    const newId = `proj_${uuidv4().split('-')[0]}`;
    resetActiveProject();
    activeProject.name = newId;
    activeProject.title = value || defaultTitle;
    activeProject.mode = modeTab.value;
    await Projects.save(activeProject.name, activeProject);
    
    router.push(`/workflow/${activeProject.name}`);
  } catch (e) {
    // User cancelled
  }
}

async function openProject(name) {
  try {
    await loadProject(name);
    router.push(`/workflow/${name}`);
  } catch (e) {
    ElMessage.error('无法打开项目');
  }
}

async function deleteProj(name, e) {
  e.stopPropagation();
  await Projects.del(name);
  ElMessage.success('已删除');
  fetchProjects();
}

function goToSettings() {
  router.push('/settings');
}
</script>

<template>
  <div class="home-container">
    <div class="header">
      <div class="header-center">
        <el-radio-group v-model="modeTab" @change="handleTabChange" size="large">
          <el-radio-button value="narration">解说</el-radio-button>
          <el-radio-button value="script">剧本</el-radio-button>
        </el-radio-group>
      </div>
      <div class="header-right">
        <el-button :icon="'Setting'" circle size="large" @click="goToSettings"></el-button>
      </div>
    </div>

    <div class="grid-container">
      <!-- Create New Card -->
      <div class="project-card create-card" @click="createProject">
        <el-icon :size="40"><Plus /></el-icon>
      </div>
      
      <!-- Existing Projects -->
      <div class="project-card" v-for="p in projects" :key="p.name" @click="openProject(p.name)">
        <div class="card-content">
          <h3>{{ p.title }}</h3>
          <p class="meta">{{ new Date(p.updatedAt).toLocaleString() }}</p>
        </div>
        <div class="card-actions">
          <el-button type="danger" :icon="'Delete'" circle size="small" @click="deleteProj(p.name, $event)"></el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-container {
  padding: 20px 40px;
  height: 100vh;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 40px;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}

.project-card {
  height: 140px;
  background: var(--bg-2);
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0,0,0,0.05);
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  position: relative;
  border: 1px solid var(--border);
}

.project-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px 0 rgba(0,0,0,0.1);
  border-color: var(--el-color-primary-light-5);
}

.create-card {
  justify-content: center;
  align-items: center;
  color: #909399;
  border: 1px dashed #dcdfe6;
  background: transparent;
  box-shadow: none;
}
.create-card:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

.card-content {
  padding: 20px;
  flex: 1;
}

.card-content h3 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: var(--text);
}

.meta {
  font-size: 12px;
  color: var(--text-2);
  margin: 0;
}

.card-actions {
  position: absolute;
  right: 10px;
  bottom: 10px;
  opacity: 0;
  transition: opacity 0.2s;
}

.project-card:hover .card-actions {
  opacity: 1;
}
</style>
