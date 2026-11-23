import * as THREE from 'three';

function seededRand(seed: number): () => number {
  let s = Math.floor(seed * 9301 + 49297) % 233280;
  if (s <= 0) s += 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Generates a delicate architectural roof-tile watercolor texture (slate or terracotta ribs).
 */
export function createRoofTileTexture(baseHex: string, ribHex: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  const rand = seededRand(19.7);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(25,30,45,0.035)';
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, 18 + rand() * 34, 0, Math.PI * 2);
    ctx.fill();
  }

  // Parallel roof tile ribs
  const ribSpacing = 12;
  for (let x = 0; x < size; x += ribSpacing) {
    ctx.strokeStyle = ribHex;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, size);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 252, 245, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2.2, 0);
    ctx.lineTo(x + 2.2, size);
    ctx.stroke();
  }

  // Horizontal overlapping tile courses
  ctx.strokeStyle = 'rgba(35, 40, 56, 0.14)';
  ctx.lineWidth = 1;
  for (let y = 0; y < size; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(size, y + 0.5);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates an illustrated cobblestone / brick quay paving texture for sidewalks & promenades.
 */
export function createPavingTexture(
  baseHex = '#f5f2ea',
  lineHex = 'rgba(110, 98, 86, 0.18)',
  repeatX = 14,
  repeatY = 14
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  const rand = seededRand(41.3);
  const rowH = 16;
  const colW = 28;

  for (let row = 0; row < size / rowH; row++) {
    const y = row * rowH;
    const offset = (row % 2) * (colW * 0.5);
    for (let x = -colW; x < size + colW; x += colW) {
      const shade = rand();
      ctx.fillStyle =
        shade > 0.65
          ? 'rgba(255,250,240,0.20)'
          : shade < 0.3
            ? 'rgba(110,95,82,0.10)'
            : 'transparent';
      ctx.fillRect(x + offset + 1, y + 1, colW - 2, rowH - 2);
      ctx.strokeStyle = lineHex;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x + offset + 0.5, y);
      ctx.lineTo(x + offset + 0.5, y + rowH);
      ctx.stroke();
    }
    ctx.strokeStyle = lineHex;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(size, y + 0.5);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a soft radial ground shadow disc for trees, pedestrians, umbrellas, and cars.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.48
  );
  grad.addColorStop(0, 'rgba(58, 66, 86, 0.36)');
  grad.addColorStop(0.65, 'rgba(58, 66, 86, 0.14)');
  grad.addColorStop(1, 'rgba(58, 66, 86, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a soft hand-painted watercolor tree foliage cluster card (or bare winter branches).
 */
export function createWatercolorFoliageTexture(
  colors: [string, string, string],
  mode: 'lush' | 'winter_bare',
  seed = 77.1
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const rand = seededRand(seed);

  if (mode === 'winter_bare') {
    ctx.strokeStyle = '#625a52';
    ctx.lineCap = 'round';
    const spread = 0.9 + rand() * 0.2;
    const tilt = (rand() - 0.5) * 14;
    const branches: Array<[number, number, number, number, number]> = [
      [cx, cy + 52, cx + tilt * 0.3, cy - 12, 5.2],
      [cx, cy + 16, cx - 44 * spread, cy - 26, 3.4],
      [cx, cy + 8, cx + 48 * spread, cy - 20, 3.4],
      [cx - 20, cy - 6, cx - 58 * spread, cy - 46, 2.3],
      [cx - 14, cy - 14, cx - 10 + tilt * 0.5, cy - 68, 2.5],
      [cx + 18, cy - 10, cx + 62 * spread, cy - 42, 2.3],
      [cx + 12, cy - 16, cx + 28 + tilt * 0.4, cy - 68, 2.3],
      [cx + tilt * 0.2, cy - 12, cx - 4 + tilt, cy - 78, 2.6],
      [cx - 38 * spread, cy - 24, cx - 72 * spread, cy - 14, 1.8],
      [cx + 40 * spread, cy - 18, cx + 74 * spread, cy - 8, 1.8],
      [cx - 28 * spread, cy - 34, cx - 42 * spread, cy - 66, 1.6],
      [cx + 30 * spread, cy - 30, cx + 48 * spread, cy - 60, 1.6],
    ];
    for (const [x1, y1, x2, y2, lw] of branches) {
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(248, 251, 255, 0.92)';
    const frostPts = [
      [cx - 48 * spread, cy - 34, 7.5],
      [cx - 12 + tilt * 0.3, cy - 62, 6.5],
      [cx + 24 + tilt * 0.3, cy - 58, 7.0],
      [cx + 54 * spread, cy - 34, 7.0],
      [cx - 4 + tilt * 0.7, cy - 72, 6.0],
    ];
    for (const [fx, fy, fr] of frostPts) {
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const jitter = () => (rand() - 0.5) * 14;
    const puffs: Array<{ x: number; y: number; r: number; col: string }> = [
      { x: cx - 34 + jitter(), y: cy + 18 + jitter() * 0.5, r: 42 + rand() * 5, col: colors[1] },
      { x: cx + 34 + jitter(), y: cy + 20 + jitter() * 0.5, r: 40 + rand() * 5, col: colors[1] },
      { x: cx + jitter() * 0.5, y: cy + 26, r: 44 + rand() * 4, col: colors[1] },
      { x: cx - 42 + jitter(), y: cy - 4 + jitter() * 0.5, r: 44 + rand() * 5, col: colors[0] },
      { x: cx + 42 + jitter(), y: cy - 2 + jitter() * 0.5, r: 43 + rand() * 5, col: colors[0] },
      { x: cx + jitter() * 0.5, y: cy - 4, r: 52 + rand() * 4, col: colors[0] },
      { x: cx - 22 + jitter(), y: cy - 34 + jitter() * 0.5, r: 40 + rand() * 4, col: colors[2] },
      { x: cx + 22 + jitter(), y: cy - 30 + jitter() * 0.5, r: 38 + rand() * 4, col: colors[2] },
      { x: cx - 4 + jitter() * 0.6, y: cy - 46, r: 36 + rand() * 4, col: colors[2] },
    ];

    for (const p of puffs) {
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 42; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = Math.sqrt(rand()) * 72;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad * 0.85 - 6;
      ctx.fillStyle =
        py < cy - 10 ? 'rgba(255, 255, 238, 0.34)' : 'rgba(38, 62, 46, 0.16)';
      ctx.beginPath();
      ctx.arc(px, py, 3.5 + rand() * 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pen-and-ink botanical contour arcs
    ctx.strokeStyle = 'rgba(54, 62, 52, 0.24)';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.arc(cx, cy - 4, 84, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(54, 62, 52, 0.16)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx - 14, cy - 18, 56, Math.PI * 1.1, Math.PI * 1.65);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Renders an illustrated italic serif river/canal name label onto a transparent texture.
 */
export function createWaterLabelTexture(
  text: string,
  color = 'rgba(42, 74, 92, 0.78)',
  strokeColor = 'rgba(246, 243, 234, 0.54)'
): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  ctx.font = 'italic 600 46px "Noto Serif SC", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 6;
  ctx.strokeText(text, w / 2, h / 2);

  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
