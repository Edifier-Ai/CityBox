import type { Feature, Polygon } from 'geojson';
import * as turf from '@turf/turf';
import type {
  BuildingArchetype,
  CameraPreset,
  CityLocationMeta,
  DioramaBuilding,
  DioramaLegendItem,
  DioramaPark,
  DioramaRoad,
  DioramaSceneData,
  DioramaTree,
  DioramaWater,
  FacadeStyle,
  RoadKind,
  RoofStyle,
  Vec2,
} from '../types/city';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

const METERS_PER_DEG_LAT = 111320;

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{
    type: string;
    ref: number;
    role: string;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

export interface SearchPlaceResult {
  displayName: string;
  shortName: string;
  region: string;
  lat: number;
  lng: number;
}

export async function searchPlaces(query: string): Promise<SearchPlaceResult[]> {
  if (!query.trim()) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
    query.trim()
  )}&limit=6&addressdetails=1&accept-language=zh-CN,zh,en`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('地名检索服务暂时不可用');
  const items = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
    name?: string;
    address?: Record<string, string>;
  }>;

  return items.map((item) => {
    const addr = item.address || {};
    const city =
      addr.city || addr.town || addr.county || addr.state || item.name || '未知地点';
    const countryOrState = addr.state || addr.country || '';
    return {
      displayName: item.display_name,
      shortName: item.name || city,
      region: countryOrState ? `${countryOrState} · ${city}` : city,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    };
  });
}

async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ region: string; city: string; subtitle: string }> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=zh-CN,zh,en`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('reverse failed');
    const data = (await res.json()) as {
      name?: string;
      address?: Record<string, string>;
    };
    const addr = data.address || {};
    const city =
      addr.city || addr.town || addr.municipality || addr.county || addr.state || '城市切片';
    const state = addr.state || addr.province || addr.country || '地球坐标';
    const local =
      data.name ||
      addr.neighbourhood ||
      addr.suburb ||
      addr.road ||
      addr.quarter ||
      '微缩城市街区';

    return {
      region: state === city ? state : `${state} · ${city}`,
      city,
      subtitle: local,
    };
  } catch {
    return {
      region: '探索切片',
      city: `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`,
      subtitle: '实时地理画境',
    };
  }
}

async function fetchOverpass(
  south: number,
  west: number,
  north: number,
  east: number,
  onProgress?: (msg: string) => void
): Promise<OverpassResponse> {
  const bbox = `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`;
  const query = `
[out:json][timeout:22];
(
  way["building"](${bbox});
  relation["building"](${bbox});
  way["highway"](${bbox});
  way["waterway"](${bbox});
  way["natural"="water"](${bbox});
  relation["natural"="water"](${bbox});
  way["leisure"~"park|garden|playground"](${bbox});
  way["landuse"~"grass|forest|meadow|recreation_ground"](${bbox});
  node["natural"="tree"](${bbox});
  way["man_made"="bridge"](${bbox});
);
out geom;
`;

  let lastError: unknown;
  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    const endpoint = OVERPASS_ENDPOINTS[i];
    try {
      onProgress?.(
        i === 0 ? '正在向 OpenStreetMap 请求矢量地理切片...' : `切换地图镜像节点 (${i + 1})...`
      );
      const controller = new AbortController();
      const timer = globalThis.setTimeout(() => controller.abort(), 18000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      globalThis.clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`Overpass HTTP ${res.status}`);
      }
      return (await res.json()) as OverpassResponse;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('无法连接到地图数据服务');
}

function projectToLocal(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number
): Vec2 {
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  const x = (lng - centerLng) * METERS_PER_DEG_LAT * cosLat;
  const z = -(lat - centerLat) * METERS_PER_DEG_LAT;
  return { x, z };
}

function coordsToRing(
  geom: Array<{ lat: number; lon: number }>,
  centerLat: number,
  centerLng: number
): Vec2[] {
  return geom.map((pt) => projectToLocal(pt.lat, pt.lon, centerLat, centerLng));
}

function clipPolygonToBbox(
  rings: Vec2[][],
  halfSize: number
): Vec2[][][] {
  if (rings.length === 0 || rings[0].length < 3) return [];
  const geoRings = rings.map((r) => {
    const pts = r.map((p) => [p.x, p.z]);
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      pts.push([first[0], first[1]]);
    }
    return pts;
  });

  if (geoRings[0].length < 4) return [];

  try {
    const poly = turf.polygon(geoRings);
    const clipped = turf.bboxClip(poly, [-halfSize, -halfSize, halfSize, halfSize]);
    const geom = clipped.geometry;
    if (geom.type === 'Polygon') {
      const out = geom.coordinates
        .map((ring) => ring.slice(0, -1).map(([x, z]) => ({ x, z })))
        .filter((r) => r.length >= 3);
      return out.length > 0 ? [out] : [];
    }
    if (geom.type === 'MultiPolygon') {
      return geom.coordinates
        .map((polyCoords) =>
          polyCoords
            .map((ring) => ring.slice(0, -1).map(([x, z]) => ({ x, z })))
            .filter((r) => r.length >= 3)
        )
        .filter((p) => p.length > 0);
    }
  } catch {
    // fallback: quick point clamp
    const fallback = rings.map((r) =>
      r.map((p) => ({
        x: Math.max(-halfSize, Math.min(halfSize, p.x)),
        z: Math.max(-halfSize, Math.min(halfSize, p.z)),
      }))
    );
    return [fallback];
  }
  return [];
}

