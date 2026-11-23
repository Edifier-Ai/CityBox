import type {
  AIConfig,
  DioramaSceneData,
  GalleryEntry,
  WorkshopStageStatus,
} from '../types/city';
import type { PocketCityBundle } from '../types/pocketCity';

export interface WorkshopGenerateRequest {
  lat: number;
  lng: number;
  sliceSizeMeters?: number;
  aiConfig?: AIConfig;
}

export class WorkshopBackendOfflineError extends Error {
  readonly isOffline = true;
  constructor(message = '云端工坊服务未连接') {
    super(message);
    this.name = 'WorkshopBackendOfflineError';
  }
}

async function fetchWorkshopJson<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new WorkshopBackendOfflineError('无法连接到云端工坊接口');
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (res.status >= 500 || res.status === 404) {
      throw new WorkshopBackendOfflineError(`云端工坊接口不可用 (HTTP ${res.status})`);
    }
    throw new Error(`云端工坊返回了非 JSON 响应 (HTTP ${res.status})`);
  }

  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new WorkshopBackendOfflineError(data?.error || `云端工坊暂不可用 (HTTP ${res.status})`);
    }
    throw new Error(data?.error || `请求失败 (HTTP ${res.status})`);
  }

  return data;
}

export async function checkWorkshopHealth(timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch('/api/health', {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

export async function startWorkshopJob(
  req: WorkshopGenerateRequest,
  signal?: AbortSignal
): Promise<WorkshopStageStatus> {
  return fetchWorkshopJson<WorkshopStageStatus>('/api/workshop/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat: req.lat,
      lng: req.lng,
      sliceSizeMeters: req.sliceSizeMeters ?? 200,
      aiConfig: req.aiConfig,
    }),
    signal,
  });
}

export async function pollWorkshopJob(
  jobId: string,
  signal?: AbortSignal
): Promise<WorkshopStageStatus> {
  return fetchWorkshopJson<WorkshopStageStatus>(
    `/api/workshop/jobs/${encodeURIComponent(jobId)}`,
    { signal }
  );
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function runWorkshopPipeline(
  req: WorkshopGenerateRequest,
  onStage?: (status: WorkshopStageStatus) => void,
  signal?: AbortSignal,
  pollIntervalMs = 550
): Promise<{
  blueprint: DioramaSceneData | PocketCityBundle;
  cached: boolean;
  finalStatus: WorkshopStageStatus;
}> {
  let current = await startWorkshopJob(req, signal);
  onStage?.(current);

  const startedAt = Date.now();
  const maxWaitMs = 90000;

  while (current.status === 'queued' || current.status === 'running') {
    if (Date.now() - startedAt > maxWaitMs) {
      throw new Error('云端工坊生成超时，请稍后重试');
    }
    await sleepWithAbort(pollIntervalMs, signal);
    current = await pollWorkshopJob(current.jobId, signal);
    onStage?.(current);
  }

  if (current.status === 'failed') {
    throw new Error(current.error || current.detail || '云端工坊生成失败');
  }

  if (!current.blueprint) {
    throw new Error('云端工坊未返回有效城市蓝图');
  }

  return {
    blueprint: current.blueprint,
    cached: Boolean(current.cached),
    finalStatus: current,
  };
}

export async function fetchGalleryList(
  signal?: AbortSignal
): Promise<GalleryEntry[]> {
  return fetchWorkshopJson<GalleryEntry[]>('/api/gallery', { signal });
}

export async function fetchGalleryBlueprint(
  id: string,
  signal?: AbortSignal
): Promise<DioramaSceneData | PocketCityBundle> {
  return fetchWorkshopJson<DioramaSceneData | PocketCityBundle>(
    `/api/gallery/${encodeURIComponent(id)}`,
    { signal }
  );
}
