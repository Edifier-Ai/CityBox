import * as turf from '@turf/turf';

/**
 * Planar 2D geometry utilities for Pocket City metre coordinates (x east, y north).
 *
 * Conventions:
 * - Point: [x, y]
 * - Ring: Point[] (unclosed internally unless GeoJSON feature conversion closes it)
 * - Poly: Ring[] where Poly[0] is exterior ring and Poly[1..] are hole rings
 * - MultiPoly: Poly[]
 */

const EPS = 1e-7;

export function r2(v) {
  return Math.round(v * 100) / 100;
}

export function hypot2(dx, dy) {
  return Math.hypot(dx, dy);
}

export function distPt(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function ensureUnclosed(ring) {
  if (!ring || ring.length === 0) return [];
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    if (out.length === 0 || Math.abs(p[0] - out[out.length - 1][0]) > EPS || Math.abs(p[1] - out[out.length - 1][1]) > EPS) {
      out.push([p[0], p[1]]);
    }
  }
  if (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) <= EPS && Math.abs(out[0][1] - out[out.length - 1][1]) <= EPS) {
    out.pop();
  }
  return out;
}

export function ensureClosed(ring) {
  const u = ensureUnclosed(ring);
  if (u.length < 3) return [];
  return [...u, [u[0][0], u[0][1]]];
}

export function ringSignedArea(ring) {
  const n = ring.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return sum * 0.5;
}

export function ringArea(ring) {
  return Math.abs(ringSignedArea(ring));
}

export function polyArea(poly) {
  if (!poly || !poly.length) return 0;
  let a = ringArea(poly[0]);
  for (let i = 1; i < poly.length; i++) {
    a -= ringArea(poly[i]);
  }
  return Math.max(0, a);
}

export function multiPolyArea(mp) {
  if (!mp || !mp.length) return 0;
  let a = 0;
  for (const p of mp) a += polyArea(p);
  return a;
}

export function normalizePoly(poly) {
  if (!poly || !poly.length) return null;
  const ext = ensureUnclosed(poly[0]);
  if (ext.length < 3 || ringArea(ext) < 1e-5) return null;
  // Exterior CCW (positive signed area)
  if (ringSignedArea(ext) < 0) ext.reverse();
  const res = [ext];
  for (let i = 1; i < poly.length; i++) {
    const hole = ensureUnclosed(poly[i]);
    if (hole.length >= 3 && ringArea(hole) > 1e-5) {
      if (ringSignedArea(hole) > 0) hole.reverse();
      res.push(hole);
    }
  }
  return res;
}

export function bboxOfPts(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

export function bboxOfPoly(poly) {
  return bboxOfPts(poly[0]);
}

export function bboxOfMultiPoly(mp) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of mp) {
    const b = bboxOfPoly(poly);
    if (b[0] < minX) minX = b[0];
    if (b[1] < minY) minY = b[1];
    if (b[2] > maxX) maxX = b[2];
    if (b[3] > maxY) maxY = b[3];
  }
  return [minX, minY, maxX, maxY];
}

export function bboxIntersects(a, b, pad = 0) {
  return a[0] - pad <= b[2] && a[2] + pad >= b[0] && a[1] - pad <= b[3] && a[3] + pad >= b[1];
}

export function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-30) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPoly(pt, poly) {
  if (!poly || !poly.length) return false;
  if (!pointInRing(pt, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) {
    if (pointInRing(pt, poly[i])) return false;
  }
  return true;
}

export function pointInMultiPoly(pt, mp) {
  for (const p of mp) {
    if (pointInPoly(pt, p)) return true;
  }
  return false;
}

export function polyCentroid(polyOrRing) {
  const ring = Array.isArray(polyOrRing[0]?.[0]) ? polyOrRing[0] : polyOrRing;
  const n = ring.length;
  if (!n) return [0, 0];
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(a) < 1e-8) {
    let sx = 0, sy = 0;
    for (const [x, y] of ring) { sx += x; sy += y; }
    return [sx / n, sy / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function representativePoint(poly) {
  const c = polyCentroid(poly);
  if (pointInPoly(c, poly)) return c;
  // Horizontal scanline at bbox vertical midpoints
  const [minX, minY, maxX, maxY] = bboxOfPoly(poly);
  for (const frac of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const y = minY + (maxY - minY) * frac;
    const xs = [];
    for (const ring of poly) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % n];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
        }
      }
    }
    xs.sort((a, b) => a - b);
    if (xs.length >= 2) {
      const mx = (xs[0] + xs[1]) * 0.5;
      if (pointInPoly([mx, y], poly)) return [mx, y];
    }
  }
  return c;
}

