<script setup>
import { ref, computed } from 'vue';
import { activeProject, autoSave } from '../../store/projectStore.js';
import { 
  busy,
  splitNarration,
  splitScript,
  shotNarration,
  shotScript,
  sbConcurrencyNarration,
  sbConcurrencyScript,
  runAnalyze,
  runStoryboard,
  runGroupUnits,
  stopStep,
  fullPipelineRunning
} from '../../store/workflowEngine.js';
import PayloadPreviewModal from './PayloadPreviewModal.vue';

const props = defineProps(['onNext']);
const payloadVisible = ref(false);

const activeSubTab = ref('raw'); // raw | grouped
const activeViewingEpisode = ref(0); // 当前查看的分集

const viewingRawStorys = computed(() => {
  return (activeProject.storyboard?.storys || []).filter(s => s.episodeIndex === activeViewingEpisode.value);
});

const viewingGroupedStorys = computed(() => {
  return (activeProject.groupedStoryboard?.storys || []).filter(s => s.episodeIndex === activeViewingEpisode.value);
});

// 智能获取和设置分镜选中的集
const checkAllEpisodes = computed({
  get() {
    return activeProject.sbSelected.length === activeProject.episodes.length;
  },
  set(val) {
    if (val) {
      activeProject.sbSelected = activeProject.episodes.map((_, i) => i);
    } else {
      activeProject.sbSelected = [];
    }
  }
});

// 每集分镜状态点颜色
function sbDotColor(i) {
  const state = activeProject.epState;
  if (state.sb[i] === 'done') return 'success';
  if (state.sb[i] === 'running') return 'primary';
  if (state.sb[i] === 'error') return 'danger';
  if (state.ready[i]) return 'warning';
  return 'info';
}

function sbDotText(i) {
  const state = activeProject.epState;
  const s2 = state.s2[i] === 'done' ? '资' : state.s2[i] === 'running' ? '资·中' : '资·待';
  const split = state.sbSplit[i] === 'done' ? '拆' : state.sbSplit[i] === 'partial' ? '拆·部' : state.sbSplit[i] === 'running' ? '拆·中' : '拆·待';
  const shots = state.sbShots[i] === 'done' ? '镜' : state.sbShots[i] === 'running' ? '镜·中' : '镜·待';
  const merge = state.s4x[i] === 'done' ? '并' : state.s4x[i] === 'running' ? '并·中' : '并·待';
  return `${s2} | ${split} | ${shots} | ${merge}`;
}

function nextStep() {
  props.onNext && props.onNext('video');
}

function getFlatShots(u) {
  if (!u || !u.shots) return [];
  if (activeProject.mode === 'script') {
    return u.shots;
  } else {
    // 解说模式下，归并后的 u.shots 实际上是包含多组原始单元的数组，需要提取里层的镜头
    const flat = [];
    u.shots.forEach(origUnit => {
      if (origUnit.shots && Array.isArray(origUnit.shots)) {
        flat.push(...origUnit.shots);
      }
    });
    return flat;
  }
}

function formatAssets(assets) {
  if (!assets || !assets.length) return '';
  return assets.map(a => typeof a === 'string' ? a : `${a.n}${a.v ? '(' + a.v + ')' : ''}`).join('、');
}
</script>

