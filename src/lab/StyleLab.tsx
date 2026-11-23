import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  FlaskConical,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { computeIsoCamera } from '../engine/pocketEngineSource';
import { resolveEngineStyle } from '../engine/miniatureStyle';
import {
  CHENGDU_ANSHUN_BUNDLE,
  POCKET_PRESETS,
  convertLegacyDioramaToPocketBundle,
} from '../data/pocketPresets';
import {
  fetchGalleryBlueprint,
  fetchGalleryList,
} from '../services/workshopService';
import type { DioramaSceneData, GalleryEntry } from '../types/city';
import type { PocketCameraState, PocketCityBundle } from '../types/pocketCity';
import { LabRenderer } from './labRenderer';
import { compositeFrame } from '../engine/postprocess';
import {
  DEFAULT_POST,
  ENGINE_DEFAULTS,
  PALETTE_PRESETS,
  PARAM_META,
  VARIANTS,
  type EngineStyle,
  type PostStyle,
  type StyleVariant,
} from './styleVariants';
import './styleLab.css';

const STORAGE_KEY = 'citybox_style_lab_v1';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function isPocketBundle(item: DioramaSceneData | PocketCityBundle): item is PocketCityBundle {
  return 'city' in item && 'scene' in item;
}

function cloneDefaultVariants(): StyleVariant[] {
  return VARIANTS.map((v) => ({
    ...v,
    engine: {
      ...v.engine,
      palette: v.engine.palette ? { ...v.engine.palette } : v.engine.palette,
    },
    post: { ...v.post },
  }));
}

function loadSavedVariants(): StyleVariant[] {
  const defaults = cloneDefaultVariants();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Array<{
      id: string;
      engine?: EngineStyle;
      post?: Partial<PostStyle>;
      regionPalette?: boolean;
    }>;
    if (!Array.isArray(parsed)) return defaults;
    return defaults.map((def) => {
      const saved = parsed.find((p) => p.id === def.id);
      if (!saved) return def;
      return {
        ...def,
        engine: saved.engine ?? def.engine,
        post: { ...DEFAULT_POST, ...def.post, ...(saved.post ?? {}) },
        regionPalette:
          saved.regionPalette !== undefined ? saved.regionPalette : def.regionPalette,
      };
    });
  } catch {
    return defaults;
  }
}

interface LabPanelProps {
  variant: StyleVariant;
  bundle: PocketCityBundle;
  seasonId: string;
  camera: PocketCameraState;
  zoomLimits: { min: number; max: number };
  focused: boolean;
  onCameraChange: (updater: (prev: PocketCameraState) => PocketCameraState) => void;
  onToggleFocus: () => void;
}

