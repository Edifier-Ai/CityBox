import * as THREE from 'three';
import earcut from 'earcut';
import type { AtmosphereTheme } from './atmosphere';
import { createBuildingMaterial, createWaterMaterial } from './shaders';
import {
  createContactShadowTexture,
  createPavingTexture,
  createWatercolorFoliageTexture,
  createWaterLabelTexture,
} from './textureFactory';
import type {
  DioramaBuilding,
  DioramaRoad,
  DioramaSceneData,
  Vec2,
} from '../types/city';

type TrackFn = <T extends { dispose: () => void }>(item: T) => T;

export interface BuiltDiorama {
  root: THREE.Group;
  updateTheme: (theme: AtmosphereTheme) => void;
  updateFrame: (dt: number, elapsed: number, theme: AtmosphereTheme, playing: boolean) => void;
  dispose: () => void;
}

// ---------- Math & Geometry Helpers ----------

function computeOBB(ring: Vec2[]): {
  cx: number;
  cz: number;
  width: number;
  length: number;
  angle: number;
} {
  if (ring.length === 0) {
    return { cx: 0, cz: 0, width: 10, length: 10, angle: 0 };
  }
  let cx = 0;
  let cz = 0;
  for (const p of ring) {
    cx += p.x;
    cz += p.z;
  }
  cx /= ring.length;
  cz /= ring.length;

  // Pick dominant edge direction as primary orientation
  let bestLen = 0;
  let bestAngle = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len > bestLen) {
      bestLen = len;
      bestAngle = Math.atan2(dz, dx);
    }
  }

  const cos = Math.cos(-bestAngle);
  const sin = Math.sin(-bestAngle);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (const p of ring) {
    const rx = p.x - cx;
    const rz = p.z - cz;
    const u = rx * cos - rz * sin;
    const v = rx * sin + rz * cos;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const uSpan = Math.max(2, maxU - minU);
  const vSpan = Math.max(2, maxV - minV);
  const midU = (minU + maxU) * 0.5;
  const midV = (minV + maxV) * 0.5;
  const cosP = Math.cos(bestAngle);
  const sinP = Math.sin(bestAngle);
  const realCx = cx + midU * cosP - midV * sinP;
  const realCz = cz + midU * sinP + midV * cosP;

  if (uSpan >= vSpan) {
    return { cx: realCx, cz: realCz, length: uSpan, width: vSpan, angle: bestAngle };
  }
  return {
    cx: realCx,
    cz: realCz,
    length: vSpan,
    width: uSpan,
    angle: bestAngle + Math.PI / 2,
  };
}

function buildExtrudedPolygonGeometry(
  rings: Vec2[][],
  height: number,
  baseY = 0,
  includeBottom = false
): THREE.BufferGeometry {
  if (rings.length === 0 || rings[0].length < 3) {
    return new THREE.BufferGeometry();
  }

  // Ensure outer ring is CCW in (x, z) -> signed area > 0
  const cleanRings = rings.map((r) => {
    const out: Vec2[] = [];
    for (const p of r) {
      const prev = out[out.length - 1];
      if (!prev || Math.hypot(p.x - prev.x, p.z - prev.z) > 0.05) {
        out.push(p);
      }
    }
    if (out.length >= 2) {
      const first = out[0];
      const last = out[out.length - 1];
      if (Math.hypot(first.x - last.x, first.z - last.z) < 0.05) {
        out.pop();
      }
    }
    return out;
  }).filter((r) => r.length >= 3);

  if (cleanRings.length === 0) return new THREE.BufferGeometry();

  const coords: number[] = [];
  const holes: number[] = [];

  for (let rIdx = 0; rIdx < cleanRings.length; rIdx++) {
    const ring = cleanRings[rIdx];
    if (rIdx > 0) holes.push(coords.length / 2);
    for (const p of ring) {
      coords.push(p.x, p.z);
    }
  }

  const indices = earcut(coords, holes.length > 0 ? holes : undefined, 2);

  const positions: number[] = [];
  const normals: number[] = [];

  const topY = baseY + height;

  // Top cap (normal +Y). Check winding in XZ plane: (p1->p2) x (p1->p3)
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 2;
    const i1 = indices[i + 1] * 2;
    const i2 = indices[i + 2] * 2;

    const x0 = coords[i0];
    const z0 = coords[i0 + 1];
    const x1 = coords[i1];
    const z1 = coords[i1 + 1];
    const x2 = coords[i2];
    const z2 = coords[i2 + 1];

    // Cross product of (x1-x0, 0, z1-z0) x (x2-x0, 0, z2-z0) Y component = (z1-z0)*(x2-x0) - (x1-x0)*(z2-z0)
    const crossY = (z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0);
    if (crossY >= 0) {
      positions.push(x0, topY, z0, x1, topY, z1, x2, topY, z2);
    } else {
      positions.push(x0, topY, z0, x2, topY, z2, x1, topY, z1);
    }
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);

    if (includeBottom) {
      if (crossY >= 0) {
        positions.push(x0, baseY, z0, x2, baseY, z2, x1, baseY, z1);
      } else {
        positions.push(x0, baseY, z0, x1, baseY, z1, x2, baseY, z2);
      }
      normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
    }
  }

  // Side walls if height > 0.001
  if (height > 0.001) {
    for (let rIdx = 0; rIdx < cleanRings.length; rIdx++) {
      const ring = cleanRings[rIdx];
      // Compute signed area to know outward normal direction
      let signedArea = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        signedArea += a.x * b.z - b.x * a.z;
      }
      const isHole = rIdx > 0;
      const flip = (signedArea < 0) !== isHole ? -1 : 1;

      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 1e-4) continue;
        const nx = (dz / len) * flip;
        const nz = (-dx / len) * flip;

        if (flip > 0) {
          positions.push(
            a.x, baseY, a.z,
            a.x, topY, a.z,
            b.x, topY, b.z,
            a.x, baseY, a.z,
            b.x, topY, b.z,
            b.x, baseY, b.z
          );
        } else {
          positions.push(
            a.x, baseY, a.z,
            b.x, topY, b.z,
            a.x, topY, a.z,
            a.x, baseY, a.z,
            b.x, baseY, b.z,
            b.x, topY, b.z
          );
        }
        for (let k = 0; k < 6; k++) {
          normals.push(nx, 0, nz);
        }
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geom;
}

function buildFlatPolygonGeometry(rings: Vec2[][], y: number): THREE.BufferGeometry {
  return buildExtrudedPolygonGeometry(rings, 0, y, false);
}

