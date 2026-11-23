/**
 * Pure ESM AI Curator for PocketCityBundle (`PocketSceneData` + `PocketCityConfig`).
 * Enriches regional architecture styles, local shop signs, seasonal notes, and
 * notable building overrides using OpenAI-compatible or Gemini APIs when configured,
 * falling back cleanly to the deterministic regional synthesizer.
 */

const VALID_FACADES = new Set([
  'house',
  'apartment',
  'brick',
  'stucco',
  'painted',
  'civic',
  'temple',
  'shophouse',
  'timber',
  'office',
  'glass',
  'plain',
  'warehouse',
]);
const VALID_ROOFS = new Set(['auto', 'flat', 'gabled', 'hipped', 'pyramidal']);
const VALID_ROOF_TEX = new Set(['kawara', 'pantile', 'slate', 'tiles', 'copper']);
const VALID_PAVING = new Set(['grid', 'slabs', 'ishidatami', 'tiles']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function resolveServerAIConfig(requestConfig) {
  if (requestConfig && requestConfig.enabled && requestConfig.apiKey?.trim()) {
    return requestConfig;
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      enabled: true,
      provider: process.env.AI_PROVIDER === 'gemini' ? 'gemini' : 'openai',
      apiBaseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: openaiKey,
      model: process.env.AI_MODEL || 'gpt-4o-mini',
    };
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    return {
      enabled: true,
      provider: 'gemini',
      apiBaseUrl:
        process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: geminiKey,
      model: process.env.AI_MODEL || 'gemini-2.0-flash',
    };
  }

  return null;
}

function safeHexList(arr, max = 6) {
  if (!Array.isArray(arr)) return undefined;
  const valid = arr.filter((c) => typeof c === 'string' && HEX_COLOR_RE.test(c.trim())).map((c) => c.trim());
  return valid.length ? valid.slice(0, max) : undefined;
}

function buildCuratorPrompt(bundle) {
  const { scene, city } = bundle;
  const notableBuildings = (scene.buildings || [])
    .filter((b) => b.n || b.famous || b.type)
    .slice(0, 12)
    .map((b) => ({
      id: b.id,
      name: b.n || undefined,
      type: b.type || undefined,
      levels: b.lv || undefined,
      famous: Boolean(b.famous),
    }));

  const roadNames = Array.from(
    new Set((scene.centerlines || []).map((r) => r.name).filter(Boolean))
  ).slice(0, 8);

  const poiSamples = (scene.pois || [])
    .slice(0, 10)
    .map((p) => `${p.name} (${p.kind})`);

  const seasonIds = (city.seasons || []).map((s) => s.id);

  return `You are the architectural & cultural curator for "CityBox" (a 2D watercolor isometric miniature city map).
Given the real OpenStreetMap extract below, synthesize culturally authentic styling, local shop signs, and concise Simplified Chinese metadata, seasonal notes, and field notes.

Place: ${city.place || scene.meta?.place || city.name}
Title: ${city.title || city.name}
Coordinates: ${Number(scene.meta?.lat || 0).toFixed(5)}, ${Number(scene.meta?.lon || 0).toFixed(5)}
Stats: ${scene.buildings?.length || 0} buildings, ${scene.trees?.length || 0} trees, water=${(scene.water?.length || 0) > 0}
Main roads: ${roadNames.join(', ') || 'local streets'}
Sample POIs: ${poiSamples.join(', ') || 'mixed urban shops'}
Notable buildings: ${JSON.stringify(notableBuildings)}
Current season IDs: ${seasonIds.join(', ')}

Return ONLY valid JSON (no prose outside JSON) matching this schema, with ALL user-facing text strictly in Simplified Chinese (except local shopSigns):
{
  "name": "Concise Chinese city or district name (e.g. 巴黎 / 东京 · 涩谷)",
  "region": "Concise Chinese country/province · city (e.g. 法国 · 巴黎)",
  "place": "Concise Chinese neighborhood/landmark label (e.g. 塞纳河艺术桥南岸)",
  "title": "Concise Chinese display title (e.g. 东京 · 涩谷街区)",
  "isoLabel": "Short Chinese label for overview tab (e.g. 涩谷全景)",
  "styleDefault": {
    "facade": "house | apartment | brick | stucco | painted | civic | temple | shophouse | timber | office | glass | plain | warehouse",
    "wall": ["#hex6", "#hex6"],
    "roof": "auto | flat | gabled | hipped | pyramidal",
    "roofColour": ["#hex6", "#hex6"],
    "roofTex": "kawara | pantile | slate | tiles | copper"
  },
  "pavingStyle": "grid | slabs | ishidatami | tiles",
  "shopSigns": ["4-6 short authentic local shopfront signs in local script"],
  "seasonNotes": [
    { "id": "spring", "label": "春樱", "text": "Concise 18-36 char Simplified Chinese climate/cultural note", "source": "地方气候志" }
  ],
  "occasion": {
    "id": "local_night",
    "label": "Short Simplified Chinese occasion name",
    "night": 0.88,
    "noteText": "Concise 18-36 char Simplified Chinese description of this evening or festival scene",
    "lanterns": ["#hex6", "#hex6"]
  },
  "buildingOverrides": [
    { "id": "exact building id from Notable buildings", "facade": "civic | temple | glass | office | brick | painted | timber", "roof": "gabled | hipped | flat", "wall": ["#hex6"], "roofColour": ["#hex6"] }
  ],
  "fieldNote": {
    "title": "Short Simplified Chinese architectural note title",
    "text": "25-55 char Simplified Chinese summary of this neighborhood's architectural character"
  }
}`;
}

