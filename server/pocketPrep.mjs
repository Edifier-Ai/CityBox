import {
  bboxIntersects,
  bboxOfMultiPoly,
  bboxOfPts,
  bufferPolyline,
  clipLineToBox,
  clipPolyToBox,
  distPointToLine,
  distPointToMultiPoly,
  distPointToSeg,
  distPt,
  interpolateLine,
  lineLength,
  makeBoxPoly,
  mergeLines,
  minimumRotatedRect,
  multiPolyArea,
  nearestPointOnMultiPoly,
  normalizePoly,
  offsetPolyline,
  pointInMultiPoly,
  polyArea,
  polyDiff,
  polygonizeLines,
  polyIntersect,
  polyUnion,
  projectOnLine,
  r2,
  representativePoint,
  ringArea,
  simplifyLine,
  simplifyPoly,
  splitLineByMultiPoly,
} from './planarGeom.mjs';
import { fixWalks } from './pocketWalks.mjs';
import { buildDefaultPocketCityConfig } from './pocketCityConfig.mjs';
import { generateProceduralLandmarks } from './pocketLandmarks.mjs';

const DRIVE = {
  motorway: 14,
  trunk: 14,
  primary: 13,
  secondary: 11,
  tertiary: 9.5,
  unclassified: 7,
  residential: 7,
  living_street: 5,
  service: 4.2,
  motorway_link: 7,
  trunk_link: 7,
  primary_link: 7,
  secondary_link: 6.5,
  tertiary_link: 6,
  road: 7,
  busway: 7,
};

const FOOT = {
  pedestrian: 6,
  footway: 2.4,
  path: 2,
  cycleway: 2.4,
  steps: 2.4,
  bridleway: 2.5,
  track: 3,
  corridor: 2,
};

const SIDEWALK = {
  motorway: 0,
  trunk: 3,
  primary: 3.2,
  secondary: 2.8,
  tertiary: 2.4,
  unclassified: 1.6,
  residential: 1.8,
  living_street: 0,
  service: 0,
  road: 1.8,
};

const RIVER = { river: 22, canal: 12, stream: 3, ditch: 1.6, drain: 1.6 };

function pickName(t = {}) {
  return t['name:zh-Hans'] || t['name:zh'] || t.name || '';
}

function parseLayer(t = {}) {
  const raw = Number.parseFloat(String(t.layer ?? '0'));
  return Number.isFinite(raw) ? raw : 0;
}

function isBridgeTag(t = {}) {
  return Boolean(t.bridge && !['no', 'false', '0'].includes(String(t.bridge).toLowerCase()));
}

function isTunnelTag(t = {}) {
  return Boolean(t.tunnel && !['no', 'false', '0'].includes(String(t.tunnel).toLowerCase()));
}

function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(',', '.');
  const m = s.match(/^\s*([\d.]+)/);
  if (!m) return null;
  let x = parseFloat(m[1]);
  if (!Number.isFinite(x)) return null;
  if (s.includes('ft') || s.includes("'")) x *= 0.3048;
  return x;
}

