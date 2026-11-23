import { buildEngineSource } from '../engine/pocketEngineSource';
import type { PocketCameraState, PocketCityBundle } from '../types/pocketCity';
import type { EngineStyle } from './styleVariants';

export interface LabRenderRequest {
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

interface PendingTask {
  req: LabRenderRequest;
  resolve: (bmp: ImageBitmap | null) => void;
  reject: (err: Error) => void;
}

export class LabRenderer {
  private worker: Worker;
  private blobUrl: string;
  private disposed = false;
  private ready = false;
  private busy = false;
  private current: PendingTask | null = null;
  private queued: PendingTask | null = null;

  constructor(bundle: PocketCityBundle, engine: EngineStyle) {
    const src = buildEngineSource(bundle, false, engine as Record<string, unknown>);
    const code =
      src +
      '\nself.onmessage=({data:m})=>{try{const r=renderFrame(m);postMessage({bitmap:r.bitmap,seq:m.seq},[r.bitmap])}catch(e){postMessage({error:String(e.stack||e),seq:m.seq})}};postMessage({ready:true});';

    this.blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    this.worker = new Worker(this.blobUrl);

    this.worker.onmessage = ({
      data,
    }: MessageEvent<{ ready?: boolean; bitmap?: ImageBitmap; error?: string; seq?: number }>) => {
      if (this.disposed) {
        if (data.bitmap && typeof data.bitmap.close === 'function') {
          data.bitmap.close();
        }
        return;
      }

      if (data.ready) {
        this.ready = true;
        this.flush();
        return;
      }

      const task = this.current;
      this.current = null;
      this.busy = false;

      if (task) {
        if (data.error) {
          if (data.bitmap && typeof data.bitmap.close === 'function') {
            data.bitmap.close();
          }
          task.reject(new Error(data.error));
        } else if (data.bitmap) {
          if (this.queued) {
            data.bitmap.close();
            task.resolve(null);
          } else {
            task.resolve(data.bitmap);
          }
        } else {
          task.resolve(null);
        }
      } else if (data.bitmap && typeof data.bitmap.close === 'function') {
        data.bitmap.close();
      }

      this.flush();
    };

    this.worker.onerror = (evt) => {
      if (this.disposed) return;
      const err = new Error(evt.message || 'Lab worker error');
      if (this.current) {
        this.current.reject(err);
        this.current = null;
      }
      if (this.queued) {
        this.queued.reject(err);
        this.queued = null;
      }
      this.busy = false;
    };
  }

  private flush(): void {
    if (this.disposed || !this.ready || this.busy || !this.queued) return;
    const next = this.queued;
    this.queued = null;
    this.current = next;
    this.busy = true;
    this.worker.postMessage(next.req);
  }

  render(req: LabRenderRequest): Promise<ImageBitmap | null> {
    if (this.disposed) return Promise.resolve(null);
    return new Promise<ImageBitmap | null>((resolve, reject) => {
      if (this.queued) {
        this.queued.resolve(null);
      }
      this.queued = { req, resolve, reject };
      this.flush();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.current) {
      this.current.resolve(null);
      this.current = null;
    }
    if (this.queued) {
      this.queued.resolve(null);
      this.queued = null;
    }
    this.worker.terminate();
    URL.revokeObjectURL(this.blobUrl);
  }
}