export function distPointToSegSq(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = a[0] + t * dx;
  const py = a[1] + t * dy;
  return (p[0] - px) ** 2 + (p[1] - py) ** 2;
}

export function distPointToSeg(p, a, b) {
  return Math.sqrt(distPointToSegSq(p, a, b));
}

export function nearestPointOnSeg(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return [a[0], a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return [a[0] + t * dx, a[1] + t * dy];
}

export function distPointToLine(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distPointToSegSq(p, pts[i], pts[i + 1]);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function distPointToRing(p, ring) {
  let best = Infinity;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const d = distPointToSegSq(p, ring[i], ring[(i + 1) % n]);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function distPointToPoly(p, poly) {
  if (pointInPoly(p, poly)) return 0;
  let best = distPointToRing(p, poly[0]);
  for (let i = 1; i < poly.length; i++) {
    const d = distPointToRing(p, poly[i]);
    if (d < best) best = d;
  }
  return best;
}

export function distPointToMultiPoly(p, mp) {
  let best = Infinity;
  for (const poly of mp) {
    const d = distPointToPoly(p, poly);
    if (d === 0) return 0;
    if (d < best) best = d;
  }
  return best;
}

export function nearestPointOnMultiPoly(p, mp) {
  if (pointInMultiPoly(p, mp)) return [p[0], p[1]];
  let bestDistSq = Infinity;
  let bestPt = null;
  for (const poly of mp) {
    for (const ring of poly) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const q = nearestPointOnSeg(p, ring[i], ring[(i + 1) % n]);
        const dSq = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestPt = q;
        }
      }
    }
  }
  return bestPt;
}

export function lineLength(pts) {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += distPt(pts[i], pts[i + 1]);
  }
  return total;
}

export function interpolateLine(pts, d) {
  if (!pts || pts.length === 0) return [0, 0];
  if (pts.length === 1 || d <= 0) return [pts[0][0], pts[0][1]];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const seg = distPt(a, b);
    if (acc + seg >= d && seg > 1e-12) {
      const t = (d - acc) / seg;
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  return [last[0], last[1]];
}

export function projectOnLine(pts, p) {
  let bestDistSq = Infinity;
  let bestS = 0;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    const seg = Math.sqrt(lenSq);
    if (lenSq > 1e-12) {
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
      const px = a[0] + t * dx;
      const py = a[1] + t * dy;
      const dSq = (p[0] - px) ** 2 + (p[1] - py) ** 2;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestS = acc + t * seg;
      }
    }
    acc += seg;
  }
  return bestS;
}

export function simplifyLine(pts, tol = 0.15) {
  if (!pts || pts.length <= 2 || tol <= 0) return pts ? pts.map((p) => [p[0], p[1]]) : [];
  const tolSq = tol * tol;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    if (end - start <= 1) continue;
    let maxDistSq = 0;
    let idx = -1;
    for (let i = start + 1; i < end; i++) {
      const dSq = distPointToSegSq(pts[i], pts[start], pts[end]);
      if (dSq > maxDistSq) {
        maxDistSq = dSq;
        idx = i;
      }
    }
    if (maxDistSq > tolSq && idx !== -1) {
      keep[idx] = 1;
      stack.push([start, idx], [idx, end]);
    }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    if (keep[i]) out.push([pts[i][0], pts[i][1]]);
  }
  return out;
}

export function simplifyRing(ring, tol = 0.15) {
  const u = ensureUnclosed(ring);
  if (u.length <= 3 || tol <= 0) return u;
  // Close temporarily, simplify, unclose
  const closed = [...u, u[0]];
  const simp = simplifyLine(closed, tol);
  simp.pop();
  return simp.length >= 3 ? simp : u;
}

