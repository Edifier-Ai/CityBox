import chengduSceneJson from './pocketExamples/chengdu/scene.json';
import type { PocketCityBundle, PocketSceneData } from '../types/pocketCity';

const rawChengduScene = chengduSceneJson as unknown as PocketSceneData;
const chengduScene: PocketSceneData = {
  ...rawChengduScene,
  routes: (rawChengduScene.routes || []).map((r) =>
    r.kind === 'ped' && r.z === 4.6 ? { ...r, z: 3.82 } : r
  ),
};

const chengduLandmarks = `
/* 成都安顺廊桥手绘地标（严格对齐真实 OSM 桥体方向与坐标） */
const ANSHUN_ID = 'w842690147';

function obbRect(cx, cy, ax, len, wid) {
  const nx = [-ax[1], ax[0]];
  const hl = len / 2;
  const hw = wid / 2;
  const pt = (u, v) => [cx + ax[0] * u + nx[0] * v, cy + ax[1] * u + nx[1] * v];
  return ccw([pt(-hl, -hw), pt(hl, -hw), pt(hl, hw), pt(-hl, hw)]);
}

function anshunBridge() {
  const b = findBuilding(ANSHUN_ID);
  if (!b || !b.obb) return null;
  const { c, ax, L, W } = b.obb;
  const nx = [-ax[1], ax[0]];
  const at = (u, v) => [c[0] + ax[0] * u + nx[0] * v, c[1] + ax[1] * u + nx[1] * v];
  const at3 = (u, v, z) => [c[0] + ax[0] * u + nx[0] * v, c[1] + ax[1] * u + nx[1] * v, z];
  const deckRing = obbRect(c[0], c[1], ax, L, W);

  // 1. Stone masonry bridge piers (z0=-1.6, z1=2.85) with facade:'masonry' (NO glass windows!)
  const pierOffsets = [-0.39 * L, -0.13 * L, 0.13 * L, 0.39 * L];
  const pierItems = pierOffsets.map((u) => {
    const pc = at(u, 0);
    const pRing = obbRect(pc[0], pc[1], ax, 4.4, W + 0.7);
    const pier = block(pRing, -1.6, 2.85, {
      facade: 'masonry',
      wall: '#b8af9e',
      top: '#d6cebe',
      shop: 'none',
    });
    return { center: [pc[0], pc[1], 0.5], draw: pier.draw };
  });

  // 2. Main stone bridge deck (z=2.85..3.8) with facade:'masonry' (NO windows!)
  const deck = block(deckRing, 2.85, 3.8, {
    facade: 'masonry',
    wall: '#a79e8d',
    top: '#ded5c3',
    shop: 'none',
  });

  const archSpans = [
    [-0.36 * L, -0.16 * L],
    [-0.10 * L, 0.10 * L],
    [0.16 * L, 0.36 * L],
  ];

  const substructure = obj(
    deckRing,
    3.8,
    () => {
      // Strictly draw piers -> stone arches -> deck so deck always sits cleanly on top of piers
      let s = pierItems
        .slice()
        .sort((p, q) => depthOf(p.center) - depthOf(q.center))
        .map((p) => p.draw())
        .join('');

      const hw = W * 0.5;
      for (const [u0, u1] of archSpans) {
        const span = u1 - u0;
        const archZ = (u) => {
          const t = ((u - u0) / span) * 2 - 1;
          return 0.4 + 1.95 * Math.sqrt(Math.max(0, 1 - t * t));
        };
        for (const side of [-1, 1]) {
          const wallN = [nx[0] * side, nx[1] * side, 0];
          if (!vis(wallN)) continue;
          const vWall = side * (hw + 0.04);
          for (let i = 0; i < 6; i++) {
            const ua = u0 + (span * i) / 6;
            const ub = u0 + (span * (i + 1)) / 6;
            const za = archZ(ua), zb = archZ(ub);
            const q = side > 0
              ? [at3(ua, vWall, za), at3(ub, vWall, zb), at3(ub, vWall, 2.85), at3(ua, vWall, 2.85)]
              : [at3(ub, vWall, zb), at3(ua, vWall, za), at3(ua, vWall, 2.85), at3(ub, vWall, 2.85)];
            s += shape(q, tone(wallN, soft('#9c9383')), 0.25);
            const qV = side > 0
              ? [at3(ua, vWall + side * 0.03, za), at3(ub, vWall + side * 0.03, zb), at3(ub, vWall + side * 0.03, Math.min(2.85, zb + 0.28)), at3(ua, vWall + side * 0.03, Math.min(2.85, za + 0.28))]
              : [at3(ub, vWall + side * 0.03, zb), at3(ua, vWall + side * 0.03, za), at3(ua, vWall + side * 0.03, Math.min(2.85, za + 0.28)), at3(ub, vWall + side * 0.03, Math.min(2.85, zb + 0.28))];
            s += shape(qV, tone(wallN, soft(i % 2 ? '#c4baa8' : '#8e8576')), 0.22);
          }
        }
      }

      s += deck.draw();
      return s;
    },
    -1.6
  );

  // 3. South & North covered timber gallery wings (separate elevation-layered objs, z0=3.8)
  const wingL = 0.28 * L;
  const wingW = 0.56 * W;
  const wingObjs = [-1, 1].map((dir) => {
    const wc = at(dir * 0.29 * L, 0);
    const wRing = obbRect(wc[0], wc[1], ax, wingL, wingW);
    const wing = block(wRing, 3.8, 7.6, {
      facade: 'timber',
      wall: '#8c3b2f',
      wood: '#5e2920',
      slat: '#a65445',
      trim: '#e8d7b8',
      shop: 'none',
    });
    const wingRoof = roofOver(
      { c: wc, ax, L: wingL + 0.8, W: wingW + 0.8 },
      7.6,
      { roof: 'gabled', pitch: 24, roofColour: '#56606b', roofTex: 'kawara', eaves: 1.0, wall: '#8c3b2f', chimney: false }
    );
    return obj(wRing, 11.2, () => wing.draw() + wingRoof(), 3.8);
  });

  // 4. Central two-tier Ming-Qing pavilion hall (z0=3.8, z1=17.5)
  const lowerL = 0.26 * L;
  const lowerW = 0.62 * W;
  const cRing = obbRect(c[0], c[1], ax, lowerL, lowerW);
  const lowerHall = block(cRing, 3.8, 8.6, {
    facade: 'timber',
    wall: '#a33e32',
    wood: '#622720',
    slat: '#ba5a4a',
    trim: '#f0dfbe',
    shop: 'none',
  });
  const lowerEave = roofOver(
    { c, ax, L: lowerL + 1.2, W: lowerW + 1.0 },
    8.6,
    { roof: 'hipped', pitch: 22, roofColour: '#58626d', roofTex: 'kawara', eaves: 1.2, wall: '#a33e32', chimney: false }
  );

  const upperL = 0.18 * L;
  const upperW = 0.48 * W;
  const uRing = obbRect(c[0], c[1], ax, upperL, upperW);
  const upperHall = block(uRing, 9.6, 13.4, {
    facade: 'timber',
    wall: '#a33e32',
    wood: '#622720',
    slat: '#c66855',
    trim: '#f4e3c1',
    shop: 'none',
  });
  const upperRoof = roofOver(
    { c, ax, L: upperL + 1.1, W: upperW + 1.0 },
    13.4,
    { roof: 'hipped', pitch: 28, roofColour: '#4e5863', roofTex: 'kawara', eaves: 1.15, wall: '#a33e32', chimney: false }
  );
  const centralObj = obj(
    cRing,
    17.5,
    () =>
      lowerHall.draw() +
      lowerEave() +
      upperHall.draw() +
      upperRoof() +
      stick([c[0], c[1], 16.0], [c[0], c[1], 17.5], 0.22, '#e2b659'),
    3.8
  );

  // 5. Two separate red timber railing strips along the outer deck edges (z0=3.8, z1=5.0)
  const railV = W / 2 - 0.35;
  const railObjs = [-1, 1].map((sg) => {
    const rc = at(0, sg * railV);
    const railFp = obbRect(rc[0], rc[1], ax, L - 1.5, 0.4);
    return obj(
      railFp,
      5.0,
      () => {
        let rSvg = '';
        for (let u = -L / 2 + 1; u <= L / 2 - 1; u += 3.7) {
          const p = at(u, sg * railV);
          rSvg += stick([p[0], p[1], 3.8], [p[0], p[1], 4.9], 0.09, '#9e3b2f');
        }
        const p0 = at(-L / 2 + 1, sg * railV);
        const p1 = at(L / 2 - 1, sg * railV);
        rSvg += stick([p0[0], p0[1], 4.9], [p1[0], p1[1], 4.9], 0.09, '#8c3328');
        return rSvg;
      },
      3.8
    );
  });

  return [substructure, ...wingObjs, centralObj, ...railObjs];
}

const LANDMARKS = [
  { name: '安顺廊桥', ids: [ANSHUN_ID], build: anshunBridge },
];

function CITY_EXTRA(t) {
  const out = [];
  if (SEASON.id === 'night_tour' || SEASON.id === 'lantern_festival') {
    const b = findBuilding(ANSHUN_ID);
    if (b && b.obb) {
      const { c, ax, L, W } = b.obb;
      const nx = [-ax[1], ax[0]];
      const at = (u, v) => [c[0] + ax[0] * u + nx[0] * v, c[1] + ax[1] * u + nx[1] * v];
      const glow = SEASON.id === 'lantern_festival' ? '#ff6f52' : '#ffcf7a';
      const railV = W / 2 + 0.1;
      for (let u = -L / 2 + 3; u <= L / 2 - 3; u += 7.2) {
        for (const sg of [-1, 1]) {
          const [x, y] = at(u, sg * railV);
          out.push({
            fp: rect(x, y, 0.8, 0.8),
            h: 7.4,
            draw: () =>
              stick([x, y, 7.1], [x, y, 6.5], 0.04, '#3d2c28') +
              ball([x, y, 6.3], 0.34, soft(glow), 0.15) +
              lightPool(x, y, 4.2, '#ffb85c', 0.35, 3.85),
          });
        }
      }
    }

    // Floating river lanterns strictly inside real Jinjiang water polygon
    const waters = SCENE.water || [];
    if (waters.length) {
      const count = SEASON.id === 'lantern_festival' ? 24 : 12;
      for (let i = 0; i < count; i++) {
        const lx = -92 + ((i * 23 + t * 1.6) % 184);
        const ly = -50 + ((i * 19) % 100);
        if (!inRings([lx, ly], waters)) continue;
        if (b && b.obb) {
          const { c, ax, L, W } = b.obb;
          const nx = [-ax[1], ax[0]];
          const dx = lx - c[0];
          const dy = ly - c[1];
          const u = dx * ax[0] + dy * ax[1];
          const v = dx * nx[0] + dy * nx[1];
          if (Math.abs(u) < L / 2 + 2 && Math.abs(v) < W / 2 + 2) continue;
        }
        out.push({
          fp: rect(lx, ly, 0.8, 0.8),
          h: 0.6,
          draw: () =>
            lightPool(lx, ly, 2.2, '#ffae4c', 0.55, 0.04) +
            ball([lx, ly, 0.25], 0.24, soft('#ffd98a'), 0),
        });
      }
    }
  }
  return out;
}
`;

