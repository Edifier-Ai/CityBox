import type { PocketCityBundle } from './pocketCity';

export type SeasonMode = 'spring' | 'summer_rain' | 'autumn' | 'winter';
export type SpecialSceneMode = 'standard' | 'night_tour' | 'dawn' | 'festival';

export type BuildingArchetype =
  | 'modern'
  | 'pitched'
  | 'pavilion'
  | 'covered_bridge'
  | 'tower';

export type FacadeStyle =
  | 'plaster_modern'
  | 'brick_canal'
  | 'traditional_timber'
  | 'stone_classic'
  | 'glass_tower';

export type RoofStyle =
  | 'flat_parapet'
  | 'gable_slate'
  | 'gable_terracotta'
  | 'hipped_eaves'
  | 'stepped_gable';

export interface Vec2 {
  x: number;
  z: number;
}

export interface CityLocationMeta {
  id: string;
  region: string;
  city: string;
  subtitle: string;
  lat: number;
  lng: number;
  sliceSizeMeters: number;
  note: string;
  noteSource: string;
  climateNote: string;
  climateSource: string;
  isLiveOSM: boolean;
  specialSceneLabel?: string;
  specialFestivalTheme?: 'kings_day' | 'lantern_night' | 'sakura_matsuri';
  pipelineSource?: 'curated' | 'cloud_workshop' | 'browser_fallback';
  generatedAt?: number;
}

export interface DioramaBuilding {
  id: string;
  name?: string;
  rings: Vec2[][]; // outer ring + optional holes, in local meters
  height: number;
  levels: number;
  archetype: BuildingArchetype;
  facadeStyle?: FacadeStyle;
  roofStyle?: RoofStyle;
  wallColor: string;
  roofColor: string;
  accentColor?: string;
  center: Vec2;
  seed: number;
  baseElevation?: number;
  bridgeArches?: number;
  hasDormers?: boolean;
}

export interface DioramaWater {
  id: string;
  name?: string;
  polygons: Vec2[][][]; // array of polygon rings (outer + holes)
  centerlines: Vec2[][]; // for boat movement & water labels
}

export type RoadKind = 'primary' | 'secondary' | 'residential' | 'footway';

export interface DioramaRoad {
  id: string;
  name?: string;
  points: Vec2[];
  width: number;
  kind: RoadKind;
  isBridge?: boolean;
  bridgeHeight?: number;
  bridgeArches?: number;
}

export interface DioramaPark {
  id: string;
  name?: string;
  rings: Vec2[][];
}

export interface DioramaTree {
  x: number;
  z: number;
  scale: number;
  variant: 0 | 1 | 2;
}

export interface DioramaLegendItem {
  id: string;
  title: string;
  subtitle: string;
  kind: 'landmark' | 'water' | 'road' | 'park';
  target: [number, number, number];
}

export interface CameraPreset {
  id: string;
  label: string;
  target: [number, number, number];
  azimuthDeg: number;
  polarDeg: number;
  zoom: number;
}

export interface DioramaSceneData {
  meta: CityLocationMeta;
  halfSize: number; // e.g., 100 means 200m x 200m architectural diorama
  buildings: DioramaBuilding[];
  waters: DioramaWater[];
  roads: DioramaRoad[];
  parks: DioramaPark[];
  trees: DioramaTree[];
  legends: DioramaLegendItem[];
  cameraPresets: CameraPreset[];
  boatPaths: Vec2[][];
  vehiclePaths: Vec2[][];
  pedestrianPaths: Vec2[][];
}

export interface PostcardSnapshot {
  id: string;
  title: string;
  subtitle: string;
  coordsText: string;
  atmosphereLabel: string;
  note: string;
  dataUrl: string;
  createdAt: number;
}

export interface AIConfig {
  enabled: boolean;
  provider: 'openai' | 'gemini';
  apiBaseUrl: string;
  apiKey: string;
  model: string;
}

export interface WorkshopStageStatus {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  stageIndex: number; // 0..3
  stageLabel: string;
  detail: string;
  progress: number; // 0..100
  cached?: boolean;
  error?: string;
  blueprint?: DioramaSceneData | PocketCityBundle;
}

export interface GalleryEntry {
  id: string;
  city: string;
  region: string;
  subtitle: string;
  lat: number;
  lng: number;
  sliceSizeMeters: number;
  buildingCount: number;
  waterCount: number;
  createdAt: number;
  isBuiltin?: boolean;
}
