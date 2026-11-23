/**
 * OpenStreetMap Overpass + Nominatim fetcher for Pocket City.
 * Fetches a padded square around (lat, lng) with 1.35 * sizeMeters half-extent
 * so computePocketPlot can slide up to 40% without losing context.
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const REQUEST_HEADERS = {
  Accept: 'application/json, */*',
  'User-Agent': 'CityBoxWorkshop/2.0',
};

const LEFT_HAND_COUNTRIES = new Set([
  'gb', 'jp', 'au', 'nz', 'ie', 'in', 'th', 'my', 'sg', 'id', 'za', 'hk', 'mo',
]);

function buildOverpassQuery(south, west, north, east) {
  const b = `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`;
  return `[out:json][timeout:20];
(
  way["building"](${b});
  relation["building"](${b});
  way["building:part"](${b});
  relation["building:part"](${b});
  way["highway"](${b});
  node["highway"~"^(bus_stop|street_lamp|traffic_signals|crossing)$"](${b});
  node["crossing"](${b});
  way["railway"](${b});
  way["waterway"](${b});
  relation["waterway"](${b});
  way["natural"~"^(water|coastline|tree_row|beach|sand|wood|scrub|grassland|heath)$"](${b});
  relation["natural"~"^(water|beach|sand|wood|scrub|grassland|heath)$"](${b});
  node["natural"="tree"](${b});
  way["leisure"~"^(park|garden|playground|pitch|common|dog_park|beach_resort)$"](${b});
  relation["leisure"~"^(park|garden|playground|pitch|common|dog_park|beach_resort)$"](${b});
  way["landuse"~"^(grass|forest|meadow|village_green|recreation_ground|cemetery|orchard|allotments|flowerbed|reservoir|basin)$"](${b});
  relation["landuse"~"^(grass|forest|meadow|village_green|recreation_ground|cemetery|orchard|allotments|flowerbed|reservoir|basin)$"](${b});
  way["man_made"~"^(pier|breakwater|groyne|quay|bridge)$"](${b});
  node["man_made"="torii"](${b});
  way["place"="square"](${b});
  relation["place"="square"](${b});
  way["area:highway"](${b});
  node["amenity"](${b});
  node["shop"](${b});
  node["tourism"](${b});
  node["historic"](${b});
  node["craft"](${b});
  node["office"](${b});
);
out geom;`;
}

function convertOsm06ToOverpassElements(elements = []) {
  const nodeMap = new Map();
  const wayGeomMap = new Map();
  const out = [];

  for (const el of elements) {
    if (el?.type === 'node' && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
      nodeMap.set(el.id, { lat: el.lat, lon: el.lon });
      if (el.tags && Object.keys(el.tags).length > 0) {
        out.push(el);
      }
    }
  }

  for (const el of elements) {
    if (el?.type === 'way' && Array.isArray(el.nodes)) {
      const geometry = [];
      for (const nid of el.nodes) {
        const pt = nodeMap.get(nid);
        if (pt) geometry.push(pt);
      }
      if (geometry.length >= 2) {
        wayGeomMap.set(el.id, geometry);
        if (el.tags && Object.keys(el.tags).length > 0) {
          out.push({ ...el, geometry });
        }
      }
    }
  }

  for (const el of elements) {
    if (el?.type === 'relation' && el.tags && Object.keys(el.tags).length > 0 && Array.isArray(el.members)) {
      const members = el.members.map((m) => {
        if (m.type === 'way') {
          const geometry = wayGeomMap.get(m.ref);
          return geometry ? { ...m, geometry } : m;
        }
        if (m.type === 'node') {
          const pt = nodeMap.get(m.ref);
          return pt ? { ...m, lat: pt.lat, lon: pt.lon } : m;
        }
        return m;
      });
      out.push({ ...el, members });
    }
  }

  return out;
}

