import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudRain,
  Compass,
  Copy,
  Flag,
  FlaskConical,
  Images,
  Landmark,
  Leaf,
  Loader2,
  MapPin,
  Minus,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  PartyPopper,
  Pause,
  Play,
  Plus,
  Route,
  Snowflake,
  Sparkles,
  Sprout,
  Store,
  Sun,
  Trees,
  Waves,
  Zap,
} from 'lucide-react';
import {
  PocketCityViewport,
  type PocketCityViewportHandle,
} from './components/PocketCityViewport';
import { MINIATURE_POST, resolveEngineStyle } from './engine/miniatureStyle';
import { LocationPickerModal } from './components/LocationPickerModal';
import { GalleryModal } from './components/GalleryModal';
import { PostcardModal } from './components/PostcardModal';
import { AISettingsModal } from './components/AISettingsModal';
import {
  CHENGDU_ANSHUN_BUNDLE,
  convertLegacyDioramaToPocketBundle,
  getPocketPresetById,
} from './data/pocketPresets';
import {
  enrichSceneWithAI,
  loadAIConfig,
  saveAIConfig,
} from './services/aiService';
import { generateDioramaFromCoordinates } from './services/osmService';
import {
  WorkshopBackendOfflineError,
  runWorkshopPipeline,
} from './services/workshopService';
import type {
  AIConfig,
  DioramaSceneData,
  PostcardSnapshot,
  WorkshopStageStatus,
} from './types/city';
import type {
  PocketCameraPreset,
  PocketCityBundle,
  PocketLegendItem,
  PocketSeasonConfig,
} from './types/pocketCity';

const WORKSHOP_STAGES = [
  '解析地理矢量切片',
  '提取立体交通与屋顶特征',
  '生态植被与风格合成',
  '几何自检与缓存入库',
];

const POSTCARD_STORAGE_KEY = 'citybox_postcards_v1';

function loadSavedPostcards(): PostcardSnapshot[] {
  try {
    const raw =
      localStorage.getItem(POSTCARD_STORAGE_KEY) ||
      localStorage.getItem('pocket_city_postcards_v1');
    if (raw) return JSON.parse(raw) as PostcardSnapshot[];
  } catch {
    // ignore
  }
  return [];
}

