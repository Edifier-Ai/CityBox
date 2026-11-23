import {
  MINIATURE_ENGINE,
  MINIATURE_PALETTES,
  MINIATURE_POST,
} from '../engine/miniatureStyle';
import type {
  EnginePaletteOverride,
  EngineStyle,
  PostStyle,
} from '../engine/styleTypes';

export type {
  EnginePaletteOverride,
  EngineStyle,
  PostStyle,
} from '../engine/styleTypes';

export interface StyleVariant {
  id: string;
  label: string;
  desc: string;
  engine: EngineStyle;
  post: PostStyle;
  regionPalette?: boolean;
}

export const PALETTE_PRESETS: Record<string, EnginePaletteOverride | null> = {
  none: null,
  warm: MINIATURE_PALETTES.global_metro,
};

export const DEFAULT_POST: PostStyle = {
  saturate: 1,
  contrast: 1,
  brightness: 1,
  tiltBlur: 0,
  tiltFocus: 0.55,
  tiltBand: 0.3,
  vignette: 0,
  background: '#eef1f5',
};

const C_ENGINE: EngineStyle = {
  treeScale: 1.35,
  peopleScale: 1.45,
  vehicleScale: 1.2,
  inkScale: 0.45,
  inkDark: 0.7,
  shadeMid: 0.2,
  shadeDark: 0.44,
  shadeColor: '#5f6a99',
  litWarm: 0.12,
  ao: 0.9,
  shadowAlpha: 0.75,
  shadowColor: '#3d3f6b',
  slabDepth: 9,
  strata: true,
  bayScale: 1.5,
  windowBars: false,
  eaveScale: 1.8,
};

const C_POST: PostStyle = {
  ...DEFAULT_POST,
  saturate: 1.2,
  contrast: 1.06,
  brightness: 1.02,
  tiltBlur: 4,
  tiltBand: 0.28,
  vignette: 0.18,
  background: '#e8e0d2',
};

export const VARIANTS: StyleVariant[] = [
  {
    id: 'A',
    label: 'A 现状',
    desc: '当前主应用默认渲染：1:1 真实比例、三色调扁平插画、4m 素色底座。',
    engine: {},
    post: { ...DEFAULT_POST },
  },
  {
    id: 'B',
    label: 'B 绘本强化',
    desc: '加粗墨线与明暗对比，放大开间、去掉细碎窗格条，突出手绘绘本感。',
    engine: {
      inkScale: 1.35,
      inkDark: 1.15,
      shadeMid: 0.22,
      shadeDark: 0.42,
      litWarm: 0.08,
      shadowAlpha: 0.8,
      eaveScale: 1.4,
      bayScale: 1.25,
      windowBars: false,
    },
    post: {
      ...DEFAULT_POST,
      saturate: 1.12,
      contrast: 1.03,
      vignette: 0.12,
      background: '#f3ede1',
    },
  },
  {
    id: 'C',
    label: 'C 风格化微缩（推荐）',
    desc: '树与行人放大、细化墨线、强冷暖对比、墙脚 AO、9m 地层底座与移轴景深。',
    engine: { ...C_ENGINE },
    post: { ...C_POST },
  },
  {
    id: 'D',
    label: 'D 微缩 + 暖色调板',
    desc: '在 C 风格化微缩基础上统一替换为暖陶土与鼠尾草绿的高饱和模型调色板。',
    engine: {
      ...C_ENGINE,
      palette: PALETTE_PRESETS.warm,
    },
    post: { ...C_POST },
  },
  {
    id: 'E',
    label: 'E 偏写实',
    desc: '去掉轮廓墨线、深灰冷调背光与强投影、降低饱和度，偏向建筑体块模型。',
    engine: {
      inkScale: 0,
      shadeMid: 0.24,
      shadeDark: 0.5,
      shadeColor: '#5b6170',
      ao: 0.6,
      shadowAlpha: 1.15,
      shadowColor: '#262a36',
      slabDepth: 6,
    },
    post: {
      ...DEFAULT_POST,
      saturate: 0.85,
      contrast: 1.1,
      brightness: 0.98,
      background: '#e9ebee',
    },
  },
  {
    id: 'F',
    label: 'F 现状 + 模型感快修',
    desc: '保留现有画法，仅叠加墙脚 AO、9m 地层底座与移轴景深，验证低成本改造上限。',
    engine: {
      ao: 0.7,
      slabDepth: 9,
      strata: true,
      shadowAlpha: 0.8,
    },
    post: {
      ...DEFAULT_POST,
      saturate: 1.1,
      contrast: 1.04,
      tiltBlur: 3.5,
      vignette: 0.12,
      background: '#e8e0d2',
    },
  },
  {
    id: 'G',
    label: 'G 正式版（主应用当前）',
    desc: 'D 的微缩参数 + 按区域自动选择的微缩调色板 + OSM 颜色吸附。',
    engine: { ...MINIATURE_ENGINE },
    post: { ...MINIATURE_POST },
    regionPalette: true,
  },
];