export function simplifyPoly(poly, tol = 0.15) {
  if (!poly || !poly.length) return null;
  const ext = simplifyRing(poly[0], tol);
  if (ext.length < 3 || ringArea(ext) < 1e-4) return null;
  const out = [ext];
  for (let i = 1; i < poly.length; i++) {
    const h = simplifyRing(poly[i], tol);
    if (h.length >= 3 && ringArea(h) > 4) out.push(h);
  }
  return out;
}

// ---------------- Convex Hull & Minimum Rotated Rectangle (OBB) ----------------

export function convexHull(pts) {
  const sorted = pts
    .map((p) => [p[0], p[1]])
    .sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
  if (sorted.length <= 2) return sorted;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function minimumRotatedRect(poly) {
  const ring = Array.isArray(poly[0]?.[0]) ? poly[0] : poly;
  const area = Array.isArray(poly[0]?.[0]) ? polyArea(poly) : ringArea(ring);
  const hull = convexHull(ring);
  if (hull.length < 3) {
    const c = polyCentroid(ring);
    return { c: [r2(c[0]), r2(c[1])], ax: [1, 0], L: 1, W: 1, fill: 1 };
  }

  let bestArea = Infinity;
  let best = null;

  for (let i = 0; i < hull.length; i++) {
    const p0 = hull[i];
    const p1 = hull[(i + 1) % hull.length];
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const ux = dx / len;
    const uy = dy / len;
    const vx = -uy;
    const vy = ux;

    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;
    for (const [x, y] of hull) {
      const u = x * ux + y * uy;
      const v = x * vx + y * vy;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const spanU = maxU - minU;
    const spanV = maxV - minV;
    const rectArea = spanU * spanV;
    if (rectArea < bestArea) {
      bestArea = rectArea;
      const cu = (minU + maxU) * 0.5;
      const cv = (minV + maxV) * 0.5;
      const cx = cu * ux + cv * vx;
      const cy = cu * uy + cv * vy;
      const L = Math.max(spanU, spanV);
      const W = Math.min(spanU, spanV);
      const ax = spanU >= spanV ? [ux, uy] : [vx, vy];
      best = {
        c: [r2(cx), r2(cy)],
        ax: [Math.round(ax[0] * 10000) / 10000, Math.round(ax[1] * 10000) / 10000],
        L: r2(L),
        W: r2(W),
        fill: Math.round((area / (rectArea || 1)) * 1000) / 1000,
      };
    }
  }
  return best || { c: [0, 0], ax: [1, 0], L: 1, W: 1, fill: 1 };
}

// ---------------- Turf v7 GeoJSON Polygon Booleans (Planar 2D) ----------------

function polyToTurfFeature(poly) {
  const norm = normalizePoly(poly);
  if (!norm) return null;
  const coords = norm.map((r) => [...r, r[0]]);
  try {
    return turf.polygon(coords);
  } catch {
    return null;
  }
}

function multiPolyToTurfFeature(mp) {
  const valid = [];
  for (const p of mp) {
    const norm = normalizePoly(p);
    if (norm) valid.push(norm.map((r) => [...r, r[0]]));
  }
  if (!valid.length) return null;
  if (valid.length === 1) return turf.polygon(valid[0]);
  return turf.multiPolygon(valid);
}

function turfFeatureToMultiPoly(feat) {
  if (!feat || !feat.geometry) return [];
  const { type, coordinates } = feat.geometry;
  const out = [];
  if (type === 'Polygon') {
    const p = normalizePoly(coordinates.map((r) => r.slice(0, -1)));
    if (p) out.push(p);
  } else if (type === 'MultiPolygon') {
    for (const polyCoords of coordinates) {
      const p = normalizePoly(polyCoords.map((r) => r.slice(0, -1)));
      if (p) out.push(p);
    }
  }
  return out;
}

export function polyUnion(polys) {
  const feats = [];
  for (const p of polys) {
    if (!p || !p.length) continue;
    // Detect whether p is Poly or MultiPoly
    if (Array.isArray(p[0]?.[0]?.[0])) {
      for (const sub of p) {
        const f = polyToTurfFeature(sub);
        if (f) feats.push(f);
      }
    } else {
      const f = polyToTurfFeature(p);
      if (f) feats.push(f);
    }
  }
  if (feats.length === 0) return [];
  if (feats.length === 1) return turfFeatureToMultiPoly(feats[0]);
  try {
    const res = turf.union(turf.featureCollection(feats));
    return turfFeatureToMultiPoly(res);
  } catch {
    // Fallback: pairwise union skipping broken geometries
    let acc = turfFeatureToMultiPoly(feats[0]);
    for (let i = 1; i < feats.length; i++) {
      const accFeat = multiPolyToTurfFeature(acc);
      if (!accFeat) {
        acc = turfFeatureToMultiPoly(feats[i]);
        continue;
      }
      try {
        const merged = turf.union(turf.featureCollection([accFeat, feats[i]]));
        acc = turfFeatureToMultiPoly(merged);
      } catch {
        // Skip degenerate polygon
      }
    }
    return acc;
  }
}

export function polyDiff(mpA, mpB) {
  const fA = Array.isArray(mpA?.[0]?.[0]?.[0]) ? multiPolyToTurfFeature(mpA) : polyToTurfFeature(mpA);
  if (!fA) return [];
  const fB = Array.isArray(mpB?.[0]?.[0]?.[0]) ? multiPolyToTurfFeature(mpB) : polyToTurfFeature(mpB);
  if (!fB) return turfFeatureToMultiPoly(fA);
  try {
    const res = turf.difference(turf.featureCollection([fA, fB]));
    return turfFeatureToMultiPoly(res);
  } catch {
    return turfFeatureToMultiPoly(fA);
  }
}

export function polyIntersect(mpA, mpB) {
  const fA = Array.isArray(mpA?.[0]?.[0]?.[0]) ? multiPolyToTurfFeature(mpA) : polyToTurfFeature(mpA);
  const fB = Array.isArray(mpB?.[0]?.[0]?.[0]) ? multiPolyToTurfFeature(mpB) : polyToTurfFeature(mpB);
  if (!fA || !fB) return [];
  try {
    const res = turf.intersect(turf.featureCollection([fA, fB]));
    return turfFeatureToMultiPoly(res);
  } catch {
    return [];
  }
}

export function makeBoxPoly(minX, minY, maxX, maxY) {
  return [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]];
}

export function makeRotatedBoxPoly(cx, cy, half, rotDeg) {
  const rad = (rotDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const corners = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  return [corners.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c])];
}

