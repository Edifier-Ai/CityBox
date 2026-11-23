import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSPIRATION_SPOTS, getCuratedPresetById } from '../src/data/presets.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_ROOT = path.join(__dirname, '.cache');
const DIORAMA_DIR = path.join(CACHE_ROOT, 'dioramas');
const INDEX_PATH = path.join(CACHE_ROOT, 'gallery-index.json');

let builtinCache = null;

function getBuiltinPresets() {
  if (builtinCache) return builtinCache;
  const entries = [];
  const blueprints = new Map();

  for (const spot of INSPIRATION_SPOTS) {
    if (!spot.hasInstantPreset) continue;
    const blueprint = getCuratedPresetById(spot.id);
    if (!blueprint) continue;

    blueprints.set(spot.id, blueprint);
    entries.push({
      id: spot.id,
      city: blueprint.meta.city,
      region: blueprint.meta.region,
      subtitle: blueprint.meta.subtitle,
      lat: blueprint.meta.lat,
      lng: blueprint.meta.lng,
      sliceSizeMeters: blueprint.meta.sliceSizeMeters,
      buildingCount: blueprint.buildings.length,
      waterCount: blueprint.waters.length,
      createdAt: blueprint.meta.generatedAt || 1700000000000,
      isBuiltin: true,
    });
  }

  builtinCache = { entries, blueprints };
  return builtinCache;
}

async function ensureCacheDirs() {
  await fs.mkdir(DIORAMA_DIR, { recursive: true });
}

async function readIndexFile() {
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndexFile(entries) {
  await ensureCacheDirs();
  await fs.writeFile(INDEX_PATH, JSON.stringify(entries, null, 2), 'utf8');
}

export async function getCachedDiorama(cacheKey) {
  const filePath = path.join(DIORAMA_DIR, `${cacheKey}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildGalleryEntry(cacheKey, payload) {
  const isPocket = payload && typeof payload === 'object' && 'city' in payload && 'scene' in payload;
  if (isPocket) {
    return {
      id: cacheKey,
      city: payload.city.name,
      region: payload.city.region || '',
      subtitle: payload.city.place || payload.city.title || payload.scene.meta?.place || '',
      lat: payload.scene.meta.lat,
      lng: payload.scene.meta.lon,
      sliceSizeMeters: payload.scene.meta.size,
      buildingCount: payload.scene.buildings.length,
      waterCount: payload.scene.water?.length || 0,
      createdAt: payload.generatedAt || Date.now(),
      isBuiltin: false,
    };
  }

  return {
    id: cacheKey,
    city: payload.meta.city,
    region: payload.meta.region,
    subtitle: payload.meta.subtitle,
    lat: payload.meta.lat,
    lng: payload.meta.lng,
    sliceSizeMeters: payload.meta.sliceSizeMeters,
    buildingCount: payload.buildings.length,
    waterCount: payload.waters.length,
    createdAt: payload.meta.generatedAt || Date.now(),
    isBuiltin: false,
  };
}

export async function saveCachedDiorama(cacheKey, payload) {
  await ensureCacheDirs();
  const filePath = path.join(DIORAMA_DIR, `${cacheKey}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload), 'utf8');

  const entry = buildGalleryEntry(cacheKey, payload);

  const existing = await readIndexFile();
  const filtered = existing.filter((item) => item.id !== cacheKey);
  filtered.unshift(entry);
  await writeIndexFile(filtered.slice(0, 60));
  return entry;
}

export async function listGalleryEntries() {
  const { entries: builtins } = getBuiltinPresets();
  const cached = await readIndexFile();
  return [...builtins, ...cached];
}

export async function getGalleryBlueprintById(id) {
  const safeId = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return null;

  const { blueprints } = getBuiltinPresets();
  if (blueprints.has(safeId)) {
    return blueprints.get(safeId);
  }

  return getCachedDiorama(safeId);
}
