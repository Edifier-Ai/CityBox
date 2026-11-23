export interface PocketCityMeta {
  lat: number;
  lon: number;
  rotation: number;
  size: number;
  half: number;
  north: [number, number, number];
  drive: 'right' | 'left';
  place?: string;
  osm_base?: string | null;
  level?: number;
}

export interface PocketBuildingOBB {
  c: [number, number];
  ax: [number, number];
  L: number;
  W: number;
  fill: number;
}

export interface PocketRoofTexMap {
  bounds: [number, number, number, number];
  w: number;
  h: number;
  pal: string[];
  data: string;
}

export interface PocketRoofFeatures {
  ax?: [number, number];
  terraces?: Array<{ x: number; y: number; w: number; d: number; h?: number }>;
  skylights?: Array<{ x: number; y: number; w: number; d: number; h: number }>;
  gardens?: Array<{ x: number; y: number; w?: number; d?: number; r: number }>;
  penthouses?: Array<{ x: number; y: number; w: number; d: number; h: number }>;
}

export interface PocketBuilding {
  id: string;
  ring: [number, number][];
  holes?: [number, number][][];
  kind?: 'building' | 'part' | 'roof';
  type?: string;
  h?: number | null;
  lv?: number | null;
  min?: number;
  roof?: string | null;
  rh?: number | null;
  rcol?: string | null;
  rdir?: string | null;
  col?: string | null;
  mat?: string | null;
  use?: string | null;
  n?: string;
  famous?: boolean;
  cut?: boolean;
  of?: string;
  obb: PocketBuildingOBB;
  roofTexMap?: PocketRoofTexMap;
  roofFeatures?: PocketRoofFeatures;
}

export interface PocketLawn {
  kind: string;
  r: [number, number][][];
}

export interface PocketBoat {
  x: number;
  y: number;
  a: number;
  l: number;
  k: number;
  anchor?: number;
}

export interface PocketRail {
  kind: string;
  p: [number, number][];
}

export interface PocketBridge {
  kind: 'footbridge' | 'steps_bridge' | 'road_bridge' | 'monorail' | 'rail_viaduct';
  name?: string;
  layer: number;
  z: number;
  z0?: number;
  z1?: number;
  w: number;
  p: [number, number][];
}

export interface PocketTunnel {
  kind: 'road_tunnel' | 'rail_tunnel' | 'ped_tunnel';
  name?: string;
  layer: number;
  w: number;
  p: [number, number][];
  portals: Array<{ x: number; y: number; dx: number; dy: number }>;
}

export type PocketTreeTuple = [number, number, number, string, string?];

export interface PocketRoute {
  kind: 'car' | 'bike' | 'ped';
  name?: string;
  z?: number;
  p: Array<[number, number] | [number, number, number]>;
}

export interface PocketCenterline {
  name?: string;
  p: [number, number][];
}

export interface PocketPOI {
  x: number;
  y: number;
  name: string;
  en?: string;
  kind: string;
}

export interface PocketFurniture {
  k:
    | 'lamp'
    | 'cafe'
    | 'bench'
    | 'vending'
    | 'bus_stop'
    | 'signal'
    | 'fountain'
    | 'torii'
    | 'wayside_shrine'
    | 'memorial'
    | 'monument'
    | string;
  x: number;
  y: number;
  i?: number;
  name?: string;
  ref?: string;
  shelter?: boolean;
}

export interface PocketSceneData {
  meta: PocketCityMeta;
  corners: [number, number][];
  buildings: PocketBuilding[];
  roads: [number, number][][][];
  paths: [number, number][][][];
  walk: [number, number][][][];
  lawns: PocketLawn[];
  water?: [number, number][][][];
  sand?: [number, number][][][];
  quay?: [number, number][][][];
  quayShade?: [number, number][][][];
  shore?: [number, number][][];
  rails?: PocketRail[];
  bridges?: PocketBridge[];
  tunnels?: PocketTunnel[];
  trees: PocketTreeTuple[];
  species: string[];
  boats?: PocketBoat[];
  routes: PocketRoute[];
  centerlines: PocketCenterline[];
  markings: [number, number][][];
  pois?: PocketPOI[];
  furniture?: PocketFurniture[];
}

