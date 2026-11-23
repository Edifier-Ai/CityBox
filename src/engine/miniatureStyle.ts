import type { PocketCityBundle } from '../types/pocketCity';
import type {
  EnginePaletteOverride,
  EngineStyle,
  PostStyle,
} from './styleTypes';

export const MINIATURE_ENGINE: EngineStyle = {
  treeScale: 1.15,
  peopleScale: 1.12,
  vehicleScale: 1.06,
  inkScale: 0.78,
  inkDark: 0.85,
  shadeMid: 0.19,
  shadeDark: 0.40,
  shadeColor: '#5f6a99',
  litWarm: 0.10,
  ao: 0.85,
  shadowAlpha: 0.72,
  shadowColor: '#3d3f6b',
  slabDepth: 8.5,
  strata: true,
  bayScale: 1.05,
  windowBars: true,
  eaveScale: 1.15,
};

export const MINIATURE_POST: PostStyle = {
  saturate: 1.12,
  contrast: 1.04,
  brightness: 1.01,
  tiltBlur: 1.4,
  tiltFocus: 0.54,
  tiltBand: 0.46,
  vignette: 0.10,
  background: '#eae3d6',
};

export type ProfileId =
  | 'japan_historic'
  | 'japan_modern'
  | 'east_asia_historic'
  | 'east_asia_modern'
  | 'korea_modern'
  | 'southeast_asia'
  | 'canal_europe'
  | 'mediterranean'
  | 'europe_classic'
  | 'global_metro';

export const MINIATURE_PALETTES: Record<ProfileId, EnginePaletteOverride> = {
  japan_historic: {
    walls: ['#f1e3c6', '#e9d6b4', '#f4ead6', '#dcc8a6', '#e6d2b8', '#efdcc0'],
    roofs: ['#6f7685', '#7d8493', '#5f6676', '#8a8f9c', '#727a8c'],
    flatRoofs: ['#d6ccb9', '#c9c3b4', '#b9c4b0'],
    ground: { ground: '#ecdfc2', grass: '#a9d27a', water: '#86c3c9' },
  },
  japan_modern: {
    walls: ['#f3e6cc', '#ead7c0', '#dfe5e0', '#f0dcc8', '#d9dde6', '#efe9dc', '#e6cdb6'],
    roofs: ['#7a8190', '#a0644e', '#6e7d6b', '#8a7d70'],
    flatRoofs: ['#d4cbb8', '#a9bb9c', '#c4c9cc', '#d9c7a5', '#b7c3c9'],
    ground: { ground: '#e9dfcb', grass: '#a5cf78', water: '#82bfc8' },
  },
  east_asia_historic: {
    walls: ['#efe1c4', '#e6d3b2', '#f3e9d6', '#dbc9ac', '#e9d9c2', '#d7c3a2'],
    roofs: ['#5f6878', '#6b7484', '#56606f', '#7a8291', '#4f5a68'],
    flatRoofs: ['#cfc6b2', '#9fb596', '#bdb7a8', '#c9d0c4'],
    ground: { ground: '#ebdcbd', grass: '#a7d07a', water: '#7fbfc6' },
  },
  east_asia_modern: {
    walls: ['#f2e2c4', '#ead2b6', '#dfe4dc', '#f1dccd', '#d8dde5', '#e9e3d4', '#e4c9ae'],
    roofs: ['#7b8291', '#a8654c', '#6c7b69', '#8e7a68'],
    flatRoofs: ['#8fb08a', '#cfc6b2', '#b9c2c6', '#d6c39f', '#a3b8a6'],
    ground: { ground: '#e9ddc6', grass: '#a7d07a', water: '#7fbfc6' },
  },
  korea_modern: {
    walls: ['#efdcc4', '#e3c9ad', '#d9cfc2', '#f1e6d6', '#cfd8d8', '#e6d3c3'],
    roofs: ['#7a808c', '#9c5f4b', '#6c7a6a'],
    flatRoofs: ['#8fb08a', '#7fa3a6', '#cfc6b2', '#c9c2b6'],
    ground: { ground: '#e9ddc6', grass: '#a7d07a' },
  },
  southeast_asia: {
    walls: ['#f6dca8', '#cfe3d6', '#f2c9bb', '#d6e0ef', '#f4e6c6', '#e8c3d0', '#c9e0c0'],
    roofs: ['#b05a42', '#c26a4c', '#94503d', '#d07c55'],
    flatRoofs: ['#d6cbb9', '#c9b79b', '#b8c6b0'],
    ground: { ground: '#efe0c2', grass: '#98cf6c', water: '#73c1c6' },
  },
  canal_europe: {
    walls: ['#9a5b45', '#b56f52', '#7d4a3d', '#c48a68', '#5f4a44', '#e6d4b6', '#a8634b'],
    roofs: ['#5a5f6b', '#6e6660', '#8a5142', '#4f5562'],
    flatRoofs: ['#cfc6b8', '#b9b2a6', '#a7b39f'],
    ground: { ground: '#e9ddc4', grass: '#a5cf76', water: '#74b6c0' },
  },
  mediterranean: {
    walls: ['#f5c460', '#f1a672', '#e27351', '#f7d785', '#edb19b', '#f4e4c1', '#e69a52'],
    roofs: ['#c0704e', '#b0634a', '#d0845c', '#a59e95'],
    flatRoofs: ['#e3d3b4', '#d6c3a0', '#cfc0aa'],
    ground: { ground: '#eedfc0', grass: '#b0d47a', water: '#6fc4d0' },
  },
  europe_classic: {
    walls: ['#f1e3c8', '#e8d5b8', '#efe6d4', '#dccab0', '#e9d2bd', '#d9d4c6'],
    roofs: ['#5f6878', '#6f7786', '#8c5a48', '#7b828f'],
    flatRoofs: ['#cdc5b6', '#b7bfc0', '#d3c4a8'],
    ground: { ground: '#ecdfc4', grass: '#acd27c', water: '#7fbcc6' },
  },
  global_metro: {
    walls: ['#f2dcae', '#eec7a0', '#e7b08a', '#f5e6c8', '#dcc3a8', '#cfd8c4', '#f0d0c0'],
    roofs: ['#b8634a', '#9a5442', '#5d6d7c', '#7f8e6a', '#a8785a', '#c98a5a'],
    flatRoofs: ['#cfc6b2', '#9db394', '#bfb7a8', '#d9c9a8'],
    ground: { ground: '#ecdcbc', grass: '#a9d47a', water: '#7cc4cf', road: '#b3a8ab' },
  },
};

