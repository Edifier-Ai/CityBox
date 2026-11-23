import {
  bboxIntersects,
  bboxOfMultiPoly,
  bboxOfPoly,
  bboxOfPts,
  bufferPolyline,
  distPointToLine,
  distPt,
  interpolateLine,
  lineLength,
  pointInMultiPoly,
  polyUnion,
  r2,
  simplifyLine,
  splitLineByMultiPoly,
} from './planarGeom.mjs';

/**
 * Port of walks.py:
 * Walkers cross roads only on zebra crossings.
 * Wherever a walker's line crosses the carriageway away from a zebra,
 * move the crossing onto the nearest zebra running the same way (within 35 degrees)
 * within `reach` metres.
 */
export function fixWalks(lines, roadMp, zebras, { zone = 2.2, reach = 14, kerb = 0.9 } = {}) {
  if (!roadMp || !roadMp.length || !zebras || !zebras.length) return lines;

  const validZebras = zebras.filter((z) => z.length >= 2 && lineLength(z) > 1.5);
  if (!validZebras.length) return lines;

  const nearZebraMp = polyUnion(validZebras.map((z) => bufferPolyline(z, zone, 'flat')));
  const roadBbox = bboxOfMultiPoly(roadMp);
  const roadPolyBoxes = roadMp.map((p) => bboxOfPoly(p));

  const inRoad = (pt) => {
    if (pt[0] < roadBbox[0] || pt[0] > roadBbox[2] || pt[1] < roadBbox[1] || pt[1] > roadBbox[3]) {
      return false;
    }
    return pointInMultiPoly(pt, roadMp);
  };

  const nearZebraBbox = nearZebraMp.length ? bboxOfMultiPoly(nearZebraMp) : null;
  const inNearZebra = (pt) => {
    if (!nearZebraBbox) return false;
    if (
      pt[0] < nearZebraBbox[0] ||
      pt[0] > nearZebraBbox[2] ||
      pt[1] < nearZebraBbox[1] ||
      pt[1] > nearZebraBbox[3]
    ) {
      return false;
    }
    return pointInMultiPoly(pt, nearZebraMp);
  };

  const bad = (p) => inRoad(p) && !inNearZebra(p);

  function crossingLine(z) {
    const [x0, y0] = z[0];
    const [x1, y1] = z[z.length - 1];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 1e-4) return null;
    const ux = (x1 - x0) / L;
    const uy = (y1 - y0) / L;
    const mx = (x0 + x1) * 0.5;
    const my = (y0 + y1) * 0.5;
    const longLine = [
      [mx - ux * 80, my - uy * 80],
      [mx + ux * 80, my + uy * 80],
    ];
    // Filter road polys intersecting longLine bbox
    const lb = bboxOfPts(longLine);
    const localRoad = roadMp.filter((_, idx) => bboxIntersects(lb, roadPolyBoxes[idx], 0.1));
    if (!localRoad.length) return null;
    const pieces = splitLineByMultiPoly(longLine, localRoad, true).filter((g) => lineLength(g) > 0.5);
    if (!pieces.length) return null;

    let bestPiece = pieces[0];
    let bestDist = distPointToLine([mx, my], pieces[0]);
    for (let i = 1; i < pieces.length; i++) {
      const d = distPointToLine([mx, my], pieces[i]);
      if (d < bestDist) {
        bestDist = d;
        bestPiece = pieces[i];
      }
    }
    const a = bestPiece[0];
    const b = bestPiece[bestPiece.length - 1];
    return {
      a: [a[0] - ux * kerb, a[1] - uy * kerb],
      b: [b[0] + ux * kerb, b[1] + uy * kerb],
      u: [ux, uy],
    };
  }

  const linesOf = [];
  for (const z of validZebras) {
    const c = crossingLine(z);
    if (c) linesOf.push(c);
  }
  if (!linesOf.length) return lines;

  const cos35 = Math.cos((35 * Math.PI) / 180);
  const out = [];

  for (const line of lines) {
    const L = lineLength(line);
    if (L < 1) {
      out.push(line);
      continue;
    }
    const step = 0.5;
    const steps = Math.floor(L / step);
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      pts.push(interpolateLine(line, k * step));
    }
    pts.push([line[line.length - 1][0], line[line.length - 1][1]]);

    const res = [];
    let i = 0;
    const n = pts.length;
    let moved = false;

    while (i < n) {
      if (!bad(pts[i])) {
        res.push(pts[i]);
        i++;
        continue;
      }
      let j = i;
      while (j < n && bad(pts[j])) j++;
      const E = res.length ? res[res.length - 1] : pts[i];
      const X = j < n ? pts[j] : pts[n - 1];
      const dx = X[0] - E[0];
      const dy = X[1] - E[1];
      const d = Math.hypot(dx, dy);
      let best = null;

      if ((j - i) * step > 3 && d > 2) {
        const mid = [(E[0] + X[0]) * 0.5, (E[1] + X[1]) * 0.5];
        for (const cr of linesOf) {
          const [ux, uy] = cr.u;
          if (Math.abs(ux * dx + uy * dy) / d < cos35) continue;
          const dist = distPointToLine(mid, [cr.a, cr.b]);
          if (dist < reach && (!best || dist < best.dist)) {
            const forward = ux * dx + uy * dy >= 0;
            best = {
              dist,
              a: forward ? cr.a : cr.b,
              b: forward ? cr.b : cr.a,
            };
          }
        }
      }

      if (best) {
        res.push(best.a, best.b);
        moved = true;
        let k = j;
        while (k + 1 < n && distPt(pts[k + 1], best.b) < distPt(pts[k], best.b)) {
          k++;
        }
        i = k;
      } else {
        for (let k = i; k < j; k++) res.push(pts[k]);
        i = j;
      }
    }

    if (!moved) {
      out.push(line);
      continue;
    }

    const clean = [res[0]];
    for (let k = 1; k < res.length; k++) {
      const q = res[k];
      const prev = clean[clean.length - 1];
      if ((q[0] - prev[0]) ** 2 + (q[1] - prev[1]) ** 2 > 0.04) {
        clean.push(q);
      }
    }
    const slim = simplifyLine(clean, 0.12);
    out.push((slim.length >= 2 ? slim : clean).map(([x, y]) => [r2(x), r2(y)]));
  }

  return out;
}
