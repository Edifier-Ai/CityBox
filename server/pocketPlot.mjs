import {
  bboxOfMultiPoly,
  makeRotatedBoxPoly,
  multiPolyArea,
  normalizePoly,
  polyArea,
  polyDiff,
  polyIntersect,
  polyUnion,
  representativePoint,
  ringArea,
} from './planarGeom.mjs';

const FAMOUS_BUILDINGS = new Set([
  'cathedral',
  'church',
  'chapel',
  'temple',
  'shrine',
  'mosque',
  'synagogue',
  'castle',
  'palace',
  'government',
  'train_station',
  'museum',
  'tower',
  'monastery',
  'basilica',
  'pagoda',
]);

const STREET_WEIGHTS = {
  primary: 3,
  secondary: 3,
  tertiary: 2.5,
  residential: 1.5,
  unclassified: 1.5,
  pedestrian: 1.5,
  living_street: 1.5,
  service: 0.6,
  footway: 0.4,
  trunk: 3,
};

function makeLocalProjector(lat0, lon0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110574;
  return (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky];
}

export function fame(tags = {}, keep = []) {
  const name = `${tags.name || ''}|${tags['name:en'] || ''}`;
  if (keep.length && keep.some((k) => k.trim() && name.toLowerCase().includes(k.trim().toLowerCase()))) {
    return 10;
  }
  const lodging =
    ['hotel', 'apartment', 'guest_house', 'hostel', 'motel'].includes(tags.tourism) ||
    ['hotel', 'apartments'].includes(tags.building);
  if (lodging && !('heritage' in tags || 'historic' in tags)) {
    return 0;
  }
  let s = 0;
  if ('wikidata' in tags || 'wikipedia' in tags) s += 3;
  if ('heritage' in tags || 'historic' in tags || 'heritage:operator' in tags) s += 2;
  if (tags.amenity === 'place_of_worship' || FAMOUS_BUILDINGS.has(tags.building)) s += 1.5;
  if (['attraction', 'museum', 'gallery'].includes(tags.tourism)) s += 1.5;
  return s;
}

export function streetBearing(els, en, centre = [0, 0], reach = 150) {
  const bins = new Float64Array(90);
  for (const e of els) {
    const hw = e.tags?.highway;
    if (e.type !== 'way' || !(hw in STREET_WEIGHTS) || !Array.isArray(e.geometry) || e.geometry.length < 2) {
      continue;
    }
    const pts = e.geometry.map((p) => en(p.lat, p.lon));
    const w = STREET_WEIGHTS[hw];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const mx = (a[0] + b[0]) * 0.5;
      const my = (a[1] + b[1]) * 0.5;
      if (Math.hypot(mx - centre[0], my - centre[1]) > reach) continue;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.1) continue;
      let ang = ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) % 90;
      if (ang < 0) ang += 90;
      for (let k = -3; k <= 3; k++) {
        const idx = (((Math.round(ang + k) % 90) + 90) % 90);
        bins[idx] += L * w * (1 - Math.abs(k) / 4);
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 90; i++) {
    if (bins[i] > bins[best]) best = i;
  }
  return best <= 45 ? best : best - 90;
}

function outlines(els, en) {
  const out = [];
  for (const e of els) {
    const t = e.tags || {};
    if (!('building' in t) && !('building:part' in t)) continue;
    let mp = [];
    if (e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 4) {
      const ring = e.geometry.map((p) => en(p.lat, p.lon));
      const p = normalizePoly([ring]);
      if (p) mp = [p];
    } else if (e.type === 'relation' && Array.isArray(e.members)) {
      const outer = [];
      for (const m of e.members) {
        if (m.role === 'outer' && Array.isArray(m.geometry) && m.geometry.length >= 4) {
          const p = normalizePoly([m.geometry.map((pt) => en(pt.lat, pt.lon))]);
          if (p) outer.push(p);
        }
      }
      if (outer.length) mp = polyUnion(outer);
    }
    if (!mp.length) continue;
    if (multiPolyArea(mp) > 2) {
      out.push({ e, mp });
    }
  }
  return out;
}

