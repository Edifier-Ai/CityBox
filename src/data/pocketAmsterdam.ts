import amsterdamSceneJson from './pocketExamples/amsterdam/scene.json';
import type { PocketCityBundle, PocketRoute, PocketSceneData } from '../types/pocketCity';

const amsterdamScene = amsterdamSceneJson as unknown as PocketSceneData;

interface BridgeSpec {
  cx: number;
  cy: number;
  ax: [number, number];
  L: number;
  W: number;
}

const BRUG_39: BridgeSpec = { cx: -2.75, cy: 19.35, ax: [0.9997, 0.023], L: 15.4, W: 8.4 };
const BRUG_38: BridgeSpec = { cx: 10.83, cy: 0.31, ax: [0.0512, -0.9987], L: 25.2, W: 11.2 };
const BRUG_40: BridgeSpec = { cx: -1.15, cy: -20.55, ax: [0.9998, -0.0201], L: 15.4, W: 8.4 };

function bridgeZ(u: number, L: number): number {
  const t = Math.max(-1, Math.min(1, u / (L * 0.5)));
  return Number((0.45 + 1.52 * (1 - t * t)).toFixed(3));
}

function buildBridgeRoute(
  spec: BridgeSpec,
  kind: 'car' | 'bike' | 'ped',
  name: string,
  vOff: number,
  reverse = false
): PocketRoute {
  const nx = [-spec.ax[1], spec.ax[0]];
  const ext = 6.5;
  const uStart = -(spec.L * 0.5 + ext);
  const uEnd = spec.L * 0.5 + ext;
  const steps = 12;
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const u = uStart + ((uEnd - uStart) * i) / steps;
    const x = Number((spec.cx + spec.ax[0] * u + nx[0] * vOff).toFixed(2));
    const y = Number((spec.cy + spec.ax[1] * u + nx[1] * vOff).toFixed(2));
    const z = Math.abs(u) <= spec.L * 0.5 ? bridgeZ(u, spec.L) : 0;
    pts.push([x, y, z]);
  }
  if (reverse) pts.reverse();
  return { kind, name, p: pts };
}

const AMSTERDAM_EXTRA_ROUTES: PocketRoute[] = [
  // Continuous 2-way canal-side bicycle lanes along Keizersgracht & Reguliersgracht
  { kind: 'bike', name: 'Keizersgracht N', p: [[-88, 30.2], [-15, 13.6], [10, 14.5], [88, 39.2]] },
  { kind: 'bike', name: 'Keizersgracht N', p: [[88, 41.8], [10, 17.2], [-15, 16.2], [-88, 32.8]] },
  { kind: 'bike', name: 'Keizersgracht S', p: [[-88, -1.5], [-13, -17.6], [9, -17.2], [88, 6.8]] },
  { kind: 'bike', name: 'Keizersgracht S', p: [[88, 4.2], [9, -19.8], [-13, -20.2], [-88, -4.2]] },
  { kind: 'bike', name: 'Reguliersgracht W', p: [[-20.8, 88], [-18.2, 19], [-16.2, -20], [-14.2, -88]] },
  { kind: 'bike', name: 'Reguliersgracht W', p: [[-12.2, -88], [-14.2, -20], [-16.2, 19], [-18.8, 88]] },
  { kind: 'bike', name: 'Reguliersgracht E', p: [[4.5, 88], [7.8, 19], [8.8, -20], [11.8, -88]] },
  { kind: 'bike', name: 'Reguliersgracht E', p: [[9.5, -88], [6.5, -20], [5.5, 19], [2.2, 88]] },
  // 3D-cambered bike & pedestrian routes crossing Brug 38, Brug 39, and Brug 40
  buildBridgeRoute(BRUG_38, 'bike', 'Brug 38', 1.9, false),
  buildBridgeRoute(BRUG_38, 'bike', 'Brug 38', -1.9, true),
  buildBridgeRoute(BRUG_38, 'ped', 'Brug 38', 4.1, false),
  buildBridgeRoute(BRUG_38, 'ped', 'Brug 38', -4.1, true),
  buildBridgeRoute(BRUG_39, 'bike', 'Brug 39', 1.6, false),
  buildBridgeRoute(BRUG_39, 'bike', 'Brug 39', -1.6, true),
  buildBridgeRoute(BRUG_39, 'ped', 'Brug 39', 3.1, false),
  buildBridgeRoute(BRUG_39, 'ped', 'Brug 39', -3.1, true),
  buildBridgeRoute(BRUG_39, 'car', 'Brug 39', 0, false),
  buildBridgeRoute(BRUG_40, 'bike', 'Brug 40', 1.6, false),
  buildBridgeRoute(BRUG_40, 'bike', 'Brug 40', -1.6, true),
  buildBridgeRoute(BRUG_40, 'ped', 'Brug 40', 3.1, false),
  buildBridgeRoute(BRUG_40, 'ped', 'Brug 40', -3.1, true),
  buildBridgeRoute(BRUG_40, 'car', 'Brug 40', 0, true),
];

