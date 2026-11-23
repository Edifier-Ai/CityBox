import { randomUUID } from 'node:crypto';
import { buildWorkshopCacheKey } from './geohash.mjs';
import { getCachedDiorama, saveCachedDiorama } from './galleryStore.mjs';
import { fetchRawOsm, reverseGeocode } from './osmFetch.mjs';
import { computePocketPlot } from './pocketPlot.mjs';
import { buildPocketBundle } from './pocketPrep.mjs';
import { enrichBundleWithSatellite } from './tileSampler.mjs';
import { curatePocketBundle } from './aiCurator.mjs';

const STAGE_LABELS = [
  '解析街区地理切片',
  '测算最佳街区取景框',
  '构建三维街区几何',
  '云端缓存与画廊入库',
];

const jobs = new Map();
const JOB_TTL_MS = 15 * 60 * 1000;

function pruneOldJobs() {
  const now = Date.now();
  for (const [id, entry] of jobs.entries()) {
    if (now - entry.updatedAt > JOB_TTL_MS && jobs.size > 20) {
      jobs.delete(id);
    }
  }
}

function updateJob(jobId, patch) {
  const cur = jobs.get(jobId);
  if (!cur) return;
  cur.status = { ...cur.status, ...patch };
  cur.updatedAt = Date.now();
}

async function runPipeline(jobId, params) {
  const { lat, lng, sliceSizeMeters, cacheKey, aiConfig } = params;

  try {
    // Stage 0: OSM Overpass + Nominatim
    updateJob(jobId, {
      status: 'running',
      stageIndex: 0,
      stageLabel: STAGE_LABELS[0],
      detail: '正在请求 OpenStreetMap 矢量街区与逆地理编码...',
      progress: 14,
    });

    const [osmData, geocodeMeta] = await Promise.all([
      fetchRawOsm(lat, lng, sliceSizeMeters, (info) => {
        updateJob(jobId, {
          detail: info?.message || '正在采集 OpenStreetMap 街区数据...',
          progress: Math.max(14, Math.min(36, Number(info?.progress) || 24)),
        });
      }),
      reverseGeocode(lat, lng),
    ]);

    // Stage 1: Compute optimal Pocket Plot rotation & landmark framing
    updateJob(jobId, {
      stageIndex: 1,
      stageLabel: STAGE_LABELS[1],
      detail: '正在对齐街道主轴角度与地标取景框...',
      progress: 50,
    });

    const plot = computePocketPlot(osmData, {
      lat,
      lon: lng,
      size: sliceSizeMeters,
      rotate: 'auto',
      place: geocodeMeta.place,
    });

    updateJob(jobId, {
      detail: `已对齐街道角度 ${plot.rotation}°（平移 ${plot.moved_m}m，完整收录 ${plot.famous_inside.length} 处地标）`,
      progress: 64,
    });

    // Stage 2: Build planar geometry, traffic routes, trees & city config
    updateJob(jobId, {
      stageIndex: 2,
      stageLabel: STAGE_LABELS[2],
      detail: '正在裁剪多边形、生成行人/车流路径与城市配色...',
      progress: 78,
    });

    const rawBundle = buildPocketBundle(osmData, plot, geocodeMeta, { id: cacheKey });

    updateJob(jobId, {
      stageIndex: 2,
      stageLabel: STAGE_LABELS[2],
      detail: aiConfig?.enabled
        ? '正在融合卫星屋顶贴图并运行 AI 策展...'
        : '正在融合 Esri 卫星屋顶水彩纹理与植被...',
      progress: 84,
    });

    const { bundle: satBundle, satellitePngBase64 } = await enrichBundleWithSatellite(rawBundle);
    const { bundle: curatedBundle, aiUsed } = await curatePocketBundle(satBundle, aiConfig, {
      satellitePngBase64,
    });
    const bundle = {
      ...curatedBundle,
      pipelineSource: 'cloud_workshop',
      isLiveOSM: true,
      aiCurated: aiUsed,
      generatedAt: curatedBundle.generatedAt || Date.now(),
    };

    // Stage 3: Geohash disk cache & gallery index
    updateJob(jobId, {
      stageIndex: 3,
      stageLabel: STAGE_LABELS[3],
      detail: '正在写入 Geohash 云端缓存与画廊索引...',
      progress: 92,
    });

    await saveCachedDiorama(cacheKey, bundle);

    const waterCount = bundle.scene.water?.length || 0;
    updateJob(jobId, {
      status: 'completed',
      stageIndex: 3,
      stageLabel: STAGE_LABELS[3],
      detail: `构建完成：${bundle.scene.buildings.length} 栋建筑 · ${waterCount} 处水系 · ${bundle.scene.trees.length} 棵树木`,
      progress: 100,
      cached: false,
      blueprint: bundle,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '工坊构建失败';
    updateJob(jobId, {
      status: 'failed',
      error: message,
      detail: message,
    });
  }
}

export async function startWorkshopJob({ lat, lng, sliceSizeMeters = 200, aiConfig }) {
  pruneOldJobs();

  const clampedSize = Math.max(120, Math.min(440, Math.round(Number(sliceSizeMeters) || 200)));
  const cacheKey = `pocket4-${buildWorkshopCacheKey(lat, lng, clampedSize)}`;
  const jobId = randomUUID();

  const cachedBundle = await getCachedDiorama(cacheKey);
  if (cachedBundle) {
    const status = {
      jobId,
      status: 'completed',
      stageIndex: 3,
      stageLabel: STAGE_LABELS[3],
      detail: `命中 Geohash (${cacheKey}) 云端缓存，瞬时加载完成`,
      progress: 100,
      cached: true,
      blueprint: cachedBundle,
    };
    jobs.set(jobId, { status, updatedAt: Date.now() });
    return status;
  }

  const initialStatus = {
    jobId,
    status: 'queued',
    stageIndex: 0,
    stageLabel: STAGE_LABELS[0],
    detail: '工坊任务已入队，准备解析地理切片...',
    progress: 5,
    cached: false,
  };
  jobs.set(jobId, { status: initialStatus, updatedAt: Date.now() });

  // Kick off async pipeline without blocking HTTP response
  void runPipeline(jobId, {
    lat,
    lng,
    sliceSizeMeters: clampedSize,
    aiConfig,
    cacheKey,
  });

  return initialStatus;
}

export function getWorkshopJobStatus(jobId) {
  const entry = jobs.get(jobId);
  return entry ? entry.status : null;
}
