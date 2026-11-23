import type { SeasonMode, SpecialSceneMode } from '../types/city';

export interface AtmosphereTheme {
  id: string;
  label: string;
  isNight: boolean;
  isWinter: boolean;
  isFestival: boolean;
  shadowOpacity: number;
  paperBg: string;
  fogColor: string;
  baseSlabColor: string;
  baseEdgeColor: string;
  groundColor: string;
  parkColor: string;
  roadColor: string;
  sidewalkColor: string;
  waterColor: string;
  waterRippleColor: string;
  waterShoreColor: string;
  sunColor: string;
  sunIntensity: number;
  sunPosition: [number, number, number];
  hemiSkyColor: string;
  hemiGroundColor: string;
  hemiIntensity: number;
  shadowTint: string;
  windowGlow: number;
  lampGlow: number;
  foliageColors: [string, string, string];
  particleKind: 'none' | 'petals' | 'rain' | 'leaves' | 'snow';
  particleColor: string;
  umbrellasActive: boolean;
  edgeLineColor: string;
  edgeLineOpacity: number;
}

const SEASON_BASES: Record<SeasonMode, Omit<AtmosphereTheme, 'id' | 'label'>> = {
  spring: {
    isNight: false,
    isWinter: false,
    isFestival: false,
    shadowOpacity: 0.22,
    paperBg: '#f6f2e8',
    fogColor: '#f6f2e8',
    baseSlabColor: '#e5ddd0',
    baseEdgeColor: '#cec3af',
    groundColor: '#ece7da',
    parkColor: '#c3dc9f',
    roadColor: '#c8c3c0',
    sidewalkColor: '#e5dfd3',
    waterColor: '#7eb9c2',
    waterRippleColor: '#aad8de',
    waterShoreColor: '#d4ebec',
    sunColor: '#fff9ed',
    sunIntensity: 0.95,
    sunPosition: [140, 210, 110],
    hemiSkyColor: '#f5f9ff',
    hemiGroundColor: '#e3d8c6',
    hemiIntensity: 1.25,
    shadowTint: '#8591ab',
    windowGlow: 0.02,
    lampGlow: 0.0,
    foliageColors: ['#7db962', '#5f9a53', '#a6d476'],
    particleKind: 'petals',
    particleColor: '#f7cad3',
    umbrellasActive: false,
    edgeLineColor: '#4e4740',
    edgeLineOpacity: 0.30,
  },
  summer_rain: {
    isNight: false,
    isWinter: false,
    isFestival: false,
    shadowOpacity: 0.16,
    paperBg: '#eef0ec',
    fogColor: '#eef0ec',
    baseSlabColor: '#dad6cb',
    baseEdgeColor: '#c0baa9',
    groundColor: '#e4e1d7',
    parkColor: '#a7ca93',
    roadColor: '#b3b5be',
    sidewalkColor: '#d7d4cc',
    waterColor: '#78b5bf',
    waterRippleColor: '#a6d6dc',
    waterShoreColor: '#cce5e8',
    sunColor: '#f2f6fb',
    sunIntensity: 0.72,
    sunPosition: [120, 215, 95],
    hemiSkyColor: '#e6eff8',
    hemiGroundColor: '#ccc7bd',
    hemiIntensity: 1.28,
    shadowTint: '#7a88a0',
    windowGlow: 0.04,
    lampGlow: 0.28,
    foliageColors: ['#63a858', '#4f8c4c', '#82c16d'],
    particleKind: 'rain',
    particleColor: '#8ba2bd',
    umbrellasActive: true,
    edgeLineColor: '#46454b',
    edgeLineOpacity: 0.32,
  },
  autumn: {
    isNight: false,
    isWinter: false,
    isFestival: false,
    shadowOpacity: 0.22,
    paperBg: '#f6efe3',
    fogColor: '#f6efe3',
    baseSlabColor: '#e3d8c4',
    baseEdgeColor: '#cbbba0',
    groundColor: '#eae3d2',
    parkColor: '#d2c88e',
    roadColor: '#c3bcbb',
    sidewalkColor: '#e3dacb',
    waterColor: '#75aebc',
    waterRippleColor: '#9ecad5',
    waterShoreColor: '#d8e7e5',
    sunColor: '#ffeed1',
    sunIntensity: 0.98,
    sunPosition: [165, 165, 95],
    hemiSkyColor: '#fff5e5',
    hemiGroundColor: '#d9c6ab',
    hemiIntensity: 1.18,
    shadowTint: '#87809a',
    windowGlow: 0.05,
    lampGlow: 0.15,
    foliageColors: ['#e8b33c', '#cf8934', '#f4d366'],
    particleKind: 'leaves',
    particleColor: '#eab13f',
    umbrellasActive: false,
    edgeLineColor: '#52453b',
    edgeLineOpacity: 0.31,
  },
  winter: {
    isNight: false,
    isWinter: true,
    isFestival: false,
    shadowOpacity: 0.19,
    paperBg: '#f1f3f5',
    fogColor: '#f1f3f5',
    baseSlabColor: '#dde1e6',
    baseEdgeColor: '#c3cad4',
    groundColor: '#eaedf0',
    parkColor: '#d2ddd9',
    roadColor: '#b9bfc8',
    sidewalkColor: '#e2e6ea',
    waterColor: '#71a3b9',
    waterRippleColor: '#a4c8d8',
    waterShoreColor: '#e3eef3',
    sunColor: '#f7f9ff',
    sunIntensity: 0.88,
    sunPosition: [145, 165, 130],
    hemiSkyColor: '#edf4fc',
    hemiGroundColor: '#cdd4de',
    hemiIntensity: 1.24,
    shadowTint: '#7f90ab',
    windowGlow: 0.14,
    lampGlow: 0.22,
    foliageColors: ['#9eb0a7', '#c2d0cc', '#889b92'],
    particleKind: 'snow',
    particleColor: '#ffffff',
    umbrellasActive: false,
    edgeLineColor: '#4c5462',
    edgeLineOpacity: 0.29,
  },
};