function LabPanel({
  variant,
  bundle,
  seasonId,
  camera,
  zoomLimits,
  focused,
  onCameraChange,
  onToggleFocus,
}: LabPanelProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<LabRenderer | null>(null);
  const lastBmpRef = useRef<ImageBitmap | null>(null);
  const seqRef = useRef(0);
  const postRef = useRef(variant.post);
  postRef.current = variant.post;

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [rendererNonce, setRendererNonce] = useState(0);
  const [rendering, setRendering] = useState(true);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const effectiveEngine = useMemo(() => {
    if (!variant.regionPalette) return variant.engine;
    const resolved = resolveEngineStyle(bundle);
    return {
      ...variant.engine,
      palette: resolved.palette,
      osmRoofs: resolved.osmRoofs,
    };
  }, [variant.engine, variant.regionPalette, bundle]);

  const engineKey = useMemo(() => JSON.stringify(effectiveEngine), [effectiveEngine]);

  // Track panel pixel dimensions
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Debounced worker rebuild when bundle or engine style changes
  useEffect(() => {
    setRendering(true);
    setErrorMsg(null);
    let cancelled = false;

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      rendererRef.current?.dispose();
      try {
        const nextRenderer = new LabRenderer(bundle, effectiveEngine);
        rendererRef.current = nextRenderer;
        setRendererNonce((n) => n + 1);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Worker init failed');
        setRendering(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, engineKey]);

  // Clean up last ImageBitmap on unmount
  useEffect(() => {
    return () => {
      lastBmpRef.current?.close();
      lastBmpRef.current = null;
    };
  }, []);

  // Render frame when camera, season, size, or worker changes
  useEffect(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas || size.w < 20 || size.h < 20) return;

    let cancelled = false;
    const seq = ++seqRef.current;
    const t0 = performance.now();
    setRendering(true);
    setErrorMsg(null);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer
      .render({
        width: size.w,
        height: size.h,
        dpr,
        camera: { ...camera },
        frontage: false,
        entrance: false,
        time: 36,
        wobble: 0,
        finish: 'wash',
        season: seasonId,
        seq,
        generation: 1,
      })
      .then((bmp) => {
        if (!bmp) return;
        if (cancelled) {
          bmp.close();
          return;
        }
        lastBmpRef.current?.close();
        lastBmpRef.current = bmp;
        compositeFrame(canvas, bmp, postRef.current);
        setRenderMs(Math.round(performance.now() - t0));
        setRendering(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : '渲染失败');
        setRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [camera, seasonId, size.w, size.h, rendererNonce]);

  // Re-composite immediately when only post-processing params change
  useEffect(() => {
    const bmp = lastBmpRef.current;
    const canvas = canvasRef.current;
    if (!bmp || !canvas) return;
    compositeFrame(canvas, bmp, variant.post);
  }, [variant.post]);

  // Shared pointer drag + wheel zoom throttled via rAF
  const dragRef = useRef<{
    x: number;
    y: number;
    yaw: number;
    pitch: number;
  } | null>(null);
  const pendingCamRef = useRef<((prev: PocketCameraState) => PocketCameraState) | null>(null);
  const rafRef = useRef(0);

  const scheduleCamera = useCallback(
    (updater: (prev: PocketCameraState) => PocketCameraState) => {
      pendingCamRef.current = updater;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const fn = pendingCamRef.current;
        pendingCamRef.current = null;
        if (fn) onCameraChange(fn);
      });
    },
    [onCameraChange]
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      yaw: camera.yaw,
      pitch: camera.pitch,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    scheduleCamera((prev) => ({
      ...prev,
      yaw: start.yaw - dx * 0.36,
      pitch: clamp(start.pitch + dy * 0.22, 12, 74),
    }));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const dy = clamp(e.deltaY * (e.deltaMode === 1 ? 16 : 1), -120, 120);
    const factor = Math.exp(-dy * 0.0018);
    scheduleCamera((prev) => ({
      ...prev,
      zoom: clamp(prev.zoom * factor, zoomLimits.min, zoomLimits.max),
    }));
  };

  return (
    <div
      ref={wrapRef}
      className="lab-panel"
      style={{ background: variant.post.background }}
      onDoubleClick={onToggleFocus}
      data-variant={variant.id}
    >
      <div className="lab-panel-badge">
        <div>{variant.label}</div>
        <div className="lab-panel-desc">{variant.desc}</div>
      </div>

      <div className="lab-panel-tools">
        <button
          type="button"
          className="lab-panel-zoom-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFocus();
          }}
        >
          {focused ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          <span>{focused ? '返回网格' : '放大调参'}</span>
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="lab-panel-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      />

      {errorMsg ? (
        <div className="lab-panel-status lab-panel-error">
          <span>{errorMsg}</span>
        </div>
      ) : rendering && renderMs === null ? (
        <div className="lab-panel-status">
          <span>渲染中…</span>
        </div>
      ) : null}

      <div className="lab-panel-ms">
        {rendering ? '渲染中…' : renderMs !== null ? `${renderMs} ms` : '—'}
      </div>
    </div>
  );
}