function buildPolylineRibbonGeometry(
  points: Vec2[],
  width: number,
  y: number,
  archHeight = 0
): THREE.BufferGeometry {
  if (points.length < 2) return new THREE.BufferGeometry();
  const hw = width * 0.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  // Precompute cumulative distance for arch profile & UVs
  const dists: number[] = [0];
  let totalLen = 0;
  for (let i = 1; i < points.length; i++) {
    totalLen += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    dists.push(totalLen);
  }
  totalLen = Math.max(totalLen, 1);

  const leftPts: THREE.Vector3[] = [];
  const rightPts: THREE.Vector3[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const nx = -dz;
    const nz = dx;
    const t = dists[i] / totalLen;
    const elev = y + Math.sin(t * Math.PI) * archHeight;

    leftPts.push(new THREE.Vector3(points[i].x + nx * hw, elev, points[i].z + nz * hw));
    rightPts.push(new THREE.Vector3(points[i].x - nx * hw, elev, points[i].z - nz * hw));
  }

  for (let i = 0; i < leftPts.length - 1; i++) {
    const l0 = leftPts[i];
    const r0 = rightPts[i];
    const l1 = leftPts[i + 1];
    const r1 = rightPts[i + 1];
    const u0 = dists[i] / 8;
    const u1 = dists[i + 1] / 8;

    positions.push(
      l0.x, l0.y, l0.z,
      l1.x, l1.y, l1.z,
      r1.x, r1.y, r1.z,

      l0.x, l0.y, l0.z,
      r1.x, r1.y, r1.z,
      r0.x, r0.y, r0.z
    );
    uvs.push(
      u0, 0,
      u1, 0,
      u1, 1,

      u0, 0,
      u1, 1,
      u0, 1
    );
    for (let k = 0; k < 6; k++) normals.push(0, 1, 0);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

function createGableRoofGeometry(length: number, width: number, roofHeight: number): THREE.BufferGeometry {
  const hl = length * 0.5;
  const hw = width * 0.5;
  const ridge = Math.max(0.5, length * 0.46);
  const positions = [
    // Left slope
    -hl, 0, -hw,
    hl, 0, -hw,
    ridge, roofHeight, 0,

    -hl, 0, -hw,
    ridge, roofHeight, 0,
    -ridge, roofHeight, 0,

    // Right slope
    hl, 0, hw,
    -hl, 0, hw,
    -ridge, roofHeight, 0,

    hl, 0, hw,
    -ridge, roofHeight, 0,
    ridge, roofHeight, 0,

    // Front gable end
    hl, 0, -hw,
    hl, 0, hw,
    ridge, roofHeight, 0,

    // Back gable end
    -hl, 0, hw,
    -hl, 0, -hw,
    -ridge, roofHeight, 0,
  ];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

function createHippedRoofGeometry(length: number, width: number, roofHeight: number): THREE.BufferGeometry {
  const hl = length * 0.5;
  const hw = width * 0.5;
  const ridge = Math.max(0.2, (length - width * 0.72) * 0.5);
  const positions = [
    // Left slope
    -hl, 0, -hw,
    hl, 0, -hw,
    ridge, roofHeight, 0,

    -hl, 0, -hw,
    ridge, roofHeight, 0,
    -ridge, roofHeight, 0,

    // Right slope
    hl, 0, hw,
    -hl, 0, hw,
    -ridge, roofHeight, 0,

    hl, 0, hw,
    -ridge, roofHeight, 0,
    ridge, roofHeight, 0,

    // Front hip slope
    hl, 0, -hw,
    hl, 0, hw,
    ridge, roofHeight, 0,

    // Back hip slope
    -hl, 0, hw,
    -hl, 0, -hw,
    -ridge, roofHeight, 0,
  ];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

function createSteppedGableGeometry(width: number, roofHeight: number): THREE.BufferGeometry {
  const hw = width * 0.52;
  const topH = roofHeight + 0.65;
  const steps = 4;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  for (let i = 0; i < steps; i++) {
    const xL = -hw + (i / steps) * hw;
    const xNextL = -hw + ((i + 1) / steps) * hw;
    const yStep = ((i + 1) / steps) * topH;
    shape.lineTo(xL, yStep);
    shape.lineTo(xNextL, yStep);
  }
  for (let i = steps - 1; i >= 0; i--) {
    const xR = hw - (i / steps) * hw;
    const yStep = ((i + 1) / steps) * topH;
    shape.lineTo(xR, yStep);
    if (i > 0) {
      const yLower = (i / steps) * topH;
      shape.lineTo(xR, yLower);
    }
  }
  shape.lineTo(hw, 0);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.44,
    bevelEnabled: false,
  });
  geom.translate(0, 0, -0.22);
  geom.rotateY(Math.PI / 2);
  return geom;
}

function addRoofDormers(
  group: THREE.Group,
  cx: number,
  wallH: number,
  cz: number,
  angle: number,
  length: number,
  width: number,
  roofH: number,
  material: THREE.Material,
  edgeMat: THREE.LineBasicMaterial,
  track: TrackFn
): void {
  if (length < 5.2 || width < 4.4) return;
  const offsets = length >= 11 ? [-length * 0.22, length * 0.22] : [0];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  for (const lx of offsets) {
    for (const side of [-1, 1]) {
      const lz = side * (width * 0.26);
      const wx = cx + lx * cos - lz * sin;
      const wz = cz + lx * sin + lz * cos;
      const dBox = track(new THREE.BoxGeometry(1.55, 1.35, 1.75));
      const dMesh = new THREE.Mesh(dBox, material);
      dMesh.position.set(wx, wallH + roofH * 0.36, wz);
      dMesh.rotation.y = -angle;
      dMesh.castShadow = true;
      group.add(dMesh);

      const dEdges = track(new THREE.LineSegments(track(new THREE.EdgesGeometry(dBox, 25)), edgeMat));
      dEdges.position.copy(dMesh.position);
      dEdges.rotation.copy(dMesh.rotation);
      group.add(dEdges);

      const dRoof = track(createGableRoofGeometry(1.9, 1.85, 0.72));
      const dRoofMesh = new THREE.Mesh(dRoof, material);
      dRoofMesh.position.set(wx, wallH + roofH * 0.36 + 0.67, wz);
      dRoofMesh.rotation.y = -angle + Math.PI / 2;
      dRoofMesh.castShadow = true;
      group.add(dRoofMesh);

      const dRoofEdges = track(new THREE.LineSegments(track(new THREE.EdgesGeometry(dRoof, 22)), edgeMat));
      dRoofEdges.position.copy(dRoofMesh.position);
      dRoofEdges.rotation.copy(dRoofMesh.rotation);
      group.add(dRoofEdges);
    }
  }
}

function createLayeredFoliageGeometry(includeCrownDiscs: boolean): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  const appendCard = (
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    rotX: number,
    rotY: number
  ) => {
    const baseIdx = positions.length / 3;
    euler.set(rotX, rotY, 0, 'YXZ');
    q.setFromEuler(euler);
    const hw = w * 0.5;
    const hh = h * 0.5;
    const corners: Array<[number, number, number, number, number]> = [
      [-hw, -hh, 0, 0, 0],
      [hw, -hh, 0, 1, 0],
      [hw, hh, 0, 1, 1],
      [-hw, hh, 0, 0, 1],
    ];
    n.set(0, 0, 1).applyQuaternion(q).normalize();

    for (const [lx, ly, lz, u, uvY] of corners) {
      v.set(lx, ly, lz).applyQuaternion(q);
      positions.push(v.x + cx, v.y + cy, v.z + cz);
      normals.push(n.x, n.y, n.z);
      uvs.push(u, uvY);
    }
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  };

  // Crossed vertical painterly cards
  appendCard(0, 3.8, 0, 5.4, 5.2, 0, 0.25);
  appendCard(0, 3.8, 0, 5.4, 5.2, 0, 0.25 + Math.PI * 0.5);

  if (includeCrownDiscs) {
    // Slightly tilted layered crown discs for aerial + isometric richness
    appendCard(0, 3.65, 0, 5.6, 5.6, -Math.PI * 0.42, 0.45);
    appendCard(0.22, 4.7, -0.15, 4.6, 4.6, -Math.PI * 0.44, 1.15);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  return geom;
}

function resolveFacadeKind(b: DioramaBuilding): number {
  switch (b.facadeStyle) {
    case 'plaster_modern':
      return 0;
    case 'brick_canal':
      return 1;
    case 'traditional_timber':
      return 2;
    case 'stone_classic':
      return 3;
    case 'glass_tower':
      return 4;
    default:
      return b.archetype === 'pavilion' || b.archetype === 'covered_bridge' ? 2 : 0;
  }
}

// ---------- Arched Stone Road Bridge Builder ----------

function buildArchedRoadBridge(
  road: DioramaRoad,
  deckMat: THREE.Material,
  stoneMat: THREE.Material,
  edgeMat: THREE.LineBasicMaterial,
  track: TrackFn,
  root: THREE.Group
): void {
  const archH = road.bridgeHeight ?? 4.6;
  const deckGeom = track(buildPolylineRibbonGeometry(road.points, road.width, 0.35, archH));
  const deckMesh = new THREE.Mesh(deckGeom, deckMat);
  deckMesh.renderOrder = 5;
  deckMesh.castShadow = true;
  root.add(deckMesh);

  const deckEdges = track(new THREE.LineSegments(track(new THREE.EdgesGeometry(deckGeom, 24)), edgeMat));
  deckEdges.renderOrder = 5;
  root.add(deckEdges);

  // Offset left & right stone parapets following the arched deck
  const hw = road.width * 0.48;
  for (const side of [-1, 1]) {
    const offsetPts: Vec2[] = [];
    for (let i = 0; i < road.points.length; i++) {
      const prev = road.points[Math.max(0, i - 1)];
      const next = road.points[Math.min(road.points.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      offsetPts.push({
        x: road.points[i].x + nx * hw * side,
        z: road.points[i].z + nz * hw * side,
      });
    }
    const railTopGeom = track(buildPolylineRibbonGeometry(offsetPts, 0.52, 1.05, archH));
    const railTopMesh = new THREE.Mesh(railTopGeom, stoneMat);
    railTopMesh.renderOrder = 5;
    railTopMesh.castShadow = true;
    root.add(railTopMesh);
  }

  // Carved stone arch substructure spanning start -> end
  const start = road.points[0];
  const end = road.points[road.points.length - 1];
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const spanLen = Math.hypot(dx, dz);
  if (spanLen < 10) return;

  const midX = (start.x + end.x) * 0.5;
  const midZ = (start.z + end.z) * 0.5;
  const angle = Math.atan2(dz, dx);
  const arches = Math.max(1, road.bridgeArches ?? (spanLen > 32 ? 3 : 1));

  const halfL = spanLen * 0.5;
  const bridgeBottomY = -1.2;
  const deckTopY = Math.max(1.8, archH * 0.65 + 0.35);
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-halfL, bridgeBottomY);

  const approachLen = spanLen * 0.12;
  const spanTotal = spanLen - approachLen * 2;
  const pierW = arches > 1 ? spanTotal * 0.08 : 0;
  const archSpan = Math.max(4, (spanTotal - pierW * (arches - 1)) / arches);

  let curX = -halfL + approachLen;
  wallShape.lineTo(curX, bridgeBottomY);

  for (let i = 0; i < arches; i++) {
    const aStart = curX;
    const aEnd = curX + archSpan;
    const aMid = (aStart + aEnd) * 0.5;
    const radiusX = archSpan * 0.5;
    const archSpringY = -0.25;
    const archTopY = Math.max(0.6, deckTopY - 0.7);
    const radiusY = archTopY - archSpringY;

    wallShape.lineTo(aStart, archSpringY);
    wallShape.absellipse(aMid, archSpringY, radiusX, radiusY, Math.PI, 0, true, 0);
    wallShape.lineTo(aEnd, bridgeBottomY);
    curX = aEnd;
    if (i < arches - 1) {
      wallShape.lineTo(curX + pierW, bridgeBottomY);
      curX += pierW;
    }
  }

  wallShape.lineTo(halfL, bridgeBottomY);
  wallShape.lineTo(halfL, deckTopY);
  wallShape.lineTo(-halfL, deckTopY);
  wallShape.closePath();

  const depth = Math.max(2.4, road.width * 0.86);
  const archGeom = track(
    new THREE.ExtrudeGeometry(wallShape, {
      depth,
      bevelEnabled: false,
      curveSegments: 16,
    })
  );
  archGeom.translate(0, 0, -depth * 0.5);
  const archMesh = new THREE.Mesh(archGeom, stoneMat);
  archMesh.position.set(midX, 0, midZ);
  archMesh.rotation.y = -angle;
  archMesh.castShadow = true;
  archMesh.renderOrder = 4;
  root.add(archMesh);

  const archEdges = track(new THREE.LineSegments(track(new THREE.EdgesGeometry(archGeom, 28)), edgeMat));
  archEdges.position.copy(archMesh.position);
  archEdges.rotation.copy(archMesh.rotation);
  archEdges.renderOrder = 4;
  root.add(archEdges);
}

// ---------- Hero Covered Bridge Builder (安顺廊桥 / 廊桥通用生成器) ----------

function buildCoveredBridgeGroup(
  b: DioramaBuilding,
  material: THREE.ShaderMaterial,
  stoneMat: THREE.Material,
  edgeMat: THREE.LineBasicMaterial,
  accentMat: THREE.Material,
  track: TrackFn
): THREE.Group {
  const group = new THREE.Group();
  const obb = computeOBB(b.rings[0]);
  const L = Math.max(36, obb.length);
  const W = Math.max(12, obb.width);
  const arches = b.bridgeArches ?? 3;
  const baseElevation = b.baseElevation ?? 0;

  group.position.set(obb.cx, baseElevation, obb.cz);
  group.rotation.y = -obb.angle;

  const deckY = 6.2;
  const bridgeBottomY = -1.2;

  // 1. Stone Arch Substructure with Arches & Circular Spandrel Holes
  const halfL = L * 0.5;
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-halfL, bridgeBottomY);

  // Carve main arches along bottom
  const approachLen = L * 0.08;
  const spanTotal = L - approachLen * 2;
  const pierW = spanTotal * 0.065;
  const archSpan = (spanTotal - pierW * (arches - 1)) / arches;

  let curX = -halfL + approachLen;
  wallShape.lineTo(curX, bridgeBottomY);

  const archCenters: number[] = [];
  for (let i = 0; i < arches; i++) {
    const aStart = curX;
    const aEnd = curX + archSpan;
    const aMid = (aStart + aEnd) * 0.5;
    archCenters.push(aMid);
    const radiusX = archSpan * 0.5;
    const archTopY = deckY - 1.35;
    const archSpringY = 0.2;
    const radiusY = archTopY - archSpringY;

    wallShape.lineTo(aStart, archSpringY);
    wallShape.absellipse(
      aMid,
      archSpringY,
      radiusX,
      radiusY,
      Math.PI,
      0,
      true,
      0
    );
    wallShape.lineTo(aEnd, bridgeBottomY);
    curX = aEnd;
    if (i < arches - 1) {
      wallShape.lineTo(curX + pierW, bridgeBottomY);
      curX += pierW;
    }
  }

  wallShape.lineTo(halfL, bridgeBottomY);
  wallShape.lineTo(halfL, deckY);
  wallShape.lineTo(-halfL, deckY);
  wallShape.closePath();

  // Circular spandrel holes between arches
  for (let i = 0; i < arches - 1; i++) {
    const holeX = (archCenters[i] + archCenters[i + 1]) * 0.5;
    const holeY = deckY - 2.95;
    const holeR = Math.min(1.85, pierW * 0.72 + 1.05);
    const hole = new THREE.Path();
    hole.absarc(holeX, holeY, holeR, 0, Math.PI * 2, false);
    wallShape.holes.push(hole);
  }

  const archGeom = track(
    new THREE.ExtrudeGeometry(wallShape, {
      depth: W * 0.92,
      bevelEnabled: false,
      curveSegments: 22,
    })
  );
  archGeom.translate(0, 0, -W * 0.46);
  const archMesh = new THREE.Mesh(archGeom, stoneMat);
  archMesh.castShadow = true;
  group.add(archMesh);
  group.add(track(new THREE.LineSegments(track(new THREE.EdgesGeometry(archGeom, 28)), edgeMat)));

  // Stone deck slab + parapets
  const deckGeom = track(new THREE.BoxGeometry(L + 1.8, 0.75, W + 1.6));
  deckGeom.translate(0, deckY + 0.35, 0);
  const deckMesh = new THREE.Mesh(deckGeom, stoneMat);
  deckMesh.castShadow = true;
  group.add(deckMesh);

  // Left & Right corridor balustrades
  for (const side of [-1, 1]) {
    const railGeom = track(new THREE.BoxGeometry(L + 1.2, 0.95, 0.55));
    railGeom.translate(0, deckY + 1.1, side * (W * 0.48));
    const railMesh = new THREE.Mesh(railGeom, accentMat);
    railMesh.castShadow = true;
    group.add(railMesh);
  }

  // 2. Traditional Multi-Tiered Corridor Pavilions on the Bridge Deck
  const addPavilionHall = (
    offsetX: number,
    hallLen: number,
    hallW: number,
    baseY: number,
    wallH: number,
    roofH: number,
    doubleRoof: boolean
  ) => {
    const bodyGeom = track(new THREE.BoxGeometry(hallLen, wallH, hallW));
    bodyGeom.translate(offsetX, baseY + wallH * 0.5, 0);
    const bodyMesh = new THREE.Mesh(bodyGeom, material);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    group.add(track(new THREE.LineSegments(track(new THREE.EdgesGeometry(bodyGeom, 25)), edgeMat)));

    // Main pitched eaves roof (with wide eaves overhang)
    const lowerRoof = track(createGableRoofGeometry(hallLen + 3.4, hallW + 3.8, roofH));
    lowerRoof.translate(offsetX, baseY + wallH, 0);
    const lowerRoofMesh = new THREE.Mesh(lowerRoof, material);
    lowerRoofMesh.castShadow = true;
    group.add(lowerRoofMesh);
    group.add(track(new THREE.LineSegments(track(new THREE.EdgesGeometry(lowerRoof, 22)), edgeMat)));

    if (doubleRoof) {
      // Upper clerestory tier
      const upperW = hallW * 0.68;
      const upperL = hallLen * 0.72;
      const upperH = wallH * 0.62;
      const upperBaseY = baseY + wallH + roofH * 0.36;

      const uBody = track(new THREE.BoxGeometry(upperL, upperH, upperW));
      uBody.translate(offsetX, upperBaseY + upperH * 0.5, 0);
      const uBodyMesh = new THREE.Mesh(uBody, material);
      uBodyMesh.castShadow = true;
      group.add(uBodyMesh);
      group.add(track(new THREE.LineSegments(track(new THREE.EdgesGeometry(uBody, 25)), edgeMat)));

      const uRoof = track(createGableRoofGeometry(upperL + 3.2, upperW + 3.6, roofH * 0.92));
      uRoof.translate(offsetX, upperBaseY + upperH, 0);
      const uRoofMesh = new THREE.Mesh(uRoof, material);
      uRoofMesh.castShadow = true;
      group.add(uRoofMesh);
      group.add(track(new THREE.LineSegments(track(new THREE.EdgesGeometry(uRoof, 22)), edgeMat)));
    }
  };

  // Central grand double-tiered corridor hall
  addPavilionHall(0, L * 0.44, W * 0.78, deckY + 0.7, 3.8, 3.1, true);
  // Two flanking wing halls
  addPavilionHall(-L * 0.31, L * 0.22, W * 0.66, deckY + 0.7, 3.1, 2.3, false);
  addPavilionHall(L * 0.31, L * 0.22, W * 0.66, deckY + 0.7, 3.1, 2.3, false);

  // Small observation kiosks at bridge piers
  for (let i = 0; i < arches - 1; i++) {
    const px = (archCenters[i] + archCenters[i + 1]) * 0.5;
    for (const side of [-1, 1]) {
      const kiosk = track(new THREE.BoxGeometry(2.6, 2.1, 2.2));
      kiosk.translate(px, 1.4, side * (W * 0.52));
      const kioskMesh = new THREE.Mesh(kiosk, stoneMat);
      kioskMesh.castShadow = true;
      group.add(kioskMesh);
    }
  }

  return group;
}

// ---------- Regular Building Archetypes ----------

function buildStandardBuildingGroup(
  b: DioramaBuilding,
  material: THREE.ShaderMaterial,
  stoneMat: THREE.Material,
  edgeMat: THREE.LineBasicMaterial,
  accentMat: THREE.Material,
  track: TrackFn
): THREE.Group {
  const group = new THREE.Group();

  if (b.archetype === 'covered_bridge') {
    return buildCoveredBridgeGroup(b, material, stoneMat, edgeMat, accentMat, track);
  }

  const obb = computeOBB(b.rings[0]);
  const baseY = b.baseElevation ?? 0;

  if (b.archetype === 'pavilion') {
    const bodyH = Math.max(4.5, b.height * 0.58);
    const bodyGeom = track(buildExtrudedPolygonGeometry(b.rings, bodyH, baseY, false));
    const bodyMesh = new THREE.Mesh(bodyGeom, material);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    group.add(track(new THREE.LineSegments(track(new THREE.EdgesGeometry(bodyGeom, 28)), edgeMat)));

    // Flared traditional hipped/gable roof on OBB
    const roofH = Math.max(2.6, b.height * 0.34);
    const roofGeom = track(
      b.roofStyle === 'hipped_eaves'
        ? createHippedRoofGeometry(obb.length + 2.8, obb.width + 2.8, roofH)
        : createGableRoofGeometry(obb.length + 2.8, obb.width + 2.8, roofH)
    );
    const roofMesh = new THREE.Mesh(roofGeom, material);
    roofMesh.position.set(obb.cx, baseY + bodyH, obb.cz);
    roofMesh.rotation.y = -obb.angle;
    roofMesh.castShadow = true;
    group.add(roofMesh);

    const lines = track(new THREE.LineSegments(track(new THREE.EdgesGeometry(roofGeom, 22)), edgeMat));
    lines.position.copy(roofMesh.position);
    lines.rotation.copy(roofMesh.rotation);
    group.add(lines);
    return group;
  }

  if (b.archetype === 'tower') {
    const baseH = b.height * 0.62;
    const bodyGeom = track(buildExtrudedPolygonGeometry(b.rings, baseH, baseY, false));
    const bodyMesh = new THREE.Mesh(bodyGeom, material);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    group.add(track(new THREE.LineSegments(track(new THREE.EdgesGeometry(bodyGeom, 28)), edgeMat)));

    const tier2H = b.height * 0.25;
    const tier2 = track(new THREE.BoxGeometry(obb.length * 0.66, tier2H, obb.width * 0.66));
    const t2Mesh = new THREE.Mesh(tier2, material);
    t2Mesh.position.set(obb.cx, baseY + baseH + tier2H * 0.5, obb.cz);
    t2Mesh.rotation.y = -obb.angle;
    t2Mesh.castShadow = true;
    group.add(t2Mesh);
    const t2Edges = track(new THREE.LineSegments(track(new THREE.EdgesGeometry(tier2, 25)), edgeMat));
    t2Edges.position.copy(t2Mesh.position);
    t2Edges.rotation.copy(t2Mesh.rotation);
    group.add(t2Edges);

    const spireRoof = track(
      new THREE.ConeGeometry(Math.min(obb.length, obb.width) * 0.38, b.height * 0.22, 4)
    );
    const spireMesh = new THREE.Mesh(spireRoof, material);
    spireMesh.position.set(obb.cx, baseY + baseH + tier2H + b.height * 0.11, obb.cz);
    spireMesh.rotation.y = -obb.angle + Math.PI / 4;
    spireMesh.castShadow = true;
    group.add(spireMesh);
    const spireEdges = track(
      new THREE.LineSegments(track(new THREE.EdgesGeometry(spireRoof, 22)), edgeMat)
    );
    spireEdges.position.copy(spireMesh.position);
    spireEdges.rotation.copy(spireMesh.rotation);
    group.add(spireEdges);
    return group;
  }

  if (b.archetype === 'pitched' || b.roofStyle === 'stepped_gable' || b.roofStyle === 'hipped_eaves') {
    const wallH = Math.max(4, b.height * 0.74);
    const bodyGeom = track(buildExtrudedPolygonGeometry(b.rings, wallH, baseY, false));
    const bodyMesh = new THREE.Mesh(bodyGeom, material);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    group.add(track(new THREE.LineSegments(track(new THREE.EdgesGeometry(bodyGeom, 28)), edgeMat)));

    const roofH = Math.max(2.2, Math.min(5.5, obb.width * 0.32));
    const overhang = b.roofStyle === 'stepped_gable' ? 0.35 : 1.0;
    const roofGeom = track(
      b.roofStyle === 'hipped_eaves'
        ? createHippedRoofGeometry(obb.length + overhang, obb.width + overhang, roofH)
        : createGableRoofGeometry(obb.length + overhang, obb.width + overhang, roofH)
    );
    const roofMesh = new THREE.Mesh(roofGeom, material);
    roofMesh.position.set(obb.cx, baseY + wallH, obb.cz);
    roofMesh.rotation.y = -obb.angle;
    roofMesh.castShadow = true;
    group.add(roofMesh);

    const roofLines = track(new THREE.LineSegments(track(new THREE.EdgesGeometry(roofGeom, 22)), edgeMat));
    roofLines.position.copy(roofMesh.position);
    roofLines.rotation.copy(roofMesh.rotation);
    group.add(roofLines);

    if (b.roofStyle === 'stepped_gable') {
      const gableGeom = track(createSteppedGableGeometry(obb.width, roofH));
      const gableEdgesGeom = track(new THREE.EdgesGeometry(gableGeom, 24));
      const cos = Math.cos(obb.angle);
      const sin = Math.sin(obb.angle);
      for (const endSign of [-1, 1]) {
        const offsetAlong = endSign * (obb.length * 0.5 - 0.16);
        const gx = obb.cx + offsetAlong * cos;
        const gz = obb.cz + offsetAlong * sin;
        const gMesh = new THREE.Mesh(gableGeom, material);
        gMesh.position.set(gx, baseY + wallH, gz);
        gMesh.rotation.y = -obb.angle;
        gMesh.castShadow = true;
        group.add(gMesh);

        const gLines = new THREE.LineSegments(gableEdgesGeom, edgeMat);
        gLines.position.copy(gMesh.position);
        gLines.rotation.copy(gMesh.rotation);
        group.add(gLines);
      }
    }

    if (b.hasDormers) {
      addRoofDormers(
        group,
        obb.cx,
        baseY + wallH,
        obb.cz,
        obb.angle,
        obb.length,
        obb.width,
        roofH,
        material,
        edgeMat,
        track
      );
    }
    return group;
  }

  // Modern flat-roof building with raised parapet & subtle rooftop cap
  const bodyGeom = track(buildExtrudedPolygonGeometry(b.rings, b.height, baseY, false));
  const bodyMesh = new THREE.Mesh(bodyGeom, material);
  bodyMesh.castShadow = true;
  group.add(bodyMesh);
  group.add(track(new THREE.LineSegments(track(new THREE.EdgesGeometry(bodyGeom, 28)), edgeMat)));

  if (obb.length > 8 && obb.width > 7) {
    const parapetGeom = track(new THREE.BoxGeometry(obb.length * 0.84, 0.55, obb.width * 0.84));
    const parapetMesh = new THREE.Mesh(parapetGeom, accentMat);
    parapetMesh.position.set(obb.cx, baseY + b.height + 0.25, obb.cz);
    parapetMesh.rotation.y = -obb.angle;
    parapetMesh.castShadow = true;
    group.add(parapetMesh);
    const pEdges = track(new THREE.LineSegments(track(new THREE.EdgesGeometry(parapetGeom, 25)), edgeMat));
    pEdges.position.copy(parapetMesh.position);
    pEdges.rotation.copy(parapetMesh.rotation);
    group.add(pEdges);
  }

  if (obb.length > 12 && obb.width > 10) {
    const capW = Math.min(8, obb.width * 0.26);
    const capL = Math.min(11, obb.length * 0.26);
    const capH = 1.6 + (b.seed % 1.4);
    const capGeom = track(new THREE.BoxGeometry(capL, capH, capW));
    const capMesh = new THREE.Mesh(capGeom, material);
    capMesh.position.set(
      obb.cx + Math.cos(obb.angle) * (obb.length * 0.12),
      baseY + b.height + capH * 0.5,
      obb.cz + Math.sin(obb.angle) * (obb.length * 0.12)
    );
    capMesh.rotation.y = -obb.angle;
    capMesh.castShadow = true;
    group.add(capMesh);
    const capEdges = track(new THREE.LineSegments(track(new THREE.EdgesGeometry(capGeom, 25)), edgeMat));
    capEdges.position.copy(capMesh.position);
    capEdges.rotation.copy(capMesh.rotation);
    group.add(capEdges);
  }

  return group;
}

// ---------- Path Sampling for Boats, Cars, Pedestrians ----------

interface PolyPath {
  points: Vec2[];
  cumDist: number[];
  totalLen: number;
}

function compilePath(pts: Vec2[]): PolyPath | null {
  if (pts.length < 2) return null;
  const cumDist = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    cumDist.push(total);
  }
  if (total < 6) return null;
  return { points: pts, cumDist, totalLen: total };
}

function samplePath(path: PolyPath, dist: number): { x: number; z: number; angle: number } {
  const d = Math.max(0, Math.min(path.totalLen, dist));
  for (let i = 0; i < path.cumDist.length - 1; i++) {
    if (d <= path.cumDist[i + 1] || i === path.cumDist.length - 2) {
      const segStart = path.cumDist[i];
      const segLen = Math.max(0.001, path.cumDist[i + 1] - segStart);
      const t = (d - segStart) / segLen;
      const a = path.points[i];
      const b = path.points[i + 1];
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        angle: Math.atan2(b.z - a.z, b.x - a.x),
      };
    }
  }
  const last = path.points[path.points.length - 1];
  return { x: last.x, z: last.z, angle: 0 };
}

