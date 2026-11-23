import * as turf from '@turf/turf';

const VALID_ARCHETYPES = new Set([
  'modern',
  'pitched',
  'pavilion',
  'covered_bridge',
  'tower',
]);
const VALID_FACADES = new Set([
  'plaster_modern',
  'brick_canal',
  'traditional_timber',
  'stone_classic',
  'glass_tower',
]);
const VALID_ROOFS = new Set([
  'flat_parapet',
  'gable_slate',
  'gable_terracotta',
  'hipped_eaves',
  'stepped_gable',
]);

function isFinitePoint(pt) {
  return Boolean(pt && Number.isFinite(pt.x) && Number.isFinite(pt.z));
}

function sanitizeRing(ring, maxBound) {
  if (!Array.isArray(ring)) return [];
  const cleaned = [];
  for (const pt of ring) {
    if (!isFinitePoint(pt)) continue;
    const x = Math.max(-maxBound, Math.min(maxBound, pt.x));
    const z = Math.max(-maxBound, Math.min(maxBound, pt.z));
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.hypot(x - prev.x, z - prev.z) > 0.05) {
      cleaned.push({ x, z });
    }
  }
  return cleaned;
}

function ringArea(ring) {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) * 0.5;
}

function ringCentroid(ring) {
  let sx = 0;
  let sz = 0;
  for (const p of ring) {
    sx += p.x;
    sz += p.z;
  }
  const n = Math.max(1, ring.length);
  return { x: sx / n, z: sz / n };
}

function buildTurfPolys(ringSets) {
  const polys = [];
  for (const rings of ringSets) {
    if (!rings.length || rings[0].length < 3) continue;
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
    if (!coords.length || coords[0].length < 4) continue;
    try {
      const poly = turf.polygon(coords);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of rings[0]) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      polys.push({ poly, minX, maxX, minZ, maxZ });
    } catch {
      // skip invalid geometry
    }
  }
  return polys;
}

function isPointInsideAny(x, z, polys, pad = 0) {
  for (const item of polys) {
    if (
      x < item.minX - pad ||
      x > item.maxX + pad ||
      z < item.minZ - pad ||
      z > item.maxZ + pad
    ) {
      continue;
    }
    if (turf.booleanPointInPolygon(turf.point([x, z]), item.poly)) {
      return true;
    }
  }
  return false;
}

/**
 * Headless Stage 4 self-check & repair:
 * - Validates bounds and drops degenerate polygon rings
 * - Removes submerged non-bridge buildings overlapping water polygons
 * - Verifies tree clearances against buildings and water bodies
 * - Ensures valid archetypes/facades/roofs, legends, and 4 cameraPresets
 */