export type PocketFacadeKind =
  | 'house'
  | 'apartment'
  | 'brick'
  | 'canal'
  | 'stucco'
  | 'painted'
  | 'civic'
  | 'temple'
  | 'shophouse'
  | 'timber'
  | 'office'
  | 'glass'
  | 'plain'
  | 'warehouse';

export type PocketRoofKind = 'auto' | 'flat' | 'gabled' | 'hipped' | 'pyramidal';
export type PocketRoofTex = 'kawara' | 'pantile' | 'slate' | 'tiles' | 'copper';
export type PocketPavingStyle = 'grid' | 'slabs' | 'ishidatami' | 'tiles';

export interface PocketBuildingStyle {
  facade?: PocketFacadeKind;
  wall?: string | string[];
  levels?: number;
  floor?: number;
  height?: number;
  roof?: PocketRoofKind;
  pitch?: number;
  ridge?: 'long' | 'short' | 'street';
  roofColour?: string | string[];
  flatRoof?: string | string[];
  roofTex?: PocketRoofTex;
  eaves?: number;
  maxSpan?: number;
  rectFill?: number;
  parapet?: number;
  rooftop?: 'none' | string;
  eave1?: boolean;
  eave1Depth?: number;
  bay?: number;
  glass?: string[];
  frame?: string;
  trim?: string;
  dark?: string;
  shutters?: string | string[];
  shutterOpen?: number;
  balcony?: boolean | 'some';
  bars?: boolean;
  wood?: string;
  slat?: string;
  noren?: string[];
  shop?: 'poi' | 'street' | 'none';
  shopHeight?: number;
  shopWall?: string;
  fascia?: string[];
  awning?: boolean | 'some';
  awningDepth?: number;
  awnings?: string[];
  stripes?: boolean;
}

export interface PocketStyleRuleCondition {
  type?: string | string[];
  use?: string | string[];
  mat?: string | string[];
  famous?: boolean;
  cut?: boolean;
  name?: string;
  minH?: number;
  maxH?: number;
  minLevels?: number;
  maxLevels?: number;
  minArea?: number;
  maxArea?: number;
  unknownHeight?: boolean;
  nearStreet?: boolean;
}

export interface PocketStyleRule {
  if?: PocketStyleRuleCondition;
  set: PocketBuildingStyle;
  more?: boolean;
}

export interface PocketTreeRule {
  match?: string;
  style?: number;
  colours?: string[];
  height?: number;
  vary?: number;
  evergreen?: boolean;
  spring?: string;
  blossom?: string;
  autumn?: string;
  winter?: string;
  bark?: string;
  mix?: Array<{
    style?: number;
    colours?: string[];
    height?: number;
    share?: number;
    evergreen?: boolean;
  }>;
}

export interface PocketNote {
  text: string;
  source: string;
  url: string;
}

export interface PocketDecorConfig {
  bunting?: string[];
  span?: number;
  height?: number;
  lanterns?: string[];
  lanternGap?: number;
  fairy?: string[];
  litTrees?: string;
  flags?: string[];
}

export interface PocketSeasonConfig {
  id: string;
  label: string;
  sub?: string;
  icon?: string;
  leaves?: 'spring' | 'summer' | 'autumn' | 'bare' | 'blossom';
  wet?: boolean;
  snow?: boolean;
  ice?: boolean;
  coats?: boolean;
  umbrellas?: boolean;
  cafes?: 'closed' | boolean;
  boats?: number;
  grass?: string;
  wx?: 'rain' | 'drizzle' | 'snow' | 'heavysnow' | 'fluff';
  haze?: boolean;
  crowd?: number;
  night?: boolean | number;
  litShare?: number;
  petals?: boolean;
  dress?: {
    colours: string[];
    share?: number;
  };
  decor?: PocketDecorConfig;
  note?: PocketNote;
}

