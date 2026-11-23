import type { AIConfig, BuildingArchetype, DioramaSceneData } from '../types/city';

const STORAGE_KEY = 'pocket_city_ai_config_v1';

export function loadAIConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as AIConfig;
    }
  } catch {
    // ignore storage errors
  }
  return {
    enabled: false,
    provider: 'openai',
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  };
}

export function saveAIConfig(config: AIConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage errors
  }
}

interface AIEnrichmentResult {
  subtitle?: string;
  note?: string;
  climateNote?: string;
  landmarkOverrides?: Array<{
    name: string;
    archetype: BuildingArchetype;
  }>;
}

export async function enrichSceneWithAI(
  scene: DioramaSceneData,
  config: AIConfig
): Promise<DioramaSceneData> {
  if (!config.enabled || !config.apiKey.trim()) {
    return scene;
  }

  const buildingNames = scene.buildings
    .map((b) => b.name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 12);
  const roadNames = Array.from(
    new Set(scene.roads.map((r) => r.name).filter((n): n is string => Boolean(n)))
  ).slice(0, 8);
  const waterNames = Array.from(
    new Set(scene.waters.map((w) => w.name).filter((n): n is string => Boolean(n)))
  ).slice(0, 4);

  const prompt = `你是“Pocket City 微缩城市画境”的地理文化策展人。请根据以下真实地图切片信息，输出一段简短优雅的中文地理文化注释，并判断是否有需要特殊古建/地标造型的建筑。

城市/区域: ${scene.meta.region} · ${scene.meta.city}
坐标: ${scene.meta.lat.toFixed(5)}, ${scene.meta.lng.toFixed(5)}
水系: ${waterNames.join(', ') || '无明显水系'}
道路: ${roadNames.join(', ') || '街区道路'}
建筑/地标: ${buildingNames.join(', ') || '普通城市街区'}

请严格返回如下 JSON（不要包含 Markdown 代码块之外的多余解释）：
{
  "subtitle": "8-14字的诗意副标题，例如：安顺廊桥·锦江两岸",
  "note": "一句不超过28字的当地风貌或游览短评",
  "climateNote": "一句不超过24字的当地气候特征描述",
  "landmarkOverrides": [
    { "name": "完全匹配的建筑名", "archetype": "pavilion | tower | covered_bridge | pitched | modern" }
  ]
}`;

  try {
    let rawText = '';

    if (config.provider === 'gemini') {
      const endpoint = `${config.apiBaseUrl.replace(/\/$/, '')}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey.trim())}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5 },
        }),
      });
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
      const json = await res.json();
      rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } else {
      const endpoint = `${config.apiBaseUrl.replace(/\/$/, '')}/chat/completions`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
      const json = await res.json();
      rawText = json?.choices?.[0]?.message?.content ?? '';
    }

    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return scene;
    const parsed = JSON.parse(match[0]) as AIEnrichmentResult;

    const updatedBuildings = scene.buildings.map((b) => {
      if (!b.name || !parsed.landmarkOverrides) return b;
      const found = parsed.landmarkOverrides.find((o) => o.name === b.name);
      if (!found) return b;
      return { ...b, archetype: found.archetype };
    });

    return {
      ...scene,
      meta: {
        ...scene.meta,
        subtitle: parsed.subtitle || scene.meta.subtitle,
        note: parsed.note || scene.meta.note,
        noteSource: `AI 策展 · ${config.model}`,
        climateNote: parsed.climateNote || scene.meta.climateNote,
      },
      buildings: updatedBuildings,
    };
  } catch (err) {
    console.warn('AI enrichment skipped:', err);
    return scene;
  }
}