<template>
  <div class="storyboard-container">
    <!-- 顶部类型分析区 -->
    <div class="analysis-card">
      <div class="card-title">
        <span>③-a 剧本类型分析 (智能策略选择)</span>
        <el-tag 
          v-if="activeProject.analysis" 
          type="success" 
          class="ml10"
        >
          {{ activeProject.analysis.recommended_strategy || '已分析' }}
        </el-tag>
      </div>
      <div class="analysis-body">
        <div class="row">
          <el-button 
            v-if="busy.s3a" 
            type="danger" 
            @click="stopStep('s3a')"
          >
            停止分析
          </el-button>
          <el-button 
            v-else 
            type="primary" 
            @click="runAnalyze"
          >
            开始类型分析
          </el-button>
          
          <div v-if="activeProject.analysis" class="analysis-details">
            <div class="detail-item">
              <span class="lbl">目标受众:</span> {{ activeProject.analysis.audience || '—' }}
            </div>
            <div class="detail-item">
              <span class="lbl">节奏风格:</span> {{ activeProject.analysis.pacing || '—' }}
            </div>
            <div class="detail-item">
              <span class="lbl">情绪重心:</span> {{ activeProject.analysis.emotion_style || '—' }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 模版与并发配置 -->
    <el-collapse class="config-collapse">
      <el-collapse-item title="分镜高级设置与创作模版覆盖" name="1">
        <div class="config-fields">
          <div class="creative-templates">
            <div class="field-group" v-if="activeProject.mode === 'narration'">
              <span class="lbl">原文拆分·创作模版 (留空使用系统默认提示词)</span>
              <el-input 
                v-model="activeProject.creativeOverrideSplit" 
                type="textarea" 
                :rows="4" 
                placeholder="在此输入自定义的拆分创作思路，覆盖内置模版..." 
              />
            </div>
            <div class="field-group">
              <span class="lbl">镜头创作·创作模版 (留空使用系统默认提示词)</span>
              <el-input 
                v-model="activeProject.creativeOverrideShots" 
                type="textarea" 
                :rows="4" 
                placeholder="在此输入自定义的镜头画面创作思路..." 
              />
            </div>
          </div>

          <div class="settings-grid" v-if="activeProject.mode === 'narration'">
            <div class="settings-item">
              <span class="lbl">切段最大字数</span>
              <el-input-number v-model="splitNarration.maxUnitChars" :min="100" :step="100" size="small" />
            </div>
            <div class="settings-item">
              <span class="lbl">拆分并发数</span>
              <el-input-number v-model="splitNarration.concurrency" :min="1" :max="20" size="small" />
            </div>
            <div class="settings-item">
              <span class="lbl">拆分重试次数</span>
              <el-input-number v-model="splitNarration.maxRetries" :min="0" :max="5" size="small" />
            </div>
            <div class="settings-item">
              <span class="lbl">镜头批次大小</span>
              <el-input-number v-model="shotNarration.batchSize" :min="1" :max="20" size="small" />
            </div>
            <div class="settings-item">
              <span class="lbl">镜头创作并发</span>
              <el-input-number v-model="shotNarration.concurrency" :min="1" :max="20" size="small" />
            </div>
            <div class="settings-item">
              <span class="lbl">按集并发集数</span>
              <el-input-number v-model="sbConcurrencyNarration.value" :min="1" :max="10" size="small" />
            </div>
            <div class="settings-item">
              <span class="lbl">单元合并秒数</span>
              <el-input-number v-model="activeProject.narrationMergeMaxSec" :min="5" :max="30" size="small" />
            </div>
          </div>

          <div class="settings-grid" v-if="activeProject.mode === 'script'">
            <div class="settings-item">
              <span class="lbl">场次创作并发</span>
              <el-input-number v-model="shotScript.concurrency" :min="1" :max="20" size="small" />
            </div>
            <div class="settings-item">
              <span class="lbl">按集并发集数</span>
              <el-input-number v-model="sbConcurrencyScript.value" :min="1" :max="10" size="small" />
            </div>
            <div class="settings-item">
              <span class="lbl">单单元合并秒数</span>
              <el-input-number v-model="activeProject.scriptMergeMaxSec" :min="5" :max="30" size="small" />
            </div>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>

    <!-- 分镜生成及运行监视 -->
    <div class="action-card">
      <div class="action-header">
        <span>③-b 分镜创作与单元归并</span>
        <div class="run-buttons">
          <el-button 
            v-if="fullPipelineRunning" 
            type="danger" 
            @click="stopStep('s3b')"
          >
            停止创作
          </el-button>
          <el-button 
            v-else 
            type="primary" 
            @click="runStoryboard"
          >
            开始生成分镜
          </el-button>

          <el-button 
            v-if="activeProject.mode === 'narration' || activeProject.mode === 'script'" 
            :type="busy.s4x ? 'info' : 'primary'"
            :loading="busy.s4x"
            @click="runGroupUnits"
          >
            合并单元 (④-x 归并)
          </el-button>

          <el-button 
            v-if="activeProject.payloads.s3b" 
            type="info" 
            @click="payloadVisible = true"
            plain
          >
            提示词预览
          </el-button>

          <el-button type="success" @click="nextStep">
            下一步：视频提示词
          </el-button>
        </div>
      </div>

      <!-- 每集可运行检测 -->
      <div class="episode-status-panel" v-if="activeProject.episodes.length > 0">
        <div class="panel-title">
          <span>每集分镜生命周期监视 (勾选指定集单独生成):</span>
          <el-checkbox v-model="checkAllEpisodes" size="small" class="ml10">全选</el-checkbox>
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
              <el-checkbox v-model="activeProject.sbSelected" :label="idx" size="small">
                第{{ idx + 1 }}集
              </el-checkbox>
              <el-tag :type="sbDotColor(idx)" size="small">
                {{ activeProject.epState.sb[idx] === 'done' ? '完成' : activeProject.epState.sb[idx] === 'running' ? '进行中' : activeProject.epState.sb[idx] === 'error' ? '失败' : '待处理' }}
              </el-tag>
            </div>
            <div class="ep-body">
              <span class="status-steps">{{ sbDotText(idx) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分镜输出展示 -->
    <el-tabs v-model="activeSubTab" type="border-card" class="storyboard-tabs">
      <el-tab-pane label="模型原始分镜" name="raw">
        <div v-if="!viewingRawStorys.length" class="empty-tab">
          <el-empty description="当前集暂无原始分镜，请运行「开始生成分镜」" />
        </div>
        <div v-else class="storyboard-list">
          <el-card 
            v-for="u in viewingRawStorys" 
            :key="u.id" 
            class="unit-card"
            shadow="hover"
          >
            <template #header>
              <div class="unit-card-header">
                <el-tag type="info">单元 {{ u.id }}</el-tag>
                <span class="episode-name" v-if="u.episodeIndex != null">第{{ u.episodeIndex + 1 }}集</span>
                <span class="location" v-if="u.loc">场景: {{ u.loc.n }} ({{ u.loc.v }})</span>
              </div>
            </template>
            <div class="unit-card-body">
              <div class="original-text">
                <span class="lbl">对应原文:</span>
                <p class="ct-text">{{ u.ct }}</p>
              </div>
              
              <!-- 镜头详情 -->
              <div class="shots-section" v-if="u.shots && u.shots.length > 0">
                <span class="lbl">镜头创作 ({{ u.shots.length }}个镜头):</span>
                <el-table :data="u.shots" size="small" border class="mt8">
                  <el-table-column prop="id" label="ID" width="50" align="center" />
                  <el-table-column prop="dur" label="时长(s)" width="70" align="center">
                    <template #default="scope">
                      {{ scope.row.dur ? scope.row.dur + 's' : '-' }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="sc" label="景别" width="70" />
                  <el-table-column prop="ag" label="角度" width="70" />
                  <el-table-column prop="mv" label="运镜" width="70" />
                  <el-table-column prop="ds" label="画面描述" min-width="150" class-name="text-wrap-cell" />
                  <el-table-column label="出场角色/物品" min-width="100">
                    <template #default="scope">
                      <div v-if="scope.row.chars?.length" class="text-wrap"><strong>人:</strong> {{ formatAssets(scope.row.chars) }}</div>
                      <div v-if="scope.row.itm?.length" class="text-wrap"><strong>物:</strong> {{ formatAssets(scope.row.itm) }}</div>
                    </template>
                  </el-table-column>
                  <el-table-column label="台词/旁白/文本" min-width="180">
                    <template #default="scope">
                      <div v-for="(v, k) in scope.row.dlg" :key="'dlg-'+k" class="text-wrap">
                        <strong>对白-{{ k }}:</strong> {{ v }}
                      </div>
                      <div v-for="(v, k) in scope.row.vo" :key="'vo-'+k" class="text-wrap">
                        <strong>旁白-{{ k }}:</strong> {{ v }}
                      </div>
                      <div v-if="scope.row.ct" class="text-wrap">
                        <strong>文本:</strong> {{ scope.row.ct }}
                      </div>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <el-tab-pane label="归并后单元分镜" name="grouped">
        <div v-if="!viewingGroupedStorys.length" class="empty-tab">
          <el-empty description="当前集暂无归并后数据，请先运行「合并单元 (④-x 归并)」" />
        </div>
        <div v-else class="storyboard-list">
          <el-card 
            v-for="u in viewingGroupedStorys" 
            :key="u.id" 
            class="unit-card"
            shadow="hover"
          >
            <template #header>
              <div class="unit-card-header">
                <el-tag type="success">归并单元 {{ u.id }}</el-tag>
                <span class="episode-name" v-if="u.episodeIndex != null">第{{ u.episodeIndex + 1 }}集</span>
                <span class="location" v-if="u.loc">场景: {{ u.loc.n }} ({{ u.loc.v }})</span>
                <span class="time" v-if="u.totalTime">预估时长: {{ u.totalTime }}s</span>
              </div>
            </template>
            <div class="unit-card-body">
              <div class="original-text">
                <span class="lbl">归并原文:</span>
                <p class="ct-text">{{ Array.isArray(u.ct) ? u.ct.join(' \n ') : u.ct }}</p>
              </div>
              <div class="shots-section" v-if="getFlatShots(u).length > 0">
                <span class="lbl">镜头列表:</span>
                <el-table :data="getFlatShots(u)" size="small" border class="mt8">
                  <el-table-column prop="id" label="ID" width="50" align="center" />
                  <el-table-column prop="dur" label="时长(s)" width="70" align="center">
                    <template #default="scope">
                      {{ scope.row.dur ? scope.row.dur + 's' : '-' }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="sc" label="景别" width="70" />
                  <el-table-column prop="ag" label="角度" width="70" />
                  <el-table-column prop="mv" label="运镜" width="70" />
                  <el-table-column prop="ds" label="画面描述" min-width="150" class-name="text-wrap-cell" />
                  <el-table-column label="出场角色/物品" min-width="100">
                    <template #default="scope">
                      <div v-if="scope.row.chars?.length" class="text-wrap"><strong>人:</strong> {{ formatAssets(scope.row.chars) }}</div>
                      <div v-if="scope.row.itm?.length" class="text-wrap"><strong>物:</strong> {{ formatAssets(scope.row.itm) }}</div>
                    </template>
                  </el-table-column>
                  <el-table-column label="台词/旁白/文本" min-width="180">
                    <template #default="scope">
                      <div v-for="(v, k) in scope.row.dlg" :key="'dlg-'+k" class="text-wrap">
                        <strong>对白-{{ k }}:</strong> {{ v }}
                      </div>
                      <div v-for="(v, k) in scope.row.vo" :key="'vo-'+k" class="text-wrap">
                        <strong>旁白-{{ k }}:</strong> {{ v }}
                      </div>
                      <div v-if="scope.row.ct" class="text-wrap">
                        <strong>文本:</strong> {{ scope.row.ct }}
                      </div>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </div>
          </el-card>
        </div>
      </el-tab-pane>
    </el-tabs>

    <PayloadPreviewModal 
      v-model:visible="payloadVisible" 
      title="分镜创作提示词" 
      :payloads="activeProject.payloads.s3b" 
    />
  </div>
</template>

<style scoped>
.storyboard-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.analysis-card, .action-card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.card-title, .action-header {
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

.analysis-details {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: var(--text-2);
  margin-left: 20px;
}

.analysis-details .lbl {
  font-weight: bold;
  color: var(--text);
}

.analysis-body .row {
  display: flex;
  align-items: center;
}

.config-collapse {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-2);
  overflow: hidden;
}

.config-collapse :deep(.el-collapse-item__header) {
  background: var(--bg-2);
  color: var(--text);
  border-bottom: 1px solid var(--border);
  padding: 0 16px;
}

.config-collapse :deep(.el-collapse-item__wrap) {
  background: var(--bg-2);
  border-bottom: none;
}

.config-collapse :deep(.el-collapse-item__content) {
  padding: 16px;
  color: var(--text-2);
}

.config-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.creative-templates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 768px) {
  .creative-templates {
    grid-template-columns: 1fr;
  }
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-group .lbl, .settings-item .lbl {
  font-size: 12px;
  font-weight: bold;
  color: var(--text);
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  border-top: 1px solid var(--border);
  padding-top: 16px;
}

.settings-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.run-buttons {
  display: flex;
  gap: 10px;
}

.ml10 {
  margin-left: 10px;
}

.episode-status-panel {
  margin-top: 16px;
  border-top: 1px solid var(--border);
  padding-top: 16px;
}

.panel-title {
  font-size: 13px;
  color: var(--text);
  font-weight: bold;
  margin-bottom: 12px;
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
  cursor: pointer;
  transition: all 0.2s;
}

.ep-status-card:hover {
  border-color: var(--text-2);
}

.ep-status-card.is-viewing {
  border-color: var(--primary);
  background: var(--bg);
  box-shadow: 0 0 0 1px var(--primary);
}

.ep-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ep-body {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-2);
}

.status-steps {
  font-family: monospace;
}

.storyboard-tabs {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.storyboard-tabs :deep(.el-tabs__item) {
  color: var(--text-2);
}

.storyboard-tabs :deep(.el-tabs__item.is-active) {
  color: var(--primary);
  background-color: var(--bg);
}

.el-empty {
  padding: 40px 0;
}

.text-wrap {
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
  margin-bottom: 4px;
}
.text-wrap:last-child {
  margin-bottom: 0;
}

:deep(.text-wrap-cell .cell) {
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}

.storyboard-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 600px;
  overflow-y: auto;
  padding: 4px;
}

.unit-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  flex-shrink: 0;
}

.unit-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.episode-name {
  font-size: 12px;
  color: var(--primary);
  font-weight: bold;
}

.location, .time {
  font-size: 12px;
  color: var(--text-2);
}

.unit-card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.original-text .lbl, .shots-section .lbl {
  font-size: 13px;
  font-weight: bold;
  color: var(--text);
  display: block;
}

.ct-text {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.6;
  margin: 6px 0 0 0;
  background: rgba(255, 255, 255, 0.01);
  padding: 8px;
  border-radius: 4px;
  border-left: 2px solid var(--border);
  white-space: pre-wrap;
}

.mt8 {
  margin-top: 8px;
}
</style>