export interface PocketCameraState {
  yaw: number;
  pitch: number;
  zoom: number;
  x: number;
  y: number;
  z: number;
}

export interface PocketCameraPreset {
  id: string;
  label: string;
  camera: Partial<PocketCameraState>;
}

export interface PocketLegendItem {
  name: string;
  source?: string;
  count?: string;
  icon?: 'buildings' | 'trees' | 'streets' | 'landmark' | 'water' | 'shops';
  camera: Partial<PocketCameraState>;
}

export interface PocketFieldNote {
  title: string;
  text: string;
  links?: Array<{ label: string; url: string }>;
}

export interface PocketCityConfig {
  name: string;
  title?: string;
  region?: string;
  place?: string;
  flag?: string;
  timezone?: string;
  level?: number;
  profile?: string;
  styles: {
    default?: PocketBuildingStyle;
    rules?: PocketStyleRule[];
  };
  buildings?: Record<string, PocketBuildingStyle>;
  palette?: {
    ground?: string;
    road?: string;
    pavement?: string;
    walk?: string;
    grass?: string;
    water?: string;
    sand?: string;
    quay?: string;
    slab?: string;
    marking?: string;
    kerb?: string;
    paving?: string;
    rail?: string;
  };
  paving?: {
    style?: PocketPavingStyle;
    size?: number;
    colour?: string;
    stone?: string;
    roadStyle?: 'asphalt' | 'klinkers' | 'cobble';
  };
  lamp?: {
    colour?: string;
    height?: number;
    head?: string;
    auto?: boolean;
  };
  shops?: {
    signs?: string[];
    font?: string;
    fascias?: string[];
    awnings?: string[];
  };
  boats?: {
    hulls?: string[];
    stripes?: string[];
    covers?: string[];
    inside?: string;
    cabin?: string;
    style?: 'generic' | 'amsterdam';
    cruising?: Array<{
      kind: 'sloop' | 'tour';
      p: [number, number][];
      speed?: number;
      phase?: number;
      hull?: string;
    }>;
  };
  traffic?: {
    pedInterval?: number;
    bikeInterval?: number;
    carInterval?: number;
    capacity?: number;
  };
  extraRoutes?: PocketRoute[];
  cafes?: {
    umbrellas?: string[];
    stripes?: boolean;
    table?: string;
    chair?: string;
  };
  trees?: {
    default?: PocketTreeRule;
    rules?: PocketTreeRule[];
    extra?: Array<[number, number, number, string]>;
  };
  people?: {
    skin?: string[];
    clothes?: string[];
    pants?: string[];
    hair?: string[];
    umbrellas?: string[];
    bikes?: string[];
  };
  vehicles?: {
    kinds?: Array<'small' | 'hatch' | 'sedan' | 'estate' | 'suv' | 'mpv' | 'van'>;
    colours?: string[];
    plate?: string;
    frontPlate?: string;
    taxi?: {
      share?: number;
      colours?: string[];
      kind?: 'small' | 'hatch' | 'sedan' | 'estate' | 'suv' | 'mpv' | 'van';
      sign?: string;
    };
  };
  seasonLabel?: string;
  seasons: PocketSeasonConfig[];
  occasionLabel?: string;
  occasions?: PocketSeasonConfig[];
  months?: string[];
  isoLabel?: string;
  cameras?: {
    iso?: Partial<PocketCameraState>;
    bird?: Partial<PocketCameraState>;
  };
  views?: PocketCameraPreset[];
  legend?: PocketLegendItem[];
  notes?: PocketFieldNote[];
  credits?: Array<{ label: string; url: string }>;
}

export interface PocketCityBundle {
  id: string;
  scene: PocketSceneData;
  city: PocketCityConfig;
  landmarksCode?: string;
  pipelineSource?: 'curated' | 'cloud_workshop' | 'browser_fallback';
  generatedAt?: number;
  isLiveOSM?: boolean;
}