// ---------------- Offsets & Buffers ----------------

export function offsetPolyline(pts, d, mitreLimit = 3) {
  if (!pts || pts.length < 2) return [];
  if (Math.abs(d) < 1e-4) return pts.map((p) => [p[0], p[1]]);
  // Clean duplicates
  const clean = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (distPt(pts[i], clean[clean.length - 1]) > 1e-4) clean.push(pts[i]);
  }
  if (clean.length < 2) return [];

  const n = clean.length;
  const normals = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = clean[i + 1][0] - clean[i][0];
    const dy = clean[i + 1][1] - clean[i][1];
    const L = Math.hypot(dx, dy) || 1;
    // Left-hand normal
    normals.push([-dy / L, dx / L]);
  }

  const out = [];
  out.push([clean[0][0] + normals[0][0] * d, clean[0][1] + normals[0][1] * d]);

  for (let i = 1; i < n - 1; i++) {
    const n0 = normals[i - 1];
    const n1 = normals[i];
    const bx = n0[0] + n1[0];
    const by = n0[1] + n1[1];
    const bLen = Math.hypot(bx, by);
    if (bLen < 1e-4) {
      out.push([clean[i][0] + n0[0] * d, clean[i][1] + n0[1] * d]);
      out.push([clean[i][0] + n1[0] * d, clean[i][1] + n1[1] * d]);
      continue;
    }
    const ux = bx / bLen;
    const uy = by / bLen;
    const dot = ux * n0[0] + uy * n0[1];
    const miterScale = dot > 1e-3 ? 1 / dot : mitreLimit;
    if (miterScale <= mitreLimit) {
      out.push([clean[i][0] + ux * d * miterScale, clean[i][1] + uy * d * miterScale]);
    } else {
      // Bevel join when miter exceeds limit
      out.push([clean[i][0] + n0[0] * d, clean[i][1] + n0[1] * d]);
      out.push([clean[i][0] + n1[0] * d, clean[i][1] + n1[1] * d]);
    }
  }

  out.push([clean[n - 1][0] + normals[n - 2][0] * d, clean[n - 1][1] + normals[n - 2][1] * d]);
  return out;
}