export function StyleLab() {
  const [variants, setVariants] = useState<StyleVariant[]>(() => loadSavedVariants());
  const [galleryEntries, setGalleryEntries] = useState<GalleryEntry[]>([]);
  const [bundleCache, setBundleCache] = useState<Record<string, PocketCityBundle>>(() => {
    const map: Record<string, PocketCityBundle> = {};
    for (const p of POCKET_PRESETS) map[p.id] = p;
    return map;
  });

  const [selectedSceneId, setSelectedSceneId] = useState<string>(CHENGDU_ANSHUN_BUNDLE.id);
  const [bundle, setBundle] = useState<PocketCityBundle>(CHENGDU_ANSHUN_BUNDLE);
  const [loadingScene, setLoadingScene] = useState(false);

  const [seasonId, setSeasonId] = useState<string>(
    () => CHENGDU_ANSHUN_BUNDLE.city.seasons[0]?.id ?? 'spring'
  );
  const [camera, setCamera] = useState<PocketCameraState>(() =>
    computeIsoCamera(CHENGDU_ANSHUN_BUNDLE)
  );
  const [camPreset, setCamPreset] = useState<'iso' | 'mid' | 'close'>('iso');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Persist variant customizations
  useEffect(() => {
    try {
      const payload = variants.map((v) => ({
        id: v.id,
        engine: v.engine,
        post: v.post,
        regionPalette: v.regionPalette,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage quota errors
    }
  }, [variants]);

  // Fetch workshop gallery list once (ignore if offline)
  useEffect(() => {
    const controller = new AbortController();
    fetchGalleryList(controller.signal)
      .then((list) => {
        if (!Array.isArray(list)) return;
        const presetIds = new Set(POCKET_PRESETS.map((p) => p.id));
        setGalleryEntries(list.filter((e) => !e.isBuiltin && !presetIds.has(e.id)));
      })
      .catch(() => {
        // offline or unavailable
      });
    return () => controller.abort();
  }, []);

  const applyBundle = useCallback((next: PocketCityBundle) => {
    setBundle(next);
    const iso = computeIsoCamera(next);
    setCamera(iso);
    setCamPreset('iso');
    const firstSeason = next.city.seasons?.[0]?.id ?? next.city.occasions?.[0]?.id ?? 'spring';
    setSeasonId(firstSeason);
  }, []);

  const handleSceneChange = async (id: string) => {
    setSelectedSceneId(id);
    const cached = bundleCache[id];
    if (cached) {
      applyBundle(cached);
      return;
    }
    setLoadingScene(true);
    try {
      const raw = await fetchGalleryBlueprint(id);
      const next = isPocketBundle(raw) ? raw : convertLegacyDioramaToPocketBundle(raw);
      setBundleCache((prev) => ({ ...prev, [id]: next }));
      applyBundle(next);
    } catch {
      // ignore failed fetch
    } finally {
      setLoadingScene(false);
    }
  };

  const seasonOptions = useMemo(
    () => [
      ...(bundle.city.seasons ?? []).map((s) => ({ id: s.id, label: s.label })),
      ...(bundle.city.occasions ?? []).map((o) => ({ id: o.id, label: `[特] ${o.label}` })),
    ],
    [bundle]
  );

  const isoCam = useMemo(() => computeIsoCamera(bundle), [bundle]);
  const zoomLimits = useMemo(
    () => ({ min: isoCam.zoom * 0.55, max: isoCam.zoom * 10 }),
    [isoCam.zoom]
  );

  const applyCameraMode = (mode: 'iso' | 'mid' | 'close') => {
    setCamPreset(mode);
    if (mode === 'iso') {
      setCamera({ ...isoCam });
      return;
    }
    if (mode === 'mid') {
      setCamera({ ...isoCam, zoom: isoCam.zoom * 2 });
      return;
    }
    const viewCam = bundle.city.views?.[0]?.camera;
    setCamera({
      ...isoCam,
      x: viewCam?.x ?? 0,
      y: viewCam?.y ?? 0,
      z: viewCam?.z ?? 0,
      zoom: isoCam.zoom * 3.5,
    });
  };

  const focusedVariant = useMemo(
    () => variants.find((v) => v.id === focusedId) ?? null,
    [variants, focusedId]
  );

  const updateVariantEngine = (id: string, patch: Partial<EngineStyle>) => {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, engine: { ...v.engine, ...patch } } : v))
    );
  };

  const updateVariantPost = (id: string, patch: Partial<PostStyle>) => {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, post: { ...v.post, ...patch } } : v))
    );
  };

  const resetOneVariant = (id: string) => {
    const def = cloneDefaultVariants().find((v) => v.id === id);
    if (!def) return;
    setVariants((prev) => prev.map((v) => (v.id === id ? def : v)));
  };

  const resetAllVariants = () => {
    setVariants(cloneDefaultVariants());
  };

  const handleCopyJson = (v: StyleVariant) => {
    const text = JSON.stringify({ engine: v.engine, post: v.post }, null, 2);
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedJson(true);
    window.setTimeout(() => setCopiedJson(false), 1800);
  };

  return (
    <div className="lab-root">
      <header className="lab-topbar">
        <div className="lab-topbar-group">
          <div className="lab-title">
            <FlaskConical size={16} />
            <span>风格实验室</span>
          </div>

          <select
            className="lab-select"
            aria-label="选择场景"
            value={selectedSceneId}
            disabled={loadingScene}
            onChange={(e) => void handleSceneChange(e.target.value)}
          >
            <optgroup label="精修馆藏">
              {POCKET_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.city.name}
                </option>
              ))}
            </optgroup>
            {galleryEntries.length > 0 && (
              <optgroup label="云端工坊">
                {galleryEntries.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.city} ({g.buildingCount}栋)
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          <select
            className="lab-select"
            aria-label="选择季节"
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
          >
            {seasonOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          <div className="lab-seg">
            <button
              type="button"
              className={`lab-btn ${camPreset === 'iso' ? 'active' : ''}`}
              onClick={() => applyCameraMode('iso')}
            >
              全景
            </button>
            <button
              type="button"
              className={`lab-btn ${camPreset === 'mid' ? 'active' : ''}`}
              onClick={() => applyCameraMode('mid')}
            >
              中景
            </button>
            <button
              type="button"
              className={`lab-btn ${camPreset === 'close' ? 'active' : ''}`}
              onClick={() => applyCameraMode('close')}
            >
              近景
            </button>
          </div>

          <button
            type="button"
            className="lab-btn"
            title="逆时针旋转 30°"
            onClick={() => setCamera((c) => ({ ...c, yaw: c.yaw + 30 }))}
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            className="lab-btn"
            title="顺时针旋转 30°"
            onClick={() => setCamera((c) => ({ ...c, yaw: c.yaw - 30 }))}
          >
            <RotateCw size={13} />
          </button>
        </div>

        <div className="lab-topbar-group">
          <button type="button" className="lab-btn" onClick={resetAllVariants}>
            全部重置
          </button>
          <a href="/" className="lab-btn lab-btn-link">
            <ArrowLeft size={13} />
            <span>返回主页</span>
          </a>
        </div>
      </header>

      {focusedVariant ? (
        <div className="lab-focus-layout">
          <div className="lab-focus-stage">
            <LabPanel
              variant={focusedVariant}
              bundle={bundle}
              seasonId={seasonId}
              camera={camera}
              zoomLimits={zoomLimits}
              focused
              onCameraChange={setCamera}
              onToggleFocus={() => setFocusedId(null)}
            />
          </div>

          <aside className="lab-editor">
            <div className="lab-editor-head">
              <div className="lab-editor-title">{focusedVariant.label}</div>
              <div className="lab-editor-actions">
                <button
                  type="button"
                  className="lab-btn"
                  onClick={() => handleCopyJson(focusedVariant)}
                >
                  {copiedJson ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedJson ? '已复制' : '复制参数 JSON'}</span>
                </button>
                <button
                  type="button"
                  className="lab-btn"
                  onClick={() => resetOneVariant(focusedVariant.id)}
                >
                  重置为预设
                </button>
              </div>
            </div>

            <div className="lab-editor-body">
              {PARAM_META.map((meta) => {
                if (meta.kind === 'number') {
                  const val =
                    meta.scope === 'engine'
                      ? Number(
                          (focusedVariant.engine as Record<string, unknown>)[meta.key] ??
                            (ENGINE_DEFAULTS as Record<string, unknown>)[meta.key]
                        )
                      : Number((focusedVariant.post as unknown as Record<string, unknown>)[meta.key]);
                  return (
                    <div key={`${meta.scope}.${meta.key}`} className="lab-field">
                      <div className="lab-field-row">
                        <span className="lab-field-label">{meta.label}</span>
                        <span className="lab-field-val">{val.toFixed(2).replace(/\.00$/, '')}</span>
                      </div>
                      <input
                        type="range"
                        className="lab-range"
                        aria-label={meta.label}
                        min={meta.min}
                        max={meta.max}
                        step={meta.step}
                        value={val}
                        onChange={(e) => {
                          const num = parseFloat(e.target.value);
                          if (meta.scope === 'engine') {
                            updateVariantEngine(focusedVariant.id, { [meta.key]: num });
                          } else {
                            updateVariantPost(focusedVariant.id, { [meta.key]: num });
                          }
                        }}
                      />
                    </div>
                  );
                }

                if (meta.kind === 'bool') {
                  const checked = Boolean(
                    focusedVariant.engine[meta.key] ?? ENGINE_DEFAULTS[meta.key]
                  );
                  return (
                    <label key={meta.key} className="lab-field-row" style={{ cursor: 'pointer' }}>
                      <span className="lab-field-label">{meta.label}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          updateVariantEngine(focusedVariant.id, { [meta.key]: e.target.checked })
                        }
                      />
                    </label>
                  );
                }

                if (meta.kind === 'color') {
                  const cur = focusedVariant.engine[meta.key] ?? null;
                  const isDefault = cur === null;
                  return (
                    <div key={meta.key} className="lab-field-row">
                      <span className="lab-field-label">{meta.label}</span>
                      <div className="lab-color-controls">
                        <input
                          type="color"
                          className="lab-color-input"
                          disabled={isDefault}
                          value={cur || meta.defaultHex}
                          onChange={(e) =>
                            updateVariantEngine(focusedVariant.id, { [meta.key]: e.target.value })
                          }
                        />
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isDefault}
                            onChange={(e) =>
                              updateVariantEngine(focusedVariant.id, {
                                [meta.key]: e.target.checked ? null : meta.defaultHex,
                              })
                            }
                          />
                          <span>默认</span>
                        </label>
                      </div>
                    </div>
                  );
                }

                const paletteVal = focusedVariant.regionPalette
                  ? 'region'
                  : focusedVariant.engine.palette
                    ? 'warm'
                    : 'none';
                return (
                  <div key={meta.key} className="lab-field-row">
                    <span className="lab-field-label">{meta.label}</span>
                    <select
                      className="lab-select"
                      value={paletteVal}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'region') {
                          setVariants((prev) =>
                            prev.map((v) =>
                              v.id === focusedVariant.id
                                ? {
                                    ...v,
                                    regionPalette: true,
                                    engine: { ...v.engine, palette: null },
                                  }
                                : v
                            )
                          );
                        } else {
                          setVariants((prev) =>
                            prev.map((v) =>
                              v.id === focusedVariant.id
                                ? {
                                    ...v,
                                    regionPalette: false,
                                    engine: {
                                      ...v.engine,
                                      palette: PALETTE_PRESETS[val] ?? null,
                                    },
                                  }
                                : v
                            )
                          );
                        }
                      }}
                    >
                      <option value="none">区域默认</option>
                      <option value="warm">暖陶土 + 鼠尾草</option>
                      <option value="region">区域微缩·自动</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      ) : (
        <div className="lab-grid">
          {variants.map((v) => (
            <LabPanel
              key={v.id}
              variant={v}
              bundle={bundle}
              seasonId={seasonId}
              camera={camera}
              zoomLimits={zoomLimits}
              focused={false}
              onCameraChange={setCamera}
              onToggleFocus={() => setFocusedId(v.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default StyleLab;