async function fetchOsmApi06Fallback(south, west, north, east, onProgress) {
  onProgress?.({
    stage: 'osm_fallback',
    message: '镜像繁忙，正在通过 OpenStreetMap v0.6 接口读取街区数据…',
    progress: 28,
  });

  const bbox = `${west.toFixed(6)},${south.toFixed(6)},${east.toFixed(6)},${north.toFixed(6)}`;
  const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox}`;

  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(url, {
        headers: REQUEST_HEADERS,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`OSM 0.6 API HTTP ${res.status}`);
      }
      const json = await res.json();
      if (!json || !Array.isArray(json.elements)) {
        throw new Error('Invalid OSM 0.6 map.json payload');
      }
      return convertOsm06ToOverpassElements(json.elements);
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  const causeMsg = lastErr?.cause?.message ? ` (${lastErr.cause.message})` : '';
  throw new Error(`${lastErr?.message || 'unknown'}${causeMsg}`);
}

async function queryOverpassEndpoint(endpoint, query, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...REQUEST_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Overpass HTTP ${res.status} from ${endpoint}`);
    }
    const json = await res.json();
    if (!json || !Array.isArray(json.elements)) {
      throw new Error(`Invalid Overpass payload from ${endpoint}`);
    }
    return json.elements;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRawOsm(lat, lng, sizeMeters = 200, onProgress) {
  const safeSize = Math.max(80, Math.min(600, Number(sizeMeters) || 200));
  const halfExtent = safeSize * 1.35;
  const dLat = halfExtent / 110574;
  const cosLat = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const dLon = halfExtent / (111320 * cosLat);

  const south = lat - dLat;
  const north = lat + dLat;
  const west = lng - dLon;
  const east = lng + dLon;
  const query = buildOverpassQuery(south, west, north, east);

  onProgress?.({
    stage: 'osm_fetch',
    message: `正在请求 ${lat.toFixed(4)}, ${lng.toFixed(4)} 周边街区矢量数据…`,
    progress: 12,
  });

  let overpassError = null;
  try {
    const elements = await Promise.any(
      OVERPASS_ENDPOINTS.map((endpoint) => queryOverpassEndpoint(endpoint, query, 8000))
    );
    return {
      elements,
      pocket_city: {
        lat,
        lon: lng,
        size: safeSize,
        osm_base: 'OpenStreetMap contributors',
      },
    };
  } catch (aggErr) {
    const errs = aggErr instanceof AggregateError ? aggErr.errors : [aggErr];
    overpassError = errs.map((e) => e?.message || String(e)).join('; ');
    onProgress?.({
      stage: 'osm_retry',
      message: '主镜像节点繁忙，正在切换至 OSM v0.6 接口…',
      progress: 22,
    });
  }

  try {
    const elements = await fetchOsmApi06Fallback(south, west, north, east, onProgress);
    return {
      elements,
      pocket_city: {
        lat,
        lon: lng,
        size: safeSize,
        osm_base: 'OpenStreetMap contributors',
      },
    };
  } catch (fallbackErr) {
    throw new Error(
      `All OSM sources failed (Overpass: ${overpassError || 'unknown'}; OSM 0.6: ${
        fallbackErr instanceof Error ? fallbackErr.message : 'unknown'
      })`
    );
  }
}

function uniqJoin(arr, sep = ' · ') {
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const v = String(raw || '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.join(sep);
}

export async function reverseGeocode(lat, lng) {
  const fallback = {
    region: '',
    city: '',
    place: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    countryCode: '',
    drive: 'right',
  };

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}&zoom=16&addressdetails=1&accept-language=zh-CN,zh;q=0.9,en;q=0.3`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CityBoxWorkshop/2.0',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.3',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return fallback;

    const data = await res.json();
    const addr = data?.address || {};
    const cc = String(addr.country_code || '').toLowerCase();
    const country = addr.country || '';
    const state = addr.state || addr.province || '';
    const stateDistrict = addr.state_district || '';
    const rawCity =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      state ||
      '';
    const district =
      addr.city_district ||
      (addr.county && addr.county !== rawCity ? addr.county : '') ||
      '';
    const neighbourhood =
      addr.neighbourhood ||
      addr.quarter ||
      addr.suburb ||
      addr.road ||
      '';

    const region =
      cc === 'cn' && state
        ? uniqJoin([state, stateDistrict || rawCity])
        : uniqJoin([country, rawCity || state]);
    const city = rawCity || state || country || '';
    const place =
      uniqJoin([neighbourhood, district].filter((v) => v && v !== city)) ||
      (data?.name && data.name !== city ? data.name : '') ||
      (city ? `${city}街区` : fallback.place);

    return {
      region: region || country || '',
      city,
      place,
      countryCode: cc,
      drive: LEFT_HAND_COUNTRIES.has(cc) ? 'left' : 'right',
    };
  } catch {
    return fallback;
  }
}