const amsterdamLandmarks = `
/* Amsterdam Reguliersgracht Seven-Bridges multi-arch masonry bridges, wrought-iron railings, parked bikes, and quay bollards */
function obbRect(cx, cy, ax, len, wid) {
  const nx = [-ax[1], ax[0]];
  const hl = len / 2;
  const hw = wid / 2;
  const pt = (u, v) => [cx + ax[0] * u + nx[0] * v, cy + ax[1] * u + nx[1] * v];
  return ccw([pt(-hl, -hw), pt(hl, -hw), pt(hl, hw), pt(-hl, hw)]);
}

function drawStaticBike(x, y, z, dir, frameCol, seed) {
  const n = [-dir[1], dir[0]];
  const at = (fw, up, sd = 0) => [x + dir[0] * fw + n[0] * sd, y + dir[1] * fw + n[1] * sd, z + up];
  let s = '';
  for (const hub of [-0.52, 0.52]) {
    s += pd(Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6;
      return at(hub + Math.cos(a) * 0.31, 0.31 + Math.sin(a) * 0.31);
    }));
  }
  const wheels = pd(Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    return at(-0.52 + Math.cos(a) * 0.31, 0.31 + Math.sin(a) * 0.31);
  })) + pd(Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    return at(0.52 + Math.cos(a) * 0.31, 0.31 + Math.sin(a) * 0.31);
  }));
  const fr = pd([at(-0.52, 0.31), at(-0.08, 0.34), at(0.35, 0.68), at(-0.18, 0.78), at(-0.52, 0.31)], false)
    + pd([at(-0.18, 0.78), at(-0.08, 0.34)], false)
    + pd([at(0.52, 0.31), at(0.35, 0.68), at(0.38, 0.98)], false);
  const bar = pd([at(0.32, 0.98, -0.22), at(0.40, 0.96, 0), at(0.32, 0.98, 0.22)], false);
  s = '<path d="' + wheels + '" fill="none" stroke="#36343c" stroke-width=".68"/>'
    + '<path d="' + fr + '" fill="none" stroke="' + frameCol + '" stroke-width=".82" stroke-linejoin="round"/>'
    + '<path d="' + bar + '" fill="none" stroke="#5b6266" stroke-width=".58"/>';
  if (seed % 2 === 0) {
    s += shape([at(0.40, 0.76, -0.13), at(0.60, 0.76, -0.13), at(0.60, 0.76, 0.13), at(0.40, 0.76, 0.13)], '#c59a62', 0.28);
  }
  return s;
}

function archedCanalBridge(cx, cy, ax, L, W, archCount = 1) {
  const nx = [-ax[1], ax[0]];
  const at = (u, v) => [cx + ax[0] * u + nx[0] * v, cy + ax[1] * u + nx[1] * v];
  const at3 = (u, v, z) => [cx + ax[0] * u + nx[0] * v, cy + ax[1] * u + nx[1] * v, z];
  const deckZ = (u) => {
    const t = Math.max(-1, Math.min(1, u / (L * 0.5)));
    return 0.45 + 1.52 * (1 - t * t);
  };
  const hw = W * 0.5;
  const swW = Math.min(2.1, W * 0.21);
  const rdW = hw - swW;
  const brickC = '#7f3e32';
  const stoneC = '#e7dfd0';
  const deckRoadC = '#8b594a';
  const walkC = '#dfd4be';
  const ironC = '#233d33';
  const parts = [];

  // 1. Arch span layout
  const arches = [];
  if (archCount === 3) {
    arches.push({ u0: -L * 0.40, u1: -L * 0.17, crown: 1.52, spring: 0.48 });
    arches.push({ u0: -L * 0.13, u1: L * 0.13, crown: 1.80, spring: 0.52 });
    arches.push({ u0: L * 0.17, u1: L * 0.40, crown: 1.52, spring: 0.48 });
  } else {
    arches.push({ u0: -L * 0.34, u1: L * 0.34, crown: 1.76, spring: 0.52 });
  }

  // 2. Cutwater piers in the water for 3-arch bridges
  if (archCount === 3) {
    for (const pu of [-L * 0.15, L * 0.15]) {
      const pRing = obbRect(cx + ax[0] * pu, cy + ax[1] * pu, ax, 1.35, W + 0.9);
      parts.push(obj(pRing, 1.55, () => {
        let s = '';
        const plRing = obbRect(cx + ax[0] * pu, cy + ax[1] * pu, ax, 1.55, W + 1.15);
        for (let i = 0; i < plRing.length; i++) {
          const a = plRing[i], b = plRing[(i + 1) % plRing.length];
          const q = [[...a, -0.35], [...b, -0.35], [...b, 0.35], [...a, 0.35]];
          const n = vNewell(q);
          if (n && vis(n)) s += shape(q, tone(n, soft('#b9b1a2')), 0.4);
        }
        for (let i = 0; i < pRing.length; i++) {
          const a = pRing[i], b = pRing[(i + 1) % pRing.length];
          const q = [[...a, 0.35], [...b, 0.35], [...b, 1.35], [...a, 1.35]];
          const n = vNewell(q);
          if (n && vis(n)) s += shape(q, tone(n, soft(brickC)), 0.45);
        }
        s += shape(atZ(pRing, 1.35), stoneC, 0.35);
        return s;
      }, -0.35));
    }
  }

  // 3. Segmented cambered bridge superstructure (open arch spans have z0=1.48 so cruising boats pass underneath!)
  const archSpanZ0 = 1.48;
  const segs = [];
  let cur = -L * 0.5;
  for (const ar of arches) {
    if (ar.u0 > cur + 0.1) segs.push({ u0: cur, u1: ar.u0, arch: null });
    segs.push({ u0: ar.u0, u1: ar.u1, arch: ar });
    cur = ar.u1;
  }
  if (cur < L * 0.5 - 0.1) segs.push({ u0: cur, u1: L * 0.5, arch: null });

  for (const sg of segs) {
    const sLen = sg.u1 - sg.u0;
    const midU = (sg.u0 + sg.u1) * 0.5;
    const fp = obbRect(cx + ax[0] * midU, cy + ax[1] * midU, ax, sLen, Math.max(2, W - 0.72));
    const zBase = sg.arch ? archSpanZ0 : 0;
    const zMax = Math.max(deckZ(sg.u0), deckZ(sg.u1), deckZ(midU)) + 0.15;

    parts.push(obj(fp, zMax, () => {
      let s = '';
      const nSub = sg.arch ? 8 : 2;
      // Deck surface (clinker carriageway + raised granite sidewalks + curbs)
      for (let i = 0; i < nSub; i++) {
        const ua = sg.u0 + (sLen * i) / nSub;
        const ub = sg.u0 + (sLen * (i + 1)) / nSub;
        const za = deckZ(ua), zb = deckZ(ub);
        const roadC = SEASON.snow ? '#f2efe8' : deckRoadC;
        const swC = SEASON.snow ? '#f5f2eb' : walkC;
        const qRoad = [at3(ua, -rdW, za), at3(ub, -rdW, zb), at3(ub, rdW, zb), at3(ua, rdW, za)];
        const rn = vNewell(qRoad);
        if (rn) s += shape(qRoad, tone(rn, soft(roadC)), 0.25);
        for (const side of [-1, 1]) {
          const v0 = side * rdW, v1 = side * hw;
          const qSw = side > 0
            ? [at3(ua, v0, za + 0.08), at3(ub, v0, zb + 0.08), at3(ub, v1, zb + 0.08), at3(ua, v1, za + 0.08)]
            : [at3(ua, v1, za + 0.08), at3(ub, v1, zb + 0.08), at3(ub, v0, zb + 0.08), at3(ua, v0, za + 0.08)];
          s += shape(qSw, swC, 0.25);
          s += edge(at3(ua, v0, za + 0.09), at3(ub, v0, zb + 0.09), stoneC, 0.10);
        }
      }

      // Spandrel walls & arch rings on both sides
      for (const side of [-1, 1]) {
        const wallN = [nx[0] * side, nx[1] * side, 0];
        if (!vis(wallN)) continue;
        const vWall = side * hw;
        if (!sg.arch) {
          for (let i = 0; i < nSub; i++) {
            const ua = sg.u0 + (sLen * i) / nSub;
            const ub = sg.u0 + (sLen * (i + 1)) / nSub;
            const za = deckZ(ua), zb = deckZ(ub);
            const q = side > 0
              ? [at3(ua, vWall, 0), at3(ub, vWall, 0), at3(ub, vWall, zb), at3(ua, vWall, za)]
              : [at3(ub, vWall, 0), at3(ua, vWall, 0), at3(ua, vWall, za), at3(ub, vWall, zb)];
            s += shape(q, tone(wallN, soft(brickC)), 0.35);
            s += shape([at3(ua, vWall, za - 0.18), at3(ub, vWall, zb - 0.18), at3(ub, vWall, zb + 0.08), at3(ua, vWall, za + 0.08)], tone(wallN, soft(stoneC)), 0.25);
          }
        } else {
          const ar = sg.arch;
          const aSpan = ar.u1 - ar.u0;
          const archZ = (u) => {
            const t = Math.max(-1, Math.min(1, ((u - ar.u0) / aSpan) * 2 - 1));
            return ar.spring + (ar.crown - ar.spring) * Math.sqrt(Math.max(0, 1 - t * t));
          };
          // Dark shadow on the water beneath the arch
          s += shape([at3(ar.u0, -hw, 0.02), at3(ar.u1, -hw, 0.02), at3(ar.u1, hw, 0.02), at3(ar.u0, hw, 0.02)], mix(WATER, '#183640', 0.55), 0);

          for (let i = 0; i < nSub; i++) {
            const ua = ar.u0 + (aSpan * i) / nSub;
            const ub = ar.u0 + (aSpan * (i + 1)) / nSub;
            const za0 = archZ(ua), zb0 = archZ(ub);
            const za1 = deckZ(ua), zb1 = deckZ(ub);
            // Dark recessed arch barrel soffit
            const soffit = [at3(ua, -hw + 0.2, za0), at3(ub, -hw + 0.2, zb0), at3(ub, hw - 0.2, zb0), at3(ua, hw - 0.2, za0)];
            s += shape(soffit, '#382a2c', 0);
            // Brick spandrel wall above arch
            const q = side > 0
              ? [at3(ua, vWall, za0), at3(ub, vWall, zb0), at3(ub, vWall, zb1), at3(ua, vWall, za1)]
              : [at3(ub, vWall, zb0), at3(ua, vWall, za0), at3(ua, vWall, za1), at3(ub, vWall, zb1)];
            s += shape(q, tone(wallN, soft(brickC)), 0.25);
            // Alternating voussoir arch ring
            const vCol = i % 2 === 0 ? stoneC : '#9e5445';
            const qV = side > 0
              ? [at3(ua, vWall + side * 0.03, za0), at3(ub, vWall + side * 0.03, zb0), at3(ub, vWall + side * 0.03, Math.min(zb1 - 0.14, zb0 + 0.26)), at3(ua, vWall + side * 0.03, Math.min(za1 - 0.14, za0 + 0.26))]
              : [at3(ub, vWall + side * 0.03, zb0), at3(ua, vWall + side * 0.03, za0), at3(ua, vWall + side * 0.03, Math.min(za1 - 0.14, za0 + 0.26)), at3(ub, vWall + side * 0.03, Math.min(zb1 - 0.14, zb0 + 0.26))];
            s += shape(qV, tone(wallN, soft(vCol)), 0.25);
            // White sandstone cornice band along top
            s += shape([at3(ua, vWall, za1 - 0.16), at3(ub, vWall, zb1 - 0.16), at3(ub, vWall, zb1 + 0.08), at3(ua, vWall, za1 + 0.08)], tone(wallN, soft(stoneC)), 0.25);
          }
          // Carved keystone (sluitsteen) at arch apex
          const ku = (ar.u0 + ar.u1) * 0.5;
          const kz = ar.crown;
          s += shape([at3(ku - 0.24, vWall + side * 0.05, kz - 0.08), at3(ku + 0.24, vWall + side * 0.05, kz - 0.08), at3(ku + 0.30, vWall + side * 0.05, kz + 0.32), at3(ku - 0.30, vWall + side * 0.05, kz + 0.32)], tone(wallN, soft(stoneC)), 0.3);

          // Night / Light Festival glowing bulbs tracing the arch
          if (SEASON.night) {
            for (let b = 1; b < 8; b++) {
              const bu = ar.u0 + (aSpan * b) / 8;
              const bz = archZ(bu) - 0.04;
              const bp = at3(bu, vWall + side * 0.08, bz);
              s += stick(bp, [bp[0], bp[1], bp[2] + 0.03], 0.09, b % 2 ? '#ffe6a1' : '#ffbd69');
            }
          }
        }
      }
      return s;
    }, zBase));
  }

  // 4. Two separate wrought-iron railing strips + corner stone piers + kroonlantaarn lamps + locked bikes
  const railV = hw - 0.16;
  for (const side of [-1, 1]) {
    const rCenter = at(0, side * railV);
    const rFp = obbRect(rCenter[0], rCenter[1], ax, L, 0.32);
    parts.push(obj(rFp, 4.9, () => {
      let s = '';
      const steps = Math.max(8, Math.round(L / 1.4));
      for (let i = 0; i < steps; i++) {
        const ua = -L * 0.5 + (L * i) / steps;
        const ub = -L * 0.5 + (L * (i + 1)) / steps;
        const za = deckZ(ua) + 0.08;
        const zb = deckZ(ub) + 0.08;
        s += stick(at3(ua, side * railV, za + 0.96), at3(ub, side * railV, zb + 0.96), 0.045, ironC);
        s += stick(at3(ua, side * railV, za + 0.18), at3(ub, side * railV, zb + 0.18), 0.032, ironC);
        s += stick(at3(ua, side * railV, za), at3(ua, side * railV, za + 0.96), 0.03, ironC);
        const um = (ua + ub) * 0.5;
        const zm = deckZ(um) + 0.08;
        s += stick(at3(um, side * railV, zm + 0.18), at3(um, side * railV, zm + 0.96), 0.022, ironC);
      }
      s += stick(at3(L * 0.5, side * railV, deckZ(L * 0.5) + 0.08), at3(L * 0.5, side * railV, deckZ(L * 0.5) + 1.04), 0.03, ironC);

      // End stone/cast-iron bridge bollards
      for (const endU of [-L * 0.5 + 0.3, L * 0.5 - 0.3]) {
        const bz = deckZ(endU) + 0.08;
        const bPt = at3(endU, side * railV, bz);
        s += stick(bPt, [bPt[0], bPt[1], bz + 1.15], 0.16, '#c7bfb0') + ball([bPt[0], bPt[1], bz + 1.24], 0.16, soft(stoneC), 0.3);
      }

      // Classic Amsterdam kroonlantaarn bridge lamp at mid-span
      const lz = deckZ(0) + 0.08;
      const lp = at3(0, side * railV, lz);
      s += stick(lp, [lp[0], lp[1], lz + 2.75], 0.065, ironC);
      s += ball([lp[0], lp[1], lz + 2.92], 0.22, SEASON.night ? { l: '#fff3c4', m: '#fff3c4', d: '#ffd98a' } : soft('#f5ebd0'), 0.35);
      s += stick([lp[0], lp[1], lz + 3.10], [lp[0], lp[1], lz + 3.24], 0.08, ironC);
      if (SEASON.night) s += lightPool(lp[0], lp[1], 3.2, '#ffcf7a', 0.45, lz + 0.04);

      // Parked Dutch bicycles locked to the bridge railing
      const bikeSlots = L > 20 ? [-5.6, 5.2] : [2.8];
      for (const [bi, bu] of bikeSlots.entries()) {
        const bz = deckZ(bu) + 0.08;
        const bp = at(bu, side * (railV - 0.28));
        const bCols = ['#2f3b44', '#8e4036', '#355c4e', '#c8893c'];
        s += drawStaticBike(bp[0], bp[1], bz, ax, bCols[(bi + Math.round(L)) % bCols.length], bi + Math.round(cx));
      }
      return s;
    }, 1.2));
  }

  return parts;
}

const LANDMARKS = [
  { name: 'Brug 39', ids: [], build: () => archedCanalBridge(${BRUG_39.cx}, ${BRUG_39.cy}, ${JSON.stringify(BRUG_39.ax)}, ${BRUG_39.L}, ${BRUG_39.W}, 1) },
  { name: 'Brug 38', ids: [], build: () => archedCanalBridge(${BRUG_38.cx}, ${BRUG_38.cy}, ${JSON.stringify(BRUG_38.ax)}, ${BRUG_38.L}, ${BRUG_38.W}, 3) },
  { name: 'Brug 40', ids: [], build: () => archedCanalBridge(${BRUG_40.cx}, ${BRUG_40.cy}, ${JSON.stringify(BRUG_40.ax)}, ${BRUG_40.L}, ${BRUG_40.W}, 1) },
];

// Iconic dark-maroon Amsterdammertje iron bollards along straight canal quays (built lazily inside CITY_EXTRA so city.js helpers are initialized)
let QUAY_PROPS = null;
function ensureQuayProps() {
  if (QUAY_PROPS) return QUAY_PROPS;
  QUAY_PROPS = [];
  const seen = [];
  for (const line of SCENE.shore || []) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 8) continue;
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      let nx = -uy, ny = ux;
      const mid = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
      if (inRings([mid[0] + nx * 2, mid[1] + ny * 2], SCENE.water || [])) { nx = -nx; ny = -ny; }
      for (let s = 3; s < len - 3; s += 5.5) {
        const px = a[0] + ux * s + nx * 0.85, py = a[1] + uy * s + ny * 0.85;
        if (!standable(px, py, 0.5)) continue;
        if (seen.some(q => Math.hypot(q[0] - px, q[1] - py) < 3.6)) continue;
        seen.push([px, py]);
        QUAY_PROPS.push({
          fp: rect(px, py, 0.4, 0.4),
          h: 1.0,
          draw: () => stick([px, py, 0], [px, py, 0.78], 0.075, '#472527') + ball([px, py, 0.82], 0.08, soft('#5c3033'), 0.25),
        });
      }
    }
  }
  return QUAY_PROPS;
}

function CITY_EXTRA() {
  const out = [...ensureQuayProps()];
  if (SEASON.id === 'kings_day') {
    const flagged = (SCENE.boats || []).filter((_, i) => i % 4 === 0);
    for (const boat of flagged) {
      const bx = boat.x;
      const by = boat.y;
      out.push({
        fp: rect(bx, by, 2, 2),
        h: 2.8,
        draw: () =>
          stick([bx, by, 1.1], [bx, by, 2.5], 0.05, '#f27c24') +
          shape(
            [
              [bx, by, 2.45],
              [bx + 1.1, by, 2.3],
              [bx + 1.1, by, 1.75],
              [bx, by, 1.85],
            ],
            '#f27c24',
            0.3
          ),
      });
    }
  }
  return out;
}
`;

