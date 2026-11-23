import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type MapMouseEvent,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl(maplibreWorkerUrl);
import { Compass, Loader2, MapPin, Search, Sparkles, X } from 'lucide-react';
import { INSPIRATION_SPOTS as _LEGACY_SPOTS, type InspirationSpot } from '../data/presets';
import { POCKET_INSPIRATION_SPOTS } from '../data/pocketPresets';

const INSPIRATION_SPOTS = POCKET_INSPIRATION_SPOTS;
import { searchPlaces, type SearchPlaceResult } from '../services/osmService';

interface LocationPickerModalProps {
  open: boolean;
  initialLat: number;
  initialLng: number;
  initialSliceMeters: number;
  onClose: () => void;
  onSelectLocation: (params: {
    lat: number;
    lng: number;
    sliceSizeMeters: number;
    presetSpotId?: string;
  }) => void;
}

const SLICE_OPTIONS = [
  { label: '微缩街口 180m', meters: 180 },
  { label: '标准画境 200m', meters: 200 },
  { label: '水岸街区 240m', meters: 240 },
];

function clampPickerSlice(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 200;
  return Math.max(160, Math.min(280, Math.round(meters)));
}

export function LocationPickerModal({
  open,
  initialLat,
  initialLng,
  initialSliceMeters,
  onClose,
  onSelectLocation,
}: LocationPickerModalProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  const [centerCoords, setCenterCoords] = useState({ lat: initialLat, lng: initialLng });
  const [sliceMeters, setSliceMeters] = useState(() => clampPickerSlice(initialSliceMeters));
  const sliceMetersRef = useRef(sliceMeters);
  sliceMetersRef.current = sliceMeters;
  const [boxPixels, setBoxPixels] = useState(140);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchPlaceResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const updateReticleSize = (map: MapLibreMap, meters: number) => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const mPerPx =
      (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / Math.pow(2, zoom);
    const px = Math.max(48, Math.min(340, Math.round(meters / Math.max(0.05, mPerPx))));
    setBoxPixels(px);
  };

  useEffect(() => {
    if (!open) return;
    setCenterCoords({ lat: initialLat, lng: initialLng });
    setSliceMeters(clampPickerSlice(initialSliceMeters));
  }, [open, initialLat, initialLng, initialSliceMeters]);

  useEffect(() => {
    if (!open || !mapContainerRef.current) return;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm',
            paint: {
              'raster-saturation': -0.32,
              'raster-brightness-min': 0.06,
              'raster-contrast': -0.05,
            },
          },
        ],
      },
      center: [initialLng, initialLat],
      zoom: 16.4,
      minZoom: 3,
      maxZoom: 18.4,
    });

    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

    const syncState = () => {
      const c = map.getCenter();
      setCenterCoords({ lat: c.lat, lng: c.lng });
      updateReticleSize(map, sliceMetersRef.current);
    };

    map.on('load', syncState);
    map.on('move', syncState);
    map.on('zoom', syncState);
    map.on('click', (e: MapMouseEvent) => {
      map.flyTo({ center: [e.lngLat.lng, e.lngLat.lat], duration: 420 });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (mapRef.current) {
      updateReticleSize(mapRef.current, sliceMeters);
    }
  }, [sliceMeters]);

  if (!open) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const items = await searchPlaces(query);
      setResults(items);
      if (items.length === 0) {
        setSearchError('未找到匹配地点，请尝试输入城市或知名地标名称');
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '地名搜索失败');
    } finally {
      setSearching(false);
    }
  };

  const jumpTo = (lat: number, lng: number, targetMeters?: number) => {
    if (targetMeters) setSliceMeters(clampPickerSlice(targetMeters));
    setCenterCoords({ lat, lng });
    mapRef.current?.flyTo({
      center: [lng, lat],
      zoom: 16.4,
      duration: 750,
    });
    setResults([]);
  };

  const handleSelectSpot = (spot: InspirationSpot) => {
    if (spot.hasInstantPreset) {
      onSelectLocation({
        lat: spot.lat,
        lng: spot.lng,
        sliceSizeMeters: spot.sliceSizeMeters,
        presetSpotId: spot.id,
      });
      return;
    }
    jumpTo(spot.lat, spot.lng, spot.sliceSizeMeters);
  };

  return (
    <div className="pc-modal-backdrop" role="dialog" aria-modal="true" aria-label="地图选点">
      <div className="pc-modal">
        <div className="pc-modal-header">
          <div className="pc-modal-title-row">
            <div className="pc-modal-icon">
              <Compass size={17} />
            </div>
            <div>
              <h2 className="pc-modal-title">探索全球坐标 · 任选地点构建 CityBox</h2>
              <p className="pc-modal-sub">
                拖拽或点击地图移动取景框，支持全球任一水岸、街区与立体交通节点实时生成三维画境
              </p>
            </div>
          </div>
          <button onClick={onClose} className="pc-icon-close" aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="pc-picker-toolbar">
          <form onSubmit={handleSearch} className="pc-search-form">
            <div className="pc-search-input-wrap">
              <Search size={15} className="pc-search-icon" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索城市、桥梁、水岸或街区（如：杭州西湖断桥、京都鸭川、巴黎艺术桥、外滩...）"
                className="pc-input with-icon"
              />
            </div>
            <button type="submit" disabled={searching} className="pc-btn-primary">
              {searching ? <Loader2 size={15} className="pc-spin" /> : <Search size={15} />}
              搜索
            </button>

            {(results.length > 0 || searchError) && (
              <div className="pc-search-dropdown">
                {searchError ? (
                  <div style={{ padding: '10px 14px', fontSize: 12, color: '#b45309' }}>
                    {searchError}
                  </div>
                ) : (
                  results.map((item, idx) => (
                    <button
                      key={`${item.lat}-${item.lng}-${idx}`}
                      type="button"
                      onClick={() => jumpTo(item.lat, item.lng)}
                      className="pc-search-item"
                    >
                      <MapPin size={15} style={{ color: '#2563eb', marginTop: 2, flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{item.shortName}</div>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#64748b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.displayName}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </form>

          <div className="pc-spots-row">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                color: '#475569',
                fontWeight: 500,
              }}
            >
              <Sparkles size={13} style={{ color: '#2563eb' }} />
              灵感选点:
            </span>
            {INSPIRATION_SPOTS.map((spot) => (
              <button
                key={spot.id}
                type="button"
                onClick={() => handleSelectSpot(spot)}
                className="pc-spot-chip"
              >
                <span style={{ fontWeight: 600 }}>{spot.city}</span>
                <span style={{ color: '#64748b' }}>· {spot.tag}</span>
                {spot.hasInstantPreset && <span className="pc-spot-tag">精修馆藏</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="pc-map-stage">
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
          <div className="pc-reticle-overlay">
            <div className="pc-reticle-box" style={{ width: boxPixels, height: boxPixels }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#14161a',
                }}
              />
              <div className="pc-reticle-label">
                取景范围 {sliceMeters}m × {sliceMeters}m
              </div>
            </div>
          </div>
        </div>

        <div className="pc-modal-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              className="font-mono"
              style={{
                padding: '5px 10px',
                borderRadius: 8,
                border: '1px solid rgba(15, 23, 42, 0.12)',
                background: '#f4f6f9',
                fontSize: 12,
                color: '#14161a',
              }}
            >
              {Math.abs(centerCoords.lat).toFixed(5)}° {centerCoords.lat >= 0 ? 'N' : 'S'},{' '}
              {Math.abs(centerCoords.lng).toFixed(5)}° {centerCoords.lng >= 0 ? 'E' : 'W'}
            </span>
            <div className="pc-seg-group">
              {SLICE_OPTIONS.map((opt) => (
                <button
                  key={opt.meters}
                  type="button"
                  onClick={() => setSliceMeters(opt.meters)}
                  className={`pc-seg-btn ${sliceMeters === opt.meters ? 'active' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} className="pc-btn-secondary">
              取消
            </button>
            <button
              type="button"
              onClick={() =>
                onSelectLocation({
                  lat: centerCoords.lat,
                  lng: centerCoords.lng,
                  sliceSizeMeters: sliceMeters,
                })
              }
              className="pc-btn-primary"
            >
              <Sparkles size={15} />
              构建当前切片
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
