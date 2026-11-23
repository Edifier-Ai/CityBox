import gionSceneJson from './pocketExamples/gion/scene.json';
import gionCityJson from './pocketExamples/gion/city.json';
import gionLandmarksRaw from './pocketExamples/gion/landmarks.js?raw';
import portofinoSceneJson from './pocketExamples/portofino/scene.json';
import portofinoCityJson from './pocketExamples/portofino/city.json';
import portofinoLandmarksRaw from './pocketExamples/portofino/landmarks.js?raw';
import { CHENGDU_ANSHUN_BUNDLE } from './pocketChengdu';
import { AMSTERDAM_CANALS_BUNDLE } from './pocketAmsterdam';

export { CHENGDU_ANSHUN_BUNDLE, AMSTERDAM_CANALS_BUNDLE };
import type { InspirationSpot } from './presets';
import type { DioramaSceneData, GalleryEntry } from '../types/city';
import type {
  PocketBuilding,
  PocketCityBundle,
  PocketCityConfig,
  PocketSceneData,
  PocketTreeTuple,
} from '../types/pocketCity';

export const GION_KYOTO_BUNDLE: PocketCityBundle = {
  id: 'gion-kyoto',
  pipelineSource: 'curated',
  scene: gionSceneJson as unknown as PocketSceneData,
  city: {
    ...(gionCityJson as unknown as PocketCityConfig),
    name: '京都 · 祇园白川',
    title: '京都 · 祇园白川',
    region: '日本 · 京都',
    place: '白川运河 · 巽桥',
  },
  landmarksCode: gionLandmarksRaw,
};

export const PORTOFINO_BUNDLE: PocketCityBundle = {
  id: 'portofino',
  pipelineSource: 'curated',
  scene: portofinoSceneJson as unknown as PocketSceneData,
  city: {
    ...(portofinoCityJson as unknown as PocketCityConfig),
    name: '波托菲诺',
    title: '波托菲诺 · 利古里亚',
    region: '意大利 · 利古里亚',
    place: '海港小广场 · 圣马丁教堂',
  },
  landmarksCode: portofinoLandmarksRaw,
};

export const POCKET_PRESETS: PocketCityBundle[] = [
  CHENGDU_ANSHUN_BUNDLE,
  GION_KYOTO_BUNDLE,
  PORTOFINO_BUNDLE,
  AMSTERDAM_CANALS_BUNDLE,
];

export const POCKET_PRESET_MAP: Record<string, PocketCityBundle> = Object.fromEntries(
  POCKET_PRESETS.map((bundle) => [bundle.id, bundle])
);

export function getPocketPresetById(id: string): PocketCityBundle | null {
  return POCKET_PRESET_MAP[id] ?? null;
}