const PROFILE_IDS = new Set<string>(Object.keys(MINIATURE_PALETTES));

export function resolveProfileId(bundle: PocketCityBundle): ProfileId | null {
  if (
    bundle.id === 'gion-kyoto' ||
    bundle.id === 'portofino' ||
    bundle.id === 'amsterdam-canals'
  ) {
    return null;
  }
  if (bundle.id === 'chengdu-anshun') return 'east_asia_historic';

  const explicit = bundle.city?.profile;
  if (explicit && PROFILE_IDS.has(explicit)) {
    return explicit as ProfileId;
  }

  const tz = bundle.city?.timezone || '';
  const facade = bundle.city?.styles?.default?.facade || '';
  if (tz === 'Asia/Tokyo') return facade === 'timber' ? 'japan_historic' : 'japan_modern';
  if (tz === 'Asia/Shanghai') return facade === 'timber' ? 'east_asia_historic' : 'east_asia_modern';
  if (tz === 'Asia/Seoul') return 'korea_modern';
  if (tz === 'Asia/Singapore') return 'southeast_asia';
  if (tz === 'Europe/Amsterdam') return 'canal_europe';
  if (tz === 'Europe/Rome') return 'mediterranean';
  if (tz === 'Europe/Paris') return 'europe_classic';
  return 'global_metro';
}

export function isGeneratedBundle(b: PocketCityBundle): boolean {
  return (
    b.pipelineSource === 'cloud_workshop' ||
    b.pipelineSource === 'browser_fallback' ||
    Boolean(b.isLiveOSM)
  );
}

export function resolveEngineStyle(bundle: PocketCityBundle): EngineStyle {
  const id = resolveProfileId(bundle);
  return {
    ...MINIATURE_ENGINE,
    palette: id ? MINIATURE_PALETTES[id] : null,
    osmRoofs: isGeneratedBundle(bundle),
  };
}
