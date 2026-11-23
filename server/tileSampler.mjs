import { inflateSync } from 'node:zlib';

const METERS_PER_DEG_LAT = 111320;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(r, g, b) {
  return (
    '#' +
    [clampByte(r), clampByte(g), clampByte(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [200, 180, 170];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function blendHex(baseHex, tintHex, weight) {
  const [r1, g1, b1] = hexToRgb(baseHex);
  const [r2, g2, b2] = hexToRgb(tintHex);
  return rgbToHex(
    r1 * (1 - weight) + r2 * weight,
    g1 * (1 - weight) + g2 * weight,
    b1 * (1 - weight) + b2 * weight
  );
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Lightweight zero-dependency PNG decoder for 8-bit RGB, RGBA, and indexed PNG tiles.
 */
function decodePngPixels(buffer) {
  if (!buffer || buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a valid PNG image');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let palette = null;
  const idatChunks = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;

    if (type === 'IHDR' && length >= 13) {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer.readUInt8(dataStart + 8);
      colorType = buffer.readUInt8(dataStart + 9);
    } else if (type === 'PLTE') {
      palette = buffer.subarray(dataStart, dataEnd);
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || bitDepth !== 8 || idatChunks.length === 0) {
    throw new Error(`Unsupported PNG format (depth=${bitDepth}, colorType=${colorType})`);
  }

  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : 0;
  if (bpp === 0) {
    throw new Error(`Unsupported PNG colorType=${colorType}`);
  }

  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * bpp;
  const pixels = new Uint8Array(width * height * 3);
  const prevRow = new Uint8Array(stride);
  const curRow = new Uint8Array(stride);

  let rawPos = 0;
  for (let y = 0; y < height; y++) {
    if (rawPos >= raw.length) break;
    const filterType = raw[rawPos++];
    for (let x = 0; x < stride; x++) {
      const filt = raw[rawPos++] ?? 0;
      const a = x >= bpp ? curRow[x - bpp] : 0;
      const b = prevRow[x];
      const c = x >= bpp ? prevRow[x - bpp] : 0;

      let recon = filt;
      if (filterType === 1) recon = (filt + a) & 0xff;
      else if (filterType === 2) recon = (filt + b) & 0xff;
      else if (filterType === 3) recon = (filt + ((a + b) >> 1)) & 0xff;
      else if (filterType === 4) recon = (filt + paethPredictor(a, b, c)) & 0xff;
      curRow[x] = recon;
    }

    for (let px = 0; px < width; px++) {
      const dst = (y * width + px) * 3;
      if (colorType === 3 && palette) {
        const pIdx = curRow[px] * 3;
        pixels[dst] = palette[pIdx] ?? 180;
        pixels[dst + 1] = palette[pIdx + 1] ?? 170;
        pixels[dst + 2] = palette[pIdx + 2] ?? 160;
      } else {
        const src = px * bpp;
        pixels[dst] = curRow[src];
        pixels[dst + 1] = curRow[src + 1];
        pixels[dst + 2] = curRow[src + 2];
      }
    }
    prevRow.set(curRow);
  }

  return { width, height, pixels };
}

function summarizeSatellitePixels({ width, height, pixels }) {
  let warmR = 0, warmG = 0, warmB = 0, warmCount = 0;
  let greenR = 0, greenG = 0, greenB = 0, greenCount = 0;
  let allR = 0, allG = 0, allB = 0, totalCount = 0;

  // Sample every 2nd pixel for speed
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = (y * width + x) * 3;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      allR += r;
      allG += g;
      allB += b;
      totalCount++;

      // Vegetation green check
      if (g > r + 10 && g > b + 12 && g > 55) {
        greenR += r;
        greenG += g;
        greenB += b;
        greenCount++;
      } else if (r >= b && r + g + b > 140 && r + g + b < 680) {
        // Warm / stone / roof mineral tones
        warmR += r;
        warmG += g;
        warmB += b;
        warmCount++;
      }
    }
  }

  const baseR = totalCount > 0 ? allR / totalCount : 178;
  const baseG = totalCount > 0 ? allG / totalCount : 166;
  const baseB = totalCount > 0 ? allB / totalCount : 158;

  const avgWarm =
    warmCount > 12
      ? [warmR / warmCount, warmG / warmCount, warmB / warmCount]
      : [baseR, baseG, baseB];

  // Mute & lift into Colorfigures pastel watercolor wall/roof range
  const wallTint = rgbToHex(
    135 + avgWarm[0] * 0.34,
    126 + avgWarm[1] * 0.32,
    120 + avgWarm[2] * 0.30
  );
  const roofTint = rgbToHex(
    72 + avgWarm[0] * 0.36,
    66 + avgWarm[1] * 0.32,
    68 + avgWarm[2] * 0.30
  );
  const foliageTone =
    greenCount > 10
      ? rgbToHex(greenR / greenCount, greenG / greenCount, greenB / greenCount)
      : '#6f9c68';

  return { wallTint, roofTint, foliageTone, sampleCount: totalCount };
}

function latLngToTile(lat, lng, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

function fallbackGeographicPalette(lat, lng) {
  const isEastAsia = lat > 18 && lat < 46 && lng > 95 && lng < 145;
  const isCanalEurope = lat > 49.5 && lat < 55.5 && lng > 2.0 && lng < 11.0;
  if (isCanalEurope) {
    return {
      source: 'fallback_geographic',
      wallTint: '#b98b78',
      roofTint: '#554c54',
      foliageTone: '#6d9462',
      sampleCount: 0,
    };
  }
  if (isEastAsia) {
    return {
      source: 'fallback_geographic',
      wallTint: '#ceb8ac',
      roofTint: '#65636e',
      foliageTone: '#699966',
      sampleCount: 0,
    };
  }
  return {
    source: 'fallback_geographic',
    wallTint: '#cdb7ad',
    roofTint: '#7a7072',
    foliageTone: '#719868',
    sampleCount: 0,
  };
}

export async function sampleSatellitePalette(lat, lng, sliceSizeMeters) {
  const halfSize = (Number(sliceSizeMeters) || 200) / 2;
  const dLat = halfSize / METERS_PER_DEG_LAT;
  const dLng = halfSize / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const bbox = `${(lng - dLng).toFixed(6)},${(lat - dLat).toFixed(6)},${(lng + dLng).toFixed(6)},${(lat + dLat).toFixed(6)}`;

  const candidates = [
    {
      source: 'esri_world_imagery',
      url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&size=96,96&format=png24&f=image`,
      timeoutMs: 4500,
    },
    (() => {
      const { x, y } = latLngToTile(lat, lng, 17);
      return {
        source: 'carto_voyager',
        url: `https://basemaps.cartocdn.com/rastertiles/voyager/17/${x}/${y}.png`,
        timeoutMs: 3500,
      };
    })(),
  ];

  for (const cand of candidates) {
    try {
      const res = await fetch(cand.url, {
        headers: { 'User-Agent': 'CityBoxWorkshop/2.0' },
        signal: AbortSignal.timeout(cand.timeoutMs),
      });
      if (!res.ok) continue;
      const arrayBuf = await res.arrayBuffer();
      const decoded = decodePngPixels(Buffer.from(arrayBuf));
      const summary = summarizeSatellitePixels(decoded);
      return {
        source: cand.source,
        ...summary,
      };
    } catch {
      // try next tile source
    }
  }

  return fallbackGeographicPalette(lat, lng);
}

/**
 * Harmonizes generic modern/plaster buildings toward sampled satellite tones while
 * preserving explicit brick/stone/timber historic materials.
 */
export function applySatellitePalette(scene, sampled) {
  if (!sampled || sampled.source === 'fallback_geographic') {
    return scene;
  }

  const updatedBuildings = scene.buildings.map((b) => {
    if (b.facadeStyle !== 'plaster_modern') return b;
    return {
      ...b,
      wallColor: blendHex(b.wallColor, sampled.wallTint, 0.28),
      roofColor:
        b.roofStyle === 'flat_parapet'
          ? blendHex(b.roofColor, sampled.roofTint, 0.24)
          : b.roofColor,
    };
  });

  return {
    ...scene,
    buildings: updatedBuildings,
  };
}

function r2(n) {
  return Math.round(n * 100) / 100;
}

function pointInRing(pt, ring) {
  let c = false;
  const x = pt[0];
  const y = pt[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      c = !c;
    }
  }
  return c;
}

function pointInMultiPolyList(pt, mpList) {
  for (const poly of mpList || []) {
    if (!poly?.length) continue;
    if (pointInRing(pt, poly[0])) {
      let inHole = false;
      for (let h = 1; h < poly.length; h++) {
        if (pointInRing(pt, poly[h])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

function ringArea2D(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) * 0.5;
}

function pastelHarmonize(r, g, b) {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  // Lift dark satellite pixels into clean architectural parchment/warm stone tones (floor lum >= 175)
  const lift = lum < 175 ? (175 - lum) * 0.72 : 0;
  const rr = Math.min(246, (r + lift) * 0.55 + 232 * 0.45);
  const gg = Math.min(242, (g + lift) * 0.55 + 224 * 0.45);
  const bb = Math.min(234, (b + lift) * 0.55 + 209 * 0.45);
  return [Math.round(rr), Math.round(gg), Math.round(bb)];
}

function clusterPoints2D(pts, maxDist, maxOut) {
  const clusters = [];
  for (const p of pts) {
    let hit = null;
    for (const c of clusters) {
      if (Math.hypot(p.x - c.cx, p.y - c.cy) <= maxDist) {
        hit = c;
        break;
      }
    }
    if (hit) {
      const n = hit.pts.length + 1;
      hit.cx = (hit.cx * hit.pts.length + p.x) / n;
      hit.cy = (hit.cy * hit.pts.length + p.y) / n;
      hit.minX = Math.min(hit.minX, p.x);
      hit.maxX = Math.max(hit.maxX, p.x);
      hit.minY = Math.min(hit.minY, p.y);
      hit.maxY = Math.max(hit.maxY, p.y);
      hit.pts.push(p);
    } else {
      clusters.push({
        cx: p.x,
        cy: p.y,
        minX: p.x,
        maxX: p.x,
        minY: p.y,
        maxY: p.y,
        pts: [p],
      });
    }
  }
  clusters.sort((a, b) => b.pts.length - a.pts.length);
  return clusters.slice(0, maxOut);
}

const RICH_ROOF_TYPES = new Set([
  'commercial',
  'retail',
  'mall',
  'supermarket',
  'department_store',
  'stadium',
  'sports_hall',
  'civic',
  'public',
  'train_station',
  'transportation',
  'museum',
  'hospital',
  'university',
  'hotel',
  'office',
]);

/**
 * Fetches a 384x384 Esri World Imagery orthophoto covering the rotated scene square,
 * then performs per-building watercolor roof stylization, 3D rooftop skylight/garden
 * detection, and sparse-city satellite tree recovery.
 */
export async function enrichBundleWithSatellite(bundle) {
  const scene = bundle?.scene;
  const city = bundle?.city;
  if (!scene?.meta || !Array.isArray(scene.buildings)) {
    return { bundle, satellitePngBase64: null, stats: { ok: false } };
  }

  const lat0 = Number(scene.meta.lat);
  const lon0 = Number(scene.meta.lon);
  const rot = Number(scene.meta.rotation) || 0;
  const half = Number(scene.meta.half) || 100;
  if (!Number.isFinite(lat0) || !Number.isFinite(lon0)) {
    return { bundle, satellitePngBase64: null, stats: { ok: false } };
  }

  const kx = METERS_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110574;
  const rad = (-rot * Math.PI) / 180;
  const cr = Math.cos(rad);
  const sr = Math.sin(rad);

  const halfExtent = half * 1.45;
  const dLat = halfExtent / ky;
  const dLon = halfExtent / kx;
  const minLon = lon0 - dLon;
  const maxLon = lon0 + dLon;
  const minLat = lat0 - dLat;
  const maxLat = lat0 + dLat;
  const bbox = `${minLon.toFixed(6)},${minLat.toFixed(6)},${maxLon.toFixed(6)},${maxLat.toFixed(6)}`;
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=384,384&format=png24&f=image`;

  let pngBuf = null;
  let img = null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CityBoxWorkshop/2.0' },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      pngBuf = Buffer.from(await res.arrayBuffer());
      img = decodePngPixels(pngBuf);
    }
  } catch {
    pngBuf = null;
    img = null;
  }

  const sampleAtScene = img
    ? (sx, sy) => {
        const wx = sx * cr + sy * sr;
        const wy = -sx * sr + sy * cr;
        const lon = lon0 + wx / kx;
        const lat = lat0 + wy / ky;
        const px = Math.max(0, Math.min(img.width - 1, Math.floor(((lon - minLon) / (maxLon - minLon)) * img.width)));
        const py = Math.max(0, Math.min(img.height - 1, Math.floor(((maxLat - lat) / (maxLat - minLat)) * img.height)));
        const idx = (py * img.width + px) * 3;
        return [img.pixels[idx], img.pixels[idx + 1], img.pixels[idx + 2]];
      }
    : null;

  const lmCode = bundle.landmarksCode || '';
  let roofFeatureCount = 0;
  let skylightTotal = 0;
  let gardenTotal = 0;

  const nextBuildings = scene.buildings.map((b) => {
    if (!Array.isArray(b.ring) || b.ring.length < 3) return b;
    const isLandmarkReplaced = lmCode && b.id && lmCode.includes(JSON.stringify(b.id));
    if (isLandmarkReplaced) return b;

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of b.ring) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const bw = x1 - x0;
    const bh = y1 - y0;
    if (bw < 2 || bh < 2) return b;
    const area = ringArea2D(b.ring);

    const gardenPts = [];
    const skylightPts = [];
    let sumR = 0, sumG = 0, sumB = 0, count = 0;

    if (sampleAtScene) {
      const gridW = Math.max(8, Math.min(20, Math.round(bw / 3)));
      const gridH = Math.max(8, Math.min(20, Math.round(bh / 3)));
      for (let iy = 0; iy < gridH; iy++) {
        const sy = y0 + ((iy + 0.5) / gridH) * bh;
        for (let ix = 0; ix < gridW; ix++) {
          const sx = x0 + ((ix + 0.5) / gridW) * bw;
          if (!pointInRing([sx, sy], b.ring)) continue;
          const [r, g, bl] = sampleAtScene(sx, sy);
          sumR += r;
          sumG += g;
          sumB += bl;
          count += 1;

          const lum = 0.299 * r + 0.587 * g + 0.114 * bl;
          if (g > r + 8 && g > bl + 10 && g > 55 && g < 215) {
            gardenPts.push({ x: sx, y: sy });
          } else if (lum > 185 && (bl >= r - 8 || Math.max(r, g, bl) - Math.min(r, g, bl) < 24)) {
            skylightPts.push({ x: sx, y: sy });
          }
        }
      }
    }

    const updated = { ...b };
    if (count >= 4) {
      const [hr, hg, hb] = pastelHarmonize(sumR / count, sumG / count, sumB / count);
      updated.rcol = b.rcol || rgbToHex(hr, hg, hb);
    }

    if (!updated.lv && !updated.h && area >= 350 && (RICH_ROOF_TYPES.has(String(b.type || '').toLowerCase()) || b.n)) {
      updated.lv = area >= 1200 ? 5 : 4;
    }

    const qualifiesRich =
      area >= 180 ||
      RICH_ROOF_TYPES.has(String(b.type || '').toLowerCase()) ||
      Boolean(b.famous) ||
      Boolean(b.n);

    if (!qualifiesRich) return updated;

    const ax = Array.isArray(b.obb?.ax) ? b.obb.ax : [1, 0];
    const nx = [-ax[1], ax[0]];
    const cx0 = b.obb?.c?.[0] ?? (x0 + x1) * 0.5;
    const cy0 = b.obb?.c?.[1] ?? (y0 + y1) * 0.5;
    const L = Math.max(4, b.obb?.L || bw);
    const W = Math.max(4, b.obb?.W || bh);

    const fitsInside = (cx, cy, w, d, margin = 1.6) => {
      const hw = w * 0.5;
      const hd = d * 0.5;
      const pts = [
        [cx, cy],
        [cx - ax[0] * hw - nx[0] * hd, cy - ax[1] * hw - nx[1] * hd],
        [cx + ax[0] * hw - nx[0] * hd, cy + ax[1] * hw - nx[1] * hd],
        [cx + ax[0] * hw + nx[0] * hd, cy + ax[1] * hw + nx[1] * hd],
        [cx - ax[0] * hw + nx[0] * hd, cy - ax[1] * hw + nx[1] * hd],
      ];
      return pts.every(
        (p) =>
          Math.abs(p[0]) <= half - margin &&
          Math.abs(p[1]) <= half - margin &&
          pointInRing(p, b.ring)
      );
    };

    const terraces = [];
    for (const k of [0.74, 0.60, 0.46]) {
      const tw = r2(Math.max(4, L * k));
      const td = r2(Math.max(4, W * k));
      if (fitsInside(cx0, cy0, tw, td, 1.4)) {
        terraces.push({ x: r2(cx0), y: r2(cy0), w: tw, d: td, h: 0.35 });
        break;
      }
    }

    const skylights = [];
    if (skylightPts.length >= 4 && count > 0 && skylightPts.length < count * 0.65) {
      for (const cl of clusterPoints2D(skylightPts, 7.0, 3)) {
        if (cl.pts.length < 3) continue;
        const sw = r2(Math.max(3.6, Math.min(16, cl.maxX - cl.minX + 2.0)));
        const sd = r2(Math.max(2.6, Math.min(11, cl.maxY - cl.minY + 2.0)));
        if (fitsInside(cl.cx, cl.cy, sw, sd, 1.8)) {
          skylights.push({ x: r2(cl.cx), y: r2(cl.cy), w: sw, d: sd, h: 1.75 });
        }
      }
    }

    if (skylights.length === 0 && area >= 220) {
      const sw = r2(Math.max(3.8, Math.min(18, L * 0.34)));
      const sd = r2(Math.max(2.6, Math.min(10, W * 0.22)));
      for (const [du, dv] of [[0, 0], [L * 0.12, 0], [-L * 0.12, 0], [0, W * 0.12], [0, -W * 0.12]]) {
        const sx = cx0 + ax[0] * du + nx[0] * dv;
        const sy = cy0 + ax[1] * du + nx[1] * dv;
        if (fitsInside(sx, sy, sw, sd, 1.8)) {
          skylights.push({ x: r2(sx), y: r2(sy), w: sw, d: sd, h: 1.8 });
          break;
        }
      }
    }

    const gardens = [];
    if (gardenPts.length >= 3) {
      for (const cl of clusterPoints2D(gardenPts, 6.5, 6)) {
        if (cl.pts.length < 2) continue;
        const radG = r2(Math.max(1.8, Math.min(4.8, Math.sqrt(cl.pts.length) * 1.25)));
        if (fitsInside(cl.cx, cl.cy, radG * 2, radG * 2, 1.6)) {
          gardens.push({ x: r2(cl.cx), y: r2(cl.cy), w: r2(radG * 2), d: r2(radG * 1.6), r: radG });
        }
      }
    }

    if (gardens.length === 0 && area >= 300) {
      const gw = r2(Math.max(2.8, Math.min(7.2, L * 0.16)));
      const gd = r2(Math.max(2.2, Math.min(5.2, W * 0.14)));
      const offsets = [
        [L * 0.25, W * 0.24],
        [-L * 0.25, W * 0.24],
        [L * 0.25, -W * 0.24],
        [-L * 0.25, -W * 0.24],
      ];
      for (const [du, dv] of offsets) {
        const gx = cx0 + ax[0] * du + nx[0] * dv;
        const gy = cy0 + ax[1] * du + nx[1] * dv;
        if (
          fitsInside(gx, gy, gw, gd, 1.8) &&
          !skylights.some((sk) => Math.hypot(sk.x - gx, sk.y - gy) < (sk.w + gw) * 0.32)
        ) {
          gardens.push({ x: r2(gx), y: r2(gy), w: gw, d: gd, r: r2(Math.min(gw, gd) * 0.45) });
        }
      }
    }

    const penthouses = [];
    if (area >= 240) {
      const pw = r2(Math.max(3.4, Math.min(9.0, L * 0.18)));
      const pd = r2(Math.max(3.0, Math.min(7.5, W * 0.18)));
      for (const [du, dv] of [[-L * 0.27, 0], [L * 0.27, 0], [0, -W * 0.27], [0, W * 0.27]]) {
        const px = cx0 + ax[0] * du + nx[0] * dv;
        const py = cy0 + ax[1] * du + nx[1] * dv;
        if (
          fitsInside(px, py, pw, pd, 1.8) &&
          !skylights.some((sk) => Math.hypot(sk.x - px, sk.y - py) < (sk.w + pw) * 0.35) &&
          !gardens.some((gd) => Math.hypot(gd.x - px, gd.y - py) < (gd.r + pw * 0.45))
        ) {
          penthouses.push({ x: r2(px), y: r2(py), w: pw, d: pd, h: 2.35 });
          break;
        }
      }
    }

    if (terraces.length || skylights.length || gardens.length || penthouses.length) {
      updated.roofFeatures = {
        ax: [Number(ax[0].toFixed(4)), Number(ax[1].toFixed(4))],
        ...(terraces.length ? { terraces } : {}),
        ...(skylights.length ? { skylights } : {}),
        ...(gardens.length ? { gardens } : {}),
        ...(penthouses.length ? { penthouses } : {}),
      };
      roofFeatureCount += 1;
      skylightTotal += skylights.length;
      gardenTotal += gardens.length;
    }

    return updated;
  });

  // Recover missing street & park trees from Esri satellite vegetation when OSM trees < 25
  const existingTrees = Array.isArray(scene.trees) ? [...scene.trees] : [];
  const nextSpecies = Array.isArray(scene.species) ? [...scene.species] : [];
  let recoveredTrees = 0;

  if (sampleAtScene && existingTrees.length < 25) {
    const bldRings = nextBuildings.map((b) => b.ring).filter((r) => r?.length >= 3);
    const roadPolys = scene.roads || [];
    const waterPolys = scene.water || [];

    let spIdx = nextSpecies.indexOf('Satellite tree');
    if (spIdx === -1) {
      nextSpecies.push('Satellite tree');
      spIdx = nextSpecies.length - 1;
    }

    const step = 7.5;
    for (let y = -half + 4; y <= half - 4 && recoveredTrees < 90; y += step) {
      for (let x = -half + 4; x <= half - 4 && recoveredTrees < 90; x += step) {
        const jx = x + Math.sin(x * 1.7 + y * 3.1) * 1.6;
        const jy = y + Math.cos(x * 2.3 - y * 1.3) * 1.6;
        if (Math.abs(jx) > half - 2 || Math.abs(jy) > half - 2) continue;
        const [r, g, bl] = sampleAtScene(jx, jy);
        if (!(g > r + 6 && g > bl + 8 && g > 48 && g < 210)) continue;
        const pt = [jx, jy];
        if (bldRings.some((ring) => pointInRing(pt, ring))) continue;
        if (pointInMultiPolyList(pt, roadPolys) || pointInMultiPolyList(pt, waterPolys)) continue;
        if (existingTrees.some((t) => Math.hypot(t[0] - jx, t[1] - jy) < 5.5)) continue;

        const h = (6.8 + Math.abs(Math.sin(jx + jy)) * 2.4).toFixed(1);
        existingTrees.push([r2(jx), r2(jy), spIdx, h]);
        recoveredTrees += 1;
      }
    }
  }

  const nextTreeRules = Array.isArray(city?.trees?.rules) ? [...city.trees.rules] : [];
  if (recoveredTrees > 0 && !nextTreeRules.some((r) => r.match === 'Satellite tree')) {
    nextTreeRules.push({
      match: 'Satellite tree',
      style: 3,
      colours: ['#74a45e', '#8bb66a'],
      height: 7.5,
      vary: 0.25,
      autumn: '#d99842',
    });
  }

  const nextNotes = Array.isArray(city?.notes) ? [...city.notes] : [];
  if (roofFeatureCount > 0 || recoveredTrees > 0) {
    nextNotes.push({
      title: '矢量屋顶与植被生态增强',
      text: `已为 ${roofFeatureCount} 栋建筑合成手绘矢量屋顶结构（${skylightTotal} 处采光天窗、${gardenTotal} 处屋顶花园），并补全 ${recoveredTrees} 棵街区植被。`,
      links: [{ label: 'Esri World Imagery', url: 'https://www.arcgis.com/' }],
    });
  }

  const nextBundle = {
    ...bundle,
    scene: {
      ...scene,
      buildings: nextBuildings,
      trees: existingTrees,
      species: nextSpecies,
    },
    city: {
      ...city,
      trees: {
        ...(city?.trees || {}),
        rules: nextTreeRules,
      },
      notes: nextNotes,
    },
  };

  return {
    bundle: nextBundle,
    satellitePngBase64: pngBuf ? pngBuf.toString('base64') : null,
    stats: {
      ok: true,
      roofFeatureCount,
      skylightTotal,
      gardenTotal,
      recoveredTrees,
    },
  };
}