export const POCKET_INSPIRATION_SPOTS: InspirationSpot[] = [
  {
    id: 'chengdu-anshun',
    region: '四川 · 成都',
    city: '成都',
    subtitle: '安顺廊桥·锦江两岸',
    lat: 30.64408,
    lng: 104.08336,
    sliceSizeMeters: 210,
    tag: '水岸廊桥',
    hasInstantPreset: true,
  },
  {
    id: 'gion-kyoto',
    region: '日本 · 京都',
    city: '京都 · 祇园白川',
    subtitle: '白川运河·巽桥町家',
    lat: 35.00572,
    lng: 135.7744,
    sliceSizeMeters: 200,
    tag: '精修馆藏',
    hasInstantPreset: true,
  },
  {
    id: 'portofino',
    region: '意大利 · 利古里亚',
    city: '波托菲诺',
    subtitle: '彩色海港·圣马丁教堂',
    lat: 44.303126,
    lng: 9.209538,
    sliceSizeMeters: 230,
    tag: '精修馆藏',
    hasInstantPreset: true,
  },
  {
    id: 'amsterdam-canals',
    region: '荷兰 · 阿姆斯特丹',
    city: '阿姆斯特丹',
    subtitle: '皇帝运河·七桥水口',
    lat: 52.36339,
    lng: 4.89600,
    sliceSizeMeters: 180,
    tag: '运河山墙',
    hasInstantPreset: true,
  },
  {
    id: 'shanghai-bund',
    region: '上海 · 黄浦',
    city: '上海',
    subtitle: '外滩万国建筑与黄浦江',
    lat: 31.2397,
    lng: 121.4906,
    sliceSizeMeters: 220,
    tag: '江岸历史街区',
  },
  {
    id: 'hangzhou-duanqiao',
    region: '浙江 · 杭州',
    city: '杭州',
    subtitle: '西湖断桥与白堤',
    lat: 30.2588,
    lng: 120.1512,
    sliceSizeMeters: 210,
    tag: '湖畔堤岸',
  },
  {
    id: 'paris-arts',
    region: '法国 · 巴黎',
    city: '巴黎',
    subtitle: '塞纳河·艺术桥与卢浮宫南岸',
    lat: 48.8584,
    lng: 2.3375,
    sliceSizeMeters: 200,
    tag: '古典河岸',
  },
  {
    id: 'tokyo-shibuya',
    region: '日本 · 东京',
    city: '东京',
    subtitle: '涩谷站前全向十字路口',
    lat: 35.6595,
    lng: 139.7004,
    sliceSizeMeters: 200,
    tag: '现代都会',
  },
];

export function buildPocketGalleryEntries(): GalleryEntry[] {
  return POCKET_PRESETS.map((bundle) => ({
    id: bundle.id,
    city: bundle.city.name,
    region: bundle.city.region || bundle.city.place || '',
    subtitle: bundle.city.place || bundle.city.title || '',
    lat: bundle.scene.meta.lat,
    lng: bundle.scene.meta.lon,
    sliceSizeMeters: bundle.scene.meta.size,
    buildingCount: bundle.scene.buildings.length,
    waterCount: bundle.scene.water?.length ?? 0,
    createdAt: bundle.generatedAt ?? 1700000000000,
    isBuiltin: true,
  }));
}

function toPocketRing(pts: Array<{ x: number; z: number }>): [number, number][] {
  return pts.map((p) => [Number(p.x.toFixed(2)), Number((-p.z).toFixed(2))]);
}

function computeObbFromRing(ring: [number, number][]): PocketBuilding['obb'] {
  if (!ring.length) return { c: [0, 0], ax: [1, 0], L: 4, W: 4, fill: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const dx = Math.max(1, maxX - minX);
  const dy = Math.max(1, maxY - minY);
  const longX = dx >= dy;
  return {
    c: [(minX + maxX) / 2, (minY + maxY) / 2],
    ax: longX ? [1, 0] : [0, 1],
    L: longX ? dx : dy,
    W: longX ? dy : dx,
    fill: 0.9,
  };
}

function bufferPolyline(
  pts: Array<{ x: number; z: number }>,
  halfWidth: number
): [number, number][][] {
  if (pts.length < 2) return [];
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = -(b.z - a.z);
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const px = pts[i].x;
    const py = -pts[i].z;
    left.push([Number((px + nx * halfWidth).toFixed(2)), Number((py + ny * halfWidth).toFixed(2))]);
    right.unshift([Number((px - nx * halfWidth).toFixed(2)), Number((py - ny * halfWidth).toFixed(2))]);
  }
  return [[...left, ...right]];
}

/**
 * Bridges legacy OSM/Workshop DioramaSceneData payloads into PocketCityBundle
 * until Phase 3 upgrades server/ and osmService.ts to emit native PocketSceneData.
 */