function clipPolylineToBbox(points: Vec2[], halfSize: number): Vec2[][] {
  if (points.length < 2) return [];
  try {
    const line = turf.lineString(points.map((p) => [p.x, p.z]));
    const clipped = turf.bboxClip(line, [-halfSize, -halfSize, halfSize, halfSize]);
    const geom = clipped.geometry;
    if (geom.type === 'LineString') {
      const pts = geom.coordinates.map(([x, z]) => ({ x, z }));
      return pts.length >= 2 ? [pts] : [];
    }
    if (geom.type === 'MultiLineString') {
      return geom.coordinates
        .map((seg) => seg.map(([x, z]) => ({ x, z })))
        .filter((seg) => seg.length >= 2);
    }
  } catch {
    return [points];
  }
  return [];
}

function ringCentroidAndArea(ring: Vec2[]): { cx: number; cz: number; area: number } {
  let area = 0;
  let cx = 0;
  let cz = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % n];
    const cross = p1.x * p2.z - p2.x * p1.z;
    area += cross;
    cx += (p1.x + p2.x) * cross;
    cz += (p1.z + p2.z) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 0.01) {
    const avgX = ring.reduce((s, p) => s + p.x, 0) / Math.max(1, n);
    const avgZ = ring.reduce((s, p) => s + p.z, 0) / Math.max(1, n);
    return { cx: avgX, cz: avgZ, area: 1 };
  }
  return {
    cx: cx / (6 * area),
    cz: cz / (6 * area),
    area: Math.abs(area),
  };
}

function parseHeightMeters(tags: Record<string, string>, area: number, seed: number): {
  height: number;
  levels: number;
} {
  if (tags.height) {
    const num = parseFloat(tags.height.replace(/[^\d.]/g, ''));
    if (!Number.isNaN(num) && num > 2) {
      return { height: Math.min(num, 140), levels: Math.max(1, Math.round(num / 3.2)) };
    }
  }
  if (tags['building:levels']) {
    const lv = parseFloat(tags['building:levels']);
    if (!Number.isNaN(lv) && lv > 0) {
      const h = Math.min(lv * 3.3, 140);
      return { height: h, levels: Math.round(lv) };
    }
  }

  // Heuristic height based on footprint area & building type
  const bType = tags.building || 'yes';
  if (bType === 'house' || bType === 'detached' || bType === 'hut') {
    const h = 6.5 + (seed % 3.5);
    return { height: h, levels: 2 };
  }
  if (bType === 'temple' || bType === 'pavilion' || tags.historic) {
    return { height: 11 + (seed % 5), levels: 2 };
  }
  if (area > 2200) {
    const lv = 6 + Math.floor((seed * 7) % 8);
    return { height: lv * 3.2, levels: lv };
  }
  if (area > 700) {
    const lv = 4 + Math.floor((seed * 11) % 6);
    return { height: lv * 3.2, levels: lv };
  }
  const lv = 2 + Math.floor((seed * 5) % 4);
  return { height: lv * 3.2, levels: lv };
}

const WALL_PALETTE = [
  '#ccb0a8',
  '#c4a8a2',
  '#d2bfb4',
  '#cbb4aa',
  '#d6cabd',
  '#bfa4a1',
  '#c9b7af',
];

const BRICK_CANAL_PALETTE = [
  '#8f493b',
  '#6b3c35',
  '#453f46',
  '#b08959',
  '#a35843',
  '#5a6158',
  '#7c483e',
  '#c8baa8',
];

const STONE_CLASSIC_PALETTE = ['#d5cab8', '#cbbda9', '#dfd6c7', '#c4b6a4'];
const ROOF_PALETTE = ['#8e7a78', '#7d7273', '#96827f', '#606675', '#525766'];

function validHexColor(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : undefined;
}

