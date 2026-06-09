// 火山方舟（Volcengine Ark）默认配置，沿用现有 HTML 工具
export const DEFAULT_LLM_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  model: 'doubao-seed-2-0-pro-260215', // 全局默认模型
  maxTokens: 36000,
  temperature: 0.7,
  models: [], // 可用模型/接入点列表（手动维护或从接口获取）
  nodeModels: {}, // 各环节模型覆盖：{ [nodeKey]: model }
};

// 多平台配置
export const API_PROVIDERS = {
  volcengine: {
    label: '火山引擎',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-seed-2-0-pro-260215',
  },
  openai: {
    label: '原平台（OpenAI 兼容）',
    defaultBaseUrl: 'https://api.zhizengzeng.com/v1',
    defaultModel: 'doubao-seed-2-0-pro-260215',
  },
};

// 会向模型发请求的流程环节（用于前端「模型配置」列表）
export const MODEL_NODES = [
  { key: 'step1', label: '① 分集（识别章节锚点）' },
  { key: 'step2a', label: '②-a 资产·名称提取' },
  { key: 'step2b', label: '②-b 资产·详情提取' },
  { key: 'step3a', label: '③-a 剧本类型分析' },
  { key: 'step3b-split-narration', label: '③-b-1 原文拆分（解说模式）' },
  { key: 'step3b-split-script', label: '③-b-1 原文拆分（剧本模式）' },
  { key: 'step3b-shots', label: '③-b-2 镜头创作' },
  { key: 'step4a', label: '④-a 镜头分类' },
  { key: 'step4c', label: '④-c 视频提示词' },
];

export const SERVER_PORT = 8787;