function approxDistToOrigin(mp) {
  const [minX, minY, maxX, maxY] = bboxOfMultiPoly(mp);
  const dx = minX > 0 ? minX : maxX < 0 ? -maxX : 0;
  const dy = minY > 0 ? minY : maxY < 0 ? -maxY : 0;
  return Math.hypot(dx, dy);
}

/**
 * Fast check whether a ring is strictly inside, outside, or intersects the boundary of rotated square.
 * Transform ring vertices into square-local coords [-half, half] x [-half, half].
 */
function classifyMultiPolyVsRotatedBox(mp, cx, cy, half, rotDeg) {
  const rad = (-rotDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);

  let allInside = true;
  let minU = Infinity, maxU = -Infinity;
  let minV = Infinity, maxV = -Infinity;
  const edgesCrossBoundary = [];

  for (const poly of mp) {
    for (const ring of poly) {
      const transformed = [];
      for (const [x, y] of ring) {
        const dx = x - cx;
        const dy = y - cy;
        const u = dx * c - dy * s;
        const v = dx * s + dy * c;
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
        if (u < -half || u > half || v < -half || v > half) {
          allInside = false;
        }
        transformed.push([u, v]);
      }
      edgesCrossBoundary.push(transformed);
    }
  }

  if (allInside) return 'inside';
  if (maxU < -half || minU > half || maxV < -half || minV > half) return 'outside';

  // Quick segment vs box boundary check for ordinary buildings
  return 'maybe_intersects';
}

function ringCrossesBoxEdge(ring, cx, cy, half, rotDeg) {
  const rad = (-rotDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  let allInside = true;
  const pts = [];
  for (const [x, y] of ring) {
    const dx = x - cx;
    const dy = y - cy;
    const u = dx * c - dy * s;
    const v = dx * s + dy * c;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    if (u < -half || u > half || v < -half || v > half) allInside = false;
    pts.push([u, v]);
  }
  if (allInside) return false;
  if (maxU < -half || minU > half || maxV < -half || minV > half) return false;

  // Check if any segment crosses u = +-half or v = +-half
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const in1 = Math.abs(x1) <= half && Math.abs(y1) <= half;
    const in2 = Math.abs(x2) <= half && Math.abs(y2) <= half;
    if (in1 !== in2) return true;
  }
  return true;
}

