import projectionRaw from './pocketKit/projection.js?raw';
import modelsRaw from './pocketKit/models.js?raw';
import streetFiguresRaw from './pocketKit/streetFigures.js?raw';
import cityRaw from './pocketKit/city.js?raw';
import foliageRaw from './pocketKit/foliage.js?raw';
import painterRaw from './pocketKit/painter.js?raw';
import type { PocketCameraState, PocketCityBundle } from '../types/pocketCity';

export function computeIsoCamera(bundle: PocketCityBundle): PocketCameraState {
  const size = bundle.scene?.meta?.size || 200;
  const autoZoom = Number((302 / (size * 1.62)).toFixed(3));
  const iso = bundle.city?.cameras?.iso ?? {};
  const ignoreZoom =
    bundle.pipelineSource === 'cloud_workshop' ||
    bundle.pipelineSource === 'browser_fallback';
  const merged = {
    yaw: -35,
    pitch: 33,
    zoom: autoZoom,
    x: 0,
    y: 0,
    z: 4,
    ...iso,
  };
  if (ignoreZoom) {
    merged.zoom = autoZoom;
  }
  return merged;
}

export function buildEngineSource(
  bundle: PocketCityBundle,
  phone: boolean,
  style: Record<string, unknown> | null = null
): string {
  const profileConfig = `self.PHONE_PROFILE=${phone};self.PAGE_SEARCH="";self.STYLE_LAB=${JSON.stringify(style)};\n`;
  const dataBlock =
    'const SCENE=' +
    JSON.stringify(bundle.scene) +
    ';\nconst CITY=' +
    JSON.stringify(bundle.city) +
    ';\n';
  const landmarksBlock = bundle.landmarksCode?.trim()
    ? bundle.landmarksCode
    : '/* no hand-built landmarks */';

  return [
    profileConfig,
    projectionRaw,
    modelsRaw,
    streetFiguresRaw,
    dataBlock,
    landmarksBlock,
    cityRaw,
    foliageRaw,
    painterRaw,
  ].join('\n');
}
