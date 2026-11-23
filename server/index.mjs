import http from 'node:http';
import { startWorkshopJob, getWorkshopJobStatus } from './jobRunner.mjs';
import { getGalleryBlueprintById, listGalleryEntries } from './galleryStore.mjs';
import { fetchRawOsm, reverseGeocode } from './osmFetch.mjs';
import { computePocketPlot } from './pocketPlot.mjs';
import { buildPocketBundle } from './pocketPrep.mjs';
import { enrichBundleWithSatellite } from './tileSampler.mjs';
import { curatePocketBundle } from './aiCurator.mjs';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY_BYTES = 256 * 1024;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'citybox-workshop',
      timestamp: Date.now(),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/workshop/generate') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'Bad request' });
      return;
    }

    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const sliceSizeMeters = Number(body?.sliceSizeMeters ?? 200);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -85 ||
      lat > 85 ||
      lng < -180 ||
      lng > 180
    ) {
      sendJson(res, 400, { error: 'Invalid coordinates (lat/lng)' });
      return;
    }

    const status = await startWorkshopJob({
      lat,
      lng,
      sliceSizeMeters,
      aiConfig: body?.aiConfig,
    });
    sendJson(res, status.status === 'completed' ? 200 : 202, status);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/pocket-city') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'Bad request' });
      return;
    }

    const lat = Number(body?.lat);
    const lng = Number(body?.lng ?? body?.lon);
    const size = Math.max(
      80,
      Math.min(600, Math.round(Number(body?.size ?? body?.sliceSizeMeters ?? 200) || 200))
    );
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -85 ||
      lat > 85 ||
      lng < -180 ||
      lng > 180
    ) {
      sendJson(res, 400, { error: 'Invalid coordinates (lat/lng)' });
      return;
    }

    try {
      const [osmData, geocodeMeta] = await Promise.all([
        fetchRawOsm(lat, lng, size),
        reverseGeocode(lat, lng),
      ]);
      const plot = computePocketPlot(osmData, {
        lat,
        lon: lng,
        size,
        rotate: body?.rotate ?? 'auto',
        keep: body?.keep,
        slide: body?.slide !== undefined ? Number(body.slide) : 0.4,
        place: geocodeMeta.place,
      });
      const rawBundle = buildPocketBundle(osmData, plot, geocodeMeta, {
        greenOpen: body?.greenOpen,
        bankTrees: body?.bankTrees,
      });
      const { bundle: satBundle, satellitePngBase64 } = await enrichBundleWithSatellite(rawBundle);
      const { bundle } = await curatePocketBundle(satBundle, body?.aiConfig, {
        satellitePngBase64,
      });
      sendJson(res, 200, bundle);
    } catch (err) {
      sendJson(res, 502, {
        error: err instanceof Error ? err.message : 'CityBox extraction failed',
      });
    }
    return;
  }

  const jobMatch = pathname.match(/^\/api\/workshop\/jobs\/([^/]+)$/);
  if (req.method === 'GET' && jobMatch) {
    const jobId = decodeURIComponent(jobMatch[1]);
    const status = getWorkshopJobStatus(jobId);
    if (!status) {
      sendJson(res, 404, { error: 'Workshop job not found' });
      return;
    }
    sendJson(res, 200, status);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/gallery') {
    const entries = await listGalleryEntries();
    sendJson(res, 200, entries);
    return;
  }

  const galleryMatch = pathname.match(/^\/api\/gallery\/([^/]+)$/);
  if (req.method === 'GET' && galleryMatch) {
    const id = decodeURIComponent(galleryMatch[1]);
    const blueprint = await getGalleryBlueprintById(id);
    if (!blueprint) {
      sendJson(res, 404, { error: 'Gallery diorama not found' });
      return;
    }
    sendJson(res, 200, blueprint);
    return;
  }

  sendJson(res, 404, { error: `Unknown endpoint: ${req.method} ${pathname}` });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('[WorkshopServer] Unhandled error:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    } else {
      res.end();
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[CityBox Workshop] API server listening at http://${HOST}:${PORT}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