function seededRng(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function isWayClosed(e) {
  const g = e.geometry;
  if (!Array.isArray(g) || g.length < 4) return false;
  const a = g[0];
  const b = g[g.length - 1];
  return a.lat === b.lat && a.lon === b.lon;
}

function inBox(pt, half, margin = 0) {
  return (
    pt[0] >= -half + margin &&
    pt[0] <= half - margin &&
    pt[1] >= -half + margin &&
    pt[1] <= half - margin
  );
}

function distToMultiPolyBoundary(pt, mp) {
  let best = Infinity;
  for (const poly of mp) {
    for (const ring of poly) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const d = distPointToSeg(pt, ring[i], ring[(i + 1) % n]);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

function pointInsideBufferedMp(pt, mp, dist) {
  if (!mp || !mp.length) return false;
  const inside = pointInMultiPoly(pt, mp);
  if (dist >= 0) {
    return inside || distToMultiPolyBoundary(pt, mp) <= dist;
  }
  return inside && distToMultiPolyBoundary(pt, mp) >= -dist;
}

function extractBoundaryLines(mp) {
  const lines = [];
  for (const poly of mp) {
    for (const ring of poly) {
      if (ring.length >= 3) lines.push([...ring, ring[0]]);
    }
  }
  return lines;
}

function cleanPolyRings(poly, tol = 0.15) {
  const s = simplifyPoly(poly, tol);
  if (!s || !s.length || s[0].length < 3) return null;
  const ext = s[0].map(([x, y]) => [r2(x), r2(y)]);
  const holes = s
    .slice(1)
    .filter((r) => ringArea(r) > 4)
    .map((r) => r.map(([x, y]) => [r2(x), r2(y)]));
  return [ext, ...holes];
}

function clipPolysToScene(geoms, half, tol = 0.15, minArea = 1.5) {
  const u = polyUnion(geoms);
  if (!u.length) return [];
  const clipped = clipPolyToBox(u, half);
  const out = [];
  for (const p of clipped) {
    if (polyArea(p) < minArea) continue;
    const r = cleanPolyRings(p, tol);
    if (r) out.push(r);
  }
  return out;
}

export function buildPocketBundle(osmData, plot, geocodeMeta = {}, opts = {}) {
  const drive = opts.drive || geocodeMeta.drive || 'right';
  const level = Number(opts.level) || 3.2;
  const greenOpen = Number(opts.greenOpen) || 0;
  const bankTrees = Number(opts.bankTrees) || 0;

  const lat0 = plot.lat;
  const lon0 = plot.lon;
  const rot = Number(plot.rotation) || 0;
  const size = Number(plot.size) || 200;
  const half = size / 2;

  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110574;
  const rad = (-rot * Math.PI) / 180;
  const cr = Math.cos(rad);
  const sr = Math.sin(rad);

  const P = (lat, lon) => {
    const x = (lon - lon0) * kx;
    const y = (lat - lat0) * ky;
    return [x * cr - y * sr, x * sr + y * cr];
  };

  const sqBox = [-half, -half, half, half];
  const bigBox = [-half - 30, -half - 30, half + 30, half + 30];

  const els = osmData?.elements || [];
  const nodes = els.filter((e) => e.type === 'node' && Number.isFinite(e.lat) && Number.isFinite(e.lon));
  const ways = els.filter((e) => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 2);
  const rels = els.filter((e) => e.type === 'relation');

  const lineOf = (e) => e.geometry.map((p) => P(p.lat, p.lon));

  const polyOf = (e) => {
    if (e.type === 'way') {
      if (!isWayClosed(e)) return [];
      const p = normalizePoly([lineOf(e)]);
      return p ? [p] : [];
    }
    if (e.type === 'relation' && Array.isArray(e.members)) {
      const outer = [];
      const inner = [];
      for (const m of e.members) {
        if (!Array.isArray(m.geometry) || m.geometry.length < 4) continue;
        const p = normalizePoly([m.geometry.map((pt) => P(pt.lat, pt.lon))]);
        if (!p) continue;
        if (m.role === 'inner') inner.push(p);
        else if (m.role === 'outer') outer.push(p);
      }
      if (!outer.length) return [];
      const g = polyUnion(outer);
      if (!g.length) return [];
      return inner.length ? polyDiff(g, polyUnion(inner)) : g;
    }
    return [];
  };

  // ---------------- buildings ----------------
  const blds = [];
  for (const e of [...ways, ...rels]) {
    const t = e.tags || {};
    const isb = 'building' in t && t.building !== 'no';
    const isp = 'building:part' in t && t['building:part'] !== 'no';
    const isCoveredBridge = e.type === 'way' && t.man_made === 'bridge' && t.bridge === 'covered';
    if (!isb && !isp && !isCoveredBridge) continue;
    if (t.location === 'underground' || String(t.layer || '0').startsWith('-')) continue;
    const kind = t.building === 'roof' && !isp ? 'roof' : isp && !isb ? 'part' : 'building';
    const mp = polyOf(e);
    if (!mp.length || multiPolyArea(mp) < 3) continue;
    if (!bboxIntersects(bboxOfMultiPoly(mp), bigBox)) continue;
    blds.push({ e, t, mp, kind, isCoveredBridge });
  }

  const parts = blds.filter((b) => b.kind === 'part');
  if (parts.length) {
    for (const b of blds) {
      if (b.kind !== 'building') continue;
      const bBox = bboxOfMultiPoly(b.mp);
      const inside = [];
      const matchingParts = [];
      for (const p of parts) {
        if (!bboxIntersects(bBox, bboxOfMultiPoly(p.mp))) continue;
        const rp = representativePoint(p.mp[0]);
        if (pointInMultiPoly(rp, b.mp)) {
          inside.push(p.mp);
          matchingParts.push(p);
        }
      }
      if (inside.length) {
        const cover = multiPolyArea(polyIntersect(polyUnion(inside), b.mp));
        if (cover > 0.6 * multiPolyArea(b.mp)) {
          b.skip = true;
          const inheritKeys = ['name', 'name:zh', 'name:zh-Hans', 'wikidata', 'wikipedia', 'heritage', 'amenity', 'shop', 'tourism'];
          for (const p of matchingParts) {
            p.of = `${b.e.type[0]}${b.e.id}`;
            const inherited = {};
            for (const k of inheritKeys) {
              if (b.t[k] !== undefined) inherited[k] = b.t[k];
            }
            p.t = { ...inherited, ...p.t };
          }
        }
      }
    }
  }

  const famousNames = new Set(plot.famous_inside || []);
  const outBuildings = [];
  for (const b of blds) {
    if (b.skip) continue;
    const { t, mp } = b;
    const lv = num(t['building:levels']);
    const h = num(t.height);
    let mn = num(t.min_height);
    if (mn === null && num(t['building:min_level']) !== null) {
      mn = num(t['building:min_level']) * level;
    }
    let rh = num(t['roof:height']);
    if (rh === null && num(t['roof:levels']) !== null) {
      rh = num(t['roof:levels']) * level * 0.8;
    }
    const name = pickName(t);
    const famous =
      Boolean(b.isCoveredBridge) ||
      famousNames.has(t.name || '') ||
      famousNames.has(name) ||
      'wikidata' in t ||
      'wikipedia' in t ||
      'heritage' in t;
    const origArea = multiPolyArea(mp);
    const clipped = clipPolyToBox(mp, half);
    const cut = multiPolyArea(clipped) < origArea - 0.5;
    const validPieces = clipped.filter((p) => polyArea(p) >= 3);

    for (let k = 0; k < validPieces.length; k++) {
      const p = validPieces[k];
      const rr = cleanPolyRings(p, 0.15);
      if (!rr) continue;
      const obb = minimumRotatedRect(p);
      const raw = {
        id: `${b.e.type[0]}${b.e.id}${validPieces.length > 1 ? `.${k}` : ''}`,
        ring: rr[0],
        holes: rr.slice(1),
        kind: b.kind,
        type: t.building || t['building:part'] || (b.isCoveredBridge ? 'bridge' : undefined),
        h,
        lv,
        min: mn ?? 0,
        roof: t['roof:shape'],
        rh,
        rcol: t['roof:colour'],
        rdir: t['roof:orientation'],
        col: t['building:colour'],
        mat: t['building:material'],
        use: t.shop || t.amenity || t.tourism || t.office || t.craft,
        n: name,
        famous,
        cut,
        of: b.of,
        obb,
      };
      const clean = {};
      for (const [k2, v] of Object.entries(raw)) {
        if (k2 === 'min') {
          clean.min = v ?? 0;
        } else if (v !== null && v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0)) {
          clean[k2] = v;
        }
      }
      outBuildings.push(clean);
    }
  }

  // ---------------- streets, bridges, monorails & tunnels ----------------
  const carriage = [];
  const pave = [];
  const foot = [];
  const walk = [];
  const rails = [];
  const driveLines = [];
  const bridges = [];
  const rawTunnels = [];
  const pendingRoadBridges = [];
  const pendingSteps = [];

  for (const e of ways) {
    const t = e.tags || {};
    const hw = t.highway;
    const layer = parseLayer(t);
    const bridged = isBridgeTag(t);
    const tunneled = isTunnelTag(t) || layer < 0;

    if (hw) {
      const closed = isWayClosed(e);
      if ((t.area === 'yes' || (hw === 'pedestrian' && closed)) && closed) {
        const g = polyOf(e);
        if (g.length) walk.push(g);
      } else if (tunneled) {
        const L = lineOf(e);
        if (bboxIntersects(bboxOfPts(L), bigBox)) {
          if (hw in DRIVE) {
            const lanes = num(t.lanes);
            let w = num(t.width) || (lanes ? lanes * 3.1 : DRIVE[hw]);
            w = Math.max(4.5, Math.min(w, 22));
            rawTunnels.push({ kind: 'road_tunnel', name: pickName(t), layer: Math.min(-1, layer || -1), w, L });
          } else if (hw in FOOT) {
            rawTunnels.push({ kind: 'ped_tunnel', name: pickName(t), layer: Math.min(-1, layer || -1), w: num(t.width) || 3.0, L });
          }
        }
      } else {
        const L = lineOf(e);
        if (bboxIntersects(bboxOfPts(L), bigBox)) {
          if (hw in DRIVE) {
            const lanes = num(t.lanes);
            let w = num(t.width) || (lanes ? lanes * 3.1 : DRIVE[hw]);
            w = Math.max(3.2, Math.min(w, 30));
            const oneway = ['yes', '1', 'true'].includes(t.oneway) || t.junction === 'roundabout';
            let sw = SIDEWALK[hw] ?? 0;
            if (['no', 'none', 'separate'].includes(t.sidewalk)) sw = 0;
            else if (['both', 'left', 'right', 'yes'].includes(t.sidewalk) && sw === 0) sw = 1.6;
            if (bridged || layer >= 1) {
              pendingRoadBridges.push({ L, w, sw, hw, name: pickName(t), oneway, lanes, layer, bridge: t.bridge });
            } else {
              const carBuf = bufferPolyline(L, w / 2, 'flat');
              if (carBuf.length) carriage.push(carBuf);
              if (sw) {
                const swBuf = bufferPolyline(L, w / 2 + sw, 'flat');
                if (swBuf.length) pave.push(swBuf);
              }
              driveLines.push({ L, w, sw, hw, name: pickName(t), oneway, lanes });
            }
          } else if (hw in FOOT) {
            const w = num(t.width) || FOOT[hw];
            if (hw === 'steps') {
              pendingSteps.push({ L, w, name: pickName(t), bridged: bridged || layer >= 1, layer: Math.max(1, layer || 1) });
            } else if (bridged || layer >= 1) {
              const effLayer = Math.max(1, layer || 1);
              const z = r2(Math.min(11.5, 4.6 + (effLayer - 1) * 2.8));
              const bw = Math.max(2.2, num(t.width) || 3.2);
              for (const seg of clipLineToBox(L, half)) {
                if (lineLength(seg) > 2.0) {
                  bridges.push({
                    kind: 'footbridge',
                    name: pickName(t),
                    layer: effLayer,
                    z,
                    w: r2(bw),
                    p: seg.map(([x, y]) => [r2(x), r2(y)]),
                  });
                }
              }
            } else if (hw === 'pedestrian') {
              const wb = bufferPolyline(L, w / 2, 'flat');
              if (wb.length) walk.push(wb);
            } else {
              const fb = bufferPolyline(L, w / 2, 'round');
              if (fb.length) foot.push(fb);
            }
          }
        }
      }
    }

    if (t['area:highway'] || t.place === 'square') {
      const g = polyOf(e);
      if (g.length) walk.push(g);
    }
    if (['rail', 'tram', 'light_rail', 'subway', 'narrow_gauge', 'monorail'].includes(t.railway)) {
      const L = lineOf(e);
      if (bboxIntersects(bboxOfPts(L), bigBox)) {
        if (tunneled) {
          rawTunnels.push({ kind: 'rail_tunnel', name: pickName(t), layer: Math.min(-1, layer || -1), w: 4.4, L });
        } else if (t.railway === 'monorail' || bridged || layer >= 1) {
          const effLayer = t.railway === 'monorail' ? Math.max(2, layer || 2) : Math.max(1, layer || 1);
          const z = effLayer >= 3 ? 9.2 : effLayer >= 2 ? 7.6 : (t.railway === 'monorail' ? 7.6 : 5.8);
          const rw = t.railway === 'monorail' ? 1.8 : 4.2;
          const kind = t.railway === 'monorail' ? 'monorail' : 'rail_viaduct';
          for (const seg of clipLineToBox(L, half)) {
            if (lineLength(seg) > 3) {
              bridges.push({
                kind,
                name: pickName(t),
                layer: effLayer,
                z,
                w: rw,
                p: seg.map(([x, y]) => [r2(x), r2(y)]),
              });
            }
          }
        } else {
          for (const seg of clipLineToBox(L, half)) {
            if (lineLength(seg) > 4) {
              rails.push({ kind: t.railway, p: seg.map(([x, y]) => [r2(x), r2(y)]) });
            }
          }
        }
      }
    }
  }

  // Resolve steps: attach steps connected to footbridges as sloped 3D stairs
  const footbridges = bridges.filter((b) => b.kind === 'footbridge');
  for (const st of pendingSteps) {
    let nearBridge = null;
    let bestD = 3.5;
    for (const fb of footbridges) {
      const dStart = distPointToLine(st.L[0], fb.p);
      const dEnd = distPointToLine(st.L[st.L.length - 1], fb.p);
      const md = Math.min(dStart, dEnd);
      if (md < bestD) {
        bestD = md;
        nearBridge = fb;
      }
    }
    if (st.bridged || nearBridge) {
      const targetZ = nearBridge ? nearBridge.z : r2(Math.min(11.5, 4.6 + (st.layer - 1) * 2.8));
      for (const seg of clipLineToBox(st.L, half)) {
        if (lineLength(seg) > 1.5) {
          const d0 = nearBridge ? distPointToLine(seg[0], nearBridge.p) : 0;
          const d1 = nearBridge ? distPointToLine(seg[seg.length - 1], nearBridge.p) : 1;
          const z0 = d0 <= d1 ? targetZ : 0;
          const z1 = d0 <= d1 ? 0 : targetZ;
          bridges.push({
            kind: 'steps_bridge',
            name: st.name,
            layer: nearBridge ? nearBridge.layer : st.layer,
            z: r2(Math.max(z0, z1)),
            z0: r2(z0),
            z1: r2(z1),
            w: r2(Math.max(1.8, st.w)),
            p: seg.map(([x, y]) => [r2(x), r2(y)]),
          });
        }
      }
    } else {
      const fb = bufferPolyline(st.L, st.w / 2, 'round');
      if (fb.length) foot.push(fb);
    }
  }

  const carU = polyUnion(carriage);

  // Resolve road bridges & viaducts
  for (const rb of pendingRoadBridges) {
    const clipped = clipLineToBox(rb.L, half);
    const crossesCar =
      carU.length > 0 &&
      clipped.some((seg) => seg.some((pt) => pointInsideBufferedMp(pt, carU, 1.5)));
    const elevated = rb.bridge === 'viaduct' || rb.layer >= 2 || crossesCar;
    const z = elevated
      ? r2(Math.min(12, 4.8 + (Math.max(1, rb.layer) - 1) * 3.0))
      : 1.5;
    for (const seg of clipped) {
      if (lineLength(seg) > 3) {
        bridges.push({
          kind: 'road_bridge',
          name: rb.name,
          layer: Math.max(1, rb.layer),
          z,
          w: r2(rb.w),
          p: seg.map(([x, y]) => [r2(x), r2(y)]),
        });
      }
    }
  }

  // Resolve tunnels & detect exposed portals
  const tunnels = [];
  if (rawTunnels.length) {
    const endKey = (pt) => `${Math.round(pt[0] * 2) / 2},${Math.round(pt[1] * 2) / 2}`;
    const endCounts = new Map();
    for (const tu of rawTunnels) {
      if (tu.L.length < 2) continue;
      for (const pt of [tu.L[0], tu.L[tu.L.length - 1]]) {
        const k = endKey(pt);
        endCounts.set(k, (endCounts.get(k) || 0) + 1);
      }
    }
    for (const tu of rawTunnels) {
      if (tu.L.length < 2) continue;
      const portals = [];
      const first = tu.L[0];
      const next = tu.L[1];
      if (endCounts.get(endKey(first)) === 1 && inBox(first, half, 1.5)) {
        const l = Math.hypot(next[0] - first[0], next[1] - first[1]) || 1;
        portals.push({ x: r2(first[0]), y: r2(first[1]), dx: r2((next[0] - first[0]) / l), dy: r2((next[1] - first[1]) / l) });
      }
      const last = tu.L[tu.L.length - 1];
      const prev = tu.L[tu.L.length - 2];
      if (endCounts.get(endKey(last)) === 1 && inBox(last, half, 1.5)) {
        const l = Math.hypot(prev[0] - last[0], prev[1] - last[1]) || 1;
        portals.push({ x: r2(last[0]), y: r2(last[1]), dx: r2((prev[0] - last[0]) / l), dy: r2((prev[1] - last[1]) / l) });
      }
      for (const seg of clipLineToBox(tu.L, half)) {
        if (lineLength(seg) > 2.5) {
          const segPortals = portals.filter((p) => distPointToLine([p.x, p.y], seg) <= 2.0);
          tunnels.push({
            kind: tu.kind,
            name: tu.name,
            layer: tu.layer,
            w: r2(tu.w),
            p: seg.map(([x, y]) => [r2(x), r2(y)]),
            portals: segPortals,
          });
        }
      }
    }
  }
  const bldU = polyUnion(blds.filter((b) => b.kind !== 'roof' && !b.skip).map((b) => b.mp));
  let paveU = polyDiff(polyDiff(polyUnion([...pave, ...foot]), carU), bldU);
  let walkU = polyDiff(polyUnion(walk), carU);

  // ---------------- green, water, piers, sand ----------------
  const green = [];
  const water = [];
  for (const e of [...ways, ...rels]) {
    const t = e.tags || {};
    let kind = null;
    if (['park', 'garden', 'playground', 'pitch', 'common', 'dog_park'].includes(t.leisure)) kind = t.leisure;
    else if (
      ['grass', 'meadow', 'village_green', 'recreation_ground', 'cemetery', 'forest', 'orchard', 'allotments', 'flowerbed'].includes(
        t.landuse
      )
    )
      kind = t.landuse;
    else if (['grassland', 'scrub', 'wood', 'heath'].includes(t.natural)) kind = t.natural;

    if (kind) {
      const g = polyOf(e);
      if (g.length && bboxIntersects(bboxOfMultiPoly(g), sqBox)) green.push([kind, g]);
    }
    if (t.natural === 'water' || t.waterway === 'riverbank' || ['reservoir', 'basin'].includes(t.landuse) || t.water) {
      const g = polyOf(e);
      if (g.length && bboxIntersects(bboxOfMultiPoly(g), sqBox)) water.push(g);
    }
    if (e.type === 'way' && t.waterway in RIVER && t.tunnel !== 'culvert' && !isWayClosed(e)) {
      const w = num(t.width) || RIVER[t.waterway];
      const wb = bufferPolyline(lineOf(e), w / 2, 'flat');
      if (wb.length) water.push(wb);
    }
  }

  const coastSegs = [];
  for (const e of ways) {
    if (e.tags?.natural === 'coastline') {
      coastSegs.push(...clipLineToBox(lineOf(e), half + 40));
    }
  }
  if (coastSegs.length) {
    const regBox = makeBoxPoly(-half - 40, -half - 40, half + 40, half + 40)[0];
    const faces = polygonizeLines([[...regBox, regBox[0]], ...coastSegs]);
    for (const face of faces) {
      const q = representativePoint(face);
      let best = null;
      for (const s of coastSegs) {
        for (let i = 0; i < s.length - 1; i++) {
          const d = distPointToSeg(q, s[i], s[i + 1]);
          if (!best || d < best.d) best = { d, a: s[i], b: s[i + 1] };
        }
      }
      if (best && (best.b[0] - best.a[0]) * (q[1] - best.a[1]) - (best.b[1] - best.a[1]) * (q[0] - best.a[0]) < 0) {
        water.push(face);
      }
    }
  }

  let waterU = polyUnion(water);
  const piers = [];
  for (const e of ways) {
    const t = e.tags || {};
    if (['pier', 'breakwater', 'groyne', 'quay'].includes(t.man_made)) {
      const g = isWayClosed(e)
        ? polyOf(e)
        : bufferPolyline(lineOf(e), (num(t.width) || 3) / 2, 'flat');
      if (g.length && bboxIntersects(bboxOfMultiPoly(g), sqBox)) piers.push(g);
    }
  }
  const pierU = piers.length ? polyUnion(piers) : [];
  if (pierU.length) {
    walkU = polyDiff(polyUnion([walkU, pierU]), carU);
    waterU = polyDiff(waterU, pierU);
  }
  if (waterU.length) {
    paveU = polyDiff(paveU, waterU);
    walkU = polyDiff(walkU, waterU);
  }

  const sand = [];
  for (const e of [...ways, ...rels]) {
    const t = e.tags || {};
    if (['beach', 'sand'].includes(t.natural) || t.leisure === 'beach_resort') {
      const g = polyOf(e);
      if (g.length && bboxIntersects(bboxOfMultiPoly(g), sqBox)) sand.push(g);
    }
  }
  const sandU = sand.length ? polyDiff(polyDiff(polyDiff(polyUnion(sand), waterU), bldU), carU) : [];

  const lawns = [];
  for (const [kind, g] of green) {
    const cleanG = clipPolyToBox(polyDiff(polyDiff(polyDiff(g, carU), bldU), waterU), half);
    for (const p of cleanG) {
      if (polyArea(p) > 4) {
        const r = cleanPolyRings(p, 0.25);
        if (r) lawns.push({ kind, r });
      }
    }
  }

  // ---------------- trees ----------------
  const species = [];
  const trees = [];
  const spIndex = (t) => {
    let s =
      t['species:en'] ||
      t['taxon:en'] ||
      t.species ||
      t.taxon ||
      t['genus:en'] ||
      t.genus ||
      '';
    if (!s) {
      const lt = t.leaf_type;
      s = lt === 'broadleaved' ? 'Broadleaf tree' : lt === 'needleleaved' ? 'Conifer' : '';
    }
    if (!s) return -1;
    let idx = species.indexOf(s);
    if (idx === -1) {
      species.push(s);
      idx = species.length - 1;
    }
    return idx;
  };

  const addTree = (x, y, t) => {
    const pt = [x, y];
    if (!inBox(pt, half, 1) || pointInMultiPoly(pt, bldU) || pointInsideBufferedMp(pt, carU, -0.8)) {
      return;
    }
    const h = num(t.height);
    trees.push([r2(x), r2(y), spIndex(t), h ? String(Math.round(h * 10) / 10) : '']);
  };

  for (const n of nodes) {
    const t = n.tags || {};
    if (t.natural === 'tree') {
      const [x, y] = P(n.lat, n.lon);
      addTree(x, y, t);
    }
  }
  for (const e of ways) {
    const t = e.tags || {};
    if (t.natural === 'tree_row') {
      const L = lineOf(e);
      const len = lineLength(L);
      for (let k = 0; k <= len; k += 7) {
        const q = interpolateLine(L, k);
        addTree(q[0], q[1], t);
      }
    }
  }

  const waterBoundaryLines = waterU.length ? extractBoundaryLines(waterU) : [];

  if (bankTrees > 0 && waterU.length) {
    const bName = 'Bank tree';
    if (!species.includes(bName)) species.push(bName);
    const bIdx = species.indexOf(bName);
    const shoreSegs = waterBoundaryLines.flatMap((l) => clipLineToBox(l, half - 2));
    for (const l of shoreSegs) {
      const len = lineLength(l);
      for (let d = bankTrees / 2; d < len; d += bankTrees) {
        const p0 = interpolateLine(l, Math.max(0, d - 0.5));
        const p1 = interpolateLine(l, Math.min(len, d + 0.5));
        const tx = p1[0] - p0[0];
        const ty = p1[1] - p0[1];
        const m = Math.hypot(tx, ty) || 1;
        for (const sgn of [1, -1]) {
          const q = [
            p0[0] + tx * 0.5 + ((sgn * -ty) / m) * 1.7,
            p0[1] + ty * 0.5 + ((sgn * tx) / m) * 1.7,
          ];
          if (
            inBox(q, half, 1.5) &&
            !pointInsideBufferedMp(q, waterU, 0.9) &&
            !pointInsideBufferedMp(q, bldU, 1.4) &&
            !pointInsideBufferedMp(q, carU, 0.6) &&
            trees.every((tr) => distPt(q, tr) > 3)
          ) {
            trees.push([r2(q[0]), r2(q[1]), bIdx, '']);
            break;
          }
        }
      }
    }
  }

  if (greenOpen > 0) {
    const taken = polyUnion([bldU, carU, paveU, walkU, sandU, waterU, ...green.map(([, g]) => g)]);
    const openPolys = clipPolyToBox(polyDiff(makeBoxPoly(-half, -half, half, half), taken), half);
    for (const p of openPolys) {
      const area = polyArea(p);
      const perim = p[0] ? lineLength([...p[0], p[0][0]]) : 1;
      if (area > 60 && area / Math.max(1, perim) > 2.2) {
        green.push(['open', [p]]);
        const r = cleanPolyRings(p, 0.25);
        if (r) lawns.push({ kind: 'open', r });
      }
    }
  }

  const rng = seededRng(7);
  const SPACING = {
    open: greenOpen || 9,
    wood: 6.5,
    forest: 6.5,
    scrub: 7.5,
    park: 10,
    garden: 10,
    orchard: 7,
    cemetery: 12,
    nature_reserve: 7,
    village_green: 14,
    recreation_ground: 15,
    common: 12,
  };
  const isTreeBlocked = (pt) =>
    pointInsideBufferedMp(pt, bldU, 2.2) ||
    pointInsideBufferedMp(pt, carU, 1) ||
    pointInsideBufferedMp(pt, waterU, 0.6) ||
    pointInMultiPoly(pt, paveU) ||
    pointInMultiPoly(pt, walkU) ||
    pointInMultiPoly(pt, sandU);

  const existingTrees = trees.map((t) => [t[0], t[1]]);
  for (const [kind, g] of green) {
    const sp = SPACING[kind];
    if (!sp) continue;
    const area = clipPolyToBox(g, half - 1.5);
    if (!area.length) continue;
    if (existingTrees.some((pt) => pointInMultiPoly(pt, area) && !isTreeBlocked(pt))) continue;
    const tName = ['wood', 'forest', 'scrub', 'nature_reserve'].includes(kind)
      ? 'Woodland'
      : kind === 'open'
      ? 'Garden tree'
      : 'Park tree';
    let sIdx = species.indexOf(tName);
    if (sIdx === -1) {
      species.push(tName);
      sIdx = species.length - 1;
    }
    const [x0, y0, x1, y1] = bboxOfMultiPoly(area);
    let y = y0 + sp * 0.5;
    let row = 0;
    while (y < y1) {
      let x = x0 + (row % 2 ? sp * 0.5 : 0) + rng() * sp * 0.3;
      while (x < x1) {
        const px = x + (rng() * 0.7 - 0.35) * sp;
        const py = y + (rng() * 0.7 - 0.35) * sp;
        const pt = [px, py];
        if (pointInMultiPoly(pt, area) && !isTreeBlocked(pt) && trees.length < 1100) {
          trees.push([r2(px), r2(py), sIdx, '']);
        }
        x += sp;
      }
      y += sp * 0.87;
      row += 1;
    }
  }

  // Auto-plant boulevard & plaza trees when OSM tree coverage is sparse
  if (trees.length < 40) {
    let stIdx = species.indexOf('Street tree');
    if (stIdx === -1) {
      species.push('Street tree');
      stIdx = species.length - 1;
    }
    const bridgePts = bridges
      .filter((br) => br.kind === 'steps_bridge' || br.kind === 'footbridge')
      .flatMap((br) => br.p || []);
    const canPlant = (pt) =>
      inBox(pt, half, 3.5) &&
      !pointInsideBufferedMp(pt, bldU, 2.2) &&
      !pointInsideBufferedMp(pt, carU, 1.0) &&
      !pointInsideBufferedMp(pt, waterU, 1.0) &&
      bridgePts.every((bp) => distPt(pt, bp) > 3.0) &&
      trees.every((tr) => distPt(pt, tr) > 8.5);

    let addedAuto = 0;
    for (const d of driveLines) {
      if (addedAuto >= 55) break;
      const len = lineLength(d.L);
      for (let s = 7; s < len - 5 && addedAuto < 55; s += 15) {
        const a = interpolateLine(d.L, Math.max(0, s - 0.5));
        const b = interpolateLine(d.L, Math.min(len, s + 0.5));
        const tx = b[0] - a[0];
        const ty = b[1] - a[1];
        const m = Math.hypot(tx, ty) || 1;
        const off = d.w * 0.5 + 1.8;
        for (const sgn of [1, -1]) {
          const q = [a[0] + tx * 0.5 + ((-sgn * ty) / m) * off, a[1] + ty * 0.5 + ((sgn * tx) / m) * off];
          if (canPlant(q)) {
            const h = (7.2 + rng() * 1.8).toFixed(1);
            trees.push([r2(q[0]), r2(q[1]), stIdx, h]);
            addedAuto += 1;
          }
        }
      }
    }

    // Scatter plaza trees near buildings & along open pedestrian zones
    for (let y = -half + 6; y <= half - 6 && addedAuto < 55; y += 14) {
      for (let x = -half + 6; x <= half - 6 && addedAuto < 55; x += 14) {
        const q = [x + (rng() - 0.5) * 4.5, y + (rng() - 0.5) * 4.5];
        if (!canPlant(q)) continue;
        const nearWalk = pointInMultiPoly(q, walkU) || pointInMultiPoly(q, paveU);
        const nearBld = bldU.length > 0 && distPointToMultiPoly(q, bldU) <= 13.5;
        if (nearWalk || nearBld) {
          const h = (7.0 + rng() * 2.1).toFixed(1);
          trees.push([r2(q[0]), r2(q[1]), stIdx, h]);
          addedAuto += 1;
        }
      }
    }
  }

  // ---------------- boats (illustrative) ----------------
  const boats = [];
  if (waterU.length && multiPolyArea(waterU) > 300) {
    const quayAccess = polyUnion([carU, walkU, paveU]);
    const shoreEdges = waterBoundaryLines.flatMap((l) => clipLineToBox(l, half - 3));
    const hulls = [];
    let boatIdx = 0;
    const boatCorners = (cx, cy, ux, uy, L) => {
      const W = Math.max(1.5, L * 0.31) * 0.5 + 0.2;
      const h = L * 0.5 + 0.2;
      return [
        [cx + ux * -h - uy * -W, cy + uy * -h + ux * -W],
        [cx + ux * h - uy * -W, cy + uy * h + ux * -W],
        [cx + ux * h - uy * W, cy + uy * h + ux * W],
        [cx + ux * -h - uy * W, cy + uy * -h + ux * W],
      ];
    };
    const hullOverlaps = (cx, cy, r) => hulls.some((h) => Math.hypot(cx - h.cx, cy - h.cy) < r + h.r);

    for (const l of shoreEdges) {
      const len = lineLength(l);
      let d = 2.5;
      while (d < len - 2) {
        const a = interpolateLine(l, d - 0.5);
        const b = interpolateLine(l, d + 0.5);
        const tx = b[0] - a[0];
        const ty = b[1] - a[1];
        const n = Math.hypot(tx, ty) || 1;
        let nx = -ty / n;
        let ny = tx / n;
        let q = [a[0] + nx * 4, a[1] + ny * 4];
        if (!pointInMultiPoly(q, waterU)) {
          nx = -nx;
          ny = -ny;
          q = [a[0] + nx * 4, a[1] + ny * 4];
        }
        const deep = [a[0] + nx * 7, a[1] + ny * 7];
        const L = [5.2, 6, 7, 8.5][Math.floor(rng() * 4)];
        const cx = a[0] + nx * (L * 0.5 + 1.2);
        const cy = a[1] + ny * (L * 0.5 + 1.2);
        let straight = false;
        if (d > 3 && d < len - 3) {
          const p0 = interpolateLine(l, d - 3);
          const p1 = interpolateLine(l, d + 3);
          const ux = p1[0] - p0[0];
          const uy = p1[1] - p0[1];
          const m = Math.hypot(ux, uy) || 1;
          straight = Math.abs((ux * ty - uy * tx) / (m * n)) < 0.2 && m > 5.6;
        }
        const corners = boatCorners(cx, cy, nx, ny, L);
        const insideSea =
          pointInMultiPoly(deep, waterU) &&
          corners.every((pt) => inBox(pt, half, 2.4) && pointInsideBufferedMp(pt, waterU, -0.4));
        if (
          straight &&
          pointInsideBufferedMp(a, quayAccess, 6) &&
          insideSea &&
          !hullOverlaps(cx, cy, L * 0.5 + 0.4) &&
          rng() < 0.85
        ) {
          hulls.push({ cx, cy, r: L * 0.5 + 0.4 });
          boats.push({
            x: r2(cx),
            y: r2(cy),
            a: Math.round(((Math.atan2(ny, nx) * 180) / Math.PI) * 10) / 10,
            l: L,
            k: boatIdx++,
          });
        }
        d += [3.2, 3.6, 4.2][Math.floor(rng() * 3)];
      }
    }

    const [wx0, wy0, wx1, wy1] = bboxOfMultiPoly(waterU);
    for (let i = 0; i < 60 && boats.filter((b) => b.anchor).length < 9; i++) {
      const px = wx0 + rng() * (wx1 - wx0);
      const py = wy0 + rng() * (wy1 - wy0);
      const L = [7, 9, 11][Math.floor(rng() * 3)];
      const ang = (rng() * 2 - 1) * Math.PI;
      const corners = boatCorners(px, py, Math.cos(ang), Math.sin(ang), L);
      if (
        inBox([px, py], half, 18) &&
        pointInsideBufferedMp([px, py], waterU, -18) &&
        corners.every((pt) => inBox(pt, half, 5) && pointInsideBufferedMp(pt, waterU, -3)) &&
        !hullOverlaps(px, py, L * 0.5 + 4)
      ) {
        hulls.push({ cx: px, cy: py, r: L * 0.5 + 0.5 });
        boats.push({
          x: r2(px),
          y: r2(py),
          a: Math.round(((ang * 180) / Math.PI) * 10) / 10,
          l: L,
          k: boatIdx++,
          anchor: 1,
        });
      }
    }
  }

  let quay = [];
  let quayShade = [];
  let shore = [];
  if (waterU.length) {
    const shoreInside = waterBoundaryLines.flatMap((l) => clipLineToBox(l, half - 1.2));
    if (shoreInside.length) {
      const landMp = polyDiff(makeBoxPoly(-half, -half, half, half), waterU);
      const topBuf = polyUnion(shoreInside.map((l) => bufferPolyline(l, 0.45, 'flat')));
      const shadeBuf = polyUnion(shoreInside.map((l) => bufferPolyline(l, 0.7, 'flat')));
      quay = clipPolysToScene([polyIntersect(topBuf, landMp)], half, 0.1, 0.3);
      quayShade = clipPolysToScene([polyIntersect(shadeBuf, waterU)], half, 0.1, 0.3);
      for (const s of shoreInside) {
        const subLines = pierU.length
          ? splitLineByMultiPoly(s, pierU, false).filter((seg) =>
              seg.every((pt) => distPointToMultiPoly(pt, pierU) > 1.2)
            )
          : [s];
        for (const sl of subLines) {
          if (lineLength(sl) > 8) {
            shore.push(simplifyLine(sl, 0.2).map(([x, y]) => [r2(x), r2(y)]));
          }
        }
      }
    }
  }

  // ---------------- traffic routes ----------------
  const routes = [];
  const byDir = new Map();
  driveLines.forEach((d, idx) => {
    const key = `${d.name || idx}::${d.oneway}`;
    if (!byDir.has(key)) byDir.set(key, []);
    byDir.get(key).push(d);
  });

  const keepSide = drive === 'right' ? 1 : -1;
  for (const group of byDir.values()) {
    const merged = group.length > 1 ? mergeLines(group.map((g) => g.L)) : [group[0].L];
    const w = Math.max(...group.map((g) => g.w));
    const sw = Math.max(...group.map((g) => g.sw));
    const { hw, name } = group[0];
    for (const mLine of merged) {
      for (const s of clipLineToBox(mLine, half)) {
        if (lineLength(s) < 30) continue;
        if (sw) {
          for (const side of [-1, 1]) {
            const o = offsetPolyline(s, side * (w * 0.5 + sw * 0.5));
            if (!o) continue;
            for (const f of splitLineByMultiPoly(o, bldU, false)) {
              if (lineLength(f) > 20) {
                const pts = f.map(([x, y]) => [r2(x), r2(y)]);
                routes.push({ kind: 'ped', name, p: pts });
                routes.push({ kind: 'ped', name, p: [...pts].reverse() });
              }
            }
          }
        } else if (['living_street', 'service', 'residential', 'unclassified'].includes(hw) && w <= 7.5) {
          for (const side of [-1, 1]) {
            const o = offsetPolyline(s, side * (w * 0.5 - 0.6));
            if (o && lineLength(o) > 20) {
              for (const f of splitLineByMultiPoly(o, bldU, false)) {
                if (lineLength(f) > 20) {
                  const pts = f.map(([x, y]) => [r2(x), r2(y)]);
                  routes.push({ kind: 'ped', name, p: side < 0 ? pts : [...pts].reverse() });
                }
              }
            }
          }
        }
      }
    }
  }

  // Cars & bikes: shortest paths edge to edge via Dijkstra
  const graph = new Map();
  const nodePt = new Map();
  const wid = new Map();
  const vKey = (q) => {
    const x = Math.round(q[0] * 2) / 2;
    const y = Math.round(q[1] * 2) / 2;
    return `${x},${y}`;
  };
  for (const d of driveLines) {
    if (d.hw === 'service') continue;
    for (const seg of clipLineToBox(d.L, half + 0.5)) {
      for (let i = 0; i < seg.length - 1; i++) {
        const uk = vKey(seg[i]);
        const vk = vKey(seg[i + 1]);
        if (uk === vk) continue;
        const u = uk.split(',').map(Number);
        const v = vk.split(',').map(Number);
        nodePt.set(uk, u);
        nodePt.set(vk, v);
        const L = distPt(u, v);
        if (!graph.has(uk)) graph.set(uk, []);
        if (!graph.has(vk)) graph.set(vk, []);
        graph.get(uk).push([vk, L]);
        if (!d.oneway) graph.get(vk).push([uk, L]);
        wid.set(`${uk}|${vk}`, [d.w, d.oneway, d.hw]);
        wid.set(`${vk}|${uk}`, [d.w, d.oneway, d.hw]);
      }
    }
  }

  const nearEdge = [];
  for (const [k, pt] of nodePt.entries()) {
    if (Math.min(half - Math.abs(pt[0]), half - Math.abs(pt[1])) < 2.5) nearEdge.push(k);
  }
  const exits = new Set(nearEdge);
  const entries = nearEdge.filter((k) => (graph.get(k)?.length || 0) > 0);

  const dijkstra = (src) => {
    const dist = new Map([[src, 0]]);
    const prev = new Map();
    const pq = [[0, src]];
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]);
      const [dd, u] = pq.shift();
      if (dd > (dist.get(u) ?? Infinity)) continue;
      for (const [v, L] of graph.get(u) || []) {
        const nd = dd + L;
        if (nd < (dist.get(v) ?? Infinity)) {
          dist.set(v, nd);
          prev.set(v, u);
          pq.push([nd, v]);
        }
      }
    }
    return { dist, prev };
  };

  const cand = [];
  for (const src of entries) {
    const { dist, prev } = dijkstra(src);
    const sPt = nodePt.get(src);
    for (const dst of exits) {
      if (dst === src) continue;
      const dVal = dist.get(dst);
      if (dVal === undefined || dVal < 45) continue;
      if (distPt(sPt, nodePt.get(dst)) < 30) continue;
      const chain = [dst];
      while (chain[chain.length - 1] !== src) chain.push(prev.get(chain[chain.length - 1]));
      chain.reverse();
      cand.push([dVal, chain]);
    }
  }
  cand.sort((a, b) => b[0] - a[0]);

  const usedPairs = new Set();
  const chosen = [];
  for (const [, chain] of cand) {
    const pairKey = `${chain[0]}->${chain[chain.length - 1]}`;
    const c0 = nodePt.get(chain[0]);
    const c1 = nodePt.get(chain[chain.length - 1]);
    const tooClose = chosen.some((c) => {
      const o0 = nodePt.get(c[0]);
      const o1 = nodePt.get(c[c.length - 1]);
      return Math.abs(c0[0] - o0[0]) + Math.abs(c0[1] - o0[1]) < 3 && Math.abs(c1[0] - o1[0]) + Math.abs(c1[1] - o1[1]) < 3;
    });
    if (usedPairs.has(pairKey) || tooClose) continue;
    usedPairs.add(pairKey);
    chosen.push(chain);
    if (chosen.length >= 14) break;
  }

  let bikeCount = 0;
  for (const chain of chosen) {
    const line = simplifyLine(chain.map((k) => nodePt.get(k)), 0.3);
    let twoWay = false;
    let minW = 7;
    for (let i = 0; i < chain.length - 1; i++) {
      const meta = wid.get(`${chain[i]}|${chain[i + 1]}`) || [7, false, ''];
      if (!meta[1]) twoWay = true;
      if (meta[0] < minW) minW = meta[0];
    }
    const carOffset = offsetPolyline(line, -keepSide * (twoWay ? Math.min(minW / 4, 1.8) : 0));
    if (carOffset && lineLength(carOffset) > 40) {
      routes.push({ kind: 'car', name: '', p: carOffset.map(([x, y]) => [r2(x), r2(y)]) });
    }
    if (bikeCount < 12 && minW >= 5) {
      const bikeOffset = offsetPolyline(line, -keepSide * (minW * 0.5 - 0.9));
      if (bikeOffset && lineLength(bikeOffset) > 30) {
        routes.push({ kind: 'bike', name: '', p: bikeOffset.map(([x, y]) => [r2(x), r2(y)]) });
        bikeCount += 1;
      }
    }
  }

  for (const e of ways) {
    const t = e.tags || {};
    const layer = parseLayer(t);
    const onSurface = !isBridgeTag(t) && !isTunnelTag(t) && layer === 0;
    if (onSurface && ['footway', 'pedestrian', 'path', 'steps'].includes(t.highway) && t.area !== 'yes' && t.footway !== 'crossing') {
      for (const seg of clipLineToBox(lineOf(e), half)) {
        for (const f of splitLineByMultiPoly(seg, bldU, false)) {
          if (lineLength(f) > 20) {
            const pts = f.map(([x, y]) => [r2(x), r2(y)]);
            routes.push({ kind: 'ped', name: pickName(t), p: pts });
            routes.push({ kind: 'ped', name: pickName(t), p: [...pts].reverse() });
          }
        }
      }
    }
    if (onSurface && t.highway === 'cycleway') {
      for (const f of clipLineToBox(lineOf(e), half)) {
        if (lineLength(f) > 25) {
          const pts = f.map(([x, y]) => [r2(x), r2(y)]);
          routes.push({ kind: 'bike', name: pickName(t), p: pts });
          if (t.oneway !== 'yes') routes.push({ kind: 'bike', name: pickName(t), p: [...pts].reverse() });
        }
      }
    }
  }

  for (const br of bridges) {
    if (br.kind === 'footbridge' && lineLength(br.p) >= 8) {
      routes.push({ kind: 'ped', name: br.name || '', z: br.z, p: br.p });
      routes.push({ kind: 'ped', name: br.name || '', z: br.z, p: [...br.p].reverse() });
    } else if (br.kind === 'road_bridge' && lineLength(br.p) >= 16) {
      routes.push({ kind: 'car', name: br.name || '', z: br.z, p: br.p });
      routes.push({ kind: 'car', name: br.name || '', z: br.z, p: [...br.p].reverse() });
    }
  }

  // ---------------- lane lines, crossings ----------------
  const centerlines = [];
  for (const d of driveLines) {
    if (['primary', 'secondary', 'tertiary', 'trunk'].includes(d.hw) || (d.lanes || 0) >= 2) {
      for (const f of clipLineToBox(d.L, half)) {
        if (lineLength(f) > 10) {
          centerlines.push({ name: d.name, p: f.map(([x, y]) => [r2(x), r2(y)]) });
        }
      }
    }
  }

  const markings = [];
  for (const n of nodes) {
    const t = n.tags || {};
    if (t.highway === 'crossing' || ['zebra', 'marked', 'traffic_signals', 'uncontrolled'].includes(t.crossing)) {
      if (['unmarked', 'no'].includes(t.crossing)) continue;
      const p = P(n.lat, n.lon);
      if (!inBox(p, half, 3) || !driveLines.length) continue;
      let best = null;
      let bestDist = Infinity;
      for (const d of driveLines) {
        const dist = distPointToLine(p, d.L);
        if (dist < bestDist) {
          bestDist = dist;
          best = d;
        }
      }
      if (!best || bestDist > 2) continue;
      const s = projectOnLine(best.L, p);
      const a1 = interpolateLine(best.L, Math.max(0, s - 0.5));
      const b1 = interpolateLine(best.L, Math.min(lineLength(best.L), s + 0.5));
      const dx = b1[0] - a1[0];
      const dy = b1[1] - a1[1];
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l;
      const ny = dx / l;
      const hw2 = best.w * 0.5;
      markings.push([
        [r2(p[0] - nx * hw2), r2(p[1] - ny * hw2)],
        [r2(p[0] + nx * hw2), r2(p[1] + ny * hw2)],
      ]);
    }
  }

  // ---------------- POIs, furniture, café seating ----------------
  const pois = [];
  const furniture = [];
  const skipPoiKinds = new Set(['bench', 'waste_basket', 'bicycle_parking', 'parking', 'vending_machine', 'telephone', 'post_box']);
  for (const n of nodes) {
    const t = n.tags || {};
    const pt = P(n.lat, n.lon);
    if (!inBox(pt, half)) continue;
    const [x, y] = pt;
    const kind = t.shop || t.amenity || t.craft || t.tourism;
    const poiName = pickName(t);
    if (poiName && kind && !skipPoiKinds.has(kind)) {
      pois.push({ x: r2(x), y: r2(y), name: poiName, en: t['name:en'] || '', kind });
    }
    const hw = t.highway;
    if (hw === 'bus_stop') {
      furniture.push({ k: 'bus_stop', x: r2(x), y: r2(y), name: poiName, ref: t.ref || '', shelter: t.shelter === 'yes' });
    } else if (hw === 'street_lamp') furniture.push({ k: 'lamp', x: r2(x), y: r2(y) });
    else if (hw === 'traffic_signals') furniture.push({ k: 'signal', x: r2(x), y: r2(y) });
    else if (t.amenity === 'bench') furniture.push({ k: 'bench', x: r2(x), y: r2(y) });
    else if (t.amenity === 'vending_machine') furniture.push({ k: 'vending', x: r2(x), y: r2(y) });
    else if (t.amenity === 'fountain') furniture.push({ k: 'fountain', x: r2(x), y: r2(y) });
    else if (t.man_made === 'torii' || ['wayside_shrine', 'memorial', 'monument'].includes(t.historic)) {
      furniture.push({ k: t.man_made || t.historic, x: r2(x), y: r2(y), name: poiName });
    }
  }

  const openFloor = clipPolyToBox(polyDiff(polyDiff(polyUnion([walkU, paveU]), bldU), carU), half - 1);
  const tables = [];
  if (openFloor.length) {
    for (const n of nodes) {
      const t = n.tags || {};
      if (!['cafe', 'bar', 'restaurant', 'pub', 'ice_cream', 'fast_food'].includes(t.amenity) || t.outdoor_seating === 'no') {
        continue;
      }
      const p = P(n.lat, n.lon);
      if (!inBox(p, half)) continue;
      const insideOpen = pointInMultiPoly(p, openFloor);
      const q = insideOpen ? p : nearestPointOnMultiPoly(p, openFloor);
      if (!q || distPt(p, q) > 12) continue;
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const d = Math.hypot(dx, dy);
      const ux = d > 1e-4 ? dx / d : 0;
      const uy = d > 1e-4 ? dy / d : 1;
      for (let i = 0; i < 6; i++) {
        const cx = q[0] + ux * (1.4 + 2.3 * Math.floor(i / 3)) + -uy * 2.3 * ((i % 3) - 1);
        const cy = q[1] + uy * (1.4 + 2.3 * Math.floor(i / 3)) + ux * 2.3 * ((i % 3) - 1);
        const c = [cx, cy];
        if (pointInsideBufferedMp(c, openFloor, -0.9) && tables.every((a) => distPt(c, a) > 2)) {
          tables.push(c);
          furniture.push({ k: 'cafe', x: r2(cx), y: r2(cy), i: tables.length });
        }
      }
    }
  }

  // Auto-populate street furniture & plaza props (planters, benches, café umbrellas, kiosks) when sparse
  const isPropClear = (pt, minPropDist = 4.0) =>
    inBox(pt, half, 3.0) &&
    !pointInsideBufferedMp(pt, bldU, 1.5) &&
    !pointInsideBufferedMp(pt, carU, 1.2) &&
    !pointInsideBufferedMp(pt, waterU, 1.2) &&
    trees.every((tr) => distPt(pt, tr) > 2.2) &&
    furniture.every((f) => distPt([f.x, f.y], pt) > minPropDist);

  const plazaCandidates = [];
  for (const r of routes) {
    if (r.kind !== 'ped' || (r.z || 0) > 0) continue;
    const len = lineLength(r.p);
    for (let s = 5; s < len - 4; s += 9) {
      const pt = interpolateLine(r.p, s);
      if (isPropClear(pt, 3.0)) plazaCandidates.push(pt);
    }
  }
  for (let y = -half + 6; y <= half - 6; y += 11) {
    for (let x = -half + 6; x <= half - 6; x += 11) {
      const pt = [x + (rng() - 0.5) * 3, y + (rng() - 0.5) * 3];
      if (!isPropClear(pt, 3.0)) continue;
      const onOpen = openFloor.length > 0 && pointInsideBufferedMp(pt, openFloor, -0.6);
      const onPlazaApron =
        bldU.length > 0 &&
        distPointToMultiPoly(pt, bldU) >= 2.2 &&
        distPointToMultiPoly(pt, bldU) <= 9.0;
      if (onOpen || onPlazaApron) plazaCandidates.push(pt);
    }
  }

  let planterCount = furniture.filter((f) => f.k === 'planter').length;
  let benchCount = furniture.filter((f) => f.k === 'bench').length;
  let kioskCount = furniture.filter((f) => f.k === 'kiosk').length;

  for (const pt of plazaCandidates) {
    if (kioskCount < 2 && !pointInsideBufferedMp(pt, bldU, 3.5) && !pointInsideBufferedMp(pt, carU, 3.0)) {
      if (isPropClear(pt, 18.0)) {
        furniture.push({ k: 'kiosk', x: r2(pt[0]), y: r2(pt[1]) });
        kioskCount += 1;
        continue;
      }
    }
    if (tables.length < 6 && bldU.length > 0 && distPointToMultiPoly(pt, bldU) <= 8.5) {
      if (isPropClear(pt, 10.0)) {
        for (const [dx, dy] of [[0, 0], [2.4, 0.4], [1.1, 2.3]]) {
          const cp = [pt[0] + dx, pt[1] + dy];
          if (isPropClear(cp, 2.0)) {
            tables.push(cp);
            furniture.push({ k: 'cafe', x: r2(cp[0]), y: r2(cp[1]), i: tables.length });
          }
        }
        continue;
      }
    }
    if (planterCount < 12 && isPropClear(pt, 11.0)) {
      furniture.push({ k: 'planter', x: r2(pt[0]), y: r2(pt[1]), i: planterCount + 1 });
      planterCount += 1;
      continue;
    }
    if (benchCount < 8 && isPropClear(pt, 14.0)) {
      furniture.push({ k: 'bench', x: r2(pt[0]), y: r2(pt[1]) });
      benchCount += 1;
    }
  }

  // Snap pedestrian crossings to zebra markings
  const pedRoutes = routes.filter((r) => r.kind === 'ped');
  if (pedRoutes.length && carU.length && markings.length) {
    const fixed = fixWalks(pedRoutes.map((r) => r.p), carU, markings);
    pedRoutes.forEach((r, idx) => {
      r.p = fixed[idx].map(([x, y]) => [r2(x), r2(y)]);
    });
  }

  const north = [Number((-Math.sin(rad)).toFixed(5)), Number(Math.cos(rad).toFixed(5)), 0];
  const scene = {
    meta: {
      lat: lat0,
      lon: lon0,
      rotation: rot,
      size,
      half,
      north,
      drive,
      place: plot.place || geocodeMeta.place || '',
      osm_base: plot.osm_base ?? null,
      level,
    },
    corners: [
      [half, -half],
      [half, half],
      [-half, half],
      [-half, -half],
    ],
    buildings: outBuildings,
    roads: clipPolysToScene([carU], half),
    paths: clipPolysToScene([paveU], half, 0.2, 2),
    walk: clipPolysToScene([walkU], half, 0.2, 4),
    lawns,
    water: clipPolysToScene([waterU], half, 0.3, 4),
    sand: clipPolysToScene([sandU], half, 0.3, 4),
    boats,
    quay,
    quayShade,
    shore,
    rails,
    bridges,
    tunnels,
    trees,
    species,
    routes,
    markings,
    centerlines,
    pois,
    furniture,
  };

  const city = buildDefaultPocketCityConfig(scene, geocodeMeta);
  const { landmarksCode, landmarks } = generateProceduralLandmarks(scene, city);
  if (landmarks.length > 0) {
    const names = landmarks.map((lm) => lm.name).join('、');
    city.notes = [
      ...(Array.isArray(city.notes) ? city.notes : []),
      {
        title: '程序化地标建筑精修',
        text: `已为 ${names} 自动合成定制屋顶与建筑体块模板。`,
        links: [{ label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/' }],
      },
    ];
  }

  const slug = (city.name || 'citybox')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'citybox';

  return {
    id: opts.id || `osm-${slug}-${Date.now().toString(36)}`,
    scene,
    city,
    ...(landmarksCode ? { landmarksCode } : {}),
    pipelineSource: 'cloud_workshop',
    isLiveOSM: true,
    generatedAt: Date.now(),
  };
}
