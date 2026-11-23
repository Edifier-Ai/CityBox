/**
 * Regional PocketCityConfig synthesizer for live OpenStreetMap extractions.
 * Produces a region-authentic, climate-accurate PocketCityConfig compatible with
 * src/engine/pocketKit/city.js and src/types/pocketCity.ts.
 */

const HISTORIC_JAPAN_RE = /\b(kyoto|nara|kanazawa|takayama|kurashiki|kamakura|nikko|uji|ise)\b|京都|奈良|金沢|金泽|鎌倉|镰仓|日光|宇治/i;
const MODERN_JAPAN_RE = /\b(tokyo|shibuya|shinjuku|ginza|roppongi|osaka|yokohama|nagoya|fukuoka|sapporo)\b|东京|東京|涉谷|涩谷|渋谷|新宿|银座|大阪|横滨|神户|福冈|札幌|名古屋/i;
const HISTORIC_CHINA_RE = /\b(suzhou|hangzhou|lijiang|pingyao|fenghuang|wuzhen|zhouzhuang|chengdu|xi'an|xian|dali|guilin)\b|苏州|杭州|丽江|平遥|乌镇|周庄|成都|西安|大理|桂林|凤凰/i;
const MODERN_CHINA_RE = /\b(shanghai|shenzhen|beijing|guangzhou|hong kong|taipei|chongqing)\b|上海|深圳|北京|广州|香港|台北|重庆/i;

const PROFILE_LABELS = {
  japan_historic: '日本古都町屋',
  japan_modern: '日本现代都会',
  east_asia_historic: '东方水岸街区',
  east_asia_modern: '东亚现代都会',
  korea_modern: '韩国都会街区',
  southeast_asia: '南洋骑楼街区',
  canal_europe: '欧洲运河街区',
  mediterranean: '地中海海港',
  europe_classic: '欧陆古典街区',
  global_metro: '国际都会街区',
};

function computeSceneStats(scene) {
  const buildings = Array.isArray(scene?.buildings) ? scene.buildings : [];
  const water = Array.isArray(scene?.water) ? scene.water : [];
  const trees = Array.isArray(scene?.trees) ? scene.trees : [];
  const pois = Array.isArray(scene?.pois) ? scene.pois : [];
  const boats = Array.isArray(scene?.boats) ? scene.boats : [];
  const centerlines = Array.isArray(scene?.centerlines) ? scene.centerlines : [];
  const bridges = Array.isArray(scene?.bridges) ? scene.bridges : [];
  const tunnels = Array.isArray(scene?.tunnels) ? scene.tunnels : [];

  let tallCount = 0;
  let maxLevels = 0;
  let famousBuilding = null;
  let waterTarget = null;
  let poiTarget = null;
  let bridgeTarget = null;
  let tunnelTarget = null;

  for (const b of buildings) {
    const lv = Number(b.lv) || (b.h ? b.h / 3.2 : 0);
    if (lv >= 5) tallCount += 1;
    if (lv > maxLevels) maxLevels = lv;
    if (!famousBuilding && (b.famous || b.n) && b.obb?.c) {
      famousBuilding = b;
    }
  }

  if (water.length > 0 && Array.isArray(water[0]?.[0]) && water[0][0].length > 0) {
    const ring = water[0][0];
    let sx = 0;
    let sy = 0;
    for (const [x, y] of ring) {
      sx += x;
      sy += y;
    }
    waterTarget = [Number((sx / ring.length).toFixed(1)), Number((sy / ring.length).toFixed(1))];
  }

  if (pois.length > 0) {
    poiTarget = [Number(pois[0].x.toFixed(1)), Number(pois[0].y.toFixed(1))];
  } else if (centerlines.length > 0 && centerlines[0]?.p?.length) {
    const mid = centerlines[0].p[Math.floor(centerlines[0].p.length / 2)];
    poiTarget = [Number(mid[0].toFixed(1)), Number(mid[1].toFixed(1))];
  }

  if (bridges.length > 0) {
    const pick =
      bridges.find((b) => b.kind === 'monorail') ||
      bridges.find((b) => b.kind === 'footbridge') ||
      bridges[0];
    if (pick?.p?.length) {
      const mid = pick.p[Math.floor(pick.p.length / 2)];
      bridgeTarget = [Number(mid[0].toFixed(1)), Number(mid[1].toFixed(1))];
    }
  }
  if (tunnels.length > 0) {
    const tu = tunnels.find((t) => t.portals?.length) || tunnels[0];
    if (tu?.portals?.length) {
      tunnelTarget = [Number(tu.portals[0].x.toFixed(1)), Number(tu.portals[0].y.toFixed(1))];
    } else if (tu?.p?.length) {
      const mid = tu.p[Math.floor(tu.p.length / 2)];
      tunnelTarget = [Number(mid[0].toFixed(1)), Number(mid[1].toFixed(1))];
    }
  }

  return {
    buildingCount: buildings.length,
    treeCount: trees.length,
    hasWater: water.length > 0,
    hasBoats: boats.length > 0,
    poiCount: pois.length,
    bridgeCount: bridges.length,
    tunnelCount: tunnels.length,
    tallRatio: buildings.length ? tallCount / buildings.length : 0,
    maxLevels,
    famousBuilding,
    waterTarget,
    poiTarget,
    bridgeTarget,
    tunnelTarget,
  };
}

function detectRegionalProfile(scene, geocodeMeta, stats) {
  const lat = Number(scene?.meta?.lat) || 0;
  const lon = Number(scene?.meta?.lon) || 0;
  const cc = String(geocodeMeta?.countryCode || geocodeMeta?.country_code || '').toLowerCase();
  const hay = `${scene?.meta?.place || ''} ${geocodeMeta?.place || ''} ${geocodeMeta?.city || ''} ${geocodeMeta?.region || ''} ${geocodeMeta?.country || ''}`;

  const isJapan = cc === 'jp' || (lat >= 24 && lat <= 46 && lon >= 122 && lon <= 146 && !/korea|seoul|busan|taiwan|taipei|韩国|首尔|釜山|台湾|台北/i.test(hay));
  if (isJapan) {
    const isHistoric =
      HISTORIC_JAPAN_RE.test(hay) ||
      (!MODERN_JAPAN_RE.test(hay) && stats.tallRatio < 0.12 && stats.maxLevels <= 6);
    return isHistoric ? 'japan_historic' : 'japan_modern';
  }

  const isKorea = cc === 'kr' || /\b(korea|seoul|busan|incheon|gyeongju)\b|서울|부산|한국|韩国|首尔|釜山|仁川|庆州/i.test(hay);
  const isChinaOrTw = ['cn', 'tw', 'hk', 'mo'].includes(cc) || (lat >= 18 && lat <= 54 && lon >= 73 && lon <= 135);
  if (isKorea || isChinaOrTw) {
    const isHistoric =
      !isKorea &&
      (HISTORIC_CHINA_RE.test(hay) ||
        (!MODERN_CHINA_RE.test(hay) && stats.hasWater && stats.tallRatio < 0.15));
    if (isKorea) return 'korea_modern';
    return isHistoric ? 'east_asia_historic' : 'east_asia_modern';
  }

  const isSEAsia =
    ['sg', 'my', 'th', 'vn', 'id', 'ph'].includes(cc) ||
    (lat >= -10 && lat <= 22 && lon >= 94 && lon <= 128);
  if (isSEAsia) return 'southeast_asia';

  const isCanalEurope =
    ['nl', 'be', 'dk'].includes(cc) ||
    (lat >= 50.5 && lat <= 54.5 && lon >= 3.0 && lon <= 8.2);
  if (isCanalEurope) return 'canal_europe';

  const isMediterranean =
    ['it', 'es', 'pt', 'gr', 'hr', 'mt'].includes(cc) ||
    (lat >= 35.0 && lat <= 44.8 && lon >= -9.5 && lon <= 26.5);
  if (isMediterranean) return 'mediterranean';

  const isEuropeClassic =
    ['fr', 'gb', 'uk', 'de', 'at', 'ch', 'se', 'no', 'fi', 'pl', 'cz', 'ie'].includes(cc) ||
    (lat >= 44.8 && lat <= 68.0 && lon >= -11.0 && lon <= 32.0);
  if (isEuropeClassic) return 'europe_classic';

  return 'global_metro';
}

const REGION_PROFILES = {
  japan_historic: {
    timezone: 'Asia/Tokyo',
    level: 2.9,
    defaultStyle: {
      facade: 'timber',
      wall: ['#f1e7d0', '#e9ddc4', '#dfd3bb'],
      roof: 'gabled',
      ridge: 'street',
      pitch: 24,
      roofColour: ['#7c7f88', '#74767e', '#83858c'],
      roofTex: 'kawara',
      eaves: 0.6,
      levels: 2,
      floor: 2.9,
      eave1: true,
      eave1Depth: 0.8,
      wood: '#624534',
      slat: '#8a684b',
      noren: ['#2b4a6f', '#7e3737', '#cfb274', '#375f48'],
      shop: 'poi',
      awning: false,
      maxSpan: 14,
      flatRoof: '#d0c9bd',
      rectFill: 0.66,
    },
    palette: {
      ground: '#ebe1ca',
      road: '#b3acb0',
      pavement: '#e5dac4',
      walk: '#ded4bf',
      grass: '#b7d584',
      water: '#8cbcc0',
      sand: '#e7d7b4',
      quay: '#d8cbb5',
      slab: '#d9c7a5',
      marking: '#f5efe3',
      kerb: '#dad0bb',
      paving: '#cbbfac',
      rail: '#6a6868',
    },
    paving: { style: 'ishidatami', size: 0.45 },
    shops: {
      signs: ['京菓子', '甘味処', 'お茶', '茶房', '和雑貨'],
      font: "'Hiragino Mincho ProN','Yu Mincho',serif",
      fascias: ['#5e4634', '#3d4a53', '#6f3a32', '#4c5c47'],
      awnings: ['#706a61', '#8f5843', '#516657'],
    },
    taxi: { share: 0.25, colours: ['#2a2c34', '#e9e5d7', '#568560'], kind: 'sedan', sign: '#faeaa2' },
    tropical: false,
    snowCapable: true,
    springBlossom: true,
    occasion: {
      id: 'lantern_sakura',
      label: '夜桜灯影',
      leaves: 'blossom',
      night: 0.88,
      litShare: 0.62,
      crowd: 1.45,
      petals: true,
      decor: { litTrees: 'Bank tree|Park tree|Garden tree', lanterns: ['#f6ebd0', '#e89d6b', '#d96452'] },
      noteText: '入夜后町屋与行灯依次点亮，沿街与水畔樱枝在暖光下映出柔和倒影。',
    },
  },

  japan_modern: {
    timezone: 'Asia/Tokyo',
    level: 3.3,
    defaultStyle: {
      facade: 'stucco',
      wall: ['#ece6da', '#e2ddd3', '#d8d4cc', '#f0ece2'],
      roof: 'flat',
      ridge: 'street',
      pitch: 18,
      roofColour: ['#70757d', '#86898f', '#60646c'],
      roofTex: 'tiles',
      eaves: 0.35,
      levels: 4,
      floor: 3.3,
      shop: 'street',
      shopHeight: 3.5,
      awning: 'some',
      awnings: ['#3b4d63', '#8c4b41', '#4d6b59', '#6e6a63'],
      maxSpan: 20,
      flatRoof: '#cfcac0',
      rectFill: 0.68,
    },
    palette: {
      ground: '#e6dfd1',
      road: '#a19fa4',
      pavement: '#dfd9cc',
      walk: '#d7d1c5',
      grass: '#a8ca7c',
      water: '#85b8bf',
      sand: '#e4d5b4',
      quay: '#d2c7b4',
      slab: '#d0c4ae',
      marking: '#f6f2e8',
      kerb: '#cfc7b8',
      paving: '#bfb7a8',
      rail: '#5d6068',
    },
    paving: { style: 'tiles', size: 0.55 },
    shops: {
      signs: ['珈琲', '書店', '薬局', '洋食', '居酒屋', '花屋'],
      font: "'Hiragino Sans','Yu Gothic',sans-serif",
      fascias: ['#2f3845', '#5c4638', '#3c5448', '#6f3e37'],
      awnings: ['#3b4d63', '#8c4b41', '#4d6b59'],
    },
    taxi: { share: 0.28, colours: ['#2b2e36', '#e8c44d', '#588261'], kind: 'sedan', sign: '#faeaa2' },
    tropical: false,
    snowCapable: true,
    springBlossom: true,
    occasion: {
      id: 'neon_evening',
      label: '都市夜巡',
      leaves: 'summer',
      night: 0.9,
      litShare: 0.72,
      crowd: 1.5,
      decor: { fairy: ['#ffd98a', '#f2a463', '#9fd2e6'] },
      noteText: '夜幕降临后街区橱窗、路灯与写字楼窗格齐亮，展现高密度都会夜间脉动。',
    },
  },

  east_asia_historic: {
    timezone: 'Asia/Shanghai',
    level: 3.1,
    defaultStyle: {
      facade: 'timber',
      wall: ['#efe8d8', '#e6decb', '#dcd4c2'],
      roof: 'gabled',
      ridge: 'street',
      pitch: 24,
      roofColour: ['#6c7078', '#5e626a', '#7c7e84'],
      roofTex: 'kawara',
      eaves: 0.65,
      levels: 2,
      floor: 3.1,
      eave1: true,
      eave1Depth: 0.8,
      wood: '#6b4936',
      slat: '#8f6c4f',
      noren: ['#9e3b33', '#39576e', '#c9a45c'],
      shop: 'street',
      awning: false,
      maxSpan: 16,
      flatRoof: '#cfc9be',
      rectFill: 0.65,
    },
    palette: {
      ground: '#ebe1cc',
      road: '#aba6aa',
      pavement: '#e3d8c2',
      walk: '#dcd0b8',
      grass: '#b0ce7f',
      water: '#83b7bd',
      sand: '#e7d7b4',
      quay: '#d6cab4',
      slab: '#d6c4a4',
      marking: '#f5efe3',
      kerb: '#d5cbb6',
      paving: '#c7baa5',
      rail: '#686666',
    },
    paving: { style: 'ishidatami', size: 0.5 },
    shops: {
      signs: ['茶馆', '书局', '酒家', '点心', '药铺'],
      font: "'PingFang SC','Songti SC',serif",
      fascias: ['#5b3d32', '#394b54', '#723a32', '#4a5a47'],
      awnings: ['#9b4f41', '#4f6d63', '#b58b4c'],
    },
    taxi: { share: 0.18, colours: ['#3f7868', '#e2b949', '#323842'], kind: 'sedan', sign: '#faeaa2' },
    tropical: false,
    snowCapable: false,
    springBlossom: false,
    occasion: {
      id: 'lantern_night',
      label: '华灯映水',
      leaves: 'summer',
      night: 0.88,
      litShare: 0.62,
      crowd: 1.45,
      decor: { lanterns: ['#d94d3a', '#f2b84b', '#e67838'], fairy: ['#ffd98a', '#f2b84b'] },
      noteText: '灯笼与沿街窗光映照青瓦木构与石板步道，重现东方水岸夜色。',
    },
  },

  east_asia_modern: {
    timezone: 'Asia/Shanghai',
    level: 3.3,
    defaultStyle: {
      facade: 'stucco',
      wall: ['#ede6d8', '#e3dcd0', '#d8d2c6'],
      roof: 'flat',
      ridge: 'street',
      pitch: 18,
      roofColour: ['#74787f', '#898b90'],
      roofTex: 'tiles',
      eaves: 0.35,
      levels: 4,
      floor: 3.3,
      shop: 'street',
      shopHeight: 3.6,
      awning: 'some',
      awnings: ['#3b5469', '#8c4b41', '#4d6b59'],
      maxSpan: 22,
      flatRoof: '#d0cac0',
      rectFill: 0.66,
    },
    palette: {
      ground: '#e8e0cf',
      road: '#a5a2a8',
      pavement: '#e2d9c8',
      walk: '#dad1c0',
      grass: '#acd080',
      water: '#86b9be',
      sand: '#e5d6b4',
      quay: '#d5c9b4',
      slab: '#d4c6ad',
      marking: '#f5efe3',
      kerb: '#d3c9b7',
      paving: '#c4baa8',
      rail: '#62646a',
    },
    paving: { style: 'tiles', size: 0.6 },
    shops: {
      signs: ['咖啡', '书店', '茶室', '烘焙', '画廊'],
      font: "'PingFang SC','Microsoft YaHei',sans-serif",
      fascias: ['#3c4b58', '#5e4438', '#445c4b', '#6f3e38'],
      awnings: ['#4a6375', '#965143', '#4f6d63'],
    },
    taxi: { share: 0.22, colours: ['#397365', '#426b96', '#e6bd4c'], kind: 'sedan', sign: '#faeaa2' },
    tropical: false,
    snowCapable: false,
    springBlossom: false,
    occasion: {
      id: 'city_night',
      label: '璀璨街夜',
      leaves: 'summer',
      night: 0.88,
      litShare: 0.68,
      crowd: 1.4,
      decor: { fairy: ['#ffe09a', '#f2b84b'] },
      noteText: '傍晚街灯与临街商铺同步亮灯，展现都市街区的夜间活力。',
    },
  },

  korea_modern: {
    timezone: 'Asia/Seoul',
    level: 3.2,
    defaultStyle: {
      facade: 'brick',
      wall: ['#e9dfd0', '#dfceb8', '#d7c8b6', '#ece5d8'],
      roof: 'flat',
      ridge: 'street',
      pitch: 20,
      roofColour: ['#6d7279', '#827c75'],
      roofTex: 'tiles',
      eaves: 0.35,
      levels: 4,
      floor: 3.2,
      shop: 'street',
      shopHeight: 3.5,
      awning: 'some',
      awnings: ['#3b4e63', '#8a5244', '#506b5a'],
      maxSpan: 18,
      flatRoof: '#d0c9be',
      rectFill: 0.66,
    },
    palette: {
      ground: '#eae1cf',
      road: '#a7a3a7',
      pavement: '#e3d9c8',
      walk: '#dbd1bf',
      grass: '#add080',
      water: '#86b9be',
      sand: '#e5d6b4',
      quay: '#d5c9b4',
      slab: '#d4c6ad',
      marking: '#f5efe3',
      kerb: '#d3c9b7',
      paving: '#c4baa8',
      rail: '#62646a',
    },
    paving: { style: 'tiles', size: 0.55 },
    shops: {
      signs: ['카페', '서점', '베이커리', '식당', '꽃집'],
      font: "'Apple SD Gothic Neo','Malgun Gothic',sans-serif",
      fascias: ['#3c4b58', '#5c4638', '#485c4b', '#6d3e38'],
      awnings: ['#4a6375', '#965143', '#4f6d63'],
    },
    taxi: { share: 0.24, colours: ['#e6883c', '#e6e4dc', '#333740'], kind: 'sedan', sign: '#faeaa2' },
    tropical: false,
    snowCapable: true,
    springBlossom: true,
    occasion: {
      id: 'seoul_night',
      label: '首尔夜游',
      leaves: 'summer',
      night: 0.88,
      litShare: 0.66,
      crowd: 1.4,
      decor: { fairy: ['#ffe09a', '#f2b84b'] },
      noteText: '夜幕下咖啡馆与街区暖光次第点亮，行人与车灯穿行于街巷之间。',
    },
  },

  southeast_asia: {
    timezone: 'Asia/Singapore',
    level: 3.4,
    defaultStyle: {
      facade: 'shophouse',
      wall: ['#f3dfb8', '#d9e6dc', '#efd3c9', '#dfe4ee', '#f2e8cf'],
      roof: 'gabled',
      ridge: 'street',
      pitch: 24,
      roofColour: ['#a85842', '#b9674c', '#8e4d3b'],
      roofTex: 'pantile',
      eaves: 0.55,
      eave1: true,
      eave1Depth: 0.9,
      levels: 3,
      floor: 3.4,
      shop: 'street',
      shopHeight: 3.8,
      awning: 'some',
      awnings: ['#3b6b64', '#b55644', '#c99b44', '#465d78'],
      maxSpan: 16,
      flatRoof: '#d6cbb9',
      rectFill: 0.64,
    },
    palette: {
      ground: '#ede2c9',
      road: '#aba4a6',
      pavement: '#e7dac2',
      walk: '#e0d2b8',
      grass: '#9fd073',
      water: '#78bec2',
      sand: '#ead9b3',
      quay: '#d9cbb3',
      slab: '#d8c5a2',
      marking: '#f6f0e4',
      kerb: '#d8ceba',
      paving: '#cabba3',
      rail: '#686666',
    },
    paving: { style: 'tiles', size: 0.5 },
    shops: {
      signs: ['KOPI', 'BAKERY', 'TEA', 'KEDAI', 'BISTRO'],
      font: 'system-ui, -apple-system, sans-serif',
      fascias: ['#2f5a54', '#7a3e35', '#3e4f63', '#6b5336'],
      awnings: ['#3b6b64', '#b55644', '#c99b44'],
    },
    taxi: { share: 0.22, colours: ['#326eb8', '#e6b83c', '#2c3038'], kind: 'sedan', sign: '#faeaa2' },
    tropical: true,
    snowCapable: false,
    springBlossom: false,
    occasion: {
      id: 'night_market',
      label: '南洋夜市',
      leaves: 'summer',
      night: 0.86,
      litShare: 0.65,
      crowd: 1.55,
      decor: { lanterns: ['#e35442', '#f2bd48', '#4da37e'], bunting: ['#e35442', '#f2bd48', '#4da37e', '#f5efe3'] },
      noteText: '骑楼骑廊与缤纷灯串在热带夜晚点亮，街市氛围热烈鲜活。',
    },
  },

  canal_europe: {
    timezone: 'Europe/Amsterdam',
    level: 3.0,
    defaultStyle: {
      facade: 'brick',
      wall: ['#7c5442', '#8f5d47', '#6a483a', '#a37159', '#5a423a', '#b78968'],
      roof: 'gabled',
      ridge: 'short',
      pitch: 34,
      roofColour: ['#585a62', '#6a6560', '#7e4e41'],
      roofTex: 'tiles',
      eaves: 0.25,
      levels: 4,
      floor: 3.0,
      shop: 'poi',
      awning: 'some',
      awnings: ['#2e4c63', '#8a463a', '#486350'],
      maxSpan: 14,
      flatRoof: '#cfc6b8',
      rectFill: 0.64,
    },
    palette: {
      ground: '#eae0ca',
      road: '#a89fa3',
      pavement: '#e2d5bf',
      walk: '#dcd0b8',
      grass: '#aad07a',
      water: '#7ab2ba',
      sand: '#e5d6b4',
      quay: '#cfc2ad',
      slab: '#d3c2a3',
      marking: '#f5efe3',
      kerb: '#d5cbb6',
      paving: '#c2b39f',
      rail: '#656568',
    },
    paving: { style: 'grid', size: 0.45 },
    shops: {
      signs: ['Bakkerij', 'Koffie', 'Boeken', 'Café', 'Kaas'],
      font: 'Georgia, serif',
      fascias: ['#2f4a5c', '#5b3c33', '#3c5746'],
      awnings: ['#2e4c63', '#8a463a', '#486350'],
    },
    taxi: { share: 0.14, colours: ['#2c3038', '#f2f2ee', '#3d5873'], kind: 'sedan', sign: '#faeaa2' },
    tropical: false,
    snowCapable: true,
    springBlossom: false,
    occasion: {
      id: 'canal_festival',
      label: '运河庆典',
      leaves: 'summer',
      crowd: 1.5,
      decor: { bunting: ['#e87a24', '#d94d3a', '#3568a8', '#f5efe3'] },
      dress: { colours: ['#e87a24', '#3568a8', '#f5efe3'], share: 0.45 },
      noteText: '沿河砖砌山墙挂起彩旗，岸边行人身着明快节庆服饰漫步水畔。',
    },
  },

  mediterranean: {
    timezone: 'Europe/Rome',
    level: 3.1,
    defaultStyle: {
      facade: 'painted',
      wall: ['#f5c460', '#f1a672', '#e27351', '#f7d785', '#edb19b', '#f4e4c1'],
      shutters: ['#337446', '#3e844d', '#2b6a48'],
      roof: 'hipped',
      ridge: 'long',
      pitch: 20,
      roofColour: ['#b8704f', '#a96749', '#a59e95', '#cb7753'],
      roofTex: 'pantile',
      eaves: 0.35,
      levels: 4,
      floor: 3.1,
      shop: 'poi',
      awning: 'some',
      awnings: ['#295f90', '#f3ead6', '#337446'],
      maxSpan: 18,
      flatRoof: '#d1c7b3',
      rectFill: 0.62,
    },
    palette: {
      ground: '#ebdfc4',
      road: '#beb3ac',
      pavement: '#e9d9bc',
      walk: '#e5d3b3',
      grass: '#b3d57d',
      water: '#7ac4ce',
      sand: '#ebd9b2',
      quay: '#dccbb0',
      slab: '#dac49c',
      marking: '#f5efe3',
      kerb: '#e0d1b5',
      paving: '#ccba9d',
      rail: '#6a6868',
    },
    paving: { style: 'slabs', size: 0.7 },
    shops: {
      signs: ['BAR', 'GELATERIA', 'TRATTORIA', 'CAFÉ', 'LIBRERIA'],
      font: 'Georgia, serif',
      fascias: ['#2c4b5e', '#6f3a32', '#375f48'],
      awnings: ['#295f90', '#f3ead6', '#337446'],
    },
    taxi: { share: 0.14, colours: ['#f2f2ee', '#e8e2d5', '#2e333c'], kind: 'small', sign: '#faeaa2' },
    tropical: false,
    evergreenWinter: true,
    snowCapable: false,
    springBlossom: false,
    occasion: {
      id: 'harbour_evening',
      label: '地中海夏夜',
      leaves: 'summer',
      night: 0.85,
      litShare: 0.58,
      crowd: 1.35,
      decor: { fairy: ['#ffe09a', '#f7c56e'] },
      noteText: '日暮后海港灯火与露天咖啡座暖光亮起，水波映出微光。',
    },
  },

  europe_classic: {
    timezone: 'Europe/Paris',
    level: 3.2,
    defaultStyle: {
      facade: 'stucco',
      wall: ['#efe7d6', '#e6dcc9', '#ded2bc', '#e9dfd0'],
      roof: 'hipped',
      ridge: 'long',
      pitch: 24,
      roofColour: ['#6f737d', '#7c7f88', '#8c5b49'],
      roofTex: 'slate',
      eaves: 0.4,
      levels: 4,
      floor: 3.2,
      shop: 'poi',
      awning: 'some',
      awnings: ['#8f433c', '#3d586e', '#4f6d63'],
      maxSpan: 17,
      flatRoof: '#d2cabd',
      rectFill: 0.64,
    },
    palette: {
      ground: '#ece2cd',
      road: '#afa9ad',
      pavement: '#e5dac4',
      walk: '#dfd4be',
      grass: '#b2d282',
      water: '#86b8bf',
      sand: '#e7d7b4',
      quay: '#d7cab3',
      slab: '#d6c6a7',
      marking: '#f5efe3',
      kerb: '#d8ceba',
      paving: '#cabca7',
      rail: '#69686a',
    },
    paving: { style: 'slabs', size: 0.6 },
    shops: {
      signs: ['CAFÉ', 'BOULANGERIE', 'LIBRAIRIE', 'BISTRO', 'FLEURS'],
      font: 'Georgia, serif',
      fascias: ['#404d5a', '#6b3e38', '#465b49', '#5a4738'],
      awnings: ['#8f433c', '#3d586e', '#4f6d63'],
    },
    taxi: { share: 0.16, colours: ['#2f333b', '#f2f2ee', '#6e7680'], kind: 'sedan', sign: '#faeaa2' },
    tropical: false,
    snowCapable: true,
    springBlossom: false,
    occasion: {
      id: 'twilight_stroll',
      label: '暮色漫步',
      leaves: 'summer',
      night: 0.86,
      litShare: 0.56,
      crowd: 1.3,
      decor: { fairy: ['#ffe09a', '#f2c06b'] },
      noteText: '欧式石砌立面与街角路灯在夜色中渐次亮起，咖啡座飘散暖黄微光。',
    },
  },

  global_metro: {
    timezone: 'UTC',
    level: 3.2,
    defaultStyle: {
      facade: 'stucco',
      wall: ['#f0e8d9', '#e7decb', '#ddd3c0', '#d8cfc0'],
      roof: 'gabled',
      ridge: 'street',
      pitch: 22,
      roofColour: ['#8c5b49', '#736f6e', '#6c7278'],
      roofTex: 'tiles',
      eaves: 0.42,
      levels: 3,
      floor: 3.2,
      shop: 'poi',
      awning: 'some',
      awnings: ['#9b4f41', '#4f6d63', '#5a6375'],
      maxSpan: 16,
      flatRoof: '#d4ccc0',
      rectFill: 0.65,
    },
    palette: {
      ground: '#ece3cf',
      road: '#ada8ac',
      pavement: '#e5dac5',
      walk: '#dfd5c0',
      grass: '#b6d383',
      water: '#8bbbc2',
      sand: '#e7d7b4',
      quay: '#d8cbb5',
      slab: '#d7c7a8',
      marking: '#f5efe3',
      kerb: '#d8ceba',
      paving: '#cbbda8',
      rail: '#6a6868',
    },
    paving: { style: 'slabs', size: 0.6 },
    shops: {
      signs: ['Café', 'Bakery', 'Books', 'Market', 'Bistro'],
      font: 'system-ui, -apple-system, sans-serif',
      fascias: ['#5c4738', '#3e4e58', '#6e3f38', '#485b49'],
      awnings: ['#9b4f41', '#4f6d63', '#5a6375', '#b58b4c'],
    },
    taxi: { share: 0.16, colours: ['#f0c94d', '#2b2e36'], kind: 'sedan', sign: '#faeaa2' },
    tropical: false,
    snowCapable: true,
    springBlossom: false,
    occasion: {
      id: 'night_tour',
      label: '夜游街区',
      leaves: 'summer',
      night: 0.85,
      litShare: 0.55,
      crowd: 1.25,
      noteText: '夜幕降临后街灯与建筑窗格亮起暖光，呈现街区的夜晚风貌。',
    },
  },
};

function buildTreeRules(profile) {
  if (profile.tropical) {
    return {
      default: { style: 3, colours: ['#6fa555', '#82b660'], height: 8, evergreen: true },
      rules: [
        { match: 'Woodland', style: 2, evergreen: true, colours: ['#5d9148', '#6ea154', '#7db05e'], height: 10, vary: 0.35 },
        { match: 'Park tree', style: 3, evergreen: true, colours: ['#72a856', '#88ba64'], height: 8.5, vary: 0.3 },
        { match: 'Bank tree', style: 7, evergreen: true, colours: ['#6c9f52', '#82b360'], height: 9, vary: 0.3 },
        { match: 'Garden tree', style: 1, evergreen: true, colours: ['#7cb05e', '#92c26b'], height: 6.5, vary: 0.25 },
        { match: 'Broadleaf tree', style: 3, evergreen: true, colours: ['#6c9f54', '#82b462'], height: 8 },
        { match: 'Street tree', style: 3, evergreen: true, colours: ['#74ab5b', '#88ba66'], height: 8, vary: 0.25 },
        { match: 'Conifer', style: 5, evergreen: true, colours: ['#528246', '#609052'], height: 9 },
      ],
    };
  }

  return {
    default: {
      style: 3,
      colours: ['#86b06b', '#9bc074'],
      height: 7,
      autumn: '#d98845',
      blossom: '#f4c7cf',
      evergreen: Boolean(profile.evergreenWinter),
    },
    rules: [
      { match: 'Woodland', style: 2, colours: ['#6f9c5d', '#7da867', '#5f8b4f'], height: 9, vary: 0.3, evergreen: Boolean(profile.evergreenWinter) },
      { match: 'Park tree', style: 3, colours: ['#84b06b', '#9bc275'], height: 8, vary: 0.25, autumn: '#de8c42', blossom: profile.springBlossom ? '#f6c4cd' : undefined },
      { match: 'Bank tree', style: 4, colours: ['#9cc66b', '#b0d476'], height: 7.5, vary: 0.3, spring: '#c8ea74', autumn: '#dfc460', blossom: profile.springBlossom ? '#f7c4cd' : undefined },
      { match: 'Garden tree', style: 1, colours: ['#8fb76d', '#a2c678'], height: 6, vary: 0.25, blossom: '#f6c8d0' },
      { match: 'Broadleaf tree', style: 3, colours: ['#7fa864', '#94bc72'], height: 7.5, autumn: '#da8643' },
      { match: 'Street tree', style: 3, colours: ['#7db164', '#94c072'], height: 8, vary: 0.25, autumn: '#e2a33e', blossom: profile.springBlossom ? '#f6c4cd' : undefined },
      { match: 'Conifer', style: 5, evergreen: true, colours: ['#5d8954', '#6b9760'], height: 8.5 },
    ],
  };
}

function buildSeasons(name, profile) {
  if (profile.tropical) {
    return [
      {
        id: 'summer',
        label: '晴夏',
        leaves: 'summer',
        crowd: 1.15,
        note: {
          text: `热带阳光与常绿树冠覆盖${name}街头。`,
          source: 'OpenStreetMap 实景数据',
          url: 'https://www.openstreetmap.org/',
        },
      },
      {
        id: 'monsoon',
        label: '骤雨',
        leaves: 'summer',
        wet: true,
        wx: 'rain',
        umbrellas: true,
        crowd: 0.9,
        note: {
          text: `午后热带阵雨掠过${name}的骑楼与砖石步道，水面泛起微光。`,
          source: 'OpenStreetMap 实景数据',
          url: 'https://www.openstreetmap.org/',
        },
      },
      {
        id: 'spring',
        label: '花季',
        leaves: 'spring',
        crowd: 1.15,
        note: {
          text: `季风轻拂${name}街头，热带行道树与花木四季繁茂。`,
          source: 'OpenStreetMap 实景数据',
          url: 'https://www.openstreetmap.org/',
        },
      },
    ];
  }

  const seasons = [
    {
      id: 'spring',
      label: profile.springBlossom ? '春樱' : '春意',
      leaves: profile.springBlossom ? 'blossom' : 'spring',
      wx: profile.springBlossom ? 'fluff' : undefined,
      crowd: 1.2,
      note: {
        text: profile.springBlossom
          ? `${name}街巷与公园樱枝盛放，春日新绿沿水岸与人行道铺展。`
          : `春日新绿沿${name}街道与绿地次第铺开，呈现真实街区肌理。`,
        source: 'OpenStreetMap 实景数据',
        url: 'https://www.openstreetmap.org/',
      },
    },
    {
      id: 'summer',
      label: '盛夏',
      leaves: 'summer',
      crowd: 1.0,
      note: {
        text: `盛夏晴光笼罩${name}，街区树荫浓郁，街头车流与行人熙攘。`,
        source: 'OpenStreetMap 实景数据',
        url: 'https://www.openstreetmap.org/',
      },
    },
    {
      id: 'autumn',
      label: '深秋',
      leaves: 'autumn',
      crowd: 1.1,
      note: {
        text: `深秋时节${name}的行道树与公园林木转为金黄与赭红。`,
        source: 'OpenStreetMap 实景数据',
        url: 'https://www.openstreetmap.org/',
      },
    },
    {
      id: 'winter',
      label: '冬日',
      leaves: profile.evergreenWinter ? 'summer' : 'bare',
      grass: profile.evergreenWinter ? '#a8cc76' : undefined,
      coats: true,
      crowd: 0.82,
      note: {
        text: profile.evergreenWinter
          ? `暖冬阳光洒在${name}的晴朗街巷与水岸常绿林木之间。`
          : `冬日枝干疏朗，${name}街头行人换上冬衣穿行于建筑影子里。`,
        source: 'OpenStreetMap 实景数据',
        url: 'https://www.openstreetmap.org/',
      },
    },
  ];

  if (profile.snowCapable) {
    seasons.push({
      id: 'snow',
      label: '初雪',
      sub: 'winter',
      leaves: 'bare',
      snow: true,
      wx: 'snow',
      coats: true,
      crowd: 0.65,
      note: {
        text: `初雪轻覆${name}的屋脊与街头步道，勾勒出清冽的冬日街景。`,
        source: 'OpenStreetMap 实景数据',
        url: 'https://www.openstreetmap.org/',
      },
    });
  }

  return seasons;
}

function buildDynamicViews(stats) {
  const views = [];
  if (stats.famousBuilding?.obb?.c) {
    const [fx, fy] = stats.famousBuilding.obb.c;
    views.push({
      id: 'landmark',
      label: stats.famousBuilding.n ? stats.famousBuilding.n.slice(0, 12) : '地标特写',
      camera: { yaw: -40, pitch: 34, zoom: 4.0, x: Number(fx.toFixed(1)), y: Number(fy.toFixed(1)), z: 2 },
    });
  }
  if (stats.waterTarget) {
    views.push({
      id: 'waterfront',
      label: '水岸视角',
      camera: { yaw: -25, pitch: 30, zoom: 3.1, x: stats.waterTarget[0], y: stats.waterTarget[1], z: 1.5 },
    });
  }
  const streetX = stats.poiTarget ? stats.poiTarget[0] : 0;
  const streetY = stats.poiTarget ? stats.poiTarget[1] : 0;
  views.push({
    id: 'street',
    label: '街巷漫步',
    camera: { yaw: 20, pitch: 26, zoom: 4.2, x: streetX, y: streetY, z: 2 },
  });
  return views;
}

function buildLegend(stats) {
  const legend = [
    {
      name: '街区建筑',
      source: '矢量建筑轮廓',
      count: stats.buildingCount ? String(stats.buildingCount) : '',
      icon: 'buildings',
      camera: { yaw: -35, pitch: 30, zoom: 2.0, x: 0, y: 0, z: 2 },
    },
    {
      name: '街道与巷弄',
      source: '实景路网',
      count: '',
      icon: 'streets',
      camera: {
        yaw: 18,
        pitch: 28,
        zoom: 3.6,
        x: stats.poiTarget ? stats.poiTarget[0] : 0,
        y: stats.poiTarget ? stats.poiTarget[1] : 0,
        z: 2,
      },
    },
  ];

  if (stats.famousBuilding?.obb?.c) {
    legend.unshift({
      name: stats.famousBuilding.n || '特色地标',
      source: '实景地标',
      count: '',
      icon: 'landmark',
      camera: {
        yaw: -40,
        pitch: 34,
        zoom: 4.2,
        x: Number(stats.famousBuilding.obb.c[0].toFixed(1)),
        y: Number(stats.famousBuilding.obb.c[1].toFixed(1)),
        z: 2,
      },
    });
  }
  if (stats.treeCount > 0) {
    legend.push({
      name: '树木与绿地',
      source: '绿地与行道树',
      count: String(stats.treeCount),
      icon: 'trees',
      camera: { yaw: -20, pitch: 32, zoom: 3.2, x: 0, y: 0, z: 2 },
    });
  }
  if (stats.hasWater) {
    legend.push({
      name: '滨水河岸',
      source: '实景水系',
      count: '',
      icon: 'water',
      camera: {
        yaw: -35,
        pitch: 30,
        zoom: 3.0,
        x: stats.waterTarget ? stats.waterTarget[0] : 0,
        y: stats.waterTarget ? stats.waterTarget[1] : 0,
        z: 2,
      },
    });
  }
  if (stats.poiCount > 0) {
    legend.push({
      name: '沿街商铺与茶咖',
      source: '街区商业点位',
      count: String(stats.poiCount),
      icon: 'shops',
      camera: {
        yaw: 16,
        pitch: 28,
        zoom: 4.0,
        x: stats.poiTarget ? stats.poiTarget[0] : 0,
        y: stats.poiTarget ? stats.poiTarget[1] : 0,
        z: 2,
      },
    });
  }

  if (stats.bridgeCount > 0 && stats.bridgeTarget) {
    legend.push({
      name: '高架与天桥',
      source: '立体交通结构',
      count: String(stats.bridgeCount),
      icon: 'streets',
      camera: {
        yaw: -32,
        pitch: 28,
        zoom: 3.4,
        x: stats.bridgeTarget[0],
        y: stats.bridgeTarget[1],
        z: 4,
      },
    });
  }
  if (stats.tunnelCount > 0 && stats.tunnelTarget) {
    legend.push({
      name: '地下隧道',
      source: '地下通行隧道',
      count: String(stats.tunnelCount),
      icon: 'streets',
      camera: {
        yaw: -35,
        pitch: 32,
        zoom: 3.2,
        x: stats.tunnelTarget[0],
        y: stats.tunnelTarget[1],
        z: 1,
      },
    });
  }

  return legend;
}

export function buildDefaultPocketCityConfig(scene, geocodeMeta = {}) {
  const place =
    scene?.meta?.place ||
    geocodeMeta.place ||
    geocodeMeta.displayName ||
    '城市切片';
  const name =
    geocodeMeta.city ||
    geocodeMeta.town ||
    geocodeMeta.village ||
    geocodeMeta.name ||
    place.split(',')[0].trim() ||
    '城市切片';
  const region =
    geocodeMeta.region ||
    geocodeMeta.suburb ||
    geocodeMeta.state ||
    geocodeMeta.country ||
    '';
  const title =
    geocodeMeta.title ||
    (place && place !== name ? `${name} · ${place}` : region || name);

  const stats = computeSceneStats(scene);
  const profileId = detectRegionalProfile(scene, geocodeMeta, stats);
  const profile = REGION_PROFILES[profileId] || REGION_PROFILES.global_metro;
  const profileLabel = PROFILE_LABELS[profileId] || '城市风貌';
  const level = Number(scene?.meta?.level) || profile.level || 3.2;

  const occasion = profile.occasion;
  const occasions = [
    {
      id: occasion.id,
      label: occasion.label,
      leaves: occasion.leaves || 'summer',
      night: occasion.night,
      litShare: occasion.litShare,
      crowd: occasion.crowd ?? 1.3,
      petals: occasion.petals,
      decor: occasion.decor,
      dress: occasion.dress,
      note: {
        text: occasion.noteText,
        source: '区域风貌策展',
        url: 'https://www.openstreetmap.org/',
      },
    },
    {
      id: 'festival',
      label: '街区市集',
      leaves: 'summer',
      crowd: 1.45,
      decor: {
        bunting: ['#d65c4f', '#e7be5d', '#4f7d99', '#6b9863'],
      },
      note: {
        text: `${name}主要街巷挂起节庆彩旗，游人与市集氛围热闹非凡。`,
        source: '街区实景生成',
        url: 'https://www.openstreetmap.org/',
      },
    },
  ];

  return {
    name,
    title,
    region,
    place,
    timezone: profile.timezone,
    level,
    profile: profileId,
    styles: {
      default: {
        ...profile.defaultStyle,
        floor: level,
      },
      rules: [
        {
          if: { maxArea: 16 },
          set: { levels: 1, shop: 'none', eave1: false },
        },
        {
          if: { type: ['temple', 'shrine'] },
          set: {
            facade: 'temple',
            roof: 'hipped',
            roofTex: 'kawara',
            wall: ['#efe6d5', '#e4dac7'],
            roofColour: ['#5e626a', '#70737b'],
            shop: 'none',
          },
        },
        {
          if: { type: ['church', 'cathedral', 'chapel'] },
          set: {
            facade: 'civic',
            roof: 'gabled',
            wall: ['#efe6d5', '#e6dcc9'],
            roofColour: ['#7b7d82', '#8c5b49'],
            shop: 'none',
          },
        },
        {
          if: { type: ['civic', 'public', 'museum', 'townhall'] },
          set: {
            facade: 'civic',
            roof: 'hipped',
            wall: ['#efe6d5', '#e4dac7'],
            shop: 'none',
          },
        },
        {
          if: { type: ['industrial', 'warehouse', 'hangar'] },
          set: {
            facade: 'warehouse',
            roof: 'flat',
            wall: ['#d9d2c7', '#cfc8bd'],
            eave1: false,
            shop: 'none',
          },
        },
        {
          if: { minLevels: 6 },
          set: {
            facade: 'office',
            roof: 'flat',
            wall: ['#e0d9cc', '#e9e2d6', '#d3ccc0'],
            eave1: false,
            shop: 'street',
            shopHeight: 3.6,
            floor: 3.4,
          },
        },
        {
          if: { minLevels: 12 },
          set: {
            facade: 'glass',
            roof: 'flat',
            wall: ['#cfd6db', '#dce2e6'],
            eave1: false,
            shop: 'street',
            shopHeight: 3.8,
            floor: 3.6,
          },
        },
        {
          if: { unknownHeight: true, minArea: 400 },
          set: {
            facade: 'plain',
            roof: 'flat',
            levels: 3,
            eave1: false,
            wall: ['#e3dbce'],
          },
        },
      ],
    },
    buildings: {},
    palette: { ...profile.palette },
    paving: { ...profile.paving },
    lamp: {
      colour: '#4d4a48',
      height: 4.6,
      head: '#f6ebd0',
      auto: true,
    },
    shops: { ...profile.shops },
    boats: {
      hulls: ['#f3eee4', '#5b6d7c', '#7c4c3d'],
      stripes: ['#39536b', '#a8473c', '#53735d'],
      covers: ['#dcd3c1', '#6e8192'],
      inside: '#d9ccb6',
      cabin: '#f5f1e8',
    },
    cafes: {
      umbrellas: ['#ebe3d2', '#9b4f41', '#4f6d63', '#5a6375'],
      stripes: true,
      table: '#e9e1d2',
      chair: '#6e5c4a',
    },
    trees: buildTreeRules(profile),
    people: {
      clothes: ['#3d4a5e', '#ebe2ce', '#788b9c', '#af5143', '#4c5c47', '#e0bb73', '#6d5a7c'],
      umbrellas: ['#eae3d5', '#3d4a5e', '#bc4d43', '#e0bb73'],
    },
    vehicles: {
      kinds: ['small', 'hatch', 'sedan', 'estate', 'suv'],
      colours: ['#f2f2ee', '#e6e2d8', '#2f333b', '#959fa9', '#b6a384'],
      plate: '#f5f3e5',
      taxi: profile.taxi,
    },
    seasons: buildSeasons(name, profile),
    occasions,
    isoLabel: `${name}全景`,
    occasionLabel: '特别场景',
    views: buildDynamicViews(stats),
    legend: buildLegend(stats),
    notes: [
      {
        title: title,
        text: `基于 OpenStreetMap 真实街道、建筑轮廓与区域风貌（${profileLabel}）自动构建。`,
        links: [
          {
            label: 'OpenStreetMap 地图数据',
            url: `https://www.openstreetmap.org/#map=18/${Number(scene?.meta?.lat || 0).toFixed(4)}/${Number(scene?.meta?.lon || 0).toFixed(4)}`,
          },
        ],
      },
    ],
  };
}
