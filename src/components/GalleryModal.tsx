import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Cloud,
  Images,
  Loader2,
  MapPin,
  RefreshCw,
  Sparkles,
  Waves,
  X,
} from 'lucide-react';
import { buildPocketGalleryEntries, getPocketPresetById } from '../data/pocketPresets';
import {
  WorkshopBackendOfflineError,
  fetchGalleryBlueprint,
  fetchGalleryList,
} from '../services/workshopService';
import type { DioramaSceneData, GalleryEntry } from '../types/city';
import type { PocketCityBundle } from '../types/pocketCity';

interface GalleryModalProps {
  open: boolean;
  currentCityId?: string;
  onClose: () => void;
  onSelectBlueprint: (blueprint: DioramaSceneData | PocketCityBundle) => void;
}

function buildBuiltinFallbackEntries(): GalleryEntry[] {
  return buildPocketGalleryEntries();
}

export function GalleryModal({
  open,
  currentCityId,
  onClose,
  onSelectBlueprint,
}: GalleryModalProps) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadGallery = useCallback(async () => {
    setLoadingList(true);
    setErrorMsg(null);
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), 5000);
    try {
      const list = await fetchGalleryList(controller.signal);
      const builtins = buildBuiltinFallbackEntries();
      const builtinIds = new Set(builtins.map((b) => b.id));
      const merged = [
        ...builtins,
        ...list.filter((item) => !builtinIds.has(item.id)),
      ];
      setEntries(merged);
      setOfflineMode(false);
    } catch (err) {
      if (err instanceof WorkshopBackendOfflineError || (err instanceof DOMException && err.name === 'AbortError')) {
        setEntries(buildBuiltinFallbackEntries());
        setOfflineMode(true);
      } else {
        setEntries(buildBuiltinFallbackEntries());
        setOfflineMode(true);
        setErrorMsg(err instanceof Error ? err.message : '加载画廊列表失败');
      }
    } finally {
      globalThis.clearTimeout(timer);
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadGallery();
    }
  }, [open, loadGallery]);

  if (!open) return null;

  const handlePickEntry = async (entry: GalleryEntry) => {
    if (loadingId) return;
    setLoadingId(entry.id);
    setErrorMsg(null);

    if (entry.isBuiltin || getPocketPresetById(entry.id)) {
      const localPreset = getPocketPresetById(entry.id);
      if (localPreset) {
        onSelectBlueprint(localPreset);
        setLoadingId(null);
        return;
      }
    }

    try {
      const blueprint = await fetchGalleryBlueprint(entry.id);
      onSelectBlueprint(blueprint);
    } catch (err) {
      setErrorMsg(
        err instanceof WorkshopBackendOfflineError
          ? '云端工坊暂未启动，仅可打开内置精修馆藏'
          : err instanceof Error
            ? `加载蓝图失败：${err.message}`
            : '加载蓝图失败'
      );
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div
      className="pc-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="探索画廊"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pc-modal" style={{ maxWidth: 880 }}>
        <div className="pc-modal-header">
          <div className="pc-modal-title-row">
            <div className="pc-modal-icon">
              <Images size={17} />
            </div>
            <div>
              <h2 className="pc-modal-title">灵感画廊 · 城市切片馆藏</h2>
              <p className="pc-modal-sub">
                浏览精修地标馆藏与工坊缓存的城市切片，点击即可秒级载入三维画境
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => void loadGallery()}
              disabled={loadingList}
              className="pc-btn-secondary"
              style={{ padding: '6px 11px', fontSize: 12 }}
              title="刷新画廊列表"
            >
              <RefreshCw size={13} className={loadingList ? 'pc-spin' : ''} />
              刷新
            </button>
            <button onClick={onClose} className="pc-icon-close" aria-label="关闭">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="pc-modal-body">
          {offlineMode && (
            <div className="pc-gallery-notice">
              <Cloud size={14} />
              <span>
                云端工坊服务未连接，当前展示本地内置精修馆藏（运行 <code>npm run server</code> 可解锁云端生成与持久化画廊）
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="pc-gallery-error">
              <span>{errorMsg}</span>
            </div>
          )}

          {loadingList && entries.length === 0 ? (
            <div className="pc-gallery-empty">
              <Loader2 size={24} className="pc-spin" style={{ color: '#14161a' }} />
              <span>正在读取画廊馆藏...</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="pc-gallery-empty">
              <span>画廊暂无藏品，快去「地图任意选点」构建一座微缩街区吧。</span>
            </div>
          ) : (
            <div className="pc-workshop-gallery-grid">
              {entries.map((entry) => {
                const isActive = currentCityId === entry.id;
                const isPicking = loadingId === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={Boolean(loadingId)}
                    onClick={() => void handlePickEntry(entry)}
                    className={`pc-workshop-card ${isActive ? 'active' : ''}`}
                  >
                    <div className="pc-workshop-card-top">
                      <span className="pc-workshop-region">{entry.region}</span>
                      <span
                        className={`pc-workshop-badge ${entry.isBuiltin ? 'builtin' : 'cloud'}`}
                      >
                        {entry.isBuiltin ? (
                          <>
                            <Sparkles size={10} />
                            精修馆藏
                          </>
                        ) : (
                          <>
                            <Cloud size={10} />
                            云端工坊
                          </>
                        )}
                      </span>
                    </div>

                    <div className="pc-workshop-title-row">
                      <h3 className="pc-workshop-city">{entry.city}</h3>
                      {isPicking && (
                        <Loader2 size={15} className="pc-spin" style={{ color: '#14161a' }} />
                      )}
                    </div>
                    <p className="pc-workshop-subtitle">{entry.subtitle}</p>

                    <div className="pc-workshop-metrics">
                      <span className="pc-workshop-metric">
                        <Building2 size={12} />
                        {entry.buildingCount} 栋建筑
                      </span>
                      <span className="pc-workshop-metric">
                        <Waves size={12} />
                        {entry.waterCount} 处水系
                      </span>
                      <span className="pc-workshop-metric font-mono">
                        {entry.sliceSizeMeters}m × {entry.sliceSizeMeters}m
                      </span>
                    </div>

                    <div className="pc-workshop-card-foot">
                      <span className="pc-workshop-coords font-mono">
                        <MapPin size={11} />
                        {Math.abs(entry.lat).toFixed(4)}° {entry.lat >= 0 ? 'N' : 'S'},{' '}
                        {Math.abs(entry.lng).toFixed(4)}° {entry.lng >= 0 ? 'E' : 'W'}
                      </span>
                      <span className="pc-workshop-open-hint">
                        {isActive ? '当前场景' : '点击载入 →'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
