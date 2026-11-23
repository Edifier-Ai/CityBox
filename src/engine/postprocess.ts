import type { PostStyle } from './styleTypes';

let scratchCanvas: HTMLCanvasElement | null = null;

function getScratch(w: number, h: number): HTMLCanvasElement {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas');
  }
  if (scratchCanvas.width !== w || scratchCanvas.height !== h) {
    scratchCanvas.width = w;
    scratchCanvas.height = h;
  }
  return scratchCanvas;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function compositeFrame(
  canvas: HTMLCanvasElement,
  bmp: CanvasImageSource & { width: number; height: number },
  post: PostStyle
): void {
  const w = bmp.width;
  const h = bmp.height;
  if (!w || !h) return;

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);

  const hasGrade =
    Math.abs(post.saturate - 1) > 0.005 ||
    Math.abs(post.contrast - 1) > 0.005 ||
    Math.abs(post.brightness - 1) > 0.005;

  const gradeFilter = hasGrade
    ? `saturate(${post.saturate}) contrast(${post.contrast}) brightness(${post.brightness})`
    : 'none';

  const supportsFilter = 'filter' in ctx;

  if (supportsFilter) {
    ctx.filter = gradeFilter;
  }
  ctx.drawImage(bmp, 0, 0);
  if (supportsFilter) {
    ctx.filter = 'none';
  }

  if (post.tiltBlur > 0 && supportsFilter) {
    const blurPx = (post.tiltBlur * w) / 1000;
    if (blurPx >= 0.25) {
      const sw = Math.max(1, Math.ceil(w / 4));
      const sh = Math.max(1, Math.ceil(h / 4));
      const sc = getScratch(sw, sh);
      const sg = sc.getContext('2d');
      if (sg) {
        sg.clearRect(0, 0, sw, sh);
        sg.globalCompositeOperation = 'source-over';
        const downBlur = (blurPx / 4).toFixed(2);
        sg.filter =
          gradeFilter === 'none'
            ? `blur(${downBlur}px)`
            : `${gradeFilter} blur(${downBlur}px)`;
        sg.drawImage(bmp, 0, 0, sw, sh);
        sg.filter = 'none';

        sg.globalCompositeOperation = 'destination-in';
        const grad = sg.createLinearGradient(0, 0, 0, sh);
        const s0 = clamp01(post.tiltFocus - post.tiltBand / 2);
        const s1 = clamp01(post.tiltFocus + post.tiltBand / 2);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(s0, 'rgba(0,0,0,0)');
        grad.addColorStop(s1, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,1)');
        sg.fillStyle = grad;
        sg.fillRect(0, 0, sw, sh);
        sg.globalCompositeOperation = 'source-over';

        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(sc, 0, 0, w, h);
      }
    }
  }

  if (post.vignette > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const cx = w * 0.5;
    const cy = h * 0.5;
    const rOuter = Math.hypot(cx, cy);
    const vg = ctx.createRadialGradient(cx, cy, rOuter * 0.42, cx, cy, rOuter);
    vg.addColorStop(0, 'rgba(40,30,50,0)');
    vg.addColorStop(1, `rgba(40,30,50,${clamp01(post.vignette).toFixed(3)})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
