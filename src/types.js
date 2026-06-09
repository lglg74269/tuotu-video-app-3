// ============================================================
// 共享类型（JSDoc typedef，仅用于编辑器提示，无运行时开销）
// 字段命名严格对齐资料中各提示词的输入/输出 JSON 结构
// ============================================================

/** @typedef {'narration'|'script'} WorkflowMode */
/** @typedef {'step1'|'step2'|'step3a'|'step3b'|'step3c'|'step4a'|'step4c'|'step4d'} StepId */

// ---------------- Step2 资产库 ----------------
/**
 * @typedef {Object} CharacterLook
 * @property {string} ln 造型名
 * @property {string} ld 造型视觉描述
 */
/**
 * @typedef {Object} Character
 * @property {string} n 角色名
 * @property {string} v 音色标识
 * @property {string} vd 音色描述
 * @property {'male'|'female'|'other'} s
 * @property {string} r 人种
 * @property {number} a 年龄
 * @property {'main'|'supporting'} rt
 * @property {string} ae 基础外貌
 * @property {string} c 泛化装扮
 * @property {string} d 身份背景
 * @property {CharacterLook[]} looks
 */
/**
 * @typedef {Object} SceneState
 * @property {string} sn 状态名
 * @property {string} sd 状态描述
 */
/**
 * @typedef {Object} Scene
 * @property {string} s 场景名（地点名）
 * @property {string} d 基础信息
 * @property {SceneState[]} states
 */
/**
 * @typedef {Object} ItemVariant
 * @property {string} vn 形态名
 * @property {string} vd 形态描述
 */
/**
 * @typedef {Object} Item
 * @property {string} n
 * @property {string} d
 * @property {ItemVariant[]} variants
 */
/**
 * @typedef {Object} AssetLibrary
 * @property {{genre:string,era:string}} [meta_info]
 * @property {{n:string,v:string}} [narrator]
 * @property {Character[]} characters
 * @property {{n:string,looks:CharacterLook[]}[]} [existing_character_new_looks]
 * @property {Scene[]} scenes
 * @property {{n:string,states:SceneState[]}[]} [existing_scene_new_states]
 * @property {Item[]} items
 * @property {{n:string,variants:ItemVariant[]}[]} [existing_item_new_variants]
 */

// ---------------- Step3 分镜 ----------------
/**
 * @typedef {Object} Shot
 * @property {string} sc 景别
 * @property {string} ag 拍摄角度
 * @property {string} mv 运镜
 * @property {string} ds 画面描述
 * @property {Object<string,string>} dlg
 * @property {Object<string,string>} vo
 * @property {number} dur
 * @property {{n:string,l:string}[]} chars
 * @property {{n:string,v:string}[]} itm
 */
/**
 * @typedef {Object} StoryUnit
 * @property {number} id
 * @property {{n:string,v:string}} loc
 * @property {string} ct 原文片段（还原校验字段）
 * @property {Shot[]} shots
 */
/**
 * @typedef {Object} Storyboard
 * @property {StoryUnit[]} storys
 */

// ---------------- Step3a 剧本类型分析 ----------------
/** @typedef {'action_heavy'|'emotion_heavy'|'suspense'|'romance'|'balanced'} CreativeStrategy */
/**
 * @typedef {Object} ScriptAnalysis
 * @property {string} genre
 * @property {string} audience 男频/女频/通用
 * @property {string} pacing
 * @property {string} visual_focus
 * @property {string} emotion_style
 * @property {CreativeStrategy} recommended_strategy
 * @property {string} [notes]
 */

// ---------------- Step4 视频提示词 ----------------
/** @typedef {'动作戏,无台词'|'动作戏,有台词'|'表情情感戏'|'特殊运镜戏'|'基础文戏'} ShotSceneType */
/**
 * @typedef {Object} VideoPromptUnit
 * @property {number} n
 * @property {string} p
 * @property {string[]} dlgs
 */

// ---------------- 校验 ----------------
/**
 * @typedef {Object} ValidationIssue
 * @property {'error'|'warning'} level
 * @property {number} [unitId]
 * @property {string} code
 * @property {string} message
 */
/**
 * @typedef {Object} ValidationReport
 * @property {boolean} pass
 * @property {ValidationIssue[]} issues
 * @property {number[]} failedUnitIds
 * @property {string} checkedAt
 */

// ---------------- 提示词版本 ----------------
/** @typedef {'system'|'creative'} PromptKind */
/**
 * @typedef {Object} PromptVersion
 * @property {string} id
 * @property {string} name
 * @property {string} content
 * @property {boolean} active
 * @property {string} createdAt
 * @property {string} updatedAt
 */
/**
 * @typedef {Object} PromptNode
 * @property {string} key
 * @property {PromptKind} kind
 * @property {StepId} step
 * @property {WorkflowMode|'common'} mode
 * @property {string} label
 * @property {PromptVersion[]} versions
 */

// ---------------- 项目数据 ----------------
/**
 * @typedef {Object} ProjectInput
 * @property {WorkflowMode} mode
 * @property {'解说文案'|'剧本'} textType
 * @property {string} currentText
 * @property {string} voiceLibrary
 * @property {string} globalStyle
 * @property {string} userExtraReq
 */

export {};