async function callLLM(prompt, aiConfig, opts = {}) {
  const apiKey = aiConfig.apiKey.trim();
  if (aiConfig.provider === 'gemini') {
    const endpoint = `${aiConfig.apiBaseUrl.replace(/\/$/, '')}/models/${aiConfig.model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const parts = [{ text: prompt }];
    if (opts.satellitePngBase64) {
      parts.push({
        inline_data: {
          mime_type: 'image/png',
          data: opts.satellitePngBase64,
        },
      });
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.45 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const json = await res.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  const endpoint = `${aiConfig.apiBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: aiConfig.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.45,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? '';
}

function mergeCuratedCityConfig(bundle, patch, modelName) {
  if (!patch || typeof patch !== 'object') return bundle;

  const baseCity = bundle.city;
  const nextCity = {
    ...baseCity,
    styles: {
      default: { ...(baseCity.styles?.default || {}) },
      rules: Array.isArray(baseCity.styles?.rules) ? [...baseCity.styles.rules] : [],
    },
    buildings: { ...(baseCity.buildings || {}) },
    shops: { ...(baseCity.shops || {}) },
    paving: { ...(baseCity.paving || {}) },
    seasons: Array.isArray(baseCity.seasons) ? baseCity.seasons.map((s) => ({ ...s })) : [],
    occasions: Array.isArray(baseCity.occasions) ? baseCity.occasions.map((o) => ({ ...o })) : [],
    notes: Array.isArray(baseCity.notes) ? [...baseCity.notes] : [],
  };

  if (typeof patch.name === 'string' && patch.name.trim()) {
    nextCity.name = patch.name.trim().slice(0, 48);
  }
  if (typeof patch.region === 'string' && patch.region.trim()) {
    nextCity.region = patch.region.trim().slice(0, 64);
  }
  if (typeof patch.place === 'string' && patch.place.trim()) {
    nextCity.place = patch.place.trim().slice(0, 64);
  }
  if (typeof patch.title === 'string' && patch.title.trim()) {
    nextCity.title = patch.title.trim().slice(0, 64);
  }
  if (typeof patch.isoLabel === 'string' && patch.isoLabel.trim()) {
    nextCity.isoLabel = patch.isoLabel.trim().slice(0, 32);
  }

  if (patch.styleDefault && typeof patch.styleDefault === 'object') {
    const sd = patch.styleDefault;
    if (VALID_FACADES.has(sd.facade)) nextCity.styles.default.facade = sd.facade;
    if (VALID_ROOFS.has(sd.roof)) nextCity.styles.default.roof = sd.roof;
    if (VALID_ROOF_TEX.has(sd.roofTex)) nextCity.styles.default.roofTex = sd.roofTex;
    const walls = safeHexList(sd.wall, 6);
    if (walls) nextCity.styles.default.wall = walls;
    const roofCols = safeHexList(sd.roofColour, 6);
    if (roofCols) nextCity.styles.default.roofColour = roofCols;
  }

  if (VALID_PAVING.has(patch.pavingStyle)) {
    nextCity.paving.style = patch.pavingStyle;
  }

  if (Array.isArray(patch.shopSigns)) {
    const signs = patch.shopSigns
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => s.trim().slice(0, 16))
      .slice(0, 8);
    if (signs.length >= 2) {
      nextCity.shops.signs = signs;
    }
  }

  if (Array.isArray(patch.seasonNotes)) {
    const byId = new Map(
      patch.seasonNotes
        .filter((item) => item && typeof item.id === 'string')
        .map((item) => [item.id, item])
    );
    nextCity.seasons = nextCity.seasons.map((season) => {
      const update = byId.get(season.id);
      if (!update) return season;
      return {
        ...season,
        label: typeof update.label === 'string' && update.label.trim() ? update.label.trim().slice(0, 16) : season.label,
        note: {
          text: typeof update.text === 'string' && update.text.trim() ? update.text.trim().slice(0, 140) : season.note?.text || '',
          source: typeof update.source === 'string' && update.source.trim() ? update.source.trim().slice(0, 40) : `AI 策展 · ${modelName}`,
          url: season.note?.url || 'https://www.openstreetmap.org/',
        },
      };
    });
  }

  if (patch.occasion && typeof patch.occasion === 'object' && typeof patch.occasion.label === 'string') {
    const occ = patch.occasion;
    const lanterns = safeHexList(occ.lanterns, 4);
    const curatedOccasion = {
      id: typeof occ.id === 'string' && occ.id.trim() ? occ.id.trim().slice(0, 24) : 'ai_occasion',
      label: occ.label.trim().slice(0, 20),
      leaves: 'summer',
      night: typeof occ.night === 'number' ? Math.max(0, Math.min(1, occ.night)) : 0.88,
      litShare: 0.65,
      crowd: 1.4,
      decor: lanterns ? { lanterns } : undefined,
      note: {
        text: typeof occ.noteText === 'string' && occ.noteText.trim() ? occ.noteText.trim().slice(0, 140) : `${nextCity.name} 特色夜间风貌。`,
        source: `AI 策展 · ${modelName}`,
        url: 'https://www.openstreetmap.org/',
      },
    };
    if (nextCity.occasions.length > 0) {
      nextCity.occasions[0] = curatedOccasion;
    } else {
      nextCity.occasions.push(curatedOccasion);
    }
  }

  if (Array.isArray(patch.buildingOverrides)) {
    const validIds = new Set((bundle.scene?.buildings || []).map((b) => b.id));
    for (const ov of patch.buildingOverrides) {
      if (!ov || typeof ov.id !== 'string' || !validIds.has(ov.id)) continue;
      const entry = {};
      if (VALID_FACADES.has(ov.facade)) entry.facade = ov.facade;
      if (VALID_ROOFS.has(ov.roof)) entry.roof = ov.roof;
      const w = safeHexList(ov.wall, 3);
      if (w) entry.wall = w;
      const rc = safeHexList(ov.roofColour, 3);
      if (rc) entry.roofColour = rc;
      if (Object.keys(entry).length > 0) {
        nextCity.buildings[ov.id] = { ...(nextCity.buildings[ov.id] || {}), ...entry };
      }
    }
  }

  if (patch.fieldNote && typeof patch.fieldNote.text === 'string' && patch.fieldNote.text.trim()) {
    nextCity.notes.unshift({
      title:
        typeof patch.fieldNote.title === 'string' && patch.fieldNote.title.trim()
          ? patch.fieldNote.title.trim().slice(0, 36)
          : `AI 策展手记 · ${modelName}`,
      text: patch.fieldNote.text.trim().slice(0, 220),
    });
  }

  return {
    ...bundle,
    city: nextCity,
  };
}

export async function curatePocketBundle(bundle, requestAiConfig, opts = {}) {
  const aiConfig = resolveServerAIConfig(requestAiConfig);
  if (!aiConfig) {
    return { bundle, aiUsed: false };
  }

  try {
    const prompt = buildCuratorPrompt(bundle);
    const rawText = await Promise.race([
      callLLM(prompt, aiConfig, opts),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI curation timeout')), 10000)
      ),
    ]);

    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      return { bundle, aiUsed: false };
    }

    const parsed = JSON.parse(match[0]);
    const nextBundle = mergeCuratedCityConfig(bundle, parsed, aiConfig.model || 'LLM');
    return { bundle: nextBundle, aiUsed: true };
  } catch (err) {
    console.warn('[aiCurator] Skipped LLM curation:', err instanceof Error ? err.message : err);
    return { bundle, aiUsed: false };
  }
}
