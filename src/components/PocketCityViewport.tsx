import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  buildEngineSource,
  computeIsoCamera,
} from '../engine/pocketEngineSource';
import { compositeFrame } from '../engine/postprocess';
import type { EngineStyle, PostStyle } from '../engine/styleTypes';
import type {
  PocketCameraPreset,
  PocketCameraState,
  PocketCityBundle,
} from '../types/pocketCity';

export interface PocketCityViewportHandle {
  flyToCamera: (camera: Partial<PocketCameraState>, cinematic?: boolean) => void;
  flyToPreset: (preset: PocketCameraPreset) => void;
  focusTarget: (target: [number, number, number], zoom?: number) => void;
  stepZoom: (factor: number) => void;
  resetNorth: () => void;
  resetView: (cinematic?: boolean) => void;
  captureSnapshot: () => string | null;
  getCameraState: () => PocketCameraState;
}

export interface PocketCityViewportProps {
  bundle: PocketCityBundle;
  seasonId: string;
  playing: boolean;
  cinematic?: boolean;
  finish?: 'wash' | 'book';
  wobble?: number;
  engineStyle?: EngineStyle | null;
  post?: PostStyle | null;
  onZoomChange?: (zoomPercent: number) => void;
  onAzimuthChange?: (angleDeg: number) => void;
  onScaleChange?: (scalePx: number) => void;
  onUserInteract?: () => void;
  onTogglePlay?: () => void;
  onFirstFrame?: () => void;
}

interface WorkerFrameMessage {
  ready?: boolean;
  error?: string;
  seq?: number;
  generation?: number;
  angle?: number;
  scale?: number;
  bitmap?: ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
}

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
}

type MainRendererFn = (m: RenderFrameRequest) => {
  angle: number;
  scale: number;
  bitmap: ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
};

interface RenderFrameRequest {
  width: number;
  height: number;
  dpr: number;
  camera: PocketCameraState;
  frontage: boolean;
  entrance: boolean;
  time: number;
  wobble: number;
  finish: 'wash' | 'book';
  season: string;
  seq: number;
  generation: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function isPhoneProfile(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer:coarse)')?.matches ?? false;
  const minScreen = Math.min(window.screen?.width ?? window.innerWidth, window.screen?.height ?? window.innerHeight);
  return window.innerWidth <= 760 || (coarse && minScreen <= 760);
}

