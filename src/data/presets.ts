import type {
  DioramaBuilding,
  DioramaSceneData,
  DioramaTree,
  FacadeStyle,
  RoofStyle,
  Vec2,
} from '../types/city';

export interface InspirationSpot {
  id: string;
  region: string;
  city: string;
  subtitle: string;
  lat: number;
  lng: number;
  sliceSizeMeters: number;
  tag: string;
  hasInstantPreset?: boolean;
}

export const INSPIRATION_SPOTS: InspirationSpot[] = [
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
    id: 'kyoto-kamogawa',
    region: '日本 · 京都',
    city: '京都',
    subtitle: '鸭川四条·木屋町通',
    lat: 35.0037,
    lng: 135.7715,
    sliceSizeMeters: 180,
    tag: '古都水巷',
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

function makeRect(cx: number, cz: number, w: number, d: number, angleDeg = 0): Vec2[] {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = w / 2;
  const hd = d / 2;
  const corners: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return corners.map(([lx, lz]) => ({
    x: cx + lx * cos - lz * sin,
    z: cz + lx * sin + lz * cos,
  }));
}

interface BuildingOpts {
  id: string;
  cx: number;
  cz: number;
  w: number;
  d: number;
  height: number;
  archetype: DioramaBuilding['archetype'];
  wallColor: string;
  roofColor: string;
  facadeStyle?: FacadeStyle;
  roofStyle?: RoofStyle;
  accentColor?: string;
  hasDormers?: boolean;
  angleDeg?: number;
  name?: string;
  seed?: number;
}

function makeBuilding(opts: BuildingOpts): DioramaBuilding {
  return {
    id: opts.id,
    name: opts.name,
    rings: [makeRect(opts.cx, opts.cz, opts.w, opts.d, opts.angleDeg ?? 0)],
    height: opts.height,
    levels: Math.max(1, Math.round(opts.height / 3.2)),
    archetype: opts.archetype,
    facadeStyle: opts.facadeStyle,
    roofStyle: opts.roofStyle,
    wallColor: opts.wallColor,
    roofColor: opts.roofColor,
    accentColor: opts.accentColor,
    hasDormers: opts.hasDormers,
    center: { x: opts.cx, z: opts.cz },
    seed: opts.seed ?? 1,
  };
}

/**
 * Curated high-craft 210m x 210m preset for Chengdu Anshun Covered Bridge & Jinjiang River.
 */
export function buildChengduAnshunPreset(): DioramaSceneData {
  const halfSize = 105;

  // Jinjiang River flowing diagonally across the 210m slice
  const riverPoly: Vec2[] = [
    { x: -105, z: -43 },
    { x: -45, z: -34 },
    { x: 15, z: -22 },
    { x: 70, z: -12 },
    { x: 105, z: -5 },
    { x: 105, z: 36 },
    { x: 60, z: 28 },
    { x: 5, z: 18 },
    { x: -55, z: 6 },
    { x: -105, z: -2 },
  ];

  const riverCenterline: Vec2[] = [
    { x: -98, z: -22 },
    { x: -45, z: -14 },
    { x: 8, z: -3 },
    { x: 62, z: 8 },
    { x: 98, z: 15 },
  ];

  const buildings: DioramaBuilding[] = [
    // Hero Landmark: 安顺廊桥 spanning the Jinjiang River
    {
      id: 'anshun-bridge',
      name: '安顺廊桥',
      rings: [makeRect(4, -5, 13, 58, 11)],
      height: 12.8,
      levels: 3,
      archetype: 'covered_bridge',
      facadeStyle: 'traditional_timber',
      roofStyle: 'hipped_eaves',
      wallColor: '#c9b4a2',
      roofColor: '#363b4c',
      accentColor: '#e8b968',
      center: { x: 4, z: -5 },
      seed: 7.7,
      baseElevation: 0,
      bridgeArches: 3,
    },

    // North bank waterfront pavilions & historic Shuijingfang quarter
    makeBuilding({
      id: 'pav-1',
      cx: -26,
      cz: -46,
      w: 14,
      d: 11,
      height: 8.6,
      archetype: 'pavilion',
      facadeStyle: 'traditional_timber',
      roofStyle: 'hipped_eaves',
      wallColor: '#d6c4b3',
      roofColor: '#3b4152',
      accentColor: '#e6b766',
      angleDeg: 11,
      name: '锦江茶肆',
      seed: 10.1,
    }),
    makeBuilding({
      id: 'pav-2',
      cx: 34,
      cz: -36,
      w: 16,
      d: 12,
      height: 9.4,
      archetype: 'pavilion',
      facadeStyle: 'traditional_timber',
      roofStyle: 'hipped_eaves',
      wallColor: '#d9c8b8',
      roofColor: '#3b4152',
      accentColor: '#e6b766',
      angleDeg: 11,
      name: '安顺驿馆',
      seed: 11.2,
    }),
    makeBuilding({
      id: 'n-1',
      cx: -78,
      cz: -74,
      w: 30,
      d: 20,
      height: 17,
      archetype: 'modern',
      facadeStyle: 'plaster_modern',
      roofStyle: 'flat_parapet',
      wallColor: '#c8a6a0',
      roofColor: '#9b837e',
      angleDeg: 11,
      name: '合江亭社区',
      seed: 1.2,
    }),
    makeBuilding({
      id: 'n-2',
      cx: -38,
      cz: -70,
      w: 34,
      d: 22,
      height: 20,
      archetype: 'modern',
      facadeStyle: 'plaster_modern',
      roofStyle: 'flat_parapet',
      wallColor: '#bfa3a1',
      roofColor: '#947c7b',
      angleDeg: 11,
      name: '水井坊片区',
      seed: 2.4,
    }),
    makeBuilding({
      id: 'n-3',
      cx: 6,
      cz: -61,
      w: 36,
      d: 22,
      height: 22,
      archetype: 'modern',
      facadeStyle: 'plaster_modern',
      roofStyle: 'flat_parapet',
      wallColor: '#ccb0a9',
      roofColor: '#9c8380',
      angleDeg: 11,
      name: '滨江住宅群',
      seed: 3.1,
    }),
    makeBuilding({
      id: 'n-4',
      cx: 52,
      cz: -53,
      w: 34,
      d: 21,
      height: 19,
      archetype: 'modern',
      facadeStyle: 'plaster_modern',
      roofStyle: 'flat_parapet',
      wallColor: '#c3a7a4',
      roofColor: '#927b79',
      angleDeg: 11,
      name: '望江楼北岸',
      seed: 4.5,
    }),
    makeBuilding({
      id: 'n-5',
      cx: 87,
      cz: -46,
      w: 24,
      d: 22,
      height: 23,
      archetype: 'modern',
      facadeStyle: 'plaster_modern',
      roofStyle: 'flat_parapet',
      wallColor: '#cbb3aa',
      roofColor: '#8f7b77',
      angleDeg: 11,
      name: '东门大桥北',
      seed: 5.2,
    }),
    makeBuilding({
      id: 'n-6',
      cx: -72,
      cz: -94,
      w: 32,
      d: 14,
      height: 14,
      archetype: 'pitched',
      facadeStyle: 'traditional_timber',
      roofStyle: 'hipped_eaves',
      wallColor: '#d5c6b8',
      roofColor: '#4c5264',
      angleDeg: 11,
      seed: 6.1,
    }),
    makeBuilding({
      id: 'n-7',
      cx: -20,
      cz: -92,
      w: 38,
      d: 15,
      height: 18,
      archetype: 'modern',
      facadeStyle: 'plaster_modern',
      roofStyle: 'flat_parapet',
      wallColor: '#c7b4ac',
      roofColor: '#8b7e7c',
      angleDeg: 11,
      seed: 7.3,
    }),
    makeBuilding({
      id: 'n-8',
      cx: 32,
      cz: -83,
      w: 34,
      d: 16,
      height: 17,
      archetype: 'modern',
      facadeStyle: 'plaster_modern',
      roofStyle: 'flat_parapet',
      wallColor: '#cbb8b0',
      roofColor: '#92807e',
      angleDeg: 11,
      seed: 8.8,
    }),
    makeBuilding({
      id: 'n-9',
      cx: 76,
      cz: -76,
      w: 28,
      d: 16,
      height: 20,
      archetype: 'modern',
      facadeStyle: 'plaster_modern',
      roofStyle: 'flat_parapet',
      wallColor: '#c2a9a5',
      roofColor: '#877675',
      angleDeg: 11,
      seed: 9.4,
    }),

    // South bank blocks behind Binjiang East Road
    makeBuilding({
      id: 's-1',
      cx: -76,
      cz: 70,
      w: 32,
      d: 20,
      height: 19,
      archetype: 'modern',
      facadeStyle: 'plaster_modern',
      roofStyle: 'flat_parapet',
      wallColor: '#cbb3aa',
      roofColor: '#8e7c79',
      angleDeg: 11,
      name: '大川巷片区',
      seed: 12.4,
    }),
    makeBuilding({
      id: 's-2',
      cx: -34,
      cz: 77,
      w: 36,
      d: 21,
      height: 22,
      archetype: 'modern',
      facadeStyle: 'plaster_modern',
      roofStyle: 'flat_parapet',
      wallColor: '#c4a6a2',
      roofColor: '#897474',
      angleDeg: 11,
      name: '九眼桥西区',
      seed: 13.7,
    }),
    makeBuilding({
      id: 's-3',
      cx: 16,
      cz: 84,
      w: 40,
      d: 22,
      height: 20,
      archetype: 'modern',
      facadeStyle: 'plaster_modern',
      roofStyle: 'flat_parapet',
      wallColor: '#d2beb4',
      roofColor: '#94827f',
      angleDeg: 11,
      name: '南岸雅居',
      seed: 14.9,
    }),
    makeBuilding({
      id: 's-4',
      cx: 68,
      cz: 89,
      w: 36,
      d: 20,
      height: 21,
      archetype: 'modern',
      facadeStyle: 'plaster_modern',
      roofStyle: 'flat_parapet',
      wallColor: '#c7aba6',
      roofColor: '#897574',
      angleDeg: 11,
      name: '锦江南岸',
      seed: 15.6,
    }),
    makeBuilding({
      id: 's-5',
      cx: -56,
      cz: 95,
      w: 28,
      d: 13,
      height: 12,
      archetype: 'pitched',
      facadeStyle: 'traditional_timber',
      roofStyle: 'hipped_eaves',
      wallColor: '#dcd0c2',
      roofColor: '#494e5f',
      angleDeg: 11,
      seed: 16.2,
    }),
    makeBuilding({
      id: 's-6',
      cx: 46,
      cz: 61,
      w: 16,
      d: 11,
      height: 8.8,
      archetype: 'pavilion',
      facadeStyle: 'traditional_timber',
      roofStyle: 'hipped_eaves',
      wallColor: '#d8c7b6',
      roofColor: '#3a4052',
      accentColor: '#e6b766',
      angleDeg: 11,
      name: '南岸茶亭',
      seed: 17.5,
    }),
  ];

  const southAvenue: Vec2[] = [
    { x: -105, z: 27 },
    { x: -50, z: 37 },
    { x: 5, z: 48 },
    { x: 60, z: 58 },
    { x: 105, z: 66 },
  ];

  const northRoad: Vec2[] = [
    { x: -105, z: -53 },
    { x: -48, z: -42 },
    { x: 8, z: -31 },
    { x: 62, z: -21 },
    { x: 105, z: -13 },
  ];

  const southPromenade: Vec2[] = [
    { x: -103, z: 8 },
    { x: -52, z: 17 },
    { x: 5, z: 27 },
    { x: 62, z: 38 },
    { x: 103, z: 46 },
  ];

  const northPromenade: Vec2[] = [
    { x: -103, z: -46 },
    { x: -48, z: -36 },
    { x: 8, z: -25 },
    { x: 62, z: -15 },
    { x: 103, z: -7 },
  ];

  const crossStreetWest: Vec2[] = [
    { x: -56, z: -102 },
    { x: -61, z: -45 },
  ];

  const crossStreetSouth: Vec2[] = [
    { x: -7, z: 45 },
    { x: -17, z: 102 },
  ];

  const trees: DioramaTree[] = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const x = -96 + t * 192;
    const zSouth = 16 + t * 38;
    const zNorth = -48 + t * 38;
    if (Math.abs(x - 4) > 15) {
      trees.push({
        x,
        z: zSouth,
        scale: 0.78 + ((i * 37) % 10) * 0.02,
        variant: (i % 3) as 0 | 1 | 2,
      });
      trees.push({
        x: x + 2,
        z: zNorth,
        scale: 0.75 + ((i * 29) % 10) * 0.02,
        variant: ((i + 1) % 3) as 0 | 1 | 2,
      });
    }
    if (i % 2 === 0 && Math.abs(x - 5) > 16) {
      trees.push({
        x: x - 3,
        z: zSouth + 21,
        scale: 0.72 + ((i * 19) % 7) * 0.022,
        variant: ((i + 2) % 3) as 0 | 1 | 2,
      });
    }
  }

  return {
    meta: {
      id: 'chengdu-anshun',
      region: '四川 · 成都',
      city: '成都',
      subtitle: '安顺廊桥·锦江两岸',
      lat: 30.64408,
      lng: 104.08336,
      sliceSizeMeters: 210,
      note: '夜游锦江的游线经过安顺廊桥。',
      noteSource: '红星新闻网',
      climateNote: '成都的降水主要集中在七、八月。',
      climateSource: '中国天气网',
      isLiveOSM: false,
      specialSceneLabel: '锦江灯夜',
      specialFestivalTheme: 'lantern_night',
      pipelineSource: 'curated',
    },
    halfSize,
    buildings,
    waters: [
      {
        id: 'jinjiang-river',
        name: '锦江',
        polygons: [[riverPoly]],
        centerlines: [riverCenterline],
      },
    ],
    roads: [
      {
        id: 'binjiang-east-road',
        name: '滨江东路',
        points: southAvenue,
        width: 11,
        kind: 'primary',
      },
      {
        id: 'north-bank-road',
        name: '东大街水井坊段',
        points: northRoad,
        width: 8.5,
        kind: 'secondary',
      },
      {
        id: 'south-promenade',
        name: '锦江滨水步道',
        points: southPromenade,
        width: 4,
        kind: 'footway',
      },
      {
        id: 'north-promenade',
        name: '北岸亲水步道',
        points: northPromenade,
        width: 3.6,
        kind: 'footway',
      },
      {
        id: 'cross-west',
        points: crossStreetWest,
        width: 6.5,
        kind: 'residential',
      },
      {
        id: 'cross-south',
        points: crossStreetSouth,
        width: 7,
        kind: 'residential',
      },
    ],
    parks: [
      {
        id: 'south-greenbelt',
        name: '锦江绿带',
        rings: [
          [
            { x: -105, z: 2 },
            { x: 105, z: 39 },
            { x: 105, z: 61 },
            { x: -105, z: 22 },
          ],
        ],
      },
      {
        id: 'north-greenbelt',
        name: '北岸绿带',
        rings: [
          [
            { x: -105, z: -51 },
            { x: 105, z: -12 },
            { x: 105, z: -5 },
            { x: -105, z: -43 },
          ],
        ],
      },
    ],
    trees,
    legends: [
      {
        id: 'legend-bridge',
        title: '安顺廊桥',
        subtitle: '三道石拱 · 飞檐廊阁',
        kind: 'landmark',
        target: [4, 6, -5],
      },
      {
        id: 'legend-river',
        title: '锦江',
        subtitle: '滨水步道与夜游画舫',
        kind: 'water',
        target: [-26, 0, -9],
      },
      {
        id: 'legend-road',
        title: '滨江东路',
        subtitle: '南岸林荫街道',
        kind: 'road',
        target: [5, 0, 48],
      },
    ],
    cameraPresets: [
      {
        id: 'tour',
        label: '巡游',
        target: [0, 3, 0],
        azimuthDeg: 38,
        polarDeg: 58,
        zoom: 2.35,
      },
      {
        id: 'landmark',
        label: '廊桥近景',
        target: [4, 6, -5],
        azimuthDeg: 28,
        polarDeg: 62,
        zoom: 3.4,
      },
      {
        id: 'walkway',
        label: '滨江步道',
        target: [-14, 2, 26],
        azimuthDeg: 52,
        polarDeg: 66,
        zoom: 3.15,
      },
      {
        id: 'aerial',
        label: '鸟瞰',
        target: [0, 0, 0],
        azimuthDeg: 45,
        polarDeg: 38,
        zoom: 1.52,
      },
    ],
    boatPaths: [riverCenterline],
    vehiclePaths: [southAvenue, northRoad],
    pedestrianPaths: [southPromenade, northPromenade],
  };
}