export const CHENGDU_ANSHUN_BUNDLE: PocketCityBundle = {
  id: 'chengdu-anshun',
  pipelineSource: 'curated',
  scene: chengduScene,
  landmarksCode: chengduLandmarks,
  city: {
    name: '成都',
    title: '成都 · 安顺廊桥',
    region: '四川 · 成都',
    place: '安顺廊桥 · 锦江两岸',
    timezone: 'Asia/Shanghai',
    level: 3.1,
    styles: {
      default: {
        facade: 'timber',
        wall: ['#efe5d0', '#e7dac2', '#dfd2b8'],
        roof: 'gabled',
        ridge: 'street',
        pitch: 24,
        roofColour: ['#646b73', '#5c636b', '#6d737a'],
        roofTex: 'kawara',
        eaves: 0.65,
        levels: 2,
        floor: 3.1,
        eave1: true,
        eave1Depth: 0.7,
        shop: 'poi',
        wood: '#5e3c2d',
        slat: '#845944',
        noren: ['#9e3d32', '#355c58', '#cfa85e'],
        shopHeight: 3.1,
        rectFill: 0.72,
      },
      rules: [
        {
          if: { minLevels: 4 },
          set: {
            facade: 'apartment',
            roof: 'flat',
            wall: ['#e3dccf', '#dcd3c4', '#ebe3d5'],
            eave1: false,
            balcony: 'some',
            shop: 'street',
            floor: 3.2,
          },
        },
      ],
    },
    palette: {
      ground: '#ede3cd',
      road: '#b2acb0',
      pavement: '#e6dcc6',
      walk: '#dfd4be',
      grass: '#a8cf7a',
      water: '#6eb2b0',
      quay: '#d5cab4',
      slab: '#d8c6a3',
      marking: '#f6efe2',
      kerb: '#d8ceb9',
      paving: '#c5b9a6',
    },
    paving: {
      style: 'slabs',
      size: 0.6,
    },
    lamp: {
      colour: '#424748',
      height: 4.5,
      head: '#ffdf9a',
    },
    shops: {
      signs: ['老茶馆', '锦江春', '川菜坊', '竹影社', '蜀绣堂'],
      font: '"Noto Serif SC", Georgia, serif',
      fascias: ['#8c3b2f', '#3d5852', '#5b4738', '#485662'],
    },
    boats: {
      hulls: ['#5b3f30', '#704b37', '#4a5a52'],
      stripes: ['#c95842', '#e0b35a'],
    },
    cafes: {
      umbrellas: ['#f3ebd7', '#4d6b53', '#b85a48'],
    },
    trees: {
      default: {
        style: 3,
        colours: ['#7eb168', '#95bf73'],
        height: 8,
        autumn: '#d9a443',
      },
      rules: [
        {
          match: 'Willow',
          style: 4,
          colours: ['#8cc26c', '#a3d177'],
          height: 8.5,
          spring: '#bae67c',
          autumn: '#d7bd58',
        },
        {
          match: 'Ginkgo',
          style: 3,
          colours: ['#7ca863', '#8fb56d'],
          height: 8.5,
          spring: '#b2da74',
          autumn: '#eab53c',
        },
      ],
    },
    people: {
      clothes: ['#3b4d63', '#ebe1cd', '#9f4f42', '#4f6d5a', '#dfb363', '#6e5e7a'],
      umbrellas: ['#eae3d5', '#3d5a58', '#c45143', '#dfba65'],
    },
    vehicles: {
      kinds: ['sedan', 'hatch', 'suv', 'small'],
      colours: ['#f1f0eb', '#30343c', '#98a1ab', '#c4b89f'],
      taxi: { share: 0.25, colours: ['#397565'], kind: 'sedan', sign: '#faeaa2' },
    },
    isoLabel: '锦江全景',
    seasons: [
      {
        id: 'spring',
        label: '春日新绿',
        leaves: 'spring',
        crowd: 1.2,
        note: {
          text: '春熙润柳，锦江两岸垂柳抽芽，安顺廊桥两侧滨江步道绿意盎然。',
          source: '成都市公园城市建设管理局',
          url: 'https://www.chengdu.gov.cn/',
        },
      },
      {
        id: 'summer',
        label: '盛夏骤雨',
        leaves: 'summer',
        wet: true,
        umbrellas: true,
        wx: 'rain',
        crowd: 0.85,
        cafes: 'closed',
        note: {
          text: '成都夏季湿润多阵雨，青石栈道泛起微光，茶客移步廊桥檐下避雨听澜。',
          source: '中国气象局 · 成都气候公报',
          url: 'https://www.cma.gov.cn/',
        },
      },
      {
        id: 'autumn',
        label: '深秋银杏',
        leaves: 'autumn',
        crowd: 1.25,
        note: {
          text: '十月底至十一月，滨江东路一带银杏金黄，是成都秋日经典水岸景致。',
          source: '成都文旅',
          url: 'https://www.chengdu.gov.cn/',
        },
      },
      {
        id: 'winter',
        label: '冬日江畔',
        leaves: 'bare',
        coats: true,
        haze: true,
        crowd: 0.75,
        note: {
          text: '蓉城冬日少雪多薄雾，行人换上冬衣沿江散步，茶馆里依然热气腾腾。',
          source: '中国气象局 · 成都气候公报',
          url: 'https://www.cma.gov.cn/',
        },
      },
    ],
    occasions: [
      {
        id: 'night_tour',
        label: '夜游锦江',
        leaves: 'summer',
        night: 0.9,
        litShare: 0.68,
        crowd: 1.5,
        decor: {
          fairy: ['#ffda8f', '#ffbe6b', '#ffe8b3'],
        },
        note: {
          text: '华灯初上，“夜游锦江”游船自东门码头驶过安顺廊桥，重檐倒映碧水金波。',
          source: '夜游锦江官方导览',
          url: 'https://www.chengdu.gov.cn/',
        },
      },
      {
        id: 'lantern_festival',
        label: '元宵灯会',
        leaves: 'bare',
        coats: true,
        night: 0.94,
        litShare: 0.78,
        crowd: 1.75,
        decor: {
          lanterns: ['#d94436', '#e86f3c', '#f2b84b'],
          fairy: ['#ff9c66', '#ffd98a'],
        },
        note: {
          text: '正月十五锦江两岸挂起大红宫灯，水灯顺流而下，重现“锦江灯市”的蜀地年俗。',
          source: '成都民俗志',
          url: 'https://www.chengdu.gov.cn/',
        },
      },
    ],
    views: [
      {
        id: 'bridge',
        label: '安顺廊桥',
        camera: { yaw: -32, pitch: 28, zoom: 2.8, x: 3.3, y: 10.0, z: 4 },
      },
      {
        id: 'southbank',
        label: '丝管路南岸',
        camera: { yaw: -52, pitch: 26, zoom: 3.2, x: -47, y: -56, z: 3 },
      },
      {
        id: 'riverfront',
        label: '锦江两岸',
        camera: { yaw: 18, pitch: 32, zoom: 2.2, x: 0, y: 12, z: 3 },
      },
    ],
    legend: [
      {
        name: '安顺廊桥',
        source: 'OpenStreetMap · 明清重檐廊桥',
        icon: 'landmark',
        camera: { yaw: -32, pitch: 28, zoom: 3.0, x: 3.3, y: 10.0, z: 5 },
      },
      {
        name: '锦江水系',
        source: 'OpenStreetMap · 府南河段',
        icon: 'water',
        camera: { yaw: 20, pitch: 30, zoom: 2.5, x: -30, y: 15, z: 1 },
      },
      {
        name: '滨江林荫',
        source: '滨江东路沿线',
        icon: 'trees',
        camera: { yaw: -20, pitch: 32, zoom: 2.8, x: -30, y: 40, z: 3 },
      },
      {
        name: '水岸坊巷建筑',
        source: 'OpenStreetMap 实景建筑',
        count: String(chengduScene.buildings.length),
        icon: 'buildings',
        camera: { yaw: -45, pitch: 29, zoom: 2.5, x: -47, y: -56, z: 4 },
      },
    ],
    notes: [
      {
        title: '安顺廊桥',
        text: '基于 OpenStreetMap 真实地理矢量构建，廊桥横跨锦江之上，以石拱桥墩与明清重檐亭阁相连。',
        links: [
          { label: '成都文旅', url: 'https://www.chengdu.gov.cn/' },
          { label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/#map=18/30.64408/104.08336' },
        ],
      },
    ],
  },
};
