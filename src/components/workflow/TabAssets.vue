<script setup>
import { ref, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { activeProject, autoSave } from '../../store/projectStore.js';
import { 
  busy, 
  progress, 
  runExtract, 
  runExtractContinue, 
  stopStep,
  runManualDetailExtraction
} from '../../store/workflowEngine.js';
import PayloadPreviewModal from './PayloadPreviewModal.vue';

const props = defineProps({
  entityType: {
    type: String,
    required: true // character | scene | item
  },
  onNext: {
    type: Function,
    required: false
  }
});

const payloadVisible = ref(false);
const drawerVisible = ref(false);
const editingEntity = ref(null);
const originalName = ref('');
const reAnalyzeDialogVisible = ref(false);
const selectedEpisodesForReAnalysis = ref([]);

// 根据类型计算当前展示的数据
const list = computed(() => {
  if (props.entityType === 'character') {
    return activeProject.assets?.characters || [];
  } else if (props.entityType === 'scene') {
    return activeProject.assets?.scenes || [];
  } else {
    return activeProject.assets?.items || [];
  }
});

const typeLabel = computed(() => {
  if (props.entityType === 'character') return '角色';
  if (props.entityType === 'scene') return '场景';
  return '物品';
});

const unextractedCount = computed(() => {
  if (!activeProject.episodes || !activeProject.epState || !activeProject.epState.s2) return 0;
  return activeProject.episodes.filter((_, i) => activeProject.epState.s2[i] !== 'done').length;
});

// 打开抽屉进行编辑
function openEdit(item) {
  editingEntity.value = JSON.parse(JSON.stringify(item));
  originalName.value = props.entityType === 'scene' ? item.s : item.n;
  drawerVisible.value = true;
}

// 保存编辑结果
function saveEdit() {
  const assets = activeProject.assets;
  if (props.entityType === 'character') {
    const idx = assets.characters.findIndex(c => c.n === originalName.value);
    if (idx !== -1) {
      assets.characters[idx] = editingEntity.value;
    }
  } else if (props.entityType === 'scene') {
    const idx = assets.scenes.findIndex(s => s.s === originalName.value);
    if (idx !== -1) {
      assets.scenes[idx] = editingEntity.value;
    }
  } else {
    const idx = assets.items.findIndex(i => i.n === originalName.value);
    if (idx !== -1) {
      assets.items[idx] = editingEntity.value;
    }
  }
  autoSave();
  drawerVisible.value = false;
  editingEntity.value = null;
}

// 添加新的子项 (looks / states / variants)
function addSubItem() {
  if (props.entityType === 'character') {
    if (!editingEntity.value.looks) editingEntity.value.looks = [];
    editingEntity.value.looks.push({ ln: '', ld: '' });
  } else if (props.entityType === 'scene') {
    if (!editingEntity.value.states) editingEntity.value.states = [];
    editingEntity.value.states.push({ sn: '', sd: '' });
  } else {
    if (!editingEntity.value.variants) editingEntity.value.variants = [];
    editingEntity.value.variants.push({ vn: '', vd: '' });
  }
}

// 删除子项
function removeSubItem(idx) {
  if (props.entityType === 'character') {
    editingEntity.value.looks.splice(idx, 1);
  } else if (props.entityType === 'scene') {
    editingEntity.value.states.splice(idx, 1);
  } else {
    editingEntity.value.variants.splice(idx, 1);
  }
}

// 导航
function nextStep() {
  if (props.entityType === 'character') props.onNext && props.onNext('scenes');
  else if (props.entityType === 'scene') props.onNext && props.onNext('items');
  else props.onNext && props.onNext('storyboard');
}

function displayEps(epsArray) {
  if (!epsArray || epsArray.length === 0) return '无记录';
  return epsArray.join(', ');
}

function openReAnalyze() {
  selectedEpisodesForReAnalysis.value = activeProject.episodes.map((_, i) => i + 1);
  reAnalyzeDialogVisible.value = true;
}

async function doReAnalyze(overwrite) {
  if (selectedEpisodesForReAnalysis.value.length === 0) {
    ElMessage.warning('请选择至少一集进行分析');
    return;
  }
  
  if (overwrite) {
    try {
      await ElMessageBox.confirm(
        `确定要覆盖分析吗？此操作将清除该${typeLabel.value}当前的所有详情与造型数据，从选中的集数中重新提取。`,
        '警告',
        { confirmButtonText: '确定重写', cancelButtonText: '取消', type: 'warning' }
      );
    } catch (e) {
      return;
    }
  }

  reAnalyzeDialogVisible.value = false;
  drawerVisible.value = false; // close edit modal
  
  try {
    const name = editingEntity.value.n || editingEntity.value.s;
    const zeroIndexedEpisodes = selectedEpisodesForReAnalysis.value.map(val => val - 1);
    await runManualDetailExtraction(props.entityType, name, zeroIndexedEpisodes, overwrite);
  } catch (e) {
    console.error(e);
  }
}
</script>

<template>
  <div class="assets-container">
    <div class="toolbar-card">
      <div class="toolbar-title">
        <span>资产管理 & 提取配置</span>
      </div>
      <div class="toolbar-content">
        <div class="input-item">
          <span class="label">2b 并发数:</span>
          <el-input-number v-model="activeProject.s2bConcurrency" :min="1" :max="50" size="small" />
        </div>
        <div class="input-item">
          <span class="label">重试次数:</span>
          <el-input-number v-model="activeProject.s2bRetries" :min="0" :max="5" size="small" />
        </div>
        <div class="input-item">
          <span class="label">重试间隔(ms):</span>
          <el-input-number v-model="activeProject.s2bRetryDelayMs" :min="500" :step="500" size="small" />
        </div>

        <div class="actions">
          <template v-if="busy.s2">
            <el-button type="danger" @click="stopStep('s2')">
              停止提取
            </el-button>
            <span class="progress-text" v-if="progress.s2">
              提取中: {{ progress.s2.cur }} / {{ progress.s2.total }}
            </span>
          </template>
          <template v-else>
            <el-button type="primary" @click="runExtract">
              全局提取资产 {{ unextractedCount > 0 ? `(有 ${unextractedCount} 集待分析)` : '' }}
            </el-button>
            <el-button 
              v-if="activeProject.s2FailedTasks && activeProject.s2FailedTasks.length > 0"
              type="warning" 
              @click="runExtractContinue"
            >
              继续提取未完成 ({{ activeProject.s2FailedTasks.length }})
            </el-button>
            <el-button 
              v-if="activeProject.payloads?.s2 || activeProject.payloads?.s2b" 
              type="info" 
              @click="payloadVisible = true"
              plain
            >
              提示词预览
            </el-button>
          </template>
          
          <el-button type="success" @click="nextStep">
            {{ props.entityType === 'character' ? '下一步：场景资产' : props.entityType === 'scene' ? '下一步：物品资产' : '下一步：分镜创作' }}
          </el-button>
        </div>
      </div>
    </div>

    <div v-if="list.length === 0" class="empty-state">
      <el-empty :description="`暂无${typeLabel}资产数据，请先分集后运行「全局提取资产」`" />
    </div>

    <div v-else class="assets-list">
      <div class="grid-layout">
        <template v-if="props.entityType === 'character'">
          <el-card 
            v-for="c in list" 
            :key="c.n" 
            class="asset-card" 
            shadow="hover"
            @click="openEdit(c)"
          >
            <template #header>
              <div class="card-header">
                <span class="name">
                  {{ c.n }}
                  <el-tag v-if="c._status === 'extracting'" type="warning" size="small" class="ml4">提取资料中...</el-tag>
                  <el-tag v-else-if="c._status === 'updating'" type="warning" size="small" class="ml4">资料更新中...</el-tag>
                  <el-tag v-else-if="c._status === 'error'" type="danger" size="small" class="ml4">提取失败(请重试)</el-tag>
                </span>
                <el-tag size="small" type="info">{{ c.rt || '无定位' }}</el-tag>
              </div>
            </template>
            <div class="card-body">
              <div v-if="c._updates && c._updates.length > 0" class="desc-section" style="color: #67c23a; font-weight: bold;">
                <span class="label" style="color: #67c23a;">最近更新:</span> {{ c._updates.join(', ') }}
              </div>
              <div class="meta-grid">
                <div><span class="label">性别:</span> {{ c.s || '—' }}</div>
                <div><span class="label">年龄:</span> {{ c.a || '—' }}</div>
                <div><span class="label">人种:</span> {{ c.r || '—' }}</div>
              </div>
              <div class="desc-section">
                <span class="label">外貌:</span> {{ c.ae || '暂无外貌描述' }}
              </div>
              <div class="desc-section">
                <span class="label">装扮:</span> {{ c.c || '暂无装扮描述' }}
              </div>
              <div class="looks-count" v-if="c.looks?.length">
                <span class="label">包含造型:</span> 
                <el-tag size="small" class="ml4 mb4" v-for="l in c.looks" :key="l.ln" style="margin-bottom: 4px;">
                  {{ l.ln }}<span v-if="l.looks_appear_episodes?.length" style="color: #909399;"> (出场: {{ displayEps(l.looks_appear_episodes) }})</span>
                </el-tag>
              </div>
              <div class="eps-section" v-if="c.eps?.length">
                <span class="label">出场集数:</span> {{ displayEps(c.eps) }}
              </div>
            </div>
          </el-card>
        </template>

        <template v-if="props.entityType === 'scene'">
          <el-card 
            v-for="s in list" 
            :key="s.s" 
            class="asset-card" 
            shadow="hover"
            @click="openEdit(s)"
          >
            <template #header>
              <div class="card-header">
                <span class="name">
                  {{ s.s }}
                  <el-tag v-if="s._status === 'extracting'" type="warning" size="small" class="ml4">提取资料中...</el-tag>
                  <el-tag v-else-if="s._status === 'updating'" type="warning" size="small" class="ml4">资料更新中...</el-tag>
                  <el-tag v-else-if="s._status === 'error'" type="danger" size="small" class="ml4">提取失败(请重试)</el-tag>
                </span>
              </div>
            </template>
            <div class="card-body">
              <div v-if="s._updates && s._updates.length > 0" class="desc-section" style="color: #67c23a; font-weight: bold;">
                <span class="label" style="color: #67c23a;">最近更新:</span> {{ s._updates.join(', ') }}
              </div>
              <div class="desc-section">
                <span class="label">场景描述:</span> {{ s.d || '暂无场景描述' }}
              </div>
              <div class="looks-count" v-if="s.states?.length">
                <span class="label">包含状态:</span> 
                <el-tag size="small" class="ml4 mb4" v-for="st in s.states" :key="st.sn" style="margin-bottom: 4px;">
                  {{ st.sn }}<span v-if="st.states_appear_episodes?.length" style="color: #909399;"> (出场: {{ displayEps(st.states_appear_episodes) }})</span>
                </el-tag>
              </div>
              <div class="eps-section" v-if="s.eps?.length">
                <span class="label">出场集数:</span> {{ displayEps(s.eps) }}
              </div>
            </div>
          </el-card>
        </template>

        <template v-if="props.entityType === 'item'">
          <el-card 
            v-for="i in list" 
            :key="i.n" 
            class="asset-card" 
            shadow="hover"
            @click="openEdit(i)"
          >
            <template #header>
              <div class="card-header">
                <span class="name">
                  {{ i.n }}
                  <el-tag v-if="i._status === 'extracting'" type="warning" size="small" class="ml4">提取资料中...</el-tag>
                  <el-tag v-else-if="i._status === 'updating'" type="warning" size="small" class="ml4">资料更新中...</el-tag>
                  <el-tag v-else-if="i._status === 'error'" type="danger" size="small" class="ml4">提取失败(请重试)</el-tag>
                </span>
              </div>
            </template>
            <div class="card-body">
              <div v-if="i._updates && i._updates.length > 0" class="desc-section" style="color: #67c23a; font-weight: bold;">
                <span class="label" style="color: #67c23a;">最近更新:</span> {{ i._updates.join(', ') }}
              </div>
              <div class="desc-section">
                <span class="label">物品描述:</span> {{ i.d || '暂无物品描述' }}
              </div>
              <div class="looks-count" v-if="i.variants?.length">
                <span class="label">包含形态:</span> 
                <el-tag size="small" class="ml4 mb4" v-for="v in i.variants" :key="v.vn" style="margin-bottom: 4px;">
                  {{ v.vn }}<span v-if="v.variants_appear_episodes?.length" style="color: #909399;"> (出场: {{ displayEps(v.variants_appear_episodes) }})</span>
                </el-tag>
              </div>
              <div class="eps-section" v-if="i.eps?.length">
                <span class="label">出场集数:</span> {{ displayEps(i.eps) }}
              </div>
            </div>
          </el-card>
        </template>
      </div>
      
      <div v-if="activeProject.isAssetExtractionLoopRunning && activeProject.pendingAssetExtractionIndices?.length > 0" class="asset-extraction-pending-hint" style="margin-top: 20px;">
        <el-alert 
          title="更多后续剧集资产正在排队接力提取中，您现在就可以放心制作已完成的分镜剧集..." 
          type="info" 
          show-icon 
          :closable="false"
        />
      </div>
    </div>

    <el-dialog
      v-model="drawerVisible"
      :title="`编辑${typeLabel}资产详情`"
      width="600px"
      append-to-body
      destroy-on-close
    >
      <div v-if="editingEntity" class="drawer-form">
        <div class="eps-hint mb10">
          <span class="label">出现集数:</span> {{ displayEps(editingEntity.eps) }}
          <el-button type="primary" plain size="small" style="margin-left: auto; float: right;" @click="openReAnalyze">
            重新分析...
          </el-button>
        </div>
        <template v-if="props.entityType === 'character'">
          <el-form :model="editingEntity" label-position="top">
            <el-form-item label="角色名称">
              <el-input v-model="editingEntity.n" />
            </el-form-item>
            <div class="form-row">
              <el-form-item label="性别" style="width: 30%">
                <el-input v-model="editingEntity.s" />
              </el-form-item>
              <el-form-item label="年龄" style="width: 30%">
                <el-input v-model="editingEntity.a" />
              </el-form-item>
              <el-form-item label="人种" style="width: 30%">
                <el-input v-model="editingEntity.r" />
              </el-form-item>
            </div>
            <el-form-item label="定位（例如：主角、配角）">
              <el-input v-model="editingEntity.rt" />
            </el-form-item>
            <el-form-item label="基础外貌">
              <el-input type="textarea" v-model="editingEntity.ae" :rows="3" />
            </el-form-item>
            <el-form-item label="泛化装扮">
              <el-input type="textarea" v-model="editingEntity.c" :rows="3" />
            </el-form-item>
            <el-form-item label="简介描述">
              <el-input type="textarea" v-model="editingEntity.d" :rows="3" />
            </el-form-item>
            <div class="sub-items-header">
              <span>造型列表 ({{ editingEntity.looks?.length || 0 }})</span>
              <el-button type="primary" size="small" @click="addSubItem">添加造型</el-button>
            </div>
            <div class="sub-item-card" v-for="(look, idx) in editingEntity.looks" :key="idx">
              <div class="sub-item-header">
                <div>
                  <span>造型 #{{ idx + 1 }}</span>
                  <span v-if="look.looks_appear_episodes?.length" style="margin-left: 8px; font-size: 12px; color: #909399; font-weight: normal;">(出场集数: {{ displayEps(look.looks_appear_episodes) }})</span>
                </div>
                <el-button type="danger" size="small" circle icon="Delete" @click="removeSubItem(idx)" />
              </div>
              <el-input v-model="look.ln" placeholder="造型名" class="mb8" />
              <el-input type="textarea" v-model="look.ld" placeholder="造型描述" :rows="2" />
            </div>
          </el-form>
        </template>
        <template v-if="props.entityType === 'scene'">
          <el-form :model="editingEntity" label-position="top">
            <el-form-item label="场景名称">
              <el-input v-model="editingEntity.s" />
            </el-form-item>
            <el-form-item label="场景描述">
              <el-input type="textarea" v-model="editingEntity.d" :rows="4" />
            </el-form-item>
            <div class="sub-items-header">
              <span>状态列表 ({{ editingEntity.states?.length || 0 }})</span>
              <el-button type="primary" size="small" @click="addSubItem">添加状态</el-button>
            </div>
            <div class="sub-item-card" v-for="(state, idx) in editingEntity.states" :key="idx">
              <div class="sub-item-header">
                <div>
                  <span>状态 #{{ idx + 1 }}</span>
                  <span v-if="state.states_appear_episodes?.length" style="margin-left: 8px; font-size: 12px; color: #909399; font-weight: normal;">(出场集数: {{ displayEps(state.states_appear_episodes) }})</span>
                </div>
                <el-button type="danger" size="small" circle icon="Delete" @click="removeSubItem(idx)" />
              </div>
              <el-input v-model="state.sn" placeholder="状态名称" class="mb8" />
              <el-input type="textarea" v-model="state.sd" placeholder="状态描述" :rows="2" />
            </div>
          </el-form>
        </template>
        <template v-if="props.entityType === 'item'">
          <el-form :model="editingEntity" label-position="top">
            <el-form-item label="物品名称">
              <el-input v-model="editingEntity.n" />
            </el-form-item>
            <el-form-item label="物品描述">
              <el-input type="textarea" v-model="editingEntity.d" :rows="4" />
            </el-form-item>
            <div class="sub-items-header">
              <span>形态列表 ({{ editingEntity.variants?.length || 0 }})</span>
              <el-button type="primary" size="small" @click="addSubItem">添加形态</el-button>
            </div>
            <div class="sub-item-card" v-for="(v, idx) in editingEntity.variants" :key="idx">
              <div class="sub-item-header">
                <div>
                  <span>形态 #{{ idx + 1 }}</span>
                  <span v-if="v.variants_appear_episodes?.length" style="margin-left: 8px; font-size: 12px; color: #909399; font-weight: normal;">(出场集数: {{ displayEps(v.variants_appear_episodes) }})</span>
                </div>
                <el-button type="danger" size="small" circle icon="Delete" @click="removeSubItem(idx)" />
              </div>
              <el-input v-model="v.vn" placeholder="形态名称" class="mb8" />
              <el-input type="textarea" v-model="v.vd" placeholder="形态描述" :rows="2" />
            </div>
          </el-form>
        </template>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="drawerVisible = false">取消</el-button>
          <el-button type="primary" @click="saveEdit">保存修改</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog
      v-model="reAnalyzeDialogVisible"
      :title="`重新提取分析 ${typeLabel} 细节`"
      width="500px"
      append-to-body
    >
      <div class="reanalyze-content">
        <p>请勾选要作为参考来源进行细节提取的集数：</p>
        <div class="episode-checks">
          <el-checkbox-group v-model="selectedEpisodesForReAnalysis">
            <el-checkbox v-for="(_, i) in activeProject.episodes" :key="i" :label="i + 1">
              第 {{ i + 1 }} 集
            </el-checkbox>
          </el-checkbox-group>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="reAnalyzeDialogVisible = false">取消</el-button>
          <el-button type="warning" plain @click="doReAnalyze(false)">追加分析</el-button>
          <el-button type="danger" @click="doReAnalyze(true)">覆盖重写</el-button>
        </span>
      </template>
    </el-dialog>

    <PayloadPreviewModal 
      v-model:visible="payloadVisible" 
      :title="`资产提取提示词`" 
      :payloads="activeProject.payloads?.s2 || activeProject.payloads?.s2b" 
    />
  </div>
</template>

<style scoped>
.assets-container {
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
  font-weight: 500;
}

.empty-state {
  padding: 40px;
  background: var(--bg-2);
  border-radius: 8px;
  border: 1px dashed var(--border);
}

.grid-layout {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.asset-card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.asset-card:hover {
  transform: translateY(-2px);
  border-color: var(--primary);
}

.asset-card :deep(.el-card__header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header .name {
  font-weight: bold;
  font-size: 14px;
  color: var(--text);
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 12px;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  color: var(--text-2);
}

.meta-grid .label {
  color: var(--text-2);
  font-weight: bold;
}

.desc-section {
  color: var(--text-2);
  line-height: 1.5;
}

.desc-section .label {
  font-weight: bold;
  color: var(--text);
  margin-right: 4px;
}

.looks-count {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}

.looks-count .label {
  font-weight: bold;
  color: var(--text);
}

.eps-section {
  color: var(--text-2);
  margin-top: 4px;
}

.eps-section .label {
  font-weight: bold;
  color: var(--text);
  margin-right: 4px;
}

.ml4 {
  margin-left: 4px;
}

.drawer-form {
  padding: 0 10px;
}

.form-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.sub-items-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
  margin-bottom: 12px;
  font-weight: bold;
  font-size: 14px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
  color: var(--text);
}

.sub-item-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.sub-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: bold;
  color: var(--text-2);
}

.mb8 {
  margin-bottom: 8px;
}

.mb10 {
  margin-bottom: 10px;
}

.eps-hint {
  padding: 8px 12px;
  background: var(--bg-1);
  border-radius: 4px;
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  color: var(--text-2);
}

.eps-hint .label {
  font-weight: bold;
  color: var(--text);
  margin-right: 6px;
}

.reanalyze-content {
  margin-bottom: 20px;
}

.episode-checks {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
  padding: 10px;
  border-radius: 4px;
  background: var(--bg-1);
}
</style>