export function computePocketPlot(
  osmData,
  { lat, lon, size = 200, rotate = 'auto', keep = [], slide = 0.4, place = '' } = {}
) {
  const meta = osmData?.pocket_city || {};
  const lat0 = lat ?? meta.lat;
  const lon0 = lon ?? meta.lon;
  const plotSize = Math.max(80, Math.min(600, Number(size || meta.size || 200)));
  const els = osmData?.elements || [];
  const keepList = Array.isArray(keep)
    ? keep.filter((k) => String(k).trim())
    : String(keep || '')
        .split(';')
        .filter((k) => k.trim());

  const en = makeLocalProjector(lat0, lon0);

  let rot = 0;
  if (rotate === 'auto') {
    rot = streetBearing(els, en, [0, 0], plotSize * 0.75);
  } else if (rotate === 'north') {
    rot = 0;
  } else {
    const parsed = Number(rotate);
    rot = Number.isFinite(parsed) ? parsed : 0;
  }

  const blds = outlines(els, en);
  const famousMap = new Map();
  const ordinary = [];

  for (const { e, mp } of blds) {
    const t = e.tags || {};
    const s = fame(t, keepList);
    if (s <= 0) {
      if (approxDistToOrigin(mp) < plotSize * 1.2) {
        ordinary.push(mp[0][0]); // outer ring for fast edge check
      }
      continue;
    }
    const key = t.name || `${e.type}/${e.id}`;
    let rec = famousMap.get(key);
    if (!rec) {
      rec = { name: key, en: t['name:en'] || '', fame: 0, geoms: [], ids: [] };
      famousMap.set(key, rec);
    }
    rec.fame = Math.max(rec.fame, s);
    rec.geoms.push(mp);
    rec.ids.push(`${e.type}/${e.id}`);
  }

  const famous = [];
  for (const f of famousMap.values()) {
    const merged = polyUnion(f.geoms);
    if (!merged.length) continue;
    if (approxDistToOrigin(merged) < plotSize * 1.2) {
      f.mp = merged;
      famous.push(f);
    }
  }

  const half = plotSize / 2;

  function score(cx, cy, tr) {
    const sq = makeRotatedBoxPoly(cx, cy, half, tr);
    let cost = 0;
    const cut = [];
    const inside = [];

    for (const f of famous) {
      const cls = classifyMultiPolyVsRotatedBox(f.mp, cx, cy, half, tr);
      if (cls === 'inside') {
        inside.push(f.name);
        continue;
      }
      if (cls === 'outside') {
        if (f.fame >= 10) {
          cost += 2000 + multiPolyArea(f.mp) * 2;
        }
        continue;
      }
      const inter = polyIntersect(f.mp, sq);
      const interArea = multiPolyArea(inter);
      if (f.fame >= 10) {
        const diff = polyDiff(f.mp, sq);
        cost += 2000 + multiPolyArea(diff) * 2;
        if (interArea >= 1) cut.push(f.name);
        continue;
      }
      if (interArea < 1) continue;
      // Check if wholly inside even though bbox touched
      const diff = polyDiff(f.mp, sq);
      if (multiPolyArea(diff) < 0.5) {
        inside.push(f.name);
        continue;
      }
      cut.push(f.name);
      cost += 120 * f.fame;
    }

    let edgeHits = 0;
    for (const ring of ordinary) {
      if (ringCrossesBoxEdge(ring, cx, cy, half, tr)) edgeHits++;
    }
    cost += edgeHits * 0.04;
    cost += (Math.hypot(cx, cy) / plotSize) * 12;
    return { cost, cut, inside };
  }

  const turns = rotate === 'auto' ? [rot, 0, rot - 8, rot + 8] : [rot];
  let best = null;
  const step = Math.max(4, plotSize / 40);
  const r = Math.floor((plotSize * slide) / step);

  for (let k = 0; k < turns.length; k++) {
    const tr = turns[k];
    const cr = Math.cos((tr * Math.PI) / 180);
    const sr = Math.sin((tr * Math.PI) / 180);
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        const dx = i * step;
        const dy = j * step;
        const cx = dx * cr - dy * sr;
        const cy = dx * sr + dy * cr;
        const res = score(cx, cy, tr);
        const totalCost = res.cost + (k > 0 ? 3 : 0);
        if (!best || totalCost < best.cost) {
          best = { cost: totalCost, cx, cy, cut: res.cut, inside: res.inside, rot: tr };
        }
      }
    }
    const missingKeep = famous.some((f) => f.fame >= 10 && !best.inside.includes(f.name));
    if (best.cut.length === 0 && !missingKeep) break;
  }

  const { cx, cy, cut, inside, rot: finalRot } = best || {
    cx: 0,
    cy: 0,
    cut: [],
    inside: [],
    rot,
  };
  const invKx = 1 / (111320 * Math.cos((lat0 * Math.PI) / 180));
  const clat = lat0 + cy / 110574;
  const clon = lon0 + cx * invKx;
  const tooBig = famous.filter((f) => f.fame >= 10 && !inside.includes(f.name)).map((f) => f.name);

  return {
    lat: Math.round(clat * 1e7) / 1e7,
    lon: Math.round(clon * 1e7) / 1e7,
    rotation: Math.round(finalRot * 100) / 100,
    size: plotSize,
    asked: { lat: lat0, lon: lon0 },
    moved_m: Math.round(Math.hypot(cx, cy) * 10) / 10,
    famous_inside: [...inside].sort(),
    famous_cut: [...cut].sort(),
    keep_missing: tooBig,
    place: place || meta.place || '',
    osm_base: meta.osm_base || 'OpenStreetMap contributors',
  };
}