export const ENGINE_DEFAULTS: Required<Omit<EngineStyle, 'palette'>> & {
  palette: EnginePaletteOverride | null;
} = {
  treeScale: 1,
  peopleScale: 1,
  vehicleScale: 1,
  shadeMid: 0.18,
  shadeDark: 0.33,
  shadeColor: null,
  litWarm: 0,
  inkScale: 1,
  inkDark: 1,
  shadowAlpha: 1,
  shadowColor: null,
  ao: 0,
  slabDepth: 4,
  strata: false,
  bayScale: 1,
  windowBars: true,
  eaveScale: 1,
  osmRoofs: false,
  palette: null,
};

export interface NumberParamMeta {
  kind: 'number';
  scope: 'engine' | 'post';
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

export interface BoolParamMeta {
  kind: 'bool';
  scope: 'engine';
  key: 'strata' | 'windowBars';
  label: string;
}

export interface ColorParamMeta {
  kind: 'color';
  scope: 'engine';
  key: 'shadeColor' | 'shadowColor';
  label: string;
  defaultHex: string;
}

export interface PaletteParamMeta {
  kind: 'palette';
  scope: 'engine';
  key: 'palette';
  label: string;
}

export type ParamMeta =
  | NumberParamMeta
  | BoolParamMeta
  | ColorParamMeta
  | PaletteParamMeta;

export const PARAM_META: ParamMeta[] = [
  { kind: 'number', scope: 'engine', key: 'treeScale', label: '树冠比例', min: 0.8, max: 1.8, step: 0.05 },
  { kind: 'number', scope: 'engine', key: 'peopleScale', label: '行人/骑行比例', min: 0.8, max: 2.0, step: 0.05 },
  { kind: 'number', scope: 'engine', key: 'vehicleScale', label: '车辆比例', min: 0.8, max: 1.6, step: 0.05 },
  { kind: 'number', scope: 'engine', key: 'bayScale', label: '开间/窗距倍率', min: 0.8, max: 2.0, step: 0.05 },
  { kind: 'number', scope: 'engine', key: 'eaveScale', label: '屋檐/女儿墙倍率', min: 0.8, max: 2.5, step: 0.05 },
  { kind: 'bool', scope: 'engine', key: 'windowBars', label: '保留窗格条' },
  { kind: 'number', scope: 'engine', key: 'inkScale', label: '墨线粗细', min: 0, max: 2.0, step: 0.05 },
  { kind: 'number', scope: 'engine', key: 'inkDark', label: '描边深度', min: 0, max: 1.6, step: 0.05 },
  { kind: 'number', scope: 'engine', key: 'litWarm', label: '受光面暖调', min: 0, max: 0.3, step: 0.01 },
  { kind: 'number', scope: 'engine', key: 'shadeMid', label: '中间面暗度', min: 0, max: 0.5, step: 0.02 },
  { kind: 'number', scope: 'engine', key: 'shadeDark', label: '背光面暗度', min: 0, max: 0.7, step: 0.02 },
  { kind: 'color', scope: 'engine', key: 'shadeColor', label: '背光混色', defaultHex: '#5f6a99' },
  { kind: 'number', scope: 'engine', key: 'ao', label: '墙脚接地 AO', min: 0, max: 1.5, step: 0.05 },
  { kind: 'number', scope: 'engine', key: 'shadowAlpha', label: '投影透明度', min: 0, max: 1.6, step: 0.05 },
  { kind: 'color', scope: 'engine', key: 'shadowColor', label: '投影色调', defaultHex: '#3d3f6b' },
  { kind: 'number', scope: 'engine', key: 'slabDepth', label: '底座厚度 (m)', min: 2, max: 14, step: 0.5 },
  { kind: 'bool', scope: 'engine', key: 'strata', label: '地层剖面底座' },
  { kind: 'palette', scope: 'engine', key: 'palette', label: '调色板覆写' },
  { kind: 'number', scope: 'post', key: 'saturate', label: '后期饱和度', min: 0.6, max: 1.6, step: 0.02 },
  { kind: 'number', scope: 'post', key: 'contrast', label: '后期对比度', min: 0.8, max: 1.3, step: 0.02 },
  { kind: 'number', scope: 'post', key: 'brightness', label: '后期亮度', min: 0.85, max: 1.15, step: 0.01 },
  { kind: 'number', scope: 'post', key: 'tiltBlur', label: '移轴模糊强度', min: 0, max: 8, step: 0.25 },
  { kind: 'number', scope: 'post', key: 'tiltFocus', label: '移轴焦点位置', min: 0.3, max: 0.7, step: 0.02 },
  { kind: 'number', scope: 'post', key: 'tiltBand', label: '移轴清晰带', min: 0.1, max: 0.6, step: 0.02 },
  { kind: 'number', scope: 'post', key: 'vignette', label: '边缘暗角', min: 0, max: 0.5, step: 0.02 },
];