function makeCirclePoly(cx, cy, r, steps = 10) {
  const ring = [];
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return [ring];
}

export function bufferPolyline(pts, halfWidth, cap = 'flat') {
  if (!pts || pts.length < 2 || halfWidth <= 1e-4) return [];
  const clean = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (distPt(pts[i], clean[clean.length - 1]) > 1e-4) clean.push(pts[i]);
  }
  if (clean.length < 2) return [];

  const pieces = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i];
    const b = clean[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-5) continue;
    const ux = dx / L;
    const uy = dy / L;
    const nx = -uy * halfWidth;
    const ny = ux * halfWidth;
    const extA = cap === 'square' && i === 0 ? [-ux * halfWidth, -uy * halfWidth] : [0, 0];
    const extB = cap === 'square' && i === clean.length - 2 ? [ux * halfWidth, uy * halfWidth] : [0, 0];
    pieces.push([
      [
        [a[0] + extA[0] - nx, a[1] + extA[1] - ny],
        [b[0] + extB[0] - nx, b[1] + extB[1] - ny],
        [b[0] + extB[0] + nx, b[1] + extB[1] + ny],
        [a[0] + extA[0] + nx, a[1] + extA[1] + ny],
      ],
    ]);
    if (i > 0) {
      pieces.push(makeCirclePoly(a[0], a[1], halfWidth, 8));
    }
  }
  if (cap === 'round') {
    pieces.push(makeCirclePoly(clean[0][0], clean[0][1], halfWidth, 10));
    pieces.push(makeCirclePoly(clean[clean.length - 1][0], clean[clean.length - 1][1], halfWidth, 10));
  }
  return polyUnion(pieces);
}

export function bufferMultiPoly(mp, dist) {
  if (!mp || !mp.length) return [];
  if (Math.abs(dist) < 1e-4) return mp;
  const ringsToBuf = [];
  for (const poly of mp) {
    for (const ring of poly) {
      if (ring.length >= 3) ringsToBuf.push([...ring, ring[0]]);
    }
  }
  if (!ringsToBuf.length) return [];
  const boundaryBuf = polyUnion(ringsToBuf.map((r) => bufferPolyline(r, Math.abs(dist), 'round')));
  if (dist > 0) {
    return polyUnion([...mp, ...boundaryBuf]);
  }
  return polyDiff(mp, boundaryBuf);
}

// ---------------- Line Clipping & Line-vs-Polygon Operations ----------------

function clipSegToBox(a, b, half) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const checks = [
    [-dx, a[0] + half],
    [dx, half - a[0]],
    [-dy, a[1] + half],
    [dy, half - a[1]],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

export function clipLineToBox(pts, half) {
  if (!pts || pts.length < 2) return [];
  const lines = [];
  let cur = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = clipSegToBox(pts[i], pts[i + 1], half);
    if (!seg) {
      if (cur.length >= 2) lines.push(cur);
      cur = [];
      continue;
    }
    if (cur.length === 0) {
      cur.push(seg[0], seg[1]);
    } else if (distPt(cur[cur.length - 1], seg[0]) < 1e-5) {
      cur.push(seg[1]);
    } else {
      if (cur.length >= 2) lines.push(cur);
      cur = [seg[0], seg[1]];
    }
  }
  if (cur.length >= 2) lines.push(cur);
  return lines;
}

export function clipPolyToBox(mp, half) {
  const box = makeBoxPoly(-half, -half, half, half);
  return polyIntersect(mp, box);
}