export const PocketCityViewport = forwardRef<PocketCityViewportHandle, PocketCityViewportProps>(
  function PocketCityViewport(
    {
      bundle,
      seasonId,
      playing,
      cinematic = true,
      finish = 'wash',
      wobble = 0,
      engineStyle = null,
      post = null,
      onZoomChange,
      onAzimuthChange,
      onScaleChange,
      onUserInteract,
      onTogglePlay,
      onFirstFrame,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [loadingError, setLoadingError] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);

    const playingRef = useRef(playing);
    const cinematicRef = useRef(cinematic);
    const seasonRef = useRef(seasonId);
    const finishRef = useRef(finish);
    const wobbleRef = useRef(wobble);
    const engineStyleRef = useRef(engineStyle);
    const postRef = useRef(post);
    playingRef.current = playing;
    cinematicRef.current = cinematic;
    finishRef.current = finish;
    wobbleRef.current = wobble;
    engineStyleRef.current = engineStyle;
    postRef.current = post;
    const engineStyleKey = JSON.stringify(engineStyle ?? null);

    const callbacksRef = useRef({
      onZoomChange,
      onAzimuthChange,
      onScaleChange,
      onUserInteract,
      onTogglePlay,
      onFirstFrame,
    });
    callbacksRef.current = {
      onZoomChange,
      onAzimuthChange,
      onScaleChange,
      onUserInteract,
      onTogglePlay,
      onFirstFrame,
    };

    const isoRef = useRef<PocketCameraState>(computeIsoCamera(bundle));
    const cameraRef = useRef<PocketCameraState>({ ...isoRef.current });
    const goalRef = useRef<PocketCameraState>({ ...isoRef.current });
    const limitsRef = useRef({
      minZoom: isoRef.current.zoom * 0.55,
      maxZoom: isoRef.current.zoom * 10,
    });

    const simStateRef = useRef({
      time: 0,
      movie: 0,
      revision: 0,
      generation: 0,
      seq: 0,
      shown: 0,
      lastKey: '',
      lastZoomReported: -1,
      lastAngleReported: -999,
      lastScaleReported: -1,
      firstFrameFired: false,
    });

    const resetToIso = (enableCine = false) => {
      const iso = isoRef.current;
      goalRef.current = { ...iso };
      if (enableCine) {
        simStateRef.current.movie = 0;
      }
      simStateRef.current.revision += 1;
    };

    useImperativeHandle(ref, () => ({
      flyToCamera(cam, enableCine = false) {
        const iso = isoRef.current;
        const { minZoom, maxZoom } = limitsRef.current;
        const next: PocketCameraState = { ...iso, ...cam };
        next.pitch = clamp(next.pitch, 12, 74);
        next.zoom = clamp(next.zoom, minZoom, maxZoom);
        goalRef.current = next;
        if (enableCine) {
          simStateRef.current.movie = 0;
        }
        simStateRef.current.revision += 1;
      },
      flyToPreset(preset) {
        const iso = isoRef.current;
        const { minZoom, maxZoom } = limitsRef.current;
        const next: PocketCameraState = { ...iso, ...preset.camera };
        next.pitch = clamp(next.pitch, 12, 74);
        next.zoom = clamp(next.zoom, minZoom, maxZoom);
        goalRef.current = next;
        simStateRef.current.revision += 1;
      },
      focusTarget(target, zoom) {
        const { minZoom, maxZoom } = limitsRef.current;
        goalRef.current = {
          ...goalRef.current,
          x: target[0],
          y: target[1],
          z: target[2],
          zoom: zoom != null ? clamp(zoom, minZoom, maxZoom) : goalRef.current.zoom,
        };
        simStateRef.current.revision += 1;
      },
      stepZoom(factor) {
        const { minZoom, maxZoom } = limitsRef.current;
        callbacksRef.current.onUserInteract?.();
        goalRef.current = {
          ...goalRef.current,
          zoom: clamp(goalRef.current.zoom * factor, minZoom, maxZoom),
        };
        simStateRef.current.revision += 1;
      },
      resetNorth() {
        const iso = isoRef.current;
        goalRef.current = {
          ...goalRef.current,
          yaw: iso.yaw,
          pitch: iso.pitch,
          x: iso.x,
          y: iso.y,
          z: iso.z,
        };
        simStateRef.current.revision += 1;
      },
      resetView(enableCine = true) {
        resetToIso(enableCine);
      },
      captureSnapshot() {
        const canvas = canvasRef.current;
        if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
        try {
          return canvas.toDataURL('image/png');
        } catch {
          return null;
        }
      },
      getCameraState() {
        return { ...cameraRef.current };
      },
    }));

    // Trigger reset & generation bump when season changes
    useEffect(() => {
      if (seasonRef.current !== seasonId) {
        seasonRef.current = seasonId;
        simStateRef.current.time = 0;
        simStateRef.current.generation += 1;
        simStateRef.current.lastKey = '';
        simStateRef.current.revision += 1;
      }
    }, [seasonId]);

    // Redraw immediately when play/finish/wobble changes
    useEffect(() => {
      simStateRef.current.revision += 1;
    }, [playing, finish, wobble, cinematic]);

    // Initialize workers & render loop per city bundle
    useEffect(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const screen = canvas.getContext('2d', { alpha: true });
      if (!screen) {
        setLoadingError('无法初始化 2D Canvas 绘图上下文。');
        return;
      }

      const iso = computeIsoCamera(bundle);
      isoRef.current = iso;
      cameraRef.current = { ...iso };
      goalRef.current = { ...iso };
      limitsRef.current = {
        minZoom: iso.zoom * 0.55,
        maxZoom: iso.zoom * 10,
      };

      simStateRef.current = {
        time: 0,
        movie: 0,
        revision: 1,
        generation: 1,
        seq: 0,
        shown: 0,
        lastKey: '',
        lastZoomReported: -1,
        lastAngleReported: -999,
        lastScaleReported: -1,
        firstFrameFired: false,
      };
      setLoadingError(null);
      setIsReady(false);

      let phone = isPhoneProfile();
      let workers: WorkerSlot[] = [];
      let mainRenderer: MainRendererFn | null = null;
      let attemptedFallback = false;
      let extraWorkerTimer: number | null = null;
      let extraWorkerLauncher: (() => void) | null = null;
      let activeBlobUrl: string | null = null;
      let disposed = false;

      const smallerMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion:reduce)')?.matches;

      const terminateWorkers = () => {
        if (extraWorkerTimer !== null) {
          window.clearTimeout(extraWorkerTimer);
          extraWorkerTimer = null;
        }
        extraWorkerLauncher = null;
        for (const slot of workers) {
          slot.worker.terminate();
        }
        workers = [];
        if (activeBlobUrl) {
          URL.revokeObjectURL(activeBlobUrl);
          activeBlobUrl = null;
        }
      };

      const displayFrame = (frame: WorkerFrameMessage, frameGen: number) => {
        const st = simStateRef.current;
        const bmp = frame.bitmap;
        if (!bmp) return;
        if (
          disposed ||
          (frame.seq ?? 0) <= st.shown ||
          frameGen !== st.generation
        ) {
          if ('close' in bmp && typeof bmp.close === 'function') {
            bmp.close();
          }
          return;
        }
        st.shown = frame.seq ?? st.shown;

        if (extraWorkerLauncher) {
          const launch = extraWorkerLauncher;
          extraWorkerLauncher = null;
          extraWorkerTimer = window.setTimeout(() => {
            if (!disposed) launch();
          }, 1500);
        }

        if (postRef.current) {
          compositeFrame(
            canvas,
            bmp as CanvasImageSource & { width: number; height: number },
            postRef.current
          );
        } else {
          if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
            canvas.width = bmp.width;
            canvas.height = bmp.height;
          }
          screen.clearRect(0, 0, canvas.width, canvas.height);
          screen.drawImage(bmp as CanvasImageSource, 0, 0);
        }
        if ('close' in bmp && typeof bmp.close === 'function') {
          bmp.close();
        }

        if (!st.firstFrameFired) {
          st.firstFrameFired = true;
          setIsReady(true);
          callbacksRef.current.onFirstFrame?.();
        }

        if (typeof frame.angle === 'number') {
          const roundedAngle = Math.round(frame.angle);
          if (Math.abs(roundedAngle - st.lastAngleReported) >= 1) {
            st.lastAngleReported = roundedAngle;
            callbacksRef.current.onAzimuthChange?.(roundedAngle);
          }
        }
        if (typeof frame.scale === 'number') {
          const roundedScale = Math.round(frame.scale);
          if (Math.abs(roundedScale - st.lastScaleReported) >= 1) {
            st.lastScaleReported = roundedScale;
            callbacksRef.current.onScaleChange?.(roundedScale);
          }
        }
      };

      const activateFallback = (reason: unknown) => {
        terminateWorkers();
        if (attemptedFallback || disposed) return;
        attemptedFallback = true;
        console.warn('[PocketCityViewport] Worker fallback:', reason);
        try {
          const engineSrc = buildEngineSource(
            bundle,
            phone,
            engineStyleRef.current as Record<string, unknown> | null
          );
          mainRenderer = new Function(`${engineSrc}\nreturn renderFrame;`)() as MainRendererFn;
          simStateRef.current.lastKey = '';
          simStateRef.current.revision += 1;
        } catch (err) {
          console.error('[PocketCityViewport] Fallback compile failed:', err);
          setLoadingError('绘图引擎未能启动，请刷新页面重试。');
        }
      };

      const startWorkers = () => {
        terminateWorkers();
        const engineSrc = buildEngineSource(
          bundle,
          phone,
          engineStyleRef.current as Record<string, unknown> | null
        );
        const workerCode =
          engineSrc +
          '\nself.onmessage=({data:m})=>{try{const r=renderFrame(m);' +
          'const xfer=typeof ImageBitmap!=="undefined"&&r.bitmap instanceof ImageBitmap?[r.bitmap]:[];' +
          'postMessage({...r,seq:m.seq,generation:m.generation},xfer);}catch(error){postMessage({error:String(error.stack||error)});}};postMessage({ready:true});';

        try {
          const url = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
          activeBlobUrl = url;
          const pool = workers;

          const spawnOne = () => {
            const worker = new Worker(url);
            const slot: WorkerSlot = { worker, busy: true };
            pool.push(slot);
            worker.onmessage = ({ data: d }: MessageEvent<WorkerFrameMessage>) => {
              if (disposed || workers !== pool) return;
              if (d.error) {
                activateFallback(d.error);
                return;
              }
              slot.busy = false;
              if (!d.ready) {
                displayFrame(d, d.generation ?? 0);
              }
            };
            worker.onerror = (evt) => {
              if (!disposed && workers === pool) {
                activateFallback(evt.message || 'Worker error');
              }
            };
          };

          spawnOne();
          spawnOne();

          const cores = navigator.hardwareConcurrency || 2;
          let extra = phone ? 0 : cores >= 10 ? 3 : cores >= 8 ? 2 : cores >= 6 ? 1 : 0;
          let starting = false;

          const scheduleNext = () => {
            if (disposed || starting || workers !== pool || extra <= 0) return;
            starting = true;
            spawnOne();
            extra -= 1;
            extraWorkerTimer = window.setTimeout(() => {
              starting = false;
              if (extra <= 0) {
                extraWorkerLauncher = null;
                if (activeBlobUrl === url) {
                  URL.revokeObjectURL(url);
                  activeBlobUrl = null;
                }
              } else {
                extraWorkerLauncher = scheduleNext;
              }
            }, 1500);
          };

          if (extra > 0) {
            extraWorkerLauncher = scheduleNext;
          } else {
            URL.revokeObjectURL(url);
            activeBlobUrl = null;
          }
        } catch (err) {
          activateFallback(err);
        }
      };

      startWorkers();

      let width = container.clientWidth || 1000;
      let height = container.clientHeight || 700;

      const handleResize = () => {
        if (!container || disposed) return;
        width = container.clientWidth || 1000;
        height = container.clientHeight || 700;
        simStateRef.current.generation += 1;
        const nextPhone = isPhoneProfile();
        if (phone !== nextPhone) {
          phone = nextPhone;
          mainRenderer = null;
          attemptedFallback = false;
          simStateRef.current.lastKey = '';
          simStateRef.current.time = 0;
          startWorkers();
        }
        simStateRef.current.revision += 1;
      };

      const ro = new ResizeObserver(handleResize);
      ro.observe(container);
      handleResize();

      // Pointer, pinch, wheel, double-click, and keyboard interactions
      const touches = new Map<number, { x: number; y: number }>();
      let baseline: {
        x: number;
        y: number;
        yaw: number;
        pitch: number;
        zoom: number;
        dist: number;
      } | null = null;

      const resetTouch = () => {
        const pts = [...touches.values()];
        baseline = pts.length
          ? {
              x: pts[0].x,
              y: pts[0].y,
              yaw: goalRef.current.yaw,
              pitch: goalRef.current.pitch,
              zoom: goalRef.current.zoom,
              dist: pts[1] ? Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)) : 0,
            }
          : null;
      };

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(e.pointerId);
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        resetTouch();
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!touches.has(e.pointerId) || !baseline) return;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pts = [...touches.values()];
        const { minZoom, maxZoom } = limitsRef.current;

        if (pts.length >= 2) {
          callbacksRef.current.onUserInteract?.();
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          goalRef.current.zoom = clamp((baseline.zoom * dist) / (baseline.dist || 1), minZoom, maxZoom);
          simStateRef.current.revision += 1;
        } else if (pts.length === 1 && Math.hypot(pts[0].x - baseline.x, pts[0].y - baseline.y) > 2) {
          callbacksRef.current.onUserInteract?.();
          goalRef.current.yaw = baseline.yaw - (pts[0].x - baseline.x) * 0.36;
          goalRef.current.pitch = clamp(baseline.pitch + (pts[0].y - baseline.y) * 0.22, 12, 74);
          simStateRef.current.revision += 1;
        }
      };

      const onPointerEnd = (e: PointerEvent) => {
        touches.delete(e.pointerId);
        resetTouch();
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        callbacksRef.current.onUserInteract?.();
        const { minZoom, maxZoom } = limitsRef.current;
        const dy = clamp(e.deltaY * (e.deltaMode === 1 ? 16 : 1), -120, 120);
        const factor = Math.exp(-dy * 0.0018);
        goalRef.current.zoom = clamp(goalRef.current.zoom * factor, minZoom, maxZoom);
        simStateRef.current.revision += 1;
      };

      const onGesture = (e: Event) => {
        e.preventDefault();
      };

      const onDblClick = () => {
        resetToIso(true);
      };

      const onKeyDown = (e: KeyboardEvent) => {
        const key = e.key;
        if (!['+', '=', '-', 'Home', ' ', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(key)) {
          return;
        }
        e.preventDefault();
        if (key === 'Home') {
          resetToIso(true);
          return;
        }
        if (key === ' ') {
          callbacksRef.current.onTogglePlay?.();
          return;
        }
        const { minZoom, maxZoom } = limitsRef.current;
        callbacksRef.current.onUserInteract?.();
        if (key === '+' || key === '=' || key === '-') {
          const factor = key === '-' ? 0.8 : 1.25;
          goalRef.current.zoom = clamp(goalRef.current.zoom * factor, minZoom, maxZoom);
        } else {
          goalRef.current.yaw += key === 'ArrowRight' ? -10 : key === 'ArrowLeft' ? 10 : 0;
          goalRef.current.pitch = clamp(
            goalRef.current.pitch + (key === 'ArrowDown' ? 5 : key === 'ArrowUp' ? -5 : 0),
            12,
            74
          );
        }
        simStateRef.current.revision += 1;
      };

      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerEnd);
      canvas.addEventListener('pointercancel', onPointerEnd);
      canvas.addEventListener('lostpointercapture', onPointerEnd);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('gesturestart', onGesture, { passive: false });
      canvas.addEventListener('gesturechange', onGesture, { passive: false });
      canvas.addEventListener('dblclick', onDblClick);
      canvas.addEventListener('keydown', onKeyDown);

      let rafId = 0;
      let lastTime = 0;
      let lastRequest = -Infinity;

      const tick = (now: number) => {
        if (disposed) return;
        rafId = requestAnimationFrame(tick);

        const dt = Math.min(0.1, (now - (lastTime || now)) / 1000);
        lastTime = now;

        if (document.hidden || !width || !height) return;

        const st = simStateRef.current;
        const isPlaying = playingRef.current;
        const isCine = cinematicRef.current;

        if (isPlaying) {
          st.time += dt;
          if (isCine) st.movie += dt;
        }

        if (isCine && touches.size === 0) {
          const k = (1 - Math.cos(st.movie * 0.095)) * 0.5;
          const base = isoRef.current;
          goalRef.current = {
            yaw: base.yaw + 38 * k,
            pitch: base.pitch - 9 * k,
            zoom: base.zoom * (1 + 0.44 * k),
            x: base.x,
            y: base.y,
            z: base.z,
          };
        }

        const smooth = smallerMotion ? 1 : 1 - Math.exp(-dt * (touches.size ? 19 : 6.5));
        const cam = cameraRef.current;
        const goal = goalRef.current;

        (Object.keys(cam) as Array<keyof PocketCameraState>).forEach((k) => {
          let delta = goal[k] - cam[k];
          if (k === 'yaw') {
            delta = ((((delta + 180) % 360) + 360) % 360) - 180;
          }
          cam[k] = Math.abs(delta) < 0.001 ? goal[k] : cam[k] + delta * smooth;
        });

        const zoomPct = Math.round((cam.zoom / (isoRef.current.zoom || 1)) * 100);
        if (Math.abs(zoomPct - st.lastZoomReported) >= 1) {
          st.lastZoomReported = zoomPct;
          callbacksRef.current.onZoomChange?.(zoomPct);
        }

        const interval = 1000 / (phone ? 20 : 30);
        if (now - lastRequest < interval - 0.3) return;

        const key = [
          st.revision,
          isPlaying ? st.time.toFixed(4) : '0',
          seasonRef.current,
          finishRef.current,
          wobbleRef.current,
          cam.yaw.toFixed(4),
          cam.pitch.toFixed(4),
          cam.zoom.toFixed(4),
          cam.x.toFixed(4),
          cam.y.toFixed(4),
          cam.z.toFixed(4),
        ].join('|');

        if (key === st.lastKey) return;

        const slot = workers.find((s) => !s.busy);
        if (!slot && !mainRenderer) return;

        lastRequest = now - lastRequest >= 2 * interval ? now : lastRequest + interval;
        st.lastKey = key;

        const req: RenderFrameRequest = {
          width,
          height,
          dpr: Math.min(window.devicePixelRatio || 1, phone ? 1.6 : 2),
          camera: { ...cam },
          frontage: false,
          entrance: false,
          time: st.time,
          wobble: wobbleRef.current,
          finish: finishRef.current,
          season: seasonRef.current,
          seq: ++st.seq,
          generation: st.generation,
        };

        if (slot) {
          slot.busy = true;
          slot.worker.postMessage(req);
        } else if (mainRenderer) {
          try {
            const res = mainRenderer(req);
            displayFrame({ ...res, seq: req.seq, generation: req.generation }, req.generation);
          } catch (err) {
            console.error('[PocketCityViewport] Main-thread render error:', err);
            mainRenderer = null;
            setLoadingError('绘图渲染出错，请刷新页面重试。');
          }
        }
      };

      rafId = requestAnimationFrame(tick);

      return () => {
        disposed = true;
        cancelAnimationFrame(rafId);
        ro.disconnect();
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerEnd);
        canvas.removeEventListener('pointercancel', onPointerEnd);
        canvas.removeEventListener('lostpointercapture', onPointerEnd);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('gesturestart', onGesture);
        canvas.removeEventListener('gesturechange', onGesture);
        canvas.removeEventListener('dblclick', onDblClick);
        canvas.removeEventListener('keydown', onKeyDown);
        terminateWorkers();
      };
    }, [bundle, engineStyleKey]);

    const placeName = bundle.city?.name || 'CityBox';

    return (
      <div
        ref={containerRef}
        className="pc-viewport-wrap"
        style={{ position: 'relative', width: '100%', height: '100%', userSelect: 'none' }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label={`${placeName} 交互式微缩街区画境。可使用方向键旋转视角，加减号缩放，Home 键重置视角。`}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            cursor: 'grab',
            touchAction: 'none',
            outline: 'none',
          }}
        />
        {!isReady && !loadingError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              fontSize: '13px',
              color: '#475569',
            }}
          >
            正在绘制 {placeName}…
          </div>
        )}
        {loadingError && (
          <div
            role="alert"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              textAlign: 'center',
              fontSize: '13px',
              color: '#8f3029',
            }}
          >
            {loadingError}
          </div>
        )}
        <div className="pc-paper-vignette" />
      </div>
    );
  }
);