function classifyArchetype(
  tags: Record<string, string>,
  area: number,
  height: number,
  lat: number,
  lng: number
): {
  archetype: BuildingArchetype;
  facadeStyle: FacadeStyle;
  roofStyle: RoofStyle;
  wallColor: string;
  roofColor: string;
  hasDormers: boolean;
  seed: number;
} {
  const seed = (Math.abs(Math.sin(area * 12.9898 + height * 78.233)) * 43758.5453) % 100;
  const name = (tags.name || '').toLowerCase();
  const bType = (tags.building || '').toLowerCase();
  const material = (tags['building:material'] || '').toLowerCase();
  const roofShape = (tags['roof:shape'] || '').toLowerCase();

  const isEastAsia = lat > 18 && lat < 46 && lng > 95 && lng < 145;
  const isEurope = lat > 35 && lat < 65 && lng > -12 && lng < 32;
  const isCanalEurope = lat > 49.5 && lat < 55.5 && lng > 2.0 && lng < 11.0;

  const customWall = validHexColor(tags['building:colour']);
  const customRoof = validHexColor(tags['roof:colour']);

  if (
    tags.bridge === 'yes' ||
    tags.man_made === 'bridge' ||
    name.includes('廊桥') ||
    name.includes('covered bridge')
  ) {
    return {
      archetype: 'covered_bridge',
      facadeStyle: isEastAsia ? 'traditional_timber' : 'stone_classic',
      roofStyle: isEastAsia ? 'hipped_eaves' : 'gable_slate',
      wallColor: customWall ?? '#c7b5a7',
      roofColor: customRoof ?? '#363b4c',
      hasDormers: false,
      seed,
    };
  }

  if (
    tags.historic ||
    tags.tourism === 'attraction' ||
    bType === 'temple' ||
    bType === 'shrine' ||
    bType === 'pagoda' ||
    bType === 'church' ||
    bType === 'cathedral' ||
    name.includes('亭') ||
    name.includes('阁') ||
    name.includes('寺') ||
    name.includes('庙') ||
    name.includes('楼')
  ) {
    if (height > 26 || name.includes('塔') || name.includes('tower') || bType === 'church' || bType === 'cathedral') {
      return {
        archetype: 'tower',
        facadeStyle: isEastAsia ? 'traditional_timber' : 'stone_classic',
        roofStyle: 'hipped_eaves',
        wallColor: customWall ?? (isEastAsia ? '#d4c3b2' : '#cfc2ae'),
        roofColor: customRoof ?? '#3b4052',
        hasDormers: false,
        seed,
      };
    }
    if (isEastAsia || bType === 'temple' || bType === 'shrine' || bType === 'pavilion') {
      return {
        archetype: 'pavilion',
        facadeStyle: 'traditional_timber',
        roofStyle: 'hipped_eaves',
        wallColor: customWall ?? '#d7c6b6',
        roofColor: customRoof ?? '#3b4152',
        hasDormers: false,
        seed,
      };
    }
  }

  // European canal / historic rowhouses & brick districts
  if (
    isCanalEurope ||
    material === 'brick' ||
    material === 'clinker' ||
    (isEurope && area < 340 && height < 22)
  ) {
    const useStepped =
      (isCanalEurope && area < 260 && height < 21) || roofShape === 'stepped';
    const roofStyle: RoofStyle = useStepped
      ? 'stepped_gable'
      : roofShape === 'hipped'
      ? 'hipped_eaves'
      : lat < 46 && isEurope
      ? 'gable_terracotta'
      : 'gable_slate';
    const facadeStyle: FacadeStyle = material === 'stone' ? 'stone_classic' : 'brick_canal';
    const wallList = facadeStyle === 'stone_classic' ? STONE_CLASSIC_PALETTE : BRICK_CANAL_PALETTE;
    return {
      archetype: 'pitched',
      facadeStyle,
      roofStyle,
      wallColor: customWall ?? wallList[Math.floor(seed) % wallList.length],
      roofColor:
        customRoof ??
        (roofStyle === 'gable_terracotta' ? '#9a5643' : '#3d4352'),
      hasDormers: height >= 7.5 && area >= 40 && seed % 10 >= 3,
      seed,
    };
  }

  if (
    height >= 30 ||
    bType === 'office' ||
    bType === 'commercial' && height >= 20 ||
    material === 'glass'
  ) {
    return {
      archetype: 'modern',
      facadeStyle: 'glass_tower',
      roofStyle: 'flat_parapet',
      wallColor: customWall ?? '#9eb3c4',
      roofColor: customRoof ?? '#566575',
      hasDormers: false,
      seed,
    };
  }

  if (
    roofShape === 'gabled' ||
    roofShape === 'hipped' ||
    roofShape === 'pyramidal' ||
    bType === 'house' ||
    bType === 'detached' ||
    (bType === 'residential' && height < 14) ||
    (area < 320 && height < 14)
  ) {
    const roofStyle: RoofStyle = isEastAsia
      ? 'hipped_eaves'
      : roofShape === 'hipped'
      ? 'hipped_eaves'
      : 'gable_terracotta';
    return {
      archetype: 'pitched',
      facadeStyle: isEastAsia && (bType === 'house' || tags.historic) ? 'traditional_timber' : 'plaster_modern',
      roofStyle,
      wallColor: customWall ?? WALL_PALETTE[Math.floor(seed) % WALL_PALETTE.length],
      roofColor: customRoof ?? (isEastAsia ? '#4c5263' : '#8a5d54'),
      hasDormers: !isEastAsia && height >= 8 && seed % 10 > 5,
      seed,
    };
  }

  return {
    archetype: 'modern',
    facadeStyle: isEurope && (material === 'stone' || tags.historic) ? 'stone_classic' : 'plaster_modern',
    roofStyle: 'flat_parapet',
    wallColor:
      customWall ??
      (isEurope && material === 'stone'
        ? STONE_CLASSIC_PALETTE[Math.floor(seed) % STONE_CLASSIC_PALETTE.length]
        : WALL_PALETTE[Math.floor(seed * 3) % WALL_PALETTE.length]),
    roofColor: customRoof ?? ROOF_PALETTE[Math.floor(seed * 5) % ROOF_PALETTE.length],
    hasDormers: false,
    seed,
  };
}