function segSegParam(a, b, c, d) {
  const rX = b[0] - a[0];
  const rY = b[1] - a[1];
  const sX = d[0] - c[0];
  const sY = d[1] - c[1];
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-12) return null;
  const qpx = c[0] - a[0];
  const qpy = c[1] - a[1];
  const t = (qpx * sY - qpy * sX) / denom;
  const u = (qpx * rY - qpy * rX) / denom;
  if (t >= -1e-7 && t <= 1 + 1e-7 && u >= -1e-7 && u <= 1 + 1e-7) {
    return Math.max(0, Math.min(1, t));
  }
  return null;
}

/**
 * Split polyline by MultiPoly boundary and keep segments either inside (keepInside=true) or outside (keepInside=false).
 */
export function splitLineByMultiPoly(pts, mp, keepInside) {
  if (!pts || pts.length < 2) return [];
  if (!mp || mp.length === 0) return keepInside ? [] : [pts];

  const mpBbox = bboxOfMultiPoly(mp);
  const lBbox = bboxOfPts(pts);
  if (!bboxIntersects(mpBbox, lBbox, 1e-4)) {
    return keepInside ? [] : [pts];
  }

  const polyBboxes = mp.map((p) => bboxOfPoly(p));
  const out = [];
  let cur = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segBox = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
    const ts = [0, 1];

    for (let pi = 0; pi < mp.length; pi++) {
      if (!bboxIntersects(segBox, polyBboxes[pi], 1e-4)) continue;
      for (const ring of mp[pi]) {
        const n = ring.length;
        for (let j = 0; j < n; j++) {
          const t = segSegParam(a, b, ring[j], ring[(j + 1) % n]);
          if (t !== null) ts.push(t);
        }
      }
    }

    ts.sort((u, v) => u - v);
    const uniq = [ts[0]];
    for (let k = 1; k < ts.length; k++) {
      if (ts[k] - uniq[uniq.length - 1] > 1e-6) uniq.push(ts[k]);
    }

    for (let k = 0; k < uniq.length - 1; k++) {
      const t0 = uniq[k];
      const t1 = uniq[k + 1];
      const tm = (t0 + t1) * 0.5;
      const mid = [a[0] + tm * (b[0] - a[0]), a[1] + tm * (b[1] - a[1])];
      const inside = pointInMultiPoly(mid, mp);
      if (inside === keepInside) {
        const p0 = [a[0] + t0 * (b[0] - a[0]), a[1] + t0 * (b[1] - a[1])];
        const p1 = [a[0] + t1 * (b[0] - a[0]), a[1] + t1 * (b[1] - a[1])];
        if (cur.length === 0) {
          cur.push(p0, p1);
        } else if (distPt(cur[cur.length - 1], p0) < 1e-4) {
          cur.push(p1);
        } else {
          if (cur.length >= 2) out.push(cur);
          cur = [p0, p1];
        }
      } else if (cur.length >= 2) {
        out.push(cur);
        cur = [];
      } else {
        cur = [];
      }
    }
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}

/**
 * Merge connected polylines that share endpoints (within tol).
 */