// ---------- Main Diorama Builder ----------

export function buildDioramaScene(
  data: DioramaSceneData,
  initialTheme: AtmosphereTheme
): BuiltDiorama {
  const root = new THREE.Group();
  const half = data.halfSize;
  const full = half * 2;
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Shared Dynamic Materials
  const baseSlabMat = track(
    new THREE.MeshLambertMaterial({ color: initialTheme.baseSlabColor })
  );
  const baseSideMat = track(
    new THREE.MeshLambertMaterial({ color: initialTheme.baseEdgeColor })
  );
  const groundMat = track(
    new THREE.MeshLambertMaterial({
      color: initialTheme.groundColor,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
    })
  );
  const riverbedMat = track(
    new THREE.MeshLambertMaterial({ color: initialTheme.waterShoreColor })
  );
  const parkMat = track(
    new THREE.MeshLambertMaterial({
      color: initialTheme.parkColor,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
    })
  );
  const roadMat = track(
    new THREE.MeshLambertMaterial({
      color: initialTheme.roadColor,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
    })
  );
  const sidewalkTex = track(
    createPavingTexture('#f5f2eb', 'rgba(100, 88, 76, 0.18)', 2, 1)
  );
  const sidewalkMat = track(
    new THREE.MeshLambertMaterial({
      color: initialTheme.sidewalkColor,
      map: sidewalkTex,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
    })
  );
  const roadStripeMat = track(
    new THREE.MeshBasicMaterial({
      color: '#ece9e1',
      transparent: true,
      opacity: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
    })
  );
  const bridgeDeckMat = track(
    new THREE.MeshLambertMaterial({ color: '#c4b8aa' })
  );
  const waterMat = track(createWaterMaterial());
  const buildingEdgeMat = track(
    new THREE.LineBasicMaterial({
      color: initialTheme.edgeLineColor,
      transparent: true,
      opacity: initialTheme.edgeLineOpacity,
    })
  );
  const shadowCatcherMat = track(
    new THREE.ShadowMaterial({
      color: initialTheme.shadowTint,
      opacity: initialTheme.shadowOpacity,
      transparent: true,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
    })
  );

  // 1. Tabletop Plinth Slab
  const slabDepth = 10;
  const slabGeom = track(new THREE.BoxGeometry(full + 4, slabDepth, full + 4));
  const slabMesh = new THREE.Mesh(slabGeom, [
    baseSideMat,
    baseSideMat,
    baseSlabMat,
    baseSideMat,
    baseSideMat,
    baseSideMat,
  ]);
  slabMesh.position.set(0, -slabDepth * 0.5 - 1.2, 0);
  slabMesh.renderOrder = 0;
  root.add(slabMesh);

  // Riverbed underneath everything inside slab bounds
  const bedGeom = track(new THREE.PlaneGeometry(full, full));
  bedGeom.rotateX(-Math.PI / 2);
  const bedMesh = new THREE.Mesh(bedGeom, riverbedMat);
  bedMesh.position.y = -1.15;
  bedMesh.renderOrder = 0;
  root.add(bedMesh);

  // 2. Water Stencil Mask (carves recessed river channels cleanly out of ground plane)
  const waterMaskMat = track(
    new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
    })
  );

  const waterSurfaceGroup = new THREE.Group();
  const waterLabelMats: THREE.MeshBasicMaterial[] = [];
  for (const w of data.waters) {
    for (const polyRings of w.polygons) {
      const maskGeom = track(buildFlatPolygonGeometry(polyRings, 0.05));
      const maskMesh = new THREE.Mesh(maskGeom, waterMaskMat);
      maskMesh.renderOrder = 1;
      root.add(maskMesh);

      const surfGeom = track(buildFlatPolygonGeometry(polyRings, -0.78));
      const surfMesh = new THREE.Mesh(surfGeom, waterMat);
      surfMesh.renderOrder = 3;
      waterSurfaceGroup.add(surfMesh);
    }

    if (w.name && w.centerlines.length > 0) {
      let bestLine: Vec2[] | null = null;
      let bestLen = 0;
      for (const line of w.centerlines) {
        if (line.length < 2) continue;
        let len = 0;
        for (let i = 1; i < line.length; i++) {
          len += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
        }
        if (len > bestLen) {
          bestLen = len;
          bestLine = line;
        }
      }
      if (bestLine && bestLen > 20) {
        const compiled = compilePath(bestLine);
        if (compiled) {
          const mid = samplePath(compiled, compiled.totalLen * 0.5);
          let rotY = -mid.angle;
          if (Math.cos(rotY) * 0.788 + Math.sin(rotY) * 0.616 < 0) {
            rotY += Math.PI;
          }
          const labelW = Math.min(48, Math.max(24, Math.min(bestLen * 0.45, half * 0.38)));
          const labelH = labelW * 0.25;
          const labelTex = track(createWaterLabelTexture(w.name));
          const labelMat = track(
            new THREE.MeshBasicMaterial({
              map: labelTex,
              transparent: true,
              opacity: initialTheme.isNight ? 0.45 : 0.85,
              depthWrite: false,
            })
          );
          waterLabelMats.push(labelMat);
          const labelGeom = track(new THREE.PlaneGeometry(labelW, labelH));
          labelGeom.rotateX(-Math.PI / 2);
          const labelMesh = new THREE.Mesh(labelGeom, labelMat);
          labelMesh.position.set(mid.x, -0.74, mid.z);
          labelMesh.rotation.y = rotY;
          labelMesh.renderOrder = 4;
          root.add(labelMesh);
        }
      }
    }
  }
  root.add(waterSurfaceGroup);

  // 3. Main Ground Plate (stenciled around water)
  const groundGeom = track(new THREE.BoxGeometry(full, 1.2, full));
  const groundMesh = new THREE.Mesh(groundGeom, groundMat);
  groundMesh.position.y = -0.6;
  groundMesh.renderOrder = 2;
  root.add(groundMesh);

  // Uniform oblique cool-blue cast shadow plane
  const shadowPlaneGeom = track(new THREE.PlaneGeometry(full, full));
  shadowPlaneGeom.rotateX(-Math.PI / 2);
  const shadowPlane = new THREE.Mesh(shadowPlaneGeom, shadowCatcherMat);
  shadowPlane.position.y = 0.16;
  shadowPlane.receiveShadow = true;
  shadowPlane.renderOrder = 6;
  root.add(shadowPlane);

  // 4. Parks & Greenbelts
  for (const park of data.parks) {
    const pGeom = track(buildFlatPolygonGeometry(park.rings, 0.06));
    const pMesh = new THREE.Mesh(pGeom, parkMat);
    pMesh.renderOrder = 4;
    root.add(pMesh);
  }

  // 5. Roads, Sidewalks, Bridges & Streetlamps
  const bridgeStoneMat = track(
    new THREE.MeshLambertMaterial({ color: '#c4b6a6' })
  );
  const lampPositions: Vec2[] = [];
  const buildRoad = (road: DioramaRoad) => {
    if (road.points.length < 2) return;
    if (road.isBridge) {
      buildArchedRoadBridge(road, bridgeDeckMat, bridgeStoneMat, buildingEdgeMat, track, root);
      return;
    }

    // Sidewalk shoulder on primary/secondary avenues
    if (road.kind === 'primary' || road.kind === 'secondary') {
      const swGeom = track(buildPolylineRibbonGeometry(road.points, road.width + 4.4, 0.07));
      const swMesh = new THREE.Mesh(swGeom, sidewalkMat);
      swMesh.renderOrder = 4;
      root.add(swMesh);
    }

    const rGeom = track(buildPolylineRibbonGeometry(road.points, road.width, 0.11));
    const rMesh = new THREE.Mesh(rGeom, roadMat);
    rMesh.renderOrder = 5;
    root.add(rMesh);

    if (road.kind === 'primary' || road.kind === 'secondary') {
      const stripeGeom = track(buildPolylineRibbonGeometry(road.points, 0.45, 0.14));
      const stripeMesh = new THREE.Mesh(stripeGeom, roadStripeMat);
      stripeMesh.renderOrder = 5;
      root.add(stripeMesh);

      // Place streetlamp posts along sidewalk edge
      for (let i = 0; i < road.points.length - 1; i++) {
        const a = road.points[i];
        const b = road.points[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 12) continue;
        const nx = -dz / len;
        const nz = dx / len;
        const stepCount = Math.max(1, Math.floor(len / 34));
        for (let s = 1; s <= stepCount; s++) {
          const t = s / (stepCount + 1);
          lampPositions.push({
            x: a.x + dx * t + nx * (road.width * 0.5 + 1.5),
            z: a.z + dz * t + nz * (road.width * 0.5 + 1.5),
          });
        }
      }
    }
  };
  for (const r of data.roads) buildRoad(r);

  // Instanced Streetlamps
  const lampBulbMat = track(
    new THREE.MeshBasicMaterial({
      color: '#ffd98a',
      transparent: true,
      opacity: 0.9,
    })
  );
  const lampPoleMat = track(new THREE.MeshLambertMaterial({ color: '#454852' }));
  if (lampPositions.length > 0) {
    const poleGeom = track(new THREE.CylinderGeometry(0.14, 0.18, 4.8, 6));
    poleGeom.translate(0, 2.4, 0);
    const bulbGeom = track(new THREE.SphereGeometry(0.55, 8, 8));
    bulbGeom.translate(0, 5.0, 0);

    const poleInst = new THREE.InstancedMesh(poleGeom, lampPoleMat, lampPositions.length);
    const bulbInst = new THREE.InstancedMesh(bulbGeom, lampBulbMat, lampPositions.length);
    poleInst.frustumCulled = false;
    poleInst.castShadow = true;
    bulbInst.frustumCulled = false;
    const dummy = new THREE.Object3D();
    lampPositions.forEach((p, idx) => {
      dummy.position.set(p.x, 0.08, p.z);
      dummy.updateMatrix();
      poleInst.setMatrixAt(idx, dummy.matrix);
      bulbInst.setMatrixAt(idx, dummy.matrix);
    });
    poleInst.instanceMatrix.needsUpdate = true;
    bulbInst.instanceMatrix.needsUpdate = true;
    root.add(poleInst, bulbInst);
  }

  // 6. Stylized Buildings
  const defaultParapetMat = track(
    new THREE.MeshLambertMaterial({ color: '#ddd6ca' })
  );
  const accentMatCache = new Map<string, THREE.MeshLambertMaterial>();
  const getAccentMat = (hex?: string): THREE.Material => {
    if (!hex) return defaultParapetMat;
    let cached = accentMatCache.get(hex);
    if (!cached) {
      cached = track(new THREE.MeshLambertMaterial({ color: hex }));
      accentMatCache.set(hex, cached);
    }
    return cached;
  };

  const buildingMaterials: THREE.ShaderMaterial[] = [];
  for (const b of data.buildings) {
    const isLandmark =
      b.archetype === 'covered_bridge' ||
      b.archetype === 'pavilion' ||
      b.archetype === 'tower' ||
      Boolean(b.name);
    const mat = track(
      createBuildingMaterial({
        wallColor: b.wallColor,
        roofColor: b.roofColor,
        seed: b.seed,
        height: b.height,
        isLandmark,
        facadeKind: resolveFacadeKind(b),
        halfSize: half,
      })
    );
    buildingMaterials.push(mat);
    const bGroup = buildStandardBuildingGroup(
      b,
      mat,
      bridgeStoneMat,
      buildingEdgeMat,
      getAccentMat(b.accentColor),
      track
    );
    root.add(bGroup);
  }

  // 7. Layered Watercolor Foliage Trees + Contact Shadows + Winter Bare Branches
  const trunkMat = track(new THREE.MeshLambertMaterial({ color: '#7a6354' }));
  const canopyMats = [0, 1, 2].map(() =>
    track(
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        alphaTest: initialTheme.isWinter ? 0.16 : 0.34,
        side: THREE.DoubleSide,
      })
    )
  );
  const lushFoliageGeom = track(createLayeredFoliageGeometry(true));
  const bareFoliageGeom = track(createLayeredFoliageGeometry(false));
  const canopyInsts: THREE.InstancedMesh[] = [];
  let treeShadowProxyInst: THREE.InstancedMesh | null = null;
  let activeFoliageTextures: THREE.Texture[] = [];
  let lastFoliageKey = '';

  if (data.trees.length > 0) {
    const trunkGeom = track(new THREE.CylinderGeometry(0.22, 0.34, 3.0, 6));
    trunkGeom.translate(0, 1.5, 0);
    const trunkInst = new THREE.InstancedMesh(trunkGeom, trunkMat, data.trees.length);
    trunkInst.frustumCulled = false;
    trunkInst.castShadow = true;

    const contactShadowTex = track(createContactShadowTexture());
    const contactShadowGeom = track(new THREE.PlaneGeometry(5.6, 5.6));
    contactShadowGeom.rotateX(-Math.PI / 2);
    const contactShadowMat = track(
      new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.NotEqualStencilFunc,
      })
    );
    const contactShadowInst = new THREE.InstancedMesh(
      contactShadowGeom,
      contactShadowMat,
      data.trees.length
    );
    contactShadowInst.frustumCulled = false;
    contactShadowInst.renderOrder = 6;

    const proxyGeom = track(new THREE.IcosahedronGeometry(2.1, 1));
    const proxyMat = track(
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
      })
    );
    treeShadowProxyInst = new THREE.InstancedMesh(proxyGeom, proxyMat, data.trees.length);
    treeShadowProxyInst.frustumCulled = false;
    treeShadowProxyInst.castShadow = true;
    treeShadowProxyInst.visible = !initialTheme.isWinter;

    const canopyBuckets: Array<typeof data.trees> = [[], [], []];
    const dummy = new THREE.Object3D();

    data.trees.forEach((t, idx) => {
      dummy.position.set(t.x, 0, t.z);
      dummy.scale.set(t.scale, t.scale, t.scale);
      dummy.rotation.set(0, (idx * 1.7) % (Math.PI * 2), 0);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(t.x, 0.15, t.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      contactShadowInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(t.x, 4.1 * t.scale, t.z);
      dummy.scale.set(t.scale, t.scale * 0.9, t.scale);
      dummy.updateMatrix();
      treeShadowProxyInst!.setMatrixAt(idx, dummy.matrix);

      canopyBuckets[t.variant].push(t);
    });
    trunkInst.instanceMatrix.needsUpdate = true;
    contactShadowInst.instanceMatrix.needsUpdate = true;
    treeShadowProxyInst.instanceMatrix.needsUpdate = true;
    root.add(trunkInst, contactShadowInst, treeShadowProxyInst);

    canopyBuckets.forEach((bucket, bIdx) => {
      if (bucket.length === 0) return;
      const geom = initialTheme.isWinter ? bareFoliageGeom : lushFoliageGeom;
      const inst = new THREE.InstancedMesh(geom, canopyMats[bIdx], bucket.length);
      inst.frustumCulled = false;
      bucket.forEach((t, idx) => {
        const s = t.scale;
        dummy.position.set(t.x, 0, t.z);
        dummy.scale.set(s, s, s);
        dummy.rotation.set(0, (idx * 1.37 + bIdx * 0.9) % (Math.PI * 2), 0);
        dummy.updateMatrix();
        inst.setMatrixAt(idx, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      canopyInsts.push(inst);
      root.add(inst);
    });
  }

  // 8. Living Micro-Agents: Boats, Vehicles, Pedestrians + Rain Umbrellas
  const compiledBoatPaths = data.boatPaths.map(compilePath).filter((p): p is PolyPath => Boolean(p));
  const compiledCarPaths = data.vehiclePaths.map(compilePath).filter((p): p is PolyPath => Boolean(p));
  const compiledPedPaths = data.pedestrianPaths.map(compilePath).filter((p): p is PolyPath => Boolean(p));

  // Boats
  interface BoatAgent {
    group: THREE.Group;
    lanternMat: THREE.MeshBasicMaterial;
    pennant: THREE.Mesh;
    path: PolyPath;
    dist: number;
    speed: number;
    dir: 1 | -1;
    phase: number;
  }
  const boats: BoatAgent[] = [];
  if (compiledBoatPaths.length > 0) {
    const hullMat = track(new THREE.MeshLambertMaterial({ color: '#8a5d48' }));
    const cabinMat = track(new THREE.MeshLambertMaterial({ color: '#e6dccb' }));
    const roofMat = track(new THREE.MeshLambertMaterial({ color: '#3b4052' }));
    const pennantMat = track(new THREE.MeshBasicMaterial({ color: '#ff7a24', side: THREE.DoubleSide }));
    const wakeMat = track(
      new THREE.MeshBasicMaterial({ color: '#e6f5f7', transparent: true, opacity: 0.55 })
    );

    const boatCount = Math.min(4, compiledBoatPaths.length * 2);
    for (let i = 0; i < boatCount; i++) {
      const path = compiledBoatPaths[i % compiledBoatPaths.length];
      const bg = new THREE.Group();

      const hull = new THREE.Mesh(track(new THREE.BoxGeometry(9.5, 1.1, 3.8)), hullMat);
      hull.position.y = 0.2;
      const cabin = new THREE.Mesh(track(new THREE.BoxGeometry(5.6, 1.8, 2.8)), cabinMat);
      cabin.position.y = 1.45;
      const roof = new THREE.Mesh(track(new THREE.BoxGeometry(6.4, 0.55, 3.4)), roofMat);
      roof.position.y = 2.55;

      const lanternMat = track(
        new THREE.MeshBasicMaterial({ color: '#ffd478', transparent: true, opacity: 0 })
      );
      const lantern = new THREE.Mesh(track(new THREE.SphereGeometry(0.45, 8, 8)), lanternMat);
      lantern.position.set(3.4, 2.0, 0);

      const pennantGeom = track(new THREE.PlaneGeometry(1.6, 1.0));
      const pennant = new THREE.Mesh(pennantGeom, pennantMat);
      pennant.position.set(-2.4, 3.4, 0);
      pennant.visible = initialTheme.isFestival;

      const wake = new THREE.Mesh(track(new THREE.RingGeometry(1.8, 2.5, 16)), wakeMat);
      wake.rotation.x = -Math.PI / 2;
      wake.position.set(-5.6, -0.05, 0);

      bg.add(hull, cabin, roof, lantern, pennant, wake);
      root.add(bg);
      boats.push({
        group: bg,
        lanternMat,
        pennant,
        path,
        dist: (path.totalLen / boatCount) * i,
        speed: 4.5 + (i % 3) * 1.1,
        dir: i % 2 === 0 ? 1 : -1,
        phase: i * 1.7,
      });
    }
  }

  // Vehicles (InstancedMesh)
  interface CarAgent {
    path: PolyPath;
    dist: number;
    speed: number;
    dir: 1 | -1;
    laneOffset: number;
  }
  const cars: CarAgent[] = [];
  let carBodyInst: THREE.InstancedMesh | null = null;
  let carRoofInst: THREE.InstancedMesh | null = null;

  if (compiledCarPaths.length > 0) {
    const carCount = Math.min(26, compiledCarPaths.length * 4);
    const carBodyGeom = track(new THREE.BoxGeometry(4.2, 1.1, 2.1));
    carBodyGeom.translate(0, 0.72, 0);
    const carRoofGeom = track(new THREE.BoxGeometry(2.3, 0.85, 1.8));
    carRoofGeom.translate(-0.2, 1.62, 0);

    const carBodyMat = track(new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    const carRoofMat = track(new THREE.MeshLambertMaterial({ color: '#e6e4de' }));

    carBodyInst = new THREE.InstancedMesh(carBodyGeom, carBodyMat, carCount);
    carRoofInst = new THREE.InstancedMesh(carRoofGeom, carRoofMat, carCount);
    carBodyInst.frustumCulled = false;
    carRoofInst.frustumCulled = false;
    const palette = ['#8da3b8', '#c99c8e', '#94b39b', '#d9c598', '#8c8a9e'];

    for (let i = 0; i < carCount; i++) {
      const path = compiledCarPaths[i % compiledCarPaths.length];
      const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      cars.push({
        path,
        dist: ((i * 37) % Math.max(10, Math.floor(path.totalLen))),
        speed: 9 + (i % 5) * 1.8,
        dir,
        laneOffset: dir * 2.4,
      });
      carBodyInst.setColorAt(i, new THREE.Color(palette[i % palette.length]));
    }
    if (carBodyInst.instanceColor) carBodyInst.instanceColor.needsUpdate = true;
    root.add(carBodyInst, carRoofInst);
  }

  // Pedestrians + Rain Umbrellas (InstancedMesh)
  interface PedAgent {
    path: PolyPath;
    dist: number;
    speed: number;
    dir: 1 | -1;
    sideOffset: number;
  }
  const peds: PedAgent[] = [];
  let pedBodyInst: THREE.InstancedMesh | null = null;
  let pedHeadInst: THREE.InstancedMesh | null = null;
  let umbrellaInst: THREE.InstancedMesh | null = null;
  const coatColors = ['#5f7687', '#b8766c', '#6e8c6e', '#c9a66b', '#4d5263', '#8c6e7f'];
  const festivalCoatColors = ['#ff7a24', '#ff9c38', '#e85d1a', '#fff3e0', '#f5a623', '#507eb5'];
  let lastFestivalState = initialTheme.isFestival;

  if (compiledPedPaths.length > 0) {
    const pedCount = Math.min(90, compiledPedPaths.length * 8);
    const bodyGeom = track(new THREE.CylinderGeometry(0.32, 0.42, 1.3, 6));
    bodyGeom.translate(0, 0.72, 0);
    const headGeom = track(new THREE.SphereGeometry(0.32, 7, 7));
    headGeom.translate(0, 1.55, 0);
    const umbGeom = track(new THREE.ConeGeometry(1.15, 0.52, 8));
    umbGeom.translate(0, 2.25, 0);

    const pedBodyMat = track(new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    const pedHeadMat = track(new THREE.MeshLambertMaterial({ color: '#463e3a' }));
    const umbMat = track(new THREE.MeshLambertMaterial({ color: '#ffffff' }));

    pedBodyInst = new THREE.InstancedMesh(bodyGeom, pedBodyMat, pedCount);
    pedHeadInst = new THREE.InstancedMesh(headGeom, pedHeadMat, pedCount);
    umbrellaInst = new THREE.InstancedMesh(umbGeom, umbMat, pedCount);
    pedBodyInst.frustumCulled = false;
    pedHeadInst.frustumCulled = false;
    umbrellaInst.frustumCulled = false;

    const activeCoats = initialTheme.isFestival ? festivalCoatColors : coatColors;
    const umbColors = ['#3d4454', '#567582', '#9e5d56', '#c29951', '#4f6b58'];

    for (let i = 0; i < pedCount; i++) {
      const path = compiledPedPaths[i % compiledPedPaths.length];
      peds.push({
        path,
        dist: ((i * 23) % Math.max(8, Math.floor(path.totalLen))),
        speed: 2.3 + (i % 4) * 0.55,
        dir: i % 2 === 0 ? 1 : -1,
        sideOffset: ((i % 5) - 2) * 1.1,
      });
      pedBodyInst.setColorAt(i, new THREE.Color(activeCoats[i % activeCoats.length]));
      umbrellaInst.setColorAt(i, new THREE.Color(umbColors[i % umbColors.length]));
    }
    if (pedBodyInst.instanceColor) pedBodyInst.instanceColor.needsUpdate = true;
    if (umbrellaInst.instanceColor) umbrellaInst.instanceColor.needsUpdate = true;
    umbrellaInst.visible = initialTheme.umbrellasActive;
    root.add(pedBodyInst, pedHeadInst, umbrellaInst);
  }

  // 9. Weather Particles (Petals / Leaves / Snow) + Illustrated Diagonal Rain Streaks
  const particleCount = 420;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleSeeds = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * full;
    particlePositions[i * 3 + 1] = Math.random() * 95 + 2;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * full;
    particleSeeds[i] = Math.random() * Math.PI * 2;
  }
  const particleGeom = track(new THREE.BufferGeometry());
  particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particleMat = track(
    new THREE.PointsMaterial({
      color: initialTheme.particleColor,
      size: 2.6,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    })
  );
  const particlePoints = new THREE.Points(particleGeom, particleMat);
  particlePoints.visible =
    initialTheme.particleKind !== 'none' && initialTheme.particleKind !== 'rain';
  root.add(particlePoints);

  const rainCount = 260;
  const rainPositions = new Float32Array(rainCount * 6);
  for (let i = 0; i < rainCount; i++) {
    const rx = (Math.random() - 0.5) * full;
    const ry = Math.random() * 95 + 6;
    const rz = (Math.random() - 0.5) * full;
    rainPositions[i * 6] = rx;
    rainPositions[i * 6 + 1] = ry;
    rainPositions[i * 6 + 2] = rz;
    rainPositions[i * 6 + 3] = rx - 0.95;
    rainPositions[i * 6 + 4] = ry - 5.2;
    rainPositions[i * 6 + 5] = rz - 0.35;
  }
  const rainGeom = track(new THREE.BufferGeometry());
  rainGeom.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMat = track(
    new THREE.LineBasicMaterial({
      color: '#7c96b2',
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    })
  );
  const rainLines = new THREE.LineSegments(rainGeom, rainMat);
  rainLines.visible = initialTheme.particleKind === 'rain';
  root.add(rainLines);

  // ---------- Theme & Frame Updaters ----------

  const updateTheme = (theme: AtmosphereTheme) => {
    baseSlabMat.color.set(theme.baseSlabColor);
    baseSideMat.color.set(theme.baseEdgeColor);
    groundMat.color.set(theme.groundColor);
    riverbedMat.color.set(theme.waterShoreColor);
    parkMat.color.set(theme.parkColor);
    roadMat.color.set(theme.roadColor);
    sidewalkMat.color.set(theme.sidewalkColor);

    shadowCatcherMat.color.set(theme.shadowTint);
    shadowCatcherMat.opacity = theme.shadowOpacity;

    buildingEdgeMat.color.set(theme.edgeLineColor);
    buildingEdgeMat.opacity = theme.edgeLineOpacity;

    lampBulbMat.opacity = theme.lampGlow > 0.05 ? 0.2 + theme.lampGlow * 0.8 : 0.0;

    const sunVec = new THREE.Vector3(...theme.sunPosition).normalize();
    for (const mat of buildingMaterials) {
      mat.uniforms.uSunDir.value.copy(sunVec);
      mat.uniforms.uSunColor.value.set(theme.sunColor);
      mat.uniforms.uHemiSky.value.set(theme.hemiSkyColor);
      mat.uniforms.uHemiGround.value.set(theme.hemiGroundColor);
      mat.uniforms.uShadowTint.value.set(theme.shadowTint);
      mat.uniforms.uFogColor.value.set(theme.fogColor);
      mat.uniforms.uWindowGlow.value = theme.windowGlow;
    }

    waterMat.uniforms.uWaterColor.value.set(theme.waterColor);
    waterMat.uniforms.uRippleColor.value.set(theme.waterRippleColor);
    waterMat.uniforms.uShoreColor.value.set(theme.waterShoreColor);
    waterMat.uniforms.uNightFactor.value = theme.isNight ? 1.0 : 0.0;
    for (const lm of waterLabelMats) {
      lm.opacity = theme.isNight ? 0.45 : 0.85;
    }

    const foliageKey = `${theme.isWinter}_${theme.foliageColors.join(',')}`;
    if (foliageKey !== lastFoliageKey) {
      lastFoliageKey = foliageKey;
      const oldTextures = activeFoliageTextures;
      activeFoliageTextures = [0, 1, 2].map((i) =>
        createWatercolorFoliageTexture(
          theme.foliageColors,
          theme.isWinter ? 'winter_bare' : 'lush',
          71.3 + i * 19.7
        )
      );
      canopyMats.forEach((m, i) => {
        m.map = activeFoliageTextures[i];
        m.alphaTest = theme.isWinter ? 0.16 : 0.34;
        m.needsUpdate = true;
      });
      canopyInsts.forEach((inst) => {
        inst.geometry = theme.isWinter ? bareFoliageGeom : lushFoliageGeom;
      });
      oldTextures.forEach((t) => t.dispose());
    }
    canopyMats.forEach((m) => m.color.set(theme.isNight ? '#8fa1bf' : '#ffffff'));
    if (treeShadowProxyInst) {
      treeShadowProxyInst.visible = !theme.isWinter;
    }

    if (pedBodyInst && theme.isFestival !== lastFestivalState) {
      lastFestivalState = theme.isFestival;
      const palette = theme.isFestival ? festivalCoatColors : coatColors;
      for (let i = 0; i < peds.length; i++) {
        pedBodyInst.setColorAt(i, new THREE.Color(palette[i % palette.length]));
      }
      if (pedBodyInst.instanceColor) pedBodyInst.instanceColor.needsUpdate = true;
    }
    for (const b of boats) {
      b.pennant.visible = theme.isFestival;
      b.lanternMat.color.set(theme.isFestival ? '#ff8a2b' : '#ffd478');
    }

    if (umbrellaInst) {
      umbrellaInst.visible = theme.umbrellasActive;
    }

    rainLines.visible = theme.particleKind === 'rain';
    particlePoints.visible =
      theme.particleKind !== 'none' && theme.particleKind !== 'rain';
    particleMat.color.set(theme.particleColor);
    particleMat.size = theme.particleKind === 'snow' ? 2.5 : 3.0;
    particleMat.opacity = 0.82;
  };

  updateTheme(initialTheme);

  const dummy = new THREE.Object3D();

  const updateFrame = (
    dt: number,
    elapsed: number,
    theme: AtmosphereTheme,
    playing: boolean
  ) => {
    waterMat.uniforms.uTime.value = playing ? elapsed : waterMat.uniforms.uTime.value;

    const stepDt = playing ? Math.min(dt, 0.05) : 0;

    // Boats
    for (const b of boats) {
      if (stepDt > 0) {
        b.dist += b.speed * b.dir * stepDt;
        if (b.dist > b.path.totalLen) {
          b.dist = b.path.totalLen;
          b.dir = -1;
        } else if (b.dist < 0) {
          b.dist = 0;
          b.dir = 1;
        }
      }
      const pos = samplePath(b.path, b.dist);
      b.group.position.set(pos.x, -0.78 + Math.sin(elapsed * 2.2 + b.phase) * 0.08, pos.z);
      b.group.rotation.y = -pos.angle + (b.dir === -1 ? Math.PI : 0);
      b.lanternMat.opacity = theme.isNight ? 0.95 : theme.isFestival ? 0.92 : theme.lampGlow * 0.6;
    }

    // Cars
    if (carBodyInst && carRoofInst) {
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (stepDt > 0) {
          c.dist += c.speed * c.dir * stepDt;
          if (c.dist > c.path.totalLen) c.dist = 0;
          if (c.dist < 0) c.dist = c.path.totalLen;
        }
        const pos = samplePath(c.path, c.dist);
        const nx = -Math.sin(pos.angle);
        const nz = Math.cos(pos.angle);
        dummy.position.set(
          pos.x + nx * c.laneOffset,
          0.12,
          pos.z + nz * c.laneOffset
        );
        dummy.rotation.set(0, -pos.angle + (c.dir === -1 ? Math.PI : 0), 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        carBodyInst.setMatrixAt(i, dummy.matrix);
        carRoofInst.setMatrixAt(i, dummy.matrix);
      }
      carBodyInst.instanceMatrix.needsUpdate = true;
      carRoofInst.instanceMatrix.needsUpdate = true;
    }

    // Pedestrians & Umbrellas
    if (pedBodyInst && pedHeadInst && umbrellaInst) {
      for (let i = 0; i < peds.length; i++) {
        const p = peds[i];
        if (stepDt > 0) {
          p.dist += p.speed * p.dir * stepDt;
          if (p.dist > p.path.totalLen) {
            p.dist = p.path.totalLen;
            p.dir = -1;
          } else if (p.dist < 0) {
            p.dist = 0;
            p.dir = 1;
          }
        }
        const pos = samplePath(p.path, p.dist);
        const nx = -Math.sin(pos.angle);
        const nz = Math.cos(pos.angle);
        const bob = playing ? Math.abs(Math.sin(elapsed * 7.5 + i)) * 0.12 : 0;
        dummy.position.set(
          pos.x + nx * p.sideOffset,
          0.12 + bob,
          pos.z + nz * p.sideOffset
        );
        dummy.rotation.set(0, -pos.angle, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        pedBodyInst.setMatrixAt(i, dummy.matrix);
        pedHeadInst.setMatrixAt(i, dummy.matrix);
        if (umbrellaInst.visible) {
          umbrellaInst.setMatrixAt(i, dummy.matrix);
        }
      }
      pedBodyInst.instanceMatrix.needsUpdate = true;
      pedHeadInst.instanceMatrix.needsUpdate = true;
      if (umbrellaInst.visible) {
        umbrellaInst.instanceMatrix.needsUpdate = true;
      }
    }

    // Weather particles (Petals / Leaves / Snow)
    if (particlePoints.visible && stepDt > 0) {
      const attr = particleGeom.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const kind = theme.particleKind;
      const fallSpeed = kind === 'snow' ? 7 : 9;
      const windX = 4.5;

      for (let i = 0; i < particleCount; i++) {
        const ix = i * 3;
        const seed = particleSeeds[i];
        arr[ix] += (windX + Math.sin(elapsed * 1.4 + seed) * 3.5) * stepDt;
        arr[ix + 1] -= fallSpeed * stepDt;
        arr[ix + 2] += Math.cos(elapsed * 1.1 + seed) * 2.8 * stepDt;

        if (arr[ix + 1] < 0) {
          arr[ix] = (Math.random() - 0.5) * full;
          arr[ix + 1] = 85 + Math.random() * 20;
          arr[ix + 2] = (Math.random() - 0.5) * full;
        }
      }
      attr.needsUpdate = true;
    }

    // Diagonal illustrated rain streaks
    if (rainLines.visible && stepDt > 0) {
      const attr = rainGeom.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const dx = -12 * stepDt;
      const dy = -66 * stepDt;
      const dz = -4.5 * stepDt;

      for (let i = 0; i < rainCount; i++) {
        const ix = i * 6;
        arr[ix] += dx;
        arr[ix + 1] += dy;
        arr[ix + 2] += dz;
        arr[ix + 3] += dx;
        arr[ix + 4] += dy;
        arr[ix + 5] += dz;

        if (arr[ix + 1] < 0) {
          const rx = (Math.random() - 0.5) * full;
          const ry = 85 + Math.random() * 22;
          const rz = (Math.random() - 0.5) * full;
          arr[ix] = rx;
          arr[ix + 1] = ry;
          arr[ix + 2] = rz;
          arr[ix + 3] = rx - 0.95;
          arr[ix + 4] = ry - 5.2;
          arr[ix + 5] = rz - 0.35;
        }
      }
      attr.needsUpdate = true;
    }
  };

  const dispose = () => {
    for (const tex of activeFoliageTextures) {
      tex.dispose();
    }
    activeFoliageTextures = [];
    for (const d of disposables) {
      d.dispose();
    }
  };

  return { root, updateTheme, updateFrame, dispose };
}