function buildClimateNote(lat: number): { note: string; source: string } {
  const absLat = Math.abs(lat);
  if (absLat < 23.5) {
    return {
      note: '该区域属热带气候，全年温暖湿润，夏季常伴午后对流阵雨。',
      source: '地理气候模型',
    };
  }
  if (absLat < 35) {
    return {
      note: '该区域四季分明，夏秋降水充沛，春秋两季最适合漫步水岸街区。',
      source: '地理气候模型',
    };
  }
  if (absLat < 52) {
    return {
      note: '温带街区四季色彩变化鲜明，深秋树冠常呈现金黄与琥珀色调。',
      source: '地理气候模型',
    };
  }
  return {
    note: '高纬度区域冬季日照偏低，建筑暖光与冷色天光形成鲜明对比。',
    source: '地理气候模型',
  };
}

function bufferPolylineInMeters(points: Vec2[], halfWidth: number): Vec2[] {
  if (points.length < 2) return [];
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    dx /= len;
    dz /= len;
    const nx = -dz;
    const nz = dx;
    left.push({ x: points[i].x + nx * halfWidth, z: points[i].z + nz * halfWidth });
    right.push({ x: points[i].x - nx * halfWidth, z: points[i].z - nz * halfWidth });
  }
  if (left.length < 2) return [];
  return [...left, ...right.reverse()];
}

interface SpatialPoly {
  poly: Feature<Polygon>;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function toTurfPolygon(rings: Vec2[][]): Feature<Polygon> | null {
  if (rings.length === 0 || rings[0].length < 3) return null;
  const coords = rings
    .filter((r) => r.length >= 3)
    .map((r) => {
      const pts = r.map((p) => [p.x, p.z]);
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        pts.push([first[0], first[1]]);
      }
      return pts;
    });
  if (coords.length === 0 || coords[0].length < 4) return null;
  try {
    return turf.polygon(coords);
  } catch {
    return null;
  }
}

function buildSpatialPolys(ringSets: Vec2[][][]): SpatialPoly[] {
  const out: SpatialPoly[] = [];
  for (const rings of ringSets) {
    const poly = toTurfPolygon(rings);
    if (!poly) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of rings[0]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    out.push({ poly, minX, maxX, minZ, maxZ });
  }
  return out;
}

function pointInsideSpatialPolys(
  x: number,
  z: number,
  polys: SpatialPoly[],
  pad = 0
): boolean {
  const probes: Array<[number, number]> =
    pad > 0
      ? [
          [x, z],
          [x + pad, z],
          [x - pad, z],
          [x, z + pad],
          [x, z - pad],
        ]
      : [[x, z]];

  for (const item of polys) {
    if (
      x < item.minX - pad ||
      x > item.maxX + pad ||
      z < item.minZ - pad ||
      z > item.maxZ + pad
    ) {
      continue;
    }
    for (const [px, pz] of probes) {
      if (turf.booleanPointInPolygon(turf.point([px, pz]), item.poly)) {
        return true;
      }
    }
  }
  return false;
}