export function convertLegacyDioramaToPocketBundle(diorama: DioramaSceneData): PocketCityBundle {
  const existing = getPocketPresetById(diorama.meta.id);
  if (existing && !diorama.meta.isLiveOSM && diorama.meta.pipelineSource === 'curated') {
    return existing;
  }

  const size = Math.max(120, Math.min(280, diorama.meta.sliceSizeMeters || 200));
  const half = size / 2;

  const buildings: PocketBuilding[] = diorama.buildings
    .filter((b) => (b.rings?.[0]?.length ?? 0) >= 3)
    .map((b) => {
      const ring = toPocketRing(b.rings[0]);
      const holes = b.rings.slice(1).map((h) => toPocketRing(h));
      const roof =
        b.roofStyle === 'gable_slate' || b.roofStyle === 'gable_terracotta' || b.roofStyle === 'stepped_gable'
          ? 'gabled'
          : b.roofStyle === 'hipped_eaves'
            ? 'hipped'
            : 'flat';
      return {
        id: b.id,
        ring,
        holes: holes.length ? holes : undefined,
        kind: 'building',
        type: b.facadeStyle === 'glass_tower' ? 'commercial' : 'yes',
        h: b.height,
        lv: b.levels,
        min: b.baseElevation ?? 0,
        roof,
        col: b.wallColor,
        rcol: b.roofColor,
        n: b.name,
        famous: b.archetype === 'covered_bridge' || b.archetype === 'pavilion' || b.archetype === 'tower',
        obb: computeObbFromRing(ring),
      };
    });

  const roads = diorama.roads
    .filter((r) => r.kind !== 'footway')
    .map((r) => bufferPolyline(r.points, Math.max(1.8, (r.width || 6) / 2)))
    .filter((g) => g.length > 0);

  const paths = diorama.roads
    .filter((r) => r.kind === 'footway')
    .map((r) => bufferPolyline(r.points, Math.max(1.2, (r.width || 3) / 2)))
    .filter((g) => g.length > 0);

  const water = diorama.waters.flatMap((w) =>
    w.polygons
      .filter((poly) => (poly[0]?.length ?? 0) >= 3)
      .map((poly) => poly.map((ring) => toPocketRing(ring)))
  );

  const lawns = diorama.parks
    .filter((p) => (p.rings?.[0]?.length ?? 0) >= 3)
    .map((p) => ({ kind: 'park', r: p.rings.map((ring) => toPocketRing(ring)) }));

  const trees: PocketTreeTuple[] = diorama.trees.map((t) => [
    Number(t.x.toFixed(2)),
    Number((-t.z).toFixed(2)),
    0,
    String(Number(((t.scale || 1) * 7.5).toFixed(1))),
    t.variant === 1 ? 'Ginkgo' : t.variant === 2 ? 'Willow' : 'Broadleaf',
  ]);

  const routes = diorama.roads
    .filter((r) => r.points.length >= 2)
    .slice(0, 12)
    .map((r) => ({
      kind: (r.kind === 'footway' ? 'ped' : 'car') as 'car' | 'ped',
      name: r.name || '',
      p: toPocketRing(r.points),
    }));

  const centerlines = diorama.roads
    .filter((r) => r.kind === 'primary' && r.points.length >= 2)
    .slice(0, 6)
    .map((r) => ({
      name: r.name || '',
      p: toPocketRing(r.points),
    }));

  const scene: PocketSceneData = {
    meta: {
      lat: diorama.meta.lat,
      lon: diorama.meta.lng,
      rotation: 0,
      size,
      half,
      north: [0, 1, 0],
      drive: 'right',
      place: `${diorama.meta.city} · ${diorama.meta.subtitle}`,
      level: 3.1,
    },
    corners: [
      [half, -half],
      [half, half],
      [-half, half],
      [-half, -half],
    ],
    buildings,
    roads,
    paths,
    walk: [],
    lawns,
    water,
    sand: [],
    rails: [],
    trees,
    species: ['Broadleaf', 'Ginkgo', 'Willow'],
    boats: [],
    routes,
    centerlines,
    markings: [],
    pois: [],
    furniture: [],
  };

  const city: PocketCityConfig = {
    name: diorama.meta.city,
    title: `${diorama.meta.city} · ${diorama.meta.subtitle}`,
    region: diorama.meta.region,
    place: diorama.meta.subtitle,
    level: 3.1,
    styles: {
      default: {
        facade: 'stucco',
        wall: ['#eee3cd', '#e6d8be', '#dfd1b6'],
        roof: 'auto',
        roofColour: ['#747a82', '#9c6652', '#c8c0b2'],
        roofTex: 'tiles',
        levels: 3,
        floor: 3.1,
        shop: 'street',
        rectFill: 0.72,
      },
    },
    palette: {
      ground: '#ede3cd',
      road: '#b5aeb2',
      pavement: '#e5dac3',
      walk: '#ded2ba',
      grass: '#a8cf7a',
      water: '#76b5bc',
      slab: '#d8c6a3',
      marking: '#f5efe2',
      kerb: '#d8ceb9',
      paving: '#c6baa7',
    },
    paving: { style: 'tiles', size: 0.6 },
    trees: {
      default: { style: 3, colours: ['#7fb166', '#97bf73'], height: 7.5, autumn: '#db9c3f' },
      rules: [
        { match: 'Ginkgo', style: 3, colours: ['#7aa862'], height: 8, autumn: '#eab53c' },
        { match: 'Willow', style: 4, colours: ['#8cc26c'], height: 8.2, spring: '#b8e37b' },
      ],
    },
    isoLabel: '街区全景',
    seasons: [
      {
        id: 'spring',
        label: '春日新绿',
        leaves: 'spring',
        crowd: 1.2,
        note: { text: diorama.meta.note, source: diorama.meta.noteSource, url: 'https://www.openstreetmap.org/' },
      },
      {
        id: 'summer',
        label: '盛夏骤雨',
        leaves: 'summer',
        wet: true,
        umbrellas: true,
        wx: 'rain',
        crowd: 0.85,
        note: { text: diorama.meta.climateNote, source: diorama.meta.climateSource, url: 'https://www.openstreetmap.org/' },
      },
      {
        id: 'autumn',
        label: '深秋晴岚',
        leaves: 'autumn',
        crowd: 1.1,
        note: { text: diorama.meta.note, source: diorama.meta.noteSource, url: 'https://www.openstreetmap.org/' },
      },
      {
        id: 'winter',
        label: '冬日疏林',
        leaves: 'bare',
        coats: true,
        crowd: 0.75,
        note: { text: diorama.meta.climateNote, source: diorama.meta.climateSource, url: 'https://www.openstreetmap.org/' },
      },
    ],
    occasions: [
      {
        id: 'night_tour',
        label: '夜游灯火',
        leaves: 'summer',
        night: 0.9,
        litShare: 0.65,
        crowd: 1.4,
        decor: { fairy: ['#ffda8f', '#ffbe6b'] },
        note: { text: diorama.meta.note, source: diorama.meta.noteSource, url: 'https://www.openstreetmap.org/' },
      },
      {
        id: 'festival',
        label: diorama.meta.specialSceneLabel || '节日庆典',
        leaves: 'spring',
        crowd: 1.6,
        decor: { bunting: ['#d45842', '#eab349', '#4a7a63'] },
        note: { text: diorama.meta.note, source: diorama.meta.noteSource, url: 'https://www.openstreetmap.org/' },
      },
    ],
    views: (diorama.cameraPresets || []).slice(1, 4).map((p) => ({
      id: p.id,
      label: p.label,
      camera: { yaw: -35, pitch: 29, zoom: 2.8, x: p.target[0], y: -p.target[2], z: 3 },
    })),
    legend: (diorama.legends || []).map((l) => ({
      name: l.title,
      source: l.subtitle,
      icon: l.kind === 'water' ? 'water' : l.kind === 'park' ? 'trees' : l.kind === 'road' ? 'streets' : 'landmark',
      camera: { yaw: -35, pitch: 29, zoom: 3.1, x: l.target[0], y: -l.target[2], z: 3 },
    })),
  };

  return {
    id: diorama.meta.id,
    scene,
    city,
    pipelineSource: diorama.meta.pipelineSource ?? 'browser_fallback',
    generatedAt: diorama.meta.generatedAt,
    isLiveOSM: diorama.meta.isLiveOSM,
  };
}