/**
 * Curated high-craft 180m x 180m preset for Amsterdam Keizersgracht & Reguliersgracht
 * canal junction ("Seven Bridges" corner), featuring narrow stepped-gable brick canal houses,
 * roof dormers, arched stone/brick bridges, and King's Day festival theme.
 */
export function buildAmsterdamCanalsPreset(): DioramaSceneData {
  const halfSize = 90;

  // Keizersgracht (east-west) & Reguliersgracht (north-south) intersecting at (0, -8)
  const keizersgrachtPoly: Vec2[] = [
    { x: -90, z: -21 },
    { x: 0, z: -19 },
    { x: 90, z: -21 },
    { x: 90, z: 3 },
    { x: 0, z: 5 },
    { x: -90, z: 3 },
  ];

  const reguliersgrachtPoly: Vec2[] = [
    { x: -10, z: -90 },
    { x: 10, z: -90 },
    { x: 10, z: 90 },
    { x: -10, z: 90 },
  ];

  const keizerLabelLine: Vec2[] = [
    { x: -86, z: -10 },
    { x: -15, z: -8 },
  ];
  const regulierLabelLine: Vec2[] = [
    { x: 0, z: 14 },
    { x: 0, z: 86 },
  ];

  const keizerBoatPath: Vec2[] = [
    { x: -86, z: -10 },
    { x: 0, z: -8 },
    { x: 86, z: -10 },
  ];
  const regulierBoatPath: Vec2[] = [
    { x: 0, z: -86 },
    { x: 0, z: -8 },
    { x: 0, z: 86 },
  ];
  const turnBoatPath: Vec2[] = [
    { x: -86, z: -10 },
    { x: -6, z: -8 },
    { x: 0, z: 2 },
    { x: 0, z: 86 },
  ];

  const wallPalette = [
    '#8f493b',
    '#663a35',
    '#433e45',
    '#b38c5a',
    '#a35843',
    '#576057',
    '#7a463d',
    '#c7baa8',
  ];
  const roofPalette = ['#3b4150', '#483f42', '#995542', '#333947'];

  const buildings: DioramaBuilding[] = [];

  // Helper to lay out narrow Dutch canal houses (narrow front along canal, deep perpendicular)
  const addCanalRow = (
    prefix: string,
    xs: number[],
    zCenter: number,
    baseHeight: number,
    facingAxis: 'z' | 'x' = 'z'
  ) => {
    xs.forEach((pos, idx) => {
      const seed = idx * 3.7 + Math.abs(zCenter) * 0.21;
      const w = 7.4 + ((idx * 17) % 3) * 0.8;
      const d = 14.5 + ((idx * 13) % 4) * 1.1;
      const h = baseHeight + ((idx * 11) % 5) * 1.3;
      const roofKind: RoofStyle =
        idx % 5 === 2 ? 'gable_slate' : idx % 7 === 4 ? 'gable_terracotta' : 'stepped_gable';
      const wallColor = wallPalette[(idx + Math.round(Math.abs(zCenter))) % wallPalette.length];
      const roofColor =
        roofKind === 'gable_terracotta'
          ? '#9b5743'
          : roofPalette[(idx + 1) % roofPalette.length];

      buildings.push(
        makeBuilding({
          id: `${prefix}-${idx}`,
          cx: facingAxis === 'z' ? pos : zCenter,
          cz: facingAxis === 'z' ? zCenter : pos,
          w: facingAxis === 'z' ? w : d,
          d: facingAxis === 'z' ? d : w,
          height: h,
          archetype: 'pitched',
          facadeStyle: 'brick_canal',
          roofStyle: roofKind,
          wallColor,
          roofColor,
          accentColor: idx % 3 === 0 ? '#efe6d5' : undefined,
          hasDormers: idx % 4 !== 1,
          seed,
        })
      );
    });
  };

  // North Keizersgracht canal-front rowhouses (NW & NE)
  addCanalRow('knw', [-80, -71, -62, -53, -44, -35, -26], -38, 12.2);
  addCanalRow('kne', [26, 35, 44, 53, 62, 71, 80], -38, 12.6);

  // South Keizersgracht canal-front rowhouses (SW & SE)
  addCanalRow('ksw', [-80, -71, -62, -53, -44, -35, -26], 23, 12.5);
  addCanalRow('kse', [26, 35, 44, 53, 62, 71, 80], 23, 12.0);

  // Reguliersgracht-facing rowhouses (North & South blocks, narrow gable facing X=0 canal)
  addCanalRow('rnw', [-78, -68, -58], -26, 11.8, 'x');
  addCanalRow('rne', [-78, -68, -58], 26, 12.1, 'x');
  addCanalRow('rsw', [44, 54, 64, 74], -26, 12.4, 'x');
  addCanalRow('rse', [44, 54, 64, 74], 26, 11.9, 'x');

  // Corner Guild House & Historic Merchant Warehouse landmarks
  buildings.push(
    makeBuilding({
      id: 'guild-corner-nw',
      cx: -48,
      cz: -72,
      w: 22,
      d: 14,
      height: 16.2,
      archetype: 'pitched',
      facadeStyle: 'stone_classic',
      roofStyle: 'hipped_eaves',
      wallColor: '#cfc1ae',
      roofColor: '#3a4252',
      accentColor: '#e6b868',
      hasDormers: true,
      name: '皇帝运河商馆',
      seed: 42.1,
    }),
    makeBuilding({
      id: 'warehouse-se',
      cx: 56,
      cz: 66,
      w: 18,
      d: 14,
      height: 15.6,
      archetype: 'pitched',
      facadeStyle: 'brick_canal',
      roofStyle: 'stepped_gable',
      wallColor: '#7a4038',
      roofColor: '#383d4d',
      accentColor: '#efe6d5',
      hasDormers: true,
      name: '荷兰东印度仓库',
      seed: 55.4,
    }),
    makeBuilding({
      id: 'church-spire-ne',
      cx: 62,
      cz: -74,
      w: 15,
      d: 15,
      height: 24.5,
      archetype: 'tower',
      facadeStyle: 'stone_classic',
      roofStyle: 'hipped_eaves',
      wallColor: '#cbbba6',
      roofColor: '#384050',
      accentColor: '#e6b868',
      name: '南钟楼',
      seed: 68.3,
    })
  );

  // Roads: North/South Keizersgracht quays + West/East Reguliersgracht quays + 4 arched bridges
  const northQuayWest: Vec2[] = [
    { x: -90, z: -26 },
    { x: -13, z: -25 },
  ];
  const northBridge: Vec2[] = [
    { x: -13, z: -25 },
    { x: 0, z: -25 },
    { x: 13, z: -25 },
  ];
  const northQuayEast: Vec2[] = [
    { x: 13, z: -25 },
    { x: 90, z: -26 },
  ];

  const southQuayWest: Vec2[] = [
    { x: -90, z: 10 },
    { x: -13, z: 11 },
  ];
  const southBridge: Vec2[] = [
    { x: -13, z: 11 },
    { x: 0, z: 11 },
    { x: 13, z: 11 },
  ];
  const southQuayEast: Vec2[] = [
    { x: 13, z: 11 },
    { x: 90, z: 10 },
  ];

  const westQuayNorth: Vec2[] = [
    { x: -15, z: -90 },
    { x: -15, z: -22 },
  ];
  const westBridge: Vec2[] = [
    { x: -15, z: -22 },
    { x: -15, z: -8 },
    { x: -15, z: 7 },
  ];
  const westQuaySouth: Vec2[] = [
    { x: -15, z: 7 },
    { x: -15, z: 90 },
  ];

  const eastQuayNorth: Vec2[] = [
    { x: 15, z: -90 },
    { x: 15, z: -22 },
  ];
  const eastBridge: Vec2[] = [
    { x: 15, z: -22 },
    { x: 15, z: -8 },
    { x: 15, z: 7 },
  ];
  const eastQuaySouth: Vec2[] = [
    { x: 15, z: 7 },
    { x: 15, z: 90 },
  ];

  // Quay walkways
  const northPromenadeWest: Vec2[] = [
    { x: -88, z: -21.5 },
    { x: -18, z: -20.5 },
  ];
  const southPromenadeEast: Vec2[] = [
    { x: 18, z: 5.5 },
    { x: 88, z: 4.5 },
  ];

  // Rhythmic Dutch canal elm trees along embankments (kept clear of water & buildings)
  const trees: DioramaTree[] = [];
  for (const x of [-82, -68, -54, -40, -26, 26, 40, 54, 68, 82]) {
    trees.push({ x, z: -22.2, scale: 0.72 + ((Math.abs(x) * 7) % 5) * 0.03, variant: (Math.abs(x) % 3) as 0 | 1 | 2 });
    trees.push({ x: x + 2, z: 6.2, scale: 0.74 + ((Math.abs(x) * 5) % 5) * 0.03, variant: ((Math.abs(x) + 1) % 3) as 0 | 1 | 2 });
  }
  for (const z of [-80, -64, -48, 22, 38, 54, 70, 82]) {
    trees.push({ x: -11.8, z, scale: 0.7 + ((Math.abs(z) * 3) % 5) * 0.03, variant: (Math.abs(z) % 3) as 0 | 1 | 2 });
    trees.push({ x: 11.8, z: z + 2, scale: 0.72 + ((Math.abs(z) * 9) % 5) * 0.03, variant: ((Math.abs(z) + 2) % 3) as 0 | 1 | 2 });
  }
  // Courtyard garden trees inside the 4 urban blocks
  trees.push(
    { x: -56, z: -56, scale: 0.85, variant: 0 },
    { x: -42, z: -56, scale: 0.78, variant: 1 },
    { x: 44, z: -56, scale: 0.82, variant: 2 },
    { x: -56, z: 54, scale: 0.86, variant: 1 },
    { x: -44, z: 66, scale: 0.76, variant: 0 },
    { x: 46, z: 46, scale: 0.8, variant: 2 }
  );

  return {
    meta: {
      id: 'amsterdam-canals',
      region: '荷兰 · 阿姆斯特丹',
      city: '阿姆斯特丹',
      subtitle: '皇帝运河·七桥水口',
      lat: 52.36339,
      lng: 4.89600,
      sliceSizeMeters: 180,
      note: '皇帝运河与雷古里尔斯运河交汇处的拱桥与阶梯山墙连排屋。',
      noteSource: '阿姆斯特丹运河遗产志',
      climateNote: '北海海洋性气候令运河四季湿润，秋日榆树叶落成金。',
      climateSource: '荷兰皇家气象研究所',
      isLiveOSM: false,
      specialSceneLabel: '国王节',
      specialFestivalTheme: 'kings_day',
      pipelineSource: 'curated',
    },
    halfSize,
    buildings,
    waters: [
      {
        id: 'keizersgracht',
        name: '皇帝运河',
        polygons: [[keizersgrachtPoly]],
        centerlines: [keizerLabelLine],
      },
      {
        id: 'reguliersgracht',
        name: '雷古利尔斯运河',
        polygons: [[reguliersgrachtPoly]],
        centerlines: [regulierLabelLine],
      },
    ],
    roads: [
      { id: 'keizer-nq-w', name: 'Keizersgracht Noord', points: northQuayWest, width: 6.5, kind: 'secondary' },
      { id: 'keizer-n-bridge', name: 'Reguliersgracht Noordbrug', points: northBridge, width: 7.5, kind: 'secondary', isBridge: true, bridgeHeight: 4.3, bridgeArches: 1 },
      { id: 'keizer-nq-e', points: northQuayEast, width: 6.5, kind: 'secondary' },
      { id: 'keizer-sq-w', name: 'Keizersgracht Zuid', points: southQuayWest, width: 6.5, kind: 'secondary' },
      { id: 'keizer-s-bridge', name: 'Brug 39', points: southBridge, width: 7.5, kind: 'secondary', isBridge: true, bridgeHeight: 4.3, bridgeArches: 1 },
      { id: 'keizer-sq-e', points: southQuayEast, width: 6.5, kind: 'secondary' },
      { id: 'reg-wq-n', points: westQuayNorth, width: 6.0, kind: 'residential' },
      { id: 'reg-w-bridge', name: 'Brug 38', points: westBridge, width: 7.2, kind: 'secondary', isBridge: true, bridgeHeight: 4.6, bridgeArches: 3 },
      { id: 'reg-wq-s', points: westQuaySouth, width: 6.0, kind: 'residential' },
      { id: 'reg-eq-n', points: eastQuayNorth, width: 6.0, kind: 'residential' },
      { id: 'reg-e-bridge', name: 'Brug 40', points: eastBridge, width: 7.2, kind: 'secondary', isBridge: true, bridgeHeight: 4.6, bridgeArches: 3 },
      { id: 'reg-eq-s', points: eastQuaySouth, width: 6.0, kind: 'residential' },
      { id: 'prom-nw', points: northPromenadeWest, width: 2.8, kind: 'footway' },
      { id: 'prom-se', points: southPromenadeEast, width: 2.8, kind: 'footway' },
    ],
    parks: [
      {
        id: 'keizer-courtyard-nw',
        name: 'Keizershof',
        rings: [[{ x: -72, z: -64 }, { x: -34, z: -64 }, { x: -34, z: -48 }, { x: -72, z: -48 }]],
      },
      {
        id: 'keizer-courtyard-ne',
        name: 'Tuin Oost',
        rings: [[{ x: 34, z: -64 }, { x: 74, z: -64 }, { x: 74, z: -48 }, { x: 34, z: -48 }]],
      },
      {
        id: 'keizer-courtyard-sw',
        name: 'Reguliershof',
        rings: [[{ x: -72, z: 36 }, { x: -34, z: 36 }, { x: -34, z: 74 }, { x: -72, z: 74 }]],
      },
      {
        id: 'keizer-courtyard-se',
        name: 'Grachtentuin',
        rings: [[{ x: 34, z: 36 }, { x: 74, z: 36 }, { x: 74, z: 54 }, { x: 34, z: 54 }]],
      },
    ],
    trees,
    legends: [
      {
        id: 'legend-junction',
        title: '七桥运河水口',
        subtitle: '四座红砖石拱桥交汇',
        kind: 'landmark',
        target: [0, 3, -8],
      },
      {
        id: 'legend-keizer',
        title: '皇帝运河',
        subtitle: '皇帝运河与阶梯山墙排屋',
        kind: 'water',
        target: [-36, 0, -9],
      },
      {
        id: 'legend-guild',
        title: '南钟楼与商馆',
        subtitle: '荷兰黄金时代立面',
        kind: 'landmark',
        target: [62, 12, -74],
      },
    ],
    cameraPresets: [
      {
        id: 'tour',
        label: '巡游',
        target: [0, 2, -6],
        azimuthDeg: 40,
        polarDeg: 57,
        zoom: 2.45,
      },
      {
        id: 'landmark',
        label: '拱桥水口',
        target: [0, 3, -8],
        azimuthDeg: 26,
        polarDeg: 61,
        zoom: 3.55,
      },
      {
        id: 'walkway',
        label: '运河漫步',
        target: [-32, 2, -24],
        azimuthDeg: 56,
        polarDeg: 66,
        zoom: 3.3,
      },
      {
        id: 'aerial',
        label: '鸟瞰',
        target: [0, 0, 0],
        azimuthDeg: 45,
        polarDeg: 37,
        zoom: 1.55,
      },
    ],
    boatPaths: [keizerBoatPath, regulierBoatPath, turnBoatPath],
    vehiclePaths: [
      [...northQuayWest, ...northBridge.slice(1), ...northQuayEast.slice(1)],
      [...southQuayWest, ...southBridge.slice(1), ...southQuayEast.slice(1)],
    ],
    pedestrianPaths: [
      [...westQuayNorth, ...westBridge.slice(1), ...westQuaySouth.slice(1)],
      [...eastQuayNorth, ...eastBridge.slice(1), ...eastQuaySouth.slice(1)],
      northPromenadeWest,
      southPromenadeEast,
    ],
  };
}

export function getCuratedPresetById(id: string): DioramaSceneData | null {
  switch (id) {
    case 'chengdu-anshun':
      return buildChengduAnshunPreset();
    case 'amsterdam-canals':
      return buildAmsterdamCanalsPreset();
    default:
      return null;
  }
}