function stitchWayRings(segments: Vec2[][]): Vec2[][] {
  const rings: Vec2[][] = [];
  const open: Vec2[][] = [];
  const EPS = 1.2;
  const distSq = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

  for (const seg of segments) {
    if (seg.length < 2) continue;
    if (seg.length >= 3 && distSq(seg[0], seg[seg.length - 1]) <= EPS * EPS) {
      rings.push(seg);
    } else {
      open.push([...seg]);
    }
  }

  while (open.length > 0) {
    const chain = open.shift()!;
    let merged = true;
    while (merged && open.length > 0) {
      merged = false;
      const head = chain[0];
      const tail = chain[chain.length - 1];
      if (chain.length >= 3 && distSq(head, tail) <= EPS * EPS) break;

      for (let i = 0; i < open.length; i++) {
        const cand = open[i];
        const cHead = cand[0];
        const cTail = cand[cand.length - 1];
        if (distSq(tail, cHead) <= EPS * EPS) {
          chain.push(...cand.slice(1));
          open.splice(i, 1);
          merged = true;
          break;
        }
        if (distSq(tail, cTail) <= EPS * EPS) {
          chain.push(...cand.slice(0, -1).reverse());
          open.splice(i, 1);
          merged = true;
          break;
        }
        if (distSq(head, cTail) <= EPS * EPS) {
          chain.unshift(...cand.slice(0, -1));
          open.splice(i, 1);
          merged = true;
          break;
        }
        if (distSq(head, cHead) <= EPS * EPS) {
          chain.unshift(...cand.slice(1).reverse());
          open.splice(i, 1);
          merged = true;
          break;
        }
      }
    }
    if (chain.length >= 3) {
      rings.push(chain);
    }
  }
  return rings;
}