export function selfCheckAndRepairScene(scene) {
  const rawHalf = Number(scene?.halfSize);
  const halfSize = Number.isFinite(rawHalf) ? Math.max(60, Math.min(250, rawHalf)) : 100;
  const maxBound = halfSize * 1.02;

  let repairedRings = 0;
  let droppedBuildings = 0;
  let droppedTrees = 0;

  // 1. Clean water polygons
  const waters = (scene.waters || [])
    .map((w) => {
      const polygons = (w.polygons || [])
        .map((poly) =>
          poly
            .map((r) => sanitizeRing(r, maxBound))
            .filter((r, idx) => r.length >= 3 && (idx > 0 || ringArea(r) >= 2))
        )
        .filter((poly) => poly.length > 0);
      const centerlines = (w.centerlines || [])
        .map((line) => line.filter(isFinitePoint))
        .filter((line) => line.length >= 2);
      return { ...w, polygons, centerlines };
    })
    .filter((w) => w.polygons.length > 0);

  const waterPolys = buildTurfPolys(waters.flatMap((w) => w.polygons));

  // 2. Clean and validate buildings
  const buildings = [];
  for (const b of scene.buildings || []) {
    const cleanedRings = (b.rings || [])
      .map((r) => sanitizeRing(r, maxBound))
      .filter((r, idx) => r.length >= 3 && (idx > 0 || ringArea(r) >= 4));

    if (cleanedRings.length === 0) {
      droppedBuildings++;
      continue;
    }
    if (cleanedRings.length !== (b.rings || []).length) {
      repairedRings++;
    }

    const center = isFinitePoint(b.center) ? b.center : ringCentroid(cleanedRings[0]);
    const archetype = VALID_ARCHETYPES.has(b.archetype) ? b.archetype : 'modern';

    // Remove non-bridge buildings trapped inside water polygons
    if (archetype !== 'covered_bridge' && isPointInsideAny(center.x, center.z, waterPolys)) {
      droppedBuildings++;
      continue;
    }

    const height = Number.isFinite(b.height) ? Math.max(3, Math.min(180, b.height)) : 9;
    const levels = Number.isFinite(b.levels) ? Math.max(1, Math.round(b.levels)) : Math.max(1, Math.round(height / 3.2));

    buildings.push({
      ...b,
      rings: cleanedRings,
      center,
      height,
      levels,
      archetype,
      facadeStyle: VALID_FACADES.has(b.facadeStyle) ? b.facadeStyle : 'plaster_modern',
      roofStyle: VALID_ROOFS.has(b.roofStyle) ? b.roofStyle : 'flat_parapet',
      wallColor: /^#[0-9a-fA-F]{6}$/.test(b.wallColor || '') ? b.wallColor : '#ccb0a8',
      roofColor: /^#[0-9a-fA-F]{6}$/.test(b.roofColor || '') ? b.roofColor : '#7d7273',
    });
  }

  // 3. Clean roads and parks
  const roads = (scene.roads || [])
    .map((r) => ({
      ...r,
      points: (r.points || []).filter(isFinitePoint),
      width: Number.isFinite(r.width) ? Math.max(2, Math.min(30, r.width)) : 8,
    }))
    .filter((r) => r.points.length >= 2);

  const parks = (scene.parks || [])
    .map((p) => ({
      ...p,
      rings: (p.rings || [])
        .map((r) => sanitizeRing(r, maxBound))
        .filter((r, idx) => r.length >= 3 && (idx > 0 || ringArea(r) >= 4)),
    }))
    .filter((p) => p.rings.length > 0);

  // 4. Verify tree clearances against buildings and water
  const buildingPolys = buildTurfPolys(buildings.map((b) => b.rings));
  const treeLimit = halfSize - 3;
  const trees = [];
  for (const t of scene.trees || []) {
    if (
      !isFinitePoint(t) ||
      Math.abs(t.x) > treeLimit ||
      Math.abs(t.z) > treeLimit ||
      isPointInsideAny(t.x, t.z, buildingPolys, 0.8) ||
      isPointInsideAny(t.x, t.z, waterPolys, 1.5)
    ) {
      droppedTrees++;
      continue;
    }
    trees.push({
      x: t.x,
      z: t.z,
      scale: Number.isFinite(t.scale) ? Math.max(0.5, Math.min(2.0, t.scale)) : 1.0,
      variant: t.variant === 0 || t.variant === 1 || t.variant === 2 ? t.variant : 0,
    });
  }

  // 5. Guarantee non-empty legends & 4 camera presets
  const legends =
    Array.isArray(scene.legends) && scene.legends.length > 0
      ? scene.legends
      : [
          {
            id: 'legend-center',
            title: scene.meta?.subtitle || '城市切片',
            subtitle: `${buildings.length} 栋建筑 · ${roads.length} 条道路`,
            kind: 'landmark',
            target: [0, 5, 0],
          },
        ];

  const cameraPresets =
    Array.isArray(scene.cameraPresets) && scene.cameraPresets.length >= 4
      ? scene.cameraPresets
      : [
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
            label: '核心近景',
            target: legends[0]?.target || [0, 6, 0],
            azimuthDeg: 26,
            polarDeg: 61,
            zoom: 3.3,
          },
          {
            id: 'walkway',
            label: '街区漫步',
            target: legends[1]?.target || [24, 0, 18],
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

  const repairedScene = {
    ...scene,
    halfSize,
    meta: {
      ...scene.meta,
      sliceSizeMeters: Math.round(halfSize * 2),
      pipelineSource: 'cloud_workshop',
      generatedAt: Date.now(),
    },
    buildings,
    waters,
    roads,
    parks,
    trees,
    legends,
    cameraPresets,
  };

  return {
    scene: repairedScene,
    report: { droppedBuildings, droppedTrees, repairedRings },
  };
}