export function mergeLines(lines, tol = 0.05) {
  const pool = lines.filter((l) => l && l.length >= 2).map((l) => l.map((p) => [p[0], p[1]]));
  if (pool.length <= 1) return pool;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const A = pool[i];
        const B = pool[j];
        const a0 = A[0], a1 = A[A.length - 1];
        const b0 = B[0], b1 = B[B.length - 1];
        let merged = null;
        if (distPt(a1, b0) <= tol) merged = [...A, ...B.slice(1)];
        else if (distPt(a1, b1) <= tol) merged = [...A, ...B.slice(0, -1).reverse()];
        else if (distPt(a0, b1) <= tol) merged = [...B, ...A.slice(1)];
        else if (distPt(a0, b0) <= tol) merged = [...B.slice(1).reverse(), ...A];
        if (merged) {
          pool[i] = merged;
          pool.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return pool;
}

/**
 * Extract rings from a planar arrangement of line segments (used for OSM coastline polygonization).
 * Splits intersecting segments, builds directed half-edges, and traces minimal CCW faces.
 */
export function polygonizeLines(lines) {
  const rawSegs = [];
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      if (distPt(line[i], line[i + 1]) > 1e-4) {
        rawSegs.push([line[i], line[i + 1]]);
      }
    }
  }
  if (rawSegs.length < 3) return [];

  // Split segments at intersections
  const splitSegs = [];
  for (let i = 0; i < rawSegs.length; i++) {
    const [a, b] = rawSegs[i];
    const ts = [0, 1];
    for (let j = 0; j < rawSegs.length; j++) {
      if (i === j) continue;
      const t = segSegParam(a, b, rawSegs[j][0], rawSegs[j][1]);
      if (t !== null) ts.push(t);
    }
    ts.sort((u, v) => u - v);
    const uniq = [ts[0]];
    for (let k = 1; k < ts.length; k++) {
      if (ts[k] - uniq[uniq.length - 1] > 1e-5) uniq.push(ts[k]);
    }
    for (let k = 0; k < uniq.length - 1; k++) {
      const p0 = [a[0] + uniq[k] * (b[0] - a[0]), a[1] + uniq[k] * (b[1] - a[1])];
      const p1 = [a[0] + uniq[k + 1] * (b[0] - a[0]), a[1] + uniq[k + 1] * (b[1] - a[1])];
      if (distPt(p0, p1) > 1e-4) splitSegs.push([p0, p1]);
    }
  }

  // Snap vertices to 1cm grid for graph topology
  const vKey = (p) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  const vertices = new Map();
  const adj = new Map();
  const halfEdges = [];

  const getVert = (p) => {
    const k = vKey(p);
    if (!vertices.has(k)) {
      vertices.set(k, [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
      adj.set(k, []);
    }
    return k;
  };

  const seenDir = new Set();
  for (const [a, b] of splitSegs) {
    const ka = getVert(a);
    const kb = getVert(b);
    if (ka === kb) continue;
    const pa = vertices.get(ka);
    const pb = vertices.get(kb);
    if (!seenDir.has(`${ka}->${kb}`)) {
      seenDir.add(`${ka}->${kb}`);
      const id = halfEdges.length;
      halfEdges.push({ from: ka, to: kb, angle: Math.atan2(pb[1] - pa[1], pb[0] - pa[0]), used: false });
      adj.get(ka).push(id);
    }
    if (!seenDir.has(`${kb}->${ka}`)) {
      seenDir.add(`${kb}->${ka}`);
      const id = halfEdges.length;
      halfEdges.push({ from: kb, to: ka, angle: Math.atan2(pa[1] - pb[1], pa[0] - pb[0]), used: false });
      adj.get(kb).push(id);
    }
  }

  // Sort outgoing half-edges CCW at each vertex
  for (const [, list] of adj) {
    list.sort((e1, e2) => halfEdges[e1].angle - halfEdges[e2].angle);
  }

  const faces = [];
  for (let i = 0; i < halfEdges.length; i++) {
    if (halfEdges[i].used) continue;
    const ringKeys = [];
    let cur = i;
    let valid = true;
    for (let step = 0; step < 5000; step++) {
      const he = halfEdges[cur];
      if (he.used) {
        valid = cur === i;
        break;
      }
      he.used = true;
      ringKeys.push(he.from);
      const outEdges = adj.get(he.to);
      if (!outEdges || outEdges.length === 0) {
        valid = false;
        break;
      }
      // Find twin edge (he.to -> he.from) and pick previous edge in CCW order (= sharpest right/left turn for minimal face)
      const revAngle = Math.atan2(
        vertices.get(he.from)[1] - vertices.get(he.to)[1],
        vertices.get(he.from)[0] - vertices.get(he.to)[0]
      );
      let twinIdx = outEdges.findIndex((id) => halfEdges[id].to === he.from);
      if (twinIdx === -1) {
        twinIdx = outEdges.findIndex((id) => Math.abs(halfEdges[id].angle - revAngle) < 1e-4);
      }
      if (twinIdx === -1) {
        valid = false;
        break;
      }
      const nextIdx = (twinIdx - 1 + outEdges.length) % outEdges.length;
      cur = outEdges[nextIdx];
      if (cur === i) break;
    }
    if (valid && ringKeys.length >= 3) {
      const pts = ringKeys.map((k) => vertices.get(k));
      // Only keep positive-area (CCW bounded) faces, ignore the unbounded outer CW face
      if (ringSignedArea(pts) > 1) {
        faces.push([pts]);
      }
    }
  }
  return faces;
}