export const AMSTERDAM_CANALS_BUNDLE: PocketCityBundle = {
  id: 'amsterdam-canals',
  pipelineSource: 'curated',
  scene: amsterdamScene,
  landmarksCode: amsterdamLandmarks,
  city: {
    name: '阿姆斯特丹',
    title: '阿姆斯特丹 · 皇帝运河七桥水口',
    region: '荷兰 · 阿姆斯特丹',
    place: 'Keizersgracht × Reguliersgracht',
    timezone: 'Europe/Amsterdam',
    level: 3.0,
    styles: {
      default: {
        facade: 'canal',
        wall: ['#7d3e33', '#4c3834', '#94503e', '#3a3c42', '#b0845c', '#344c41', '#6b3d39', '#8a4838'],
        trim: '#f4ede0',
        roof: 'gabled',
        ridge: 'long',
        pitch: 38,
        roofColour: ['#4c5059', '#6e493e', '#3e434c', '#7c4c3d'],
        roofTex: 'pantile',
        eaves: 0.25,
        maxSpan: 24,
        levels: 4,
        floor: 3.0,
        shop: 'poi',
        awning: 'some',
        awnings: ['#2d4d40', '#7f453b', '#eae0cc'],
        rectFill: 0.62,
      },
    },
    palette: {
      ground: '#eadfc8',
      road: '#9a8e89',
      pavement: '#dfd3bc',
      walk: '#d8ccb5',
      grass: '#9ec874',
      water: '#67a3a6',
      quay: '#c7b8a3',
      slab: '#d6c3a1',
      marking: '#f3ede0',
      kerb: '#cfc3ae',
      paving: '#b9ac9a',
    },
    paving: {
      style: 'slabs',
      size: 0.55,
      roadStyle: 'klinkers',
    },
    lamp: {
      colour: '#2f3d37',
      height: 4.2,
      head: '#fae5aa',
    },
    shops: {
      signs: ['CAFÉ', 'BOEKHANDEL', 'KAAS', 'BLOEMEN'],
      font: 'Georgia, serif',
      fascias: ['#2f4940', '#633831', '#384654'],
    },
    boats: {
      style: 'amsterdam',
      hulls: ['#2d4050', '#f0eadc', '#5e382b', '#2f4f3f', '#3d454d'],
      stripes: ['#e2a83c', '#f4efe2', '#b84635'],
      cruising: [
        {
          kind: 'sloop',
          p: [[-82, 8], [-35, 3], [0, -1], [38, 6], [82, 20]],
          speed: 1.55,
          phase: 4,
        },
        {
          kind: 'tour',
          p: [[82, 24], [38, 10], [-2, 2], [-42, 7], [-82, 13]],
          speed: 1.35,
          phase: 19,
        },
        {
          kind: 'sloop',
          p: [[-5, 82], [-3, 35], [-1, 0], [1, -35], [2, -82]],
          speed: 1.45,
          phase: 11,
        },
      ],
    },
    traffic: {
      bikeInterval: 4.4,
      pedInterval: 8.8,
      carInterval: 11.5,
      capacity: 170,
    },
    extraRoutes: AMSTERDAM_EXTRA_ROUTES,
    trees: {
      default: {
        style: 3,
        colours: ['#7eb065', '#96bf72'],
        height: 8.5,
        autumn: '#d7a03d',
      },
    },
    people: {
      clothes: ['#3b4f68', '#ebe2ce', '#c45b43', '#4b6b57', '#e0b35c', '#58697c'],
      bikes: ['#262d33', '#2e574c', '#8c3f32', '#c88738', '#41556a'],
    },
    vehicles: {
      kinds: ['small', 'hatch', 'estate'],
      colours: ['#f1f0eb', '#30343b', '#87939f', '#4e6378'],
    },
    isoLabel: '运河水口全景',
    seasons: [
      {
        id: 'spring',
        label: '春日郁金香季',
        leaves: 'spring',
        crowd: 1.3,
        note: {
          text: '春日榆树新绿沿运河砖岸铺开，骑行者穿梭于皇帝运河与七桥交汇处。',
          source: 'City of Amsterdam · Canal Ring',
          url: 'https://www.amsterdam.nl/',
        },
      },
      {
        id: 'summer',
        label: '盛夏阵雨',
        leaves: 'summer',
        wet: true,
        umbrellas: true,
        wx: 'drizzle',
        crowd: 1.0,
        note: {
          text: '北海水汽带来间歇骤雨，雨后石板堤岸与红砖山墙倒映在运河波纹之中。',
          source: 'KNMI Climate Normals',
          url: 'https://www.knmi.nl/',
        },
      },
      {
        id: 'autumn',
        label: '深秋落叶',
        leaves: 'autumn',
        crowd: 1.1,
        note: {
          text: '十月运河两岸榆树与椴树转为金黄，落叶轻洒在拱桥栏杆与木船顶篷上。',
          source: 'City of Amsterdam',
          url: 'https://www.amsterdam.nl/',
        },
      },
      {
        id: 'winter',
        label: '冬日冰河',
        leaves: 'bare',
        coats: true,
        ice: true,
        snow: true,
        wx: 'snow',
        boats: 0.4,
        crowd: 0.7,
        note: {
          text: '寒潮来袭时，部分窄运河水面凝结薄冰，白雪轻覆红砖阶梯山墙屋脊。',
          source: 'KNMI Winter Archive',
          url: 'https://www.knmi.nl/',
        },
      },
    ],
    occasions: [
      {
        id: 'light_festival',
        label: '运河灯光节',
        leaves: 'bare',
        coats: true,
        night: 0.92,
        litShare: 0.75,
        crowd: 1.4,
        decor: {
          fairy: ['#ffe6a1', '#ffbd69', '#88d8d0'],
        },
        note: {
          text: '每年冬季 Amsterdam Light Festival 期间，桥拱与水岸被暖色串灯点亮。',
          source: 'Amsterdam Light Festival',
          url: 'https://amsterdamlightfestival.com/',
        },
      },
      {
        id: 'kings_day',
        label: '国王节橙潮',
        leaves: 'spring',
        crowd: 1.8,
        dress: { colours: ['#f27c24', '#ff943d', '#f5ede0'], share: 0.65 },
        decor: {
          bunting: ['#f27c24', '#ffffff', '#2d5c8f', '#c94338'],
        },
        note: {
          text: '4 月 27 日国王节，人们身着橙色衣衫乘船欢聚运河，桥头与街道挂满彩旗。',
          source: 'I amsterdam',
          url: 'https://www.iamsterdam.com/',
        },
      },
    ],
    views: [
      {
        id: 'seven-bridges',
        label: '七桥水口',
        camera: { yaw: -35, pitch: 28, zoom: 2.8, x: 4, y: 1, z: 3 },
      },
      {
        id: 'keizersgracht',
        label: '皇帝运河立面',
        camera: { yaw: -52, pitch: 24, zoom: 3.6, x: -28, y: 42, z: 5 },
      },
      {
        id: 'canal-cruise',
        label: '运河游船视角',
        camera: { yaw: 24, pitch: 27, zoom: 3.0, x: 8, y: -2, z: 2 },
      },
    ],
    legend: [
      {
        name: '七桥水口拱桥',
        source: 'OpenStreetMap · Brug 38/39/40',
        icon: 'landmark',
        camera: { yaw: -35, pitch: 28, zoom: 3.2, x: 4, y: 1, z: 2 },
      },
      {
        name: '运河水道与游船',
        source: 'OpenStreetMap · UNESCO 运河带',
        icon: 'water',
        camera: { yaw: 24, pitch: 27, zoom: 2.9, x: -12, y: 4, z: 1 },
      },
      {
        name: '窄面红砖山墙屋',
        source: 'OpenStreetMap 实景建筑',
        count: String(amsterdamScene.buildings.length),
        icon: 'buildings',
        camera: { yaw: -52, pitch: 24, zoom: 3.6, x: -28, y: 42, z: 6 },
      },
    ],
    notes: [
      {
        title: '皇帝运河七桥水口',
        text: '基于 OpenStreetMap 真实地理矢量构建，站在 Reguliersgracht 与 Keizersgracht 交汇处，可望见沿水延伸的多重砖石拱桥与阶梯山墙屋。',
        links: [
          { label: 'I amsterdam', url: 'https://www.iamsterdam.com/' },
          { label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/#map=18/52.36339/4.89600' },
        ],
      },
    ],
  },
};