function inferBridgeArches(points: Vec2[]): number {
  let spanLen = 0;
  for (let i = 1; i < points.length; i++) {
    spanLen += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  if (spanLen < 22) return 1;
  if (spanLen < 44) return 2;
  return Math.min(5, Math.max(3, Math.round(spanLen / 18)));
}

export async function generateDioramaFromCoordinates(
  lat: number,
  lng: number,
  sliceSizeMeters = 200,
  onProgress?: (msg: string) => void
): Promise<DioramaSceneData> {
  const halfSize = sliceSizeMeters / 2;
  const dLat = halfSize / METERS_PER_DEG_LAT;
  const dLng = halfSize / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));

  const [geoInfo, osm] = await Promise.all([
    reverseGeocode(lat, lng),
    fetchOverpass(lat - dLat, lng - dLng, lat + dLat, lng + dLng, onProgress),
  ]);

  onProgress?.('正在解析建筑轮廓、水系与街区拓扑...');

  const buildings: DioramaBuilding[] = [];
  const waters: DioramaWater[] = [];
  const roads: DioramaRoad[] = [];
  const parks: DioramaPark[] = [];
  const trees: DioramaTree[] = [];
  const rawTreeNodes: Array<{ id: number; x: number; z: number }> = [];
  const bridgeWays: Array<{ points: Vec2[]; name?: string; width: number }> = [];

  const waterAreaTrackers: Array<{
    water: DioramaWater;
    spatials: SpatialPoly[];
  }> = [];
  const pendingLinearWaterways: Array<{
    id: number;
    name?: string;
    waterway: string;
    seg: Vec2[];
  }> = [];
  const waterCenterlines: Vec2[][] = [];

  for (const el of osm.elements) {
    const tags = el.tags || {};

    // Single tree nodes (validated against building & water polygons after parsing)
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined && tags.natural === 'tree') {
      const pt = projectToLocal(el.lat, el.lon, lat, lng);
      if (Math.abs(pt.x) <= halfSize - 4 && Math.abs(pt.z) <= halfSize - 4) {
        rawTreeNodes.push({ id: el.id, x: pt.x, z: pt.z });
      }
      continue;
    }

    // Collect polygon ring sets ([outer, ...holes]) for ways & multipolygon relations
    const extractPolygonSets = (): Vec2[][][] => {
      if (el.type === 'way' && el.geometry && el.geometry.length >= 3) {
        return [[coordsToRing(el.geometry, lat, lng)]];
      }
      if (el.type === 'relation' && el.members) {
        const outerSegs: Vec2[][] = [];
        const innerSegs: Vec2[][] = [];
        for (const m of el.members) {
          if (!m.geometry || m.geometry.length < 2) continue;
          if (m.role === 'inner') {
            innerSegs.push(coordsToRing(m.geometry, lat, lng));
          } else if (m.role === 'outer' || m.role === '') {
            outerSegs.push(coordsToRing(m.geometry, lat, lng));
          }
        }
        const outers = stitchWayRings(outerSegs);
        const inners = stitchWayRings(innerSegs);
        if (outers.length === 0) return [];
        if (inners.length === 0) return outers.map((o) => [o]);

        return outers.map((outer) => {
          const outerPoly = toTurfPolygon([outer]);
          if (!outerPoly) return [outer];
          const matchedHoles = inners.filter((hole) => {
            const { cx, cz } = ringCentroidAndArea(hole);
            return (
              turf.booleanPointInPolygon(turf.point([cx, cz]), outerPoly) ||
              turf.booleanPointInPolygon(turf.point([hole[0].x, hole[0].z]), outerPoly)
            );
          });
          return [outer, ...matchedHoles];
        });
      }
      return [];
    };

    // Buildings
    if (tags.building) {
      const polySets = extractPolygonSets();
      for (const polyRings of polySets) {
        const clippedPolys = clipPolygonToBbox(polyRings, halfSize);
        for (const clipped of clippedPolys) {
          const { cx, cz, area } = ringCentroidAndArea(clipped[0]);
          if (area < 12) continue;
          const { height, levels } = parseHeightMeters(tags, area, (el.id % 97) + 1);
          const style = classifyArchetype(tags, area, height, lat, lng);
          buildings.push({
            id: `b-${el.id}-${buildings.length}`,
            name: tags.name,
            rings: clipped,
            height,
            levels,
            archetype: style.archetype,
            facadeStyle: style.facadeStyle,
            roofStyle: style.roofStyle,
            wallColor: style.wallColor,
            roofColor: style.roofColor,
            hasDormers: style.hasDormers,
            center: { x: cx, z: cz },
            seed: style.seed,
          });
        }
      }
      continue;
    }

    // Water areas
    if (tags.natural === 'water' || tags.waterway === 'riverbank' || tags.waterway === 'dock') {
      const polySets = extractPolygonSets();
      const clippedAll: Vec2[][][] = [];
      for (const polyRings of polySets) {
        clippedAll.push(...clipPolygonToBbox(polyRings, halfSize));
      }
      if (clippedAll.length > 0) {
        const water: DioramaWater = {
          id: `w-${el.id}`,
          name: tags.name,
          polygons: clippedAll,
          centerlines: [],
        };
        waters.push(water);
        waterAreaTrackers.push({
          water,
          spatials: buildSpatialPolys(clippedAll),
        });
      }
      continue;
    }

    // Linear waterways (rivers, canals, streams) — deferred for deduplication against water areas
    if (el.type === 'way' && tags.waterway && el.geometry && el.geometry.length >= 2) {
      const pts = coordsToRing(el.geometry, lat, lng);
      const clippedSegs = clipPolylineToBbox(pts, halfSize);
      for (const seg of clippedSegs) {
        pendingLinearWaterways.push({
          id: el.id,
          name: tags.name,
          waterway: tags.waterway,
          seg,
        });
      }
      continue;
    }

    // Parks & green areas
    if (
      tags.leisure === 'park' ||
      tags.leisure === 'garden' ||
      tags.leisure === 'playground' ||
      tags.landuse === 'grass' ||
      tags.landuse === 'forest' ||
      tags.landuse === 'meadow' ||
      tags.landuse === 'recreation_ground'
    ) {
      const polySets = extractPolygonSets();
      for (const polyRings of polySets) {
        const clippedPolys = clipPolygonToBbox(polyRings, halfSize);
        for (const clipped of clippedPolys) {
          parks.push({
            id: `p-${el.id}-${parks.length}`,
            name: tags.name,
            rings: clipped,
          });
        }
      }
      continue;
    }

    // Bridges (man_made=bridge or highway with bridge=yes)
    if (el.type === 'way' && (tags.bridge === 'yes' || tags.man_made === 'bridge') && el.geometry) {
      const pts = coordsToRing(el.geometry, lat, lng);
      const segs = clipPolylineToBbox(pts, halfSize);
      for (const seg of segs) {
        bridgeWays.push({
          points: seg,
          name: tags.name,
          width: tags.highway === 'footway' || tags.highway === 'pedestrian' ? 8 : 13,
        });
      }
    }

    // Roads & footpaths
    if (el.type === 'way' && tags.highway && el.geometry && el.geometry.length >= 2) {
      const hw = tags.highway;
      let kind: RoadKind = 'residential';
      let width = 9;
      if (['motorway', 'trunk', 'primary'].includes(hw)) {
        kind = 'primary';
        width = 15;
      } else if (['secondary', 'tertiary'].includes(hw)) {
        kind = 'secondary';
        width = 12;
      } else if (['footway', 'pedestrian', 'path', 'cycleway', 'steps'].includes(hw)) {
        kind = 'footway';
        width = 4.5;
      }
      const pts = coordsToRing(el.geometry, lat, lng);
      const clippedSegs = clipPolylineToBbox(pts, halfSize);
      const isBridge =
        tags.bridge === 'yes' || tags.bridge === 'viaduct' || tags.man_made === 'bridge';
      for (const seg of clippedSegs) {
        roads.push({
          id: `r-${el.id}-${roads.length}`,
          name: tags.name,
          points: seg,
          width,
          kind,
          isBridge,
          bridgeHeight: isBridge ? 4.8 : 0,
          bridgeArches: isBridge ? inferBridgeArches(seg) : 0,
        });
      }
    }
  }

  // Deduplicate linear waterways against existing water polygons & match centerlines
  for (const lw of pendingLinearWaterways) {
    waterCenterlines.push(lw.seg);
    const samplePts = [
      lw.seg[Math.floor(lw.seg.length * 0.25)],
      lw.seg[Math.floor(lw.seg.length * 0.5)],
      lw.seg[Math.floor(lw.seg.length * 0.75)],
    ];

    let bestTracker: (typeof waterAreaTrackers)[number] | null = null;
    let bestHits = 0;
    for (const tracker of waterAreaTrackers) {
      let hits = 0;
      for (const sp of samplePts) {
        if (pointInsideSpatialPolys(sp.x, sp.z, tracker.spatials)) {
          hits++;
        }
      }
      if (hits > bestHits) {
        bestHits = hits;
        bestTracker = tracker;
      }
    }

    if (bestTracker && bestHits >= 1) {
      bestTracker.water.centerlines.push(lw.seg);
      if (!bestTracker.water.name && lw.name) {
        bestTracker.water.name = lw.name;
      }
      continue;
    }

    // No enclosing natural=water / riverbank polygon found: synthesize ribbon
    const width =
      lw.waterway === 'river' ? 44 : lw.waterway === 'canal' ? 22 : 10;
    const polyRing = bufferPolylineInMeters(lw.seg, width / 2);
    if (polyRing.length >= 3) {
      const clippedWater = clipPolygonToBbox([polyRing], halfSize);
      if (clippedWater.length > 0) {
        const water: DioramaWater = {
          id: `wr-${lw.id}-${waters.length}`,
          name: lw.name,
          polygons: clippedWater,
          centerlines: [lw.seg],
        };
        waters.push(water);
        waterAreaTrackers.push({
          water,
          spatials: buildSpatialPolys(clippedWater),
        });
      }
    }
  }

  // Build spatial collision indexes for Turf polygon checks
  const buildingSpatials = buildSpatialPolys(buildings.map((b) => b.rings));
  const waterSpatials = buildSpatialPolys(waters.flatMap((w) => w.polygons));

  for (const node of rawTreeNodes) {
    if (
      !pointInsideSpatialPolys(node.x, node.z, buildingSpatials, 1.0) &&
      !pointInsideSpatialPolys(node.x, node.z, waterSpatials, 2.0)
    ) {
      trees.push({
        x: node.x,
        z: node.z,
        scale: 0.85 + (node.id % 7) * 0.04,
        variant: (node.id % 3) as 0 | 1 | 2,
      });
    }
  }

  // Scatter stylized avenue & park trees if OSM had few individual trees
  if (trees.length < 40) {
    for (const road of roads) {
      if (road.kind === 'footway' && road.points.length < 2) continue;
      if (road.isBridge) continue;
      for (let i = 0; i < road.points.length - 1; i++) {
        const a = road.points[i];
        const b = road.points[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 16) continue;
        const nx = -dz / len;
        const nz = dx / len;
        const steps = Math.floor(len / 24);
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const px = a.x + dx * t + nx * (road.width * 0.65 + 2.5);
          const pz = a.z + dz * t + nz * (road.width * 0.65 + 2.5);
          if (
            Math.abs(px) < halfSize - 10 &&
            Math.abs(pz) < halfSize - 10 &&
            !pointInsideSpatialPolys(px, pz, buildingSpatials, 1.5) &&
            !pointInsideSpatialPolys(px, pz, waterSpatials, 3.0)
          ) {
            trees.push({
              x: px,
              z: pz,
              scale: 0.82 + ((s * 17) % 5) * 0.06,
              variant: ((s + i) % 3) as 0 | 1 | 2,
            });
          }
          if (trees.length > 160) break;
        }
        if (trees.length > 160) break;
      }
      if (trees.length > 160) break;
    }

    // Plant inside parks
    for (const park of parks) {
      if (park.rings.length === 0) continue;
      const { cx, cz, area } = ringCentroidAndArea(park.rings[0]);
      const count = Math.min(18, Math.max(3, Math.floor(area / 450)));
      for (let i = 0; i < count; i++) {
        const ang = i * 2.39996;
        const rad = Math.sqrt((i + 1) / count) * Math.min(35, Math.sqrt(area) * 0.36);
        const tx = cx + Math.cos(ang) * rad;
        const tz = cz + Math.sin(ang) * rad;
        if (
          Math.abs(tx) < halfSize - 8 &&
          Math.abs(tz) < halfSize - 8 &&
          !pointInsideSpatialPolys(tx, tz, buildingSpatials, 1.5) &&
          !pointInsideSpatialPolys(tx, tz, waterSpatials, 2.5)
        ) {
          trees.push({
            x: tx,
            z: tz,
            scale: 0.85 + (i % 4) * 0.08,
            variant: (i % 3) as 0 | 1 | 2,
          });
        }
      }
    }
  }

  // Build Legends & Smart Camera Presets
  const legends: DioramaLegendItem[] = [];
  const namedBuildings = buildings
    .filter((b) => Boolean(b.name))
    .sort((a, b) => b.height - a.height);

  if (namedBuildings.length > 0) {
    const hero = namedBuildings[0];
    legends.push({
      id: 'legend-hero',
      title: hero.name!,
      subtitle: `${hero.levels} 层建筑 · 核心地标`,
      kind: 'landmark',
      target: [hero.center.x, hero.height * 0.4, hero.center.z],
    });
  } else if (bridgeWays.length > 0 && bridgeWays[0].name) {
    const br = bridgeWays[0];
    const mid = br.points[Math.floor(br.points.length / 2)];
    legends.push({
      id: 'legend-bridge',
      title: br.name ?? '跨水桥梁',
      subtitle: '跨水桥梁',
      kind: 'landmark',
      target: [mid.x, 4, mid.z],
    });
  }

  const namedWater = waters.find((w) => Boolean(w.name));
  if (namedWater) {
    const pt =
      namedWater.centerlines[0]?.[Math.floor((namedWater.centerlines[0]?.length || 1) / 2)] ||
      namedWater.polygons[0]?.[0]?.[0] || { x: 0, z: 0 };
    legends.push({
      id: 'legend-water',
      title: namedWater.name!,
      subtitle: '城市水系与游线',
      kind: 'water',
      target: [pt.x, 0, pt.z],
    });
  }

  const namedRoad = roads.find((r) => Boolean(r.name) && r.kind !== 'footway');
  if (namedRoad) {
    const mid = namedRoad.points[Math.floor(namedRoad.points.length / 2)];
    legends.push({
      id: 'legend-road',
      title: namedRoad.name!,
      subtitle: '主要通行街道',
      kind: 'road',
      target: [mid.x, 0, mid.z],
    });
  }

  if (legends.length === 0) {
    legends.push({
      id: 'legend-center',
      title: geoInfo.subtitle,
      subtitle: `${buildings.length} 栋建筑 · ${roads.length} 条道路`,
      kind: 'landmark',
      target: [0, 6, 0],
    });
  }

  const heroTarget = legends[0]?.target ?? [0, 6, 0];
  const secondaryTarget = legends[1]?.target ?? [30, 0, 20];

  const cameraPresets: CameraPreset[] = [
    {
      id: 'tour',
      label: '巡游',
      target: [0, 4, 0],
      azimuthDeg: 38,
      polarDeg: 57,
      zoom: 2.25,
    },
    {
      id: 'landmark',
      label: legends[0]?.title.slice(0, 5) || '核心近景',
      target: heroTarget,
      azimuthDeg: 26,
      polarDeg: 61,
      zoom: 3.3,
    },
    {
      id: 'walkway',
      label: legends[1]?.title.slice(0, 5) || '街区漫步',
      target: secondaryTarget,
      azimuthDeg: 54,
      polarDeg: 65,
      zoom: 3.0,
    },
    {
      id: 'aerial',
      label: '鸟瞰',
      target: [0, 0, 0],
      azimuthDeg: 45,
      polarDeg: 36,
      zoom: 1.45,
    },
  ];

  // Collect movement paths for living agents
  const vehiclePaths = roads
    .filter((r) => r.kind !== 'footway' && r.points.length >= 2)
    .map((r) => r.points)
    .slice(0, 24);
  const pedestrianPaths = roads
    .filter((r) => r.points.length >= 2)
    .map((r) => r.points)
    .slice(0, 28);
  const boatPaths = waterCenterlines.filter((c) => c.length >= 2).slice(0, 6);

  const climate = buildClimateNote(lat);
  const meta: CityLocationMeta = {
    id: `osm-${lat.toFixed(4)}-${lng.toFixed(4)}`,
    region: geoInfo.region,
    city: geoInfo.city,
    subtitle: geoInfo.subtitle,
    lat,
    lng,
    sliceSizeMeters,
    note: `已实时解析 ${buildings.length} 座建筑、${roads.length} 条街路与 ${waters.length} 处水系。`,
    noteSource: 'OpenStreetMap 实景数据',
    climateNote: climate.note,
    climateSource: climate.source,
    isLiveOSM: true,
    pipelineSource: 'browser_fallback',
    generatedAt: Date.now(),
  };

  return {
    meta,
    halfSize,
    buildings,
    waters,
    roads,
    parks,
    trees,
    legends,
    cameraPresets,
    boatPaths,
    vehiclePaths,
    pedestrianPaths,
  };
}