export function resolveAtmosphere(
  season: SeasonMode,
  special: SpecialSceneMode,
  festivalLabel?: string
): AtmosphereTheme {
  const base = SEASON_BASES[season];

  if (special === 'night_tour') {
    return {
      ...base,
      id: `${season}_night_tour`,
      label: '夜游模式',
      isNight: true,
      isFestival: false,
      shadowOpacity: 0.28,
      paperBg: '#eee9de',
      fogColor: '#465475',
      baseSlabColor: '#5c637a',
      baseEdgeColor: '#43495e',
      groundColor: '#5c6784',
      parkColor: season === 'autumn' ? '#676b61' : '#4d6b6d',
      roadColor: '#747a91',
      sidewalkColor: '#868b9f',
      waterColor: '#407599',
      waterRippleColor: '#639ec2',
      waterShoreColor: '#7eb2cf',
      sunColor: '#a6bce8',
      sunIntensity: 0.55,
      sunPosition: [-130, 180, 115],
      hemiSkyColor: '#7e90ba',
      hemiGroundColor: '#464d66',
      hemiIntensity: 1.08,
      shadowTint: '#363f59',
      windowGlow: 1.0,
      lampGlow: 1.0,
      foliageColors:
        season === 'autumn'
          ? ['#a38948', '#8c6b42', '#b89b52']
          : ['#568c68', '#437357', '#679c77'],
      particleKind: season === 'summer_rain' ? 'rain' : season === 'winter' ? 'snow' : 'none',
      umbrellasActive: season === 'summer_rain',
      edgeLineColor: '#262b3d',
      edgeLineOpacity: 0.36,
    };
  }

  if (special === 'dawn') {
    return {
      ...base,
      id: `${season}_dawn`,
      label: '晨曦微光',
      isNight: false,
      isFestival: false,
      shadowOpacity: 0.24,
      paperBg: '#f6efe6',
      fogColor: '#f6e9da',
      sunColor: '#ffd4b2',
      sunIntensity: 0.92,
      sunPosition: [185, 110, 115],
      hemiSkyColor: '#ffe3d6',
      hemiGroundColor: '#cbb7c2',
      hemiIntensity: 1.15,
      shadowTint: '#847d9e',
      windowGlow: 0.32,
      lampGlow: 0.45,
    };
  }

  if (special === 'festival') {
    const springBase = SEASON_BASES.spring;
    return {
      ...springBase,
      id: `${season}_festival`,
      label: festivalLabel || '节庆盛典',
      isNight: false,
      isWinter: false,
      isFestival: true,
      windowGlow: 0.12,
      lampGlow: 0.45,
      particleKind: 'petals',
      particleColor: '#ff9642',
      shadowOpacity: 0.22,
      edgeLineOpacity: 0.31,
    };
  }

  const seasonLabels: Record<SeasonMode, string> = {
    spring: '春日新绿',
    summer_rain: '盛夏骤雨',
    autumn: '深秋银杏',
    winter: '冬日江畔',
  };

  return {
    ...base,
    id: season,
    label: seasonLabels[season],
  };
}