function formatCoords(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)}° ${latDir}  ${Math.abs(lng).toFixed(5)}° ${lngDir}`;
}

function isPocketBundle(item: DioramaSceneData | PocketCityBundle): item is PocketCityBundle {
  return 'city' in item && 'scene' in item;
}

function renderSeasonIcon(s: PocketSeasonConfig) {
  if (s.snow || s.ice || s.leaves === 'bare') {
    return <Snowflake size={14} style={{ color: '#5b8fb8' }} />;
  }
  if (s.wet || s.wx === 'rain' || s.wx === 'drizzle') {
    return <CloudRain size={14} style={{ color: '#d4943a' }} />;
  }
  if (s.leaves === 'autumn') {
    return <Leaf size={14} style={{ color: '#cf7d2e' }} />;
  }
  if (s.leaves === 'spring' || s.leaves === 'blossom') {
    return <Sprout size={14} style={{ color: '#5c9152' }} />;
  }
  return <Sun size={14} style={{ color: '#d4943a' }} />;
}

export function App() {
  const viewportRef = useRef<PocketCityViewportHandle | null>(null);
  const bundleCacheRef = useRef<Map<string, PocketCityBundle>>(new Map());
  const activeJobAbortRef = useRef<AbortController | null>(null);
  const specialMenuRef = useRef<HTMLDivElement | null>(null);

  const [bundle, setBundle] = useState<PocketCityBundle>(() => {
    bundleCacheRef.current.set(CHENGDU_ANSHUN_BUNDLE.id, CHENGDU_ANSHUN_BUNDLE);
    return CHENGDU_ANSHUN_BUNDLE;
  });

  const [seasonId, setSeasonId] = useState<string>(
    () => CHENGDU_ANSHUN_BUNDLE.city.seasons[0]?.id ?? 'spring'
  );
  const [specialMenuOpen, setSpecialMenuOpen] = useState(false);

  const [playing, setPlaying] = useState(true);
  const [freeView, setFreeView] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string>('cine');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [azimuthDeg, setAzimuthDeg] = useState(0);
  const [scalePx, setScalePx] = useState(44);
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [copiedCoords, setCopiedCoords] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [postcardOpen, setPostcardOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const [workshopStatus, setWorkshopStatus] = useState<WorkshopStageStatus | null>(null);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [aiConfig, setAiConfig] = useState<AIConfig>(() => loadAIConfig());
  const [snapshots, setSnapshots] = useState<PostcardSnapshot[]>(() => loadSavedPostcards());
  const [draftImageUrl, setDraftImageUrl] = useState<string | null>(null);

  const classic = useMemo(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('style') === 'classic',
    []
  );
  const engineStyle = useMemo(
    () => (classic ? null : resolveEngineStyle(bundle)),
    [bundle, classic]
  );
  const post = classic ? null : MINIATURE_POST;

  const seasons = bundle.city.seasons ?? [];
  const occasions = bundle.city.occasions ?? [];

  const activeOccasion = useMemo(
    () => occasions.find((o) => o.id === seasonId) ?? null,
    [occasions, seasonId]
  );

  const activeSeasonOrOccasion = useMemo(
    () =>
      seasons.find((s) => s.id === seasonId) ??
      occasions.find((o) => o.id === seasonId) ??
      seasons[0] ??
      null,
    [seasons, occasions, seasonId]
  );

  // Close special-scene dropdown on outside click
  useEffect(() => {
    if (!specialMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (specialMenuRef.current && !specialMenuRef.current.contains(e.target as Node)) {
        setSpecialMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [specialMenuOpen]);

  // Auto-dismiss Geohash cache hit toast
  useEffect(() => {
    if (!cacheNotice) return;
    const timer = globalThis.setTimeout(() => setCacheNotice(null), 3600);
    return () => globalThis.clearTimeout(timer);
  }, [cacheNotice]);

  const updateUrlParams = useCallback(
    (lat: number, lon: number, size: number, nextSeasonId: string, presetId?: string) => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('lat', lat.toFixed(5));
        url.searchParams.set('lng', lon.toFixed(5));
        url.searchParams.set('size', String(size));
        url.searchParams.set('season', nextSeasonId);
        if (presetId) {
          url.searchParams.set('preset', presetId);
        } else {
          url.searchParams.delete('preset');
        }
        window.history.replaceState({}, '', url.toString());
      } catch {
        // ignore
      }
    },
    []
  );

  const applyLoadedBundle = useCallback(
    (nextBundle: PocketCityBundle, cacheKey?: string, requestedSeasonId?: string) => {
      if (cacheKey) {
        bundleCacheRef.current.set(cacheKey, nextBundle);
      }
      bundleCacheRef.current.set(nextBundle.id, nextBundle);

      const allSeasons = [
        ...(nextBundle.city.seasons ?? []),
        ...(nextBundle.city.occasions ?? []),
      ];
      const nextSeason =
        (requestedSeasonId && allSeasons.some((s) => s.id === requestedSeasonId)
          ? requestedSeasonId
          : null) ??
        nextBundle.city.seasons[0]?.id ??
        'spring';

      setBundle(nextBundle);
      setSeasonId(nextSeason);
      setActiveViewId('cine');
      setFreeView(false);
      setSpecialMenuOpen(false);
      updateUrlParams(
        nextBundle.scene.meta.lat,
        nextBundle.scene.meta.lon,
        nextBundle.scene.meta.size,
        nextSeason,
        getPocketPresetById(nextBundle.id) ? nextBundle.id : undefined
      );
    },
    [updateUrlParams]
  );

  // Sync URL query params for shareable deep links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const presetParam = params.get('preset');
    const seasonParam = params.get('season');
    if (presetParam) {
      const preset = getPocketPresetById(presetParam);
      if (preset) {
        applyLoadedBundle(preset, preset.id, seasonParam ?? undefined);
        return;
      }
    }

    if (seasonParam) {
      const all = [
        ...(CHENGDU_ANSHUN_BUNDLE.city.seasons ?? []),
        ...(CHENGDU_ANSHUN_BUNDLE.city.occasions ?? []),
      ];
      if (all.some((s) => s.id === seasonParam)) {
        setSeasonId(seasonParam);
      }
    }

    const latStr = params.get('lat');
    const lngStr = params.get('lng');
    if (latStr && lngStr) {
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      const size = parseInt(params.get('size') || '200', 10);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        if (Math.abs(lat - 30.64408) > 0.001 || Math.abs(lng - 104.08336) > 0.001) {
          void loadLocation(lat, lng, Number.isNaN(size) ? 200 : size);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancelWorkshop = useCallback(() => {
    activeJobAbortRef.current?.abort();
    activeJobAbortRef.current = null;
    setWorkshopStatus(null);
    setLoadingMsg(null);
  }, []);

  const loadLocation = useCallback(
    async (lat: number, lng: number, sliceSizeMeters: number, presetSpotId?: string) => {
      setErrorBanner(null);
      setCacheNotice(null);

      if (presetSpotId) {
        const preset =
          bundleCacheRef.current.get(presetSpotId) ?? getPocketPresetById(presetSpotId);
        if (preset) {
          applyLoadedBundle(preset, presetSpotId);
          return;
        }
      }

      const cacheKey = `${lat.toFixed(4)}_${lng.toFixed(4)}_${sliceSizeMeters}`;
      const cached = bundleCacheRef.current.get(cacheKey);
      if (cached) {
        applyLoadedBundle(cached);
        return;
      }

      activeJobAbortRef.current?.abort();
      const controller = new AbortController();
      activeJobAbortRef.current = controller;

      setWorkshopStatus({
        jobId: 'pending',
        status: 'queued',
        stageIndex: 0,
        stageLabel: WORKSHOP_STAGES[0],
        detail: '正在连接云端工坊与 Geohash 缓存...',
        progress: 6,
        cached: false,
      });

      try {
        const result = await runWorkshopPipeline(
          {
            lat,
            lng,
            sliceSizeMeters,
            aiConfig: aiConfig.enabled ? aiConfig : undefined,
          },
          (stageStatus) => {
            if (activeJobAbortRef.current === controller) {
              setWorkshopStatus(stageStatus);
            }
          },
          controller.signal
        );

        if (activeJobAbortRef.current !== controller) return;

        const nextBundle = isPocketBundle(result.blueprint)
          ? result.blueprint
          : convertLegacyDioramaToPocketBundle(result.blueprint);
        applyLoadedBundle(nextBundle, cacheKey);
        if (result.cached) {
          setCacheNotice('命中 Geohash 云端缓存 · 已秒级还原城市画境');
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }

        if (err instanceof WorkshopBackendOfflineError) {
          if (activeJobAbortRef.current !== controller) return;
          setWorkshopStatus(null);
          try {
            setLoadingMsg('云端工坊离线，正在浏览器端直连采集街道与水系...');
            let generated = await generateDioramaFromCoordinates(
              lat,
              lng,
              sliceSizeMeters,
              (msg) => setLoadingMsg(msg)
            );

            if (aiConfig.enabled && aiConfig.apiKey.trim()) {
              setLoadingMsg('正在运用 AI 地理策展并识别地标原型...');
              generated = await enrichSceneWithAI(generated, aiConfig);
            }

            generated = {
              ...generated,
              meta: {
                ...generated.meta,
                pipelineSource: 'browser_fallback',
                generatedAt: Date.now(),
              },
            };

            if (activeJobAbortRef.current !== controller) return;
            applyLoadedBundle(convertLegacyDioramaToPocketBundle(generated), cacheKey);
          } catch (fallbackErr) {
            if (activeJobAbortRef.current !== controller) return;
            setErrorBanner(
              fallbackErr instanceof Error
                ? `地图切片加载失败：${fallbackErr.message}（可稍后重试或切换其他区域）`
                : '地图切片加载失败，请检查网络连接'
            );
          }
          return;
        }

        if (activeJobAbortRef.current !== controller) return;
        setErrorBanner(
          err instanceof Error
            ? `云端工坊构建失败：${err.message}（可稍后重试或切换其他区域）`
            : '地图切片加载失败，请检查网络连接'
        );
      } finally {
        if (activeJobAbortRef.current === controller) {
          activeJobAbortRef.current = null;
          setWorkshopStatus(null);
          setLoadingMsg(null);
        }
      }
    },
    [aiConfig, applyLoadedBundle]
  );

  const handleSelectGalleryBlueprint = useCallback(
    (blueprint: DioramaSceneData | PocketCityBundle) => {
      const nextBundle = isPocketBundle(blueprint)
        ? blueprint
        : convertLegacyDioramaToPocketBundle(blueprint);
      const cacheKey = `${nextBundle.scene.meta.lat.toFixed(4)}_${nextBundle.scene.meta.lon.toFixed(4)}_${nextBundle.scene.meta.size}`;
      applyLoadedBundle(nextBundle, cacheKey);
      setGalleryOpen(false);
    },
    [applyLoadedBundle]
  );

  const handleSelectSeasonOrOccasion = (nextId: string) => {
    setSeasonId(nextId);
    setSpecialMenuOpen(false);
    updateUrlParams(
      bundle.scene.meta.lat,
      bundle.scene.meta.lon,
      bundle.scene.meta.size,
      nextId,
      getPocketPresetById(bundle.id) ? bundle.id : undefined
    );
  };

  const viewTabs = useMemo(() => {
    const seen = new Set<string>(['cine', 'iso', 'bird']);
    const tabs: Array<{ id: string; label: string; kind: 'cine' | 'iso' | 'bird' | 'preset'; preset?: PocketCameraPreset }> = [
      { id: 'cine', label: '自动巡游', kind: 'cine' },
      { id: 'iso', label: bundle.city.isoLabel || '全景等轴', kind: 'iso' },
    ];
    for (const v of bundle.city.views ?? []) {
      if (!v?.id || seen.has(v.id)) continue;
      seen.add(v.id);
      tabs.push({ id: v.id, label: v.label, kind: 'preset', preset: v });
    }
    tabs.push({ id: 'bird', label: '俯瞰', kind: 'bird' });
    return tabs;
  }, [bundle]);

  const handleViewTabClick = (tab: (typeof viewTabs)[number]) => {
    setActiveViewId(tab.id);
    if (tab.kind === 'cine') {
      setFreeView(false);
      viewportRef.current?.resetView(true);
      return;
    }
    setFreeView(true);
    if (tab.kind === 'iso') {
      viewportRef.current?.resetView(false);
    } else if (tab.kind === 'bird') {
      const birdCam = bundle.city.cameras?.bird ?? {
        yaw: -35,
        pitch: 70,
        zoom: Number((302 / ((bundle.scene.meta.size || 200) * 1.75)).toFixed(3)),
        x: 0,
        y: 0,
        z: 2,
      };
      viewportRef.current?.flyToCamera(birdCam, false);
    } else if (tab.preset) {
      viewportRef.current?.flyToPreset(tab.preset);
    }
  };

  const handleLegendClick = (item: PocketLegendItem) => {
    setFreeView(true);
    setActiveViewId('');
    viewportRef.current?.flyToCamera(item.camera, false);
  };

  const handleOpenPostcard = () => {
    const dataUrl = viewportRef.current?.captureSnapshot() ?? null;
    setDraftImageUrl(dataUrl);
    setPostcardOpen(true);
  };

  const handleSaveSnapshot = (note: string) => {
    if (!draftImageUrl) return;
    const item: PostcardSnapshot = {
      id: `snap-${Date.now()}`,
      title: bundle.city.name,
      subtitle: bundle.city.place || bundle.city.title || '',
      coordsText: formatCoords(bundle.scene.meta.lat, bundle.scene.meta.lon),
      atmosphereLabel: activeSeasonOrOccasion?.label ?? '城市画境',
      note,
      dataUrl: draftImageUrl,
      createdAt: Date.now(),
    };
    const next = [item, ...snapshots].slice(0, 16);
    setSnapshots(next);
    try {
      localStorage.setItem(POSTCARD_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  };

  const handleDeleteSnapshot = (id: string) => {
    const next = snapshots.filter((s) => s.id !== id);
    setSnapshots(next);
    try {
      localStorage.setItem(POSTCARD_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const activeNote = activeSeasonOrOccasion?.note ?? null;

  const pipelineBadgeLabel =
    bundle.pipelineSource === 'cloud_workshop'
      ? '实时构建'
      : bundle.pipelineSource === 'browser_fallback'
        ? '本地直连'
        : '精修馆藏';

  const handleCopyCoords = () => {
    const text = `${bundle.scene.meta.lat.toFixed(5)}, ${bundle.scene.meta.lon.toFixed(5)}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedCoords(true);
    globalThis.setTimeout(() => setCopiedCoords(false), 2000);
  };

  const renderLegendIcon = (icon?: PocketLegendItem['icon']) => {
    switch (icon) {
      case 'landmark':
        return <Landmark size={14} />;
      case 'water':
        return <Waves size={14} />;
      case 'streets':
        return <Route size={14} />;
      case 'trees':
        return <Trees size={14} />;
      case 'shops':
        return <Store size={14} />;
      case 'buildings':
      default:
        return <Building2 size={14} />;
    }
  };

  return (
    <div className="cb-shell" style={{ background: post?.background }}>
      {/* Full-Bleed Multi-Worker 2D Canvas Viewport */}
      <main className="cb-workspace">
        <PocketCityViewport
          ref={viewportRef}
          bundle={bundle}
          seasonId={seasonId}
          playing={playing}
          cinematic={!freeView}
          engineStyle={engineStyle}
          post={post}
          onZoomChange={setZoomPercent}
          onAzimuthChange={setAzimuthDeg}
          onScaleChange={setScalePx}
          onUserInteract={() => {
            setFreeView(true);
            setActiveViewId('');
          }}
          onTogglePlay={() => setPlaying((p) => !p)}
        />

        {/* Floating Top-Left Brand & Navigation Island */}
        <header className="cb-top-left">
          <div className="cb-brand">
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <path d="M14 3L25 9.2V18.8L14 25L3 18.8V9.2L14 3Z" fill="#14161a" />
              <path d="M14 3L25 9.2L14 15.4L3 9.2L14 3Z" fill="#3b82f6" fillOpacity="0.88" />
              <path d="M14 15.4L25 9.2V18.8L14 25V15.4Z" fill="#272b33" />
              <path d="M14 15.4V25M3 9.2L14 15.4L25 9.2" stroke="#ffffff" strokeWidth="1.2" strokeOpacity="0.65" />
            </svg>
            <span className="cb-brand-title">CityBox</span>
          </div>

          <div className="cb-divider-v" />

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="cb-city-chip"
            title="点击打开世界地图重新选点"
          >
            <MapPin size={13} style={{ color: '#2563eb' }} />
            <span>{bundle.city.name}</span>
            <ChevronDown size={13} style={{ color: '#94a3b8' }} />
          </button>

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="cb-action-primary"
          >
            <Compass size={13} />
            任意选点
          </button>

          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="cb-action-ghost"
            title="打开灵感画廊与内置精修馆藏"
          >
            <Images size={13} />
            灵感画廊
          </button>
        </header>

        {/* Floating Top-Right Studio Controls Island */}
        <div className="cb-top-right">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="cb-status-pill"
            title={playing ? '点击暂停动态车流与水面' : '点击恢复场景动画'}
          >
            <span className={`cb-status-dot ${playing ? '' : 'paused'}`} />
            <span>{playing ? '运行中' : '已暂停'}</span>
          </button>

          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="cb-action-ghost"
            title="配置可选的 AI 地理文化策展"
          >
            <Sparkles size={13} style={{ color: aiConfig.enabled ? '#2563eb' : '#94a3b8' }} />
            <span>{aiConfig.enabled ? 'AI 策展已启用' : 'AI 策展'}</span>
          </button>

          <button type="button" onClick={handleOpenPostcard} className="cb-action-ghost">
            <BookOpen size={13} />
            <span>取景册</span>
            {snapshots.length > 0 && (
              <span className="cb-badge-count">{snapshots.length}</span>
            )}
          </button>

          <a
            href="/?lab"
            className="cb-action-ghost"
            style={{ textDecoration: 'none' }}
            title="打开风格实验室对比不同微缩风格"
          >
            <FlaskConical size={13} />
            <span>风格实验室</span>
          </a>

          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            className="cb-drawer-toggle"
            title={drawerOpen ? '收起右侧信息面板' : '展开右侧信息面板'}
            aria-label={drawerOpen ? '收起右侧信息面板' : '展开右侧信息面板'}
          >
            {drawerOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
        </div>

        {/* Collapsible Right-Side Inspector Drawer */}
        <aside className={`cb-inspector ${drawerOpen ? '' : 'collapsed'}`}>
          <div className="cb-card cb-info-card">
            <div className="cb-region-row">
              <div className="cb-region">{bundle.city.region || bundle.city.title}</div>
              <span className="cb-source-pill">{pipelineBadgeLabel}</span>
            </div>
            <h1 className="cb-city-title">{bundle.city.name}</h1>
            <p className="cb-subtitle">{bundle.city.place || bundle.city.title}</p>

            <div className="cb-coords-row">
              <div className="cb-coords">
                <MapPin size={11} />
                <span>{formatCoords(bundle.scene.meta.lat, bundle.scene.meta.lon)}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyCoords}
                className="cb-copy-btn"
                title="复制经纬度坐标"
              >
                {copiedCoords ? <Check size={11} style={{ color: '#10b981' }} /> : <Copy size={11} />}
                <span>{copiedCoords ? '已复制' : '复制'}</span>
              </button>
            </div>

            <div className="cb-section-label">{bundle.city.seasonLabel || '季节与气象'}</div>
            <div className="cb-season-grid">
              {seasons.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectSeasonOrOccasion(s.id)}
                  className={`cb-season-btn ${seasonId === s.id ? 'active' : ''}`}
                >
                  {renderSeasonIcon(s)}
                  <span>{s.label}</span>
                </button>
              ))}
            </div>

            {occasions.length > 0 && (
              <div className="cb-special-wrap" ref={specialMenuRef}>
                <button
                  type="button"
                  onClick={() => setSpecialMenuOpen((o) => !o)}
                  className={`cb-special-btn ${
                    activeOccasion?.night
                      ? 'night'
                      : activeOccasion
                        ? 'festival'
                        : ''
                  }`}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {activeOccasion?.night ? (
                      <Moon size={13} />
                    ) : activeOccasion ? (
                      <PartyPopper size={13} />
                    ) : (
                      <Flag size={13} />
                    )}
                    <span>
                      {activeOccasion
                        ? activeOccasion.label
                        : bundle.city.occasionLabel || '特别场景'}
                    </span>
                  </span>
                  <ChevronDown size={13} />
                </button>

                {specialMenuOpen && (
                  <div className="cb-special-menu">
                    {activeOccasion && seasons[0] && (
                      <button
                        type="button"
                        onClick={() => handleSelectSeasonOrOccasion(seasons[0].id)}
                        className="cb-special-option"
                      >
                        <span>回归昼景 ({seasons[0].label})</span>
                        <Sun size={13} />
                      </button>
                    )}
                    {occasions.map((occ) => (
                      <button
                        key={occ.id}
                        type="button"
                        onClick={() => handleSelectSeasonOrOccasion(occ.id)}
                        className={`cb-special-option ${seasonId === occ.id ? 'active' : ''}`}
                      >
                        <span>{occ.label}</span>
                        {occ.night ? <Moon size={13} /> : <PartyPopper size={13} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeNote && (
              <div className="cb-field-note">
                <p className="cb-note-text">{activeNote.text}</p>
                {activeNote.url ? (
                  <a
                    href={activeNote.url}
                    target="_blank"
                    rel="noreferrer"
                    className="cb-note-source"
                    style={{ textDecoration: 'none' }}
                  >
                    {activeNote.source} ↗
                  </a>
                ) : (
                  <span className="cb-note-source">{activeNote.source}</span>
                )}
              </div>
            )}
          </div>

          {(bundle.city.legend?.length ?? 0) > 0 && (
            <div className="cb-card cb-legend-card">
              <button
                type="button"
                onClick={() => setLegendExpanded((v) => !v)}
                className="cb-legend-header"
              >
                <span>空间索引</span>
                {legendExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {legendExpanded && (
                <div className="cb-legend-list">
                  {bundle.city.legend!.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => handleLegendClick(item)}
                      className="cb-legend-item"
                    >
                      <div className="cb-legend-icon">{renderLegendIcon(item.icon)}</div>
                      <div className="cb-legend-meta">
                        <div className="cb-legend-title">
                          {item.name}
                          {item.count ? (
                            <span style={{ marginLeft: 6, fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>
                              {item.count}
                            </span>
                          ) : null}
                        </div>
                        {item.source && <div className="cb-legend-sub">{item.source}</div>}
                      </div>
                      <ArrowUpRight size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Bottom-Left Unified Telemetry & Viewport Pod */}
        <div className="cb-telemetry-pod">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="cb-play-btn"
            title={playing ? '暂停场景动画' : '继续场景动画'}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>

          <button
            type="button"
            onClick={() => viewportRef.current?.stepZoom(0.84)}
            className="cb-zoom-btn"
            title="缩小"
          >
            <Minus size={13} />
          </button>
          <span className="cb-zoom-label">{zoomPercent}%</span>
          <button
            type="button"
            onClick={() => viewportRef.current?.stepZoom(1.18)}
            className="cb-zoom-btn"
            title="放大"
          >
            <Plus size={13} />
          </button>

          <div className="cb-divider-v" />

          <div className="cb-scale-pill" title="比例尺 (20m)">
            <span style={{ lineHeight: 1.1, marginBottom: 3 }}>20 m</span>
            <span
              style={{
                display: 'block',
                width: `${Math.max(18, Math.min(72, Math.round(scalePx)))}px`,
                height: 3,
                borderLeft: '1.5px solid #475569',
                borderRight: '1.5px solid #475569',
                borderBottom: '1.5px solid #475569',
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => viewportRef.current?.resetNorth()}
            className="cb-compass-btn"
            title="点击重置正北朝向"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 28 28"
              style={{
                transform: `rotate(${azimuthDeg}deg)`,
                transition: 'transform 0.16s ease',
              }}
            >
              <polygon points="14,3 17,14 11,14" fill="#ef4444" />
              <polygon points="14,25 17,14 11,14" fill="#64748b" />
              <circle cx="14" cy="14" r="1.8" fill="#ffffff" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => {
              const nextFree = !freeView;
              setFreeView(nextFree);
              if (!nextFree) {
                setActiveViewId('cine');
                viewportRef.current?.resetView(true);
              }
            }}
            className={`cb-mode-pill ${freeView ? 'active' : ''}`}
            title="切换自由视角或自动环绕巡游"
          >
            <span>{freeView ? '✦ 自由视角' : '◎ 自动巡游'}</span>
          </button>
        </div>

        {/* Bottom-Center Camera Presets Dock */}
        <div className="cb-view-dock">
          <div className="cb-hint-text">拖动旋转 · 滚轮缩放 · 双击重置 · Space 暂停</div>
          <div className="cb-preset-bar">
            {viewTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleViewTabClick(tab)}
                className={`cb-preset-btn ${activeViewId === tab.id ? 'active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cache Hit Toast */}
        {cacheNotice && (
          <div className="pc-cache-toast">
            <Zap size={13} />
            <span>{cacheNotice}</span>
          </div>
        )}

        {/* Error Toast Banner */}
        {errorBanner && (
          <div
            style={{
              position: 'absolute',
              top: 72,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 35,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '9px 16px',
              borderRadius: 12,
              fontSize: 12,
              boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              style={{ fontWeight: 700, textDecoration: 'underline' }}
            >
              关闭
            </button>
          </div>
        )}

        {/* 4-Stage Cloud Workshop Progress Overlay */}
        {workshopStatus && (
          <div className="pc-loading-overlay">
            <div className="pc-workshop-card-overlay">
              <div className="pc-workshop-overlay-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="pc-workshop-icon-ring">
                    <Cloud size={17} />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: '#14161a' }}>
                      CityBox 工坊正在构建画境
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b' }}>
                      4 阶段自动采景、立体交通与风格合成
                    </div>
                  </div>
                </div>
                {workshopStatus.cached && (
                  <span className="pc-geohash-badge">
                    <Zap size={11} />
                    缓存命中
                  </span>
                )}
              </div>

              <div className="pc-workshop-progress-track">
                <div
                  className="pc-workshop-progress-fill"
                  style={{ width: `${Math.max(4, Math.min(100, workshopStatus.progress))}%` }}
                />
              </div>

              <div className="pc-workshop-stages">
                {WORKSHOP_STAGES.map((label, idx) => {
                  const isDone =
                    idx < workshopStatus.stageIndex ||
                    (workshopStatus.status === 'completed' && idx <= workshopStatus.stageIndex);
                  const isCurrent =
                    idx === workshopStatus.stageIndex && workshopStatus.status !== 'completed';
                  return (
                    <div
                      key={label}
                      className={`pc-workshop-stage-row ${
                        isDone ? 'done' : isCurrent ? 'active' : 'pending'
                      }`}
                    >
                      <span className="pc-stage-indicator">
                        {isDone ? (
                          <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                        ) : isCurrent ? (
                          <Loader2 size={14} className="pc-spin" style={{ color: '#2563eb' }} />
                        ) : (
                          <span className="pc-stage-dot" />
                        )}
                      </span>
                      <span className="pc-stage-index">0{idx + 1}</span>
                      <span className="pc-stage-name">{label}</span>
                    </div>
                  );
                })}
              </div>

              <p className="pc-workshop-detail">{workshopStatus.detail}</p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span className="font-mono" style={{ fontSize: 11, color: '#94a3b8' }}>
                  {Math.round(workshopStatus.progress)}%
                </span>
                <button
                  type="button"
                  onClick={handleCancelWorkshop}
                  className="pc-btn-secondary"
                  style={{ padding: '5px 12px', fontSize: 12 }}
                >
                  取消构建
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Browser Fallback Loading Overlay */}
        {!workshopStatus && loadingMsg && (
          <div className="pc-loading-overlay">
            <div className="pc-loading-card">
              <Loader2
                size={28}
                className="pc-spin"
                style={{ color: '#14161a', margin: '0 auto 12px' }}
              />
              <div style={{ fontSize: 15.5, fontWeight: 700, color: '#14161a' }}>
                正在绘制微缩画境
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>{loadingMsg}</p>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <LocationPickerModal
        open={pickerOpen}
        initialLat={bundle.scene.meta.lat}
        initialLng={bundle.scene.meta.lon}
        initialSliceMeters={bundle.scene.meta.size}
        onClose={() => setPickerOpen(false)}
        onSelectLocation={({ lat, lng, sliceSizeMeters, presetSpotId }) => {
          setPickerOpen(false);
          void loadLocation(lat, lng, sliceSizeMeters, presetSpotId);
        }}
      />

      <GalleryModal
        open={galleryOpen}
        currentCityId={bundle.id}
        onClose={() => setGalleryOpen(false)}
        onSelectBlueprint={handleSelectGalleryBlueprint}
      />

      <PostcardModal
        open={postcardOpen}
        snapshots={snapshots}
        currentDraft={{
          title: bundle.city.name,
          subtitle: bundle.city.place || bundle.city.title || '',
          coordsText: formatCoords(bundle.scene.meta.lat, bundle.scene.meta.lon),
          atmosphereLabel: activeSeasonOrOccasion?.label ?? '城市画境',
          defaultNote: activeNote?.text ?? '',
          dataUrl: draftImageUrl,
        }}
        onClose={() => setPostcardOpen(false)}
        onSaveSnapshot={handleSaveSnapshot}
        onDeleteSnapshot={handleDeleteSnapshot}
      />

      <AISettingsModal
        open={aiOpen}
        config={aiConfig}
        onClose={() => setAiOpen(false)}
        onSave={(next) => {
          setAiConfig(next);
          saveAIConfig(next);
        }}
      />
    </div>
  );
}

export default App;
