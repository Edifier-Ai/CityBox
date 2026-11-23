/**
 * Procedural `landmarks.js` template generator for live OpenStreetMap extractions.
 * Detects notable buildings in a PocketSceneData extract and emits self-contained
 * JavaScript landmark definitions compatible with `src/engine/pocketKit/city.js`.
 *
 * IMPORTANT load-order contract:
 * `PocketCityViewport.tsx` injects `landmarksCode` BEFORE `city.js`.
 * Top-level code in the emitted script MUST only declare functions and `LANDMARKS`
 * (plus optional `CITY_EXTRA`); all calls to `findBuilding`, `ccw`, `block`,
 * `roofOver`, `planOrder`, `obj`, `standable`, etc. happen inside `build()`/`draw()`.
 */

const TEMPLE_RE =
  /temple|shrine|jinja|pagoda|pavilion|inari|kannon|daibutsu|寺|庙|神社|神宮|神明|大社|亭|阁|塔院|道观/i;
const CHURCH_RE =
  /church|cathedral|chapel|basilica|chiesa|duomo|oratorio|église|eglise|kirche|kerk|iglesia|parish|abbey|教堂|礼拜堂/i;
const BRIDGE_RE =
  /bridge|covered bridge|pont|ponte|brücke|brucke|brug|bashi|廊桥|风雨桥|桥/i;
const TOWER_RE =
  /tower|clock\s*tower|belfry|campanile|bell\s*tower|watchtower|lighthouse|钟楼|鼓楼|塔/i;

function isEastOrSouthEastAsia(scene, city) {
  const tz = String(city?.timezone || '');
  if (/^Asia\/(Tokyo|Shanghai|Taipei|Hong_Kong|Seoul|Singapore|Bangkok|Ho_Chi_Minh|Manila|Kuala_Lumpur|Jakarta)/i.test(tz)) {
    return true;
  }
  const lat = Number(scene?.meta?.lat);
  const lon = Number(scene?.meta?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return lat >= -10 && lat <= 54 && lon >= 94 && lon <= 146;
  }
  return false;
}

function classifyLandmarkArchetype(b, asiaContext) {
  const type = String(b.type || '').toLowerCase();
  const use = String(b.use || '').toLowerCase();
  const name = String(b.n || '');
  const L = Number(b.obb?.L || 0);
  const W = Number(b.obb?.W || 0);
  const h = Number(b.h || 0);
  const lv = Number(b.lv || 0);
  const ratio = W > 0 ? L / W : 1;

  if (
    ['temple', 'shrine', 'pagoda'].includes(type) ||
    TEMPLE_RE.test(name)
  ) {
    return 'temple_shrine';
  }

  if (
    ['church', 'cathedral', 'chapel', 'basilica'].includes(type) ||
    (use === 'place_of_worship' && !asiaContext) ||
    CHURCH_RE.test(name)
  ) {
    return 'church_belltower';
  }

  if (type === 'bridge' || (b.famous && ratio >= 2.2 && BRIDGE_RE.test(name))) {
    return 'covered_bridge';
  }

  if (
    ['tower', 'bell_tower', 'belfry', 'water_tower', 'lighthouse'].includes(type) ||
    (L <= 24 &&
      ratio <= 1.6 &&
      (h >= 22 || lv >= 7 || TOWER_RE.test(name)) &&
      (b.famous || (type !== '' && type !== 'yes')))
  ) {
    return 'tower_clock';
  }

  if (
    [
      'civic',
      'public',
      'townhall',
      'museum',
      'palace',
      'castle',
      'theatre',
      'opera_house',
      'university',
      'library',
    ].includes(type) ||
    ['townhall', 'museum', 'theatre', 'arts_centre', 'library'].includes(use)
  ) {
    return 'civic_dome';
  }

  return null;
}

function scoreLandmarkCandidate(b) {
  const L = Number(b.obb?.L || 0);
  const W = Number(b.obb?.W || 0);
  const area = L * W;
  const hasExplicitType = b.type && b.type !== 'yes' ? 1 : 0;
  return (b.famous ? 1_000_000 : 0) + hasExplicitType * 50_000 + Math.min(area, 20_000);
}

const RUNTIME_HELPERS = `
function _lmClamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function _lmHex(c, fb) {
  if (typeof c !== 'string') return fb;
  const s = c.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
  }
  const map = {
    white: '#f2eee4',
    cream: '#efe4cd',
    beige: '#e6d8be',
    yellow: '#ebd08a',
    red: '#a64436',
    brown: '#7d523d',
    grey: '#7c8087',
    gray: '#7c8087',
    slate: '#68707a',
    black: '#3e4248',
    green: '#628a78',
    blue: '#5a788f',
    orange: '#c46c49',
    terracotta: '#b8684a',
  };
  return map[s.toLowerCase()] || fb;
}

function _lmObbRect(cx, cy, ax, L, W) {
  const nx = [-ax[1], ax[0]];
  const hl = L / 2;
  const hw = W / 2;
  const pt = (u, v) => [cx + ax[0] * u + nx[0] * v, cy + ax[1] * u + nx[1] * v];
  return ccw([pt(-hl, -hw), pt(hl, -hw), pt(hl, hw), pt(-hl, hw)]);
}

function _tplTempleShrine(id) {
  const b = findBuilding(id);
  if (!b || !b.obb) return null;
  const { c, ax, L, W } = b.obb;
  const ring = ccw(b.ring);
  const rawH = b.h || (b.lv ? b.lv * 3.0 : 5.4);
  const h1 = _lmClamp(rawH, 3.6, 7.2);
  const wallCol = _lmHex(b.col, '#efe5d0');
  const roofCol = _lmHex(b.rcol, '#555c66');

  const plinth = block(ring, 0, 0.65, {
    facade: 'plain',
    wall: '#c7bfb0',
    top: '#ded7c8',
    shop: 'none',
  });
  const lowerHall = block(ring, 0.65, h1, {
    facade: 'timber',
    wall: wallCol,
    wood: '#702f25',
    slat: '#9e4334',
    trim: '#efe1c4',
    shop: 'none',
  });
  const lowerRoof = roofOver({ c, ax, L, W }, h1, {
    roof: 'hipped',
    pitch: 24,
    roofColour: roofCol,
    roofTex: 'kawara',
    eaves: 0.85,
    wall: wallCol,
  });

  const lowerRise = (W / 2 + 0.85) * Math.tan((24 * Math.PI) / 180);
  const parts = [
    {
      fp: ring,
      z1: h1 + lowerRise,
      draw: () => plinth.draw() + lowerHall.draw() + lowerRoof(),
    },
  ];

  let topZ = h1 + lowerRise;
  const hasUpperTier = L >= 9 && W >= 7;
  if (hasUpperTier) {
    const uL = L * 0.66;
    const uW = W * 0.66;
    const uRing = _lmObbRect(c[0], c[1], ax, uL, uW);
    const uZ0 = h1 + 0.75;
    const uZ1 = uZ0 + 3.1;
    const upperHall = block(uRing, uZ0, uZ1, {
      facade: 'timber',
      wall: wallCol,
      wood: '#7a3328',
      slat: '#a94b3b',
      trim: '#f3e4c7',
      shop: 'none',
    });
    const upperRoof = roofOver({ c, ax, L: uL, W: uW }, uZ1, {
      roof: 'hipped',
      pitch: 26,
      roofColour: roofCol,
      roofTex: 'kawara',
      eaves: 0.75,
      wall: wallCol,
    });
    const uRise = (uW / 2 + 0.75) * Math.tan((26 * Math.PI) / 180);
    topZ = uZ1 + uRise;
    parts.push({
      fp: uRing,
      z1: topZ + 1.4,
      draw: () =>
        upperHall.draw() +
        upperRoof() +
        stick([c[0], c[1], topZ - 0.15], [c[0], c[1], topZ + 1.15], 0.12, '#e2b659'),
    });
  } else {
    parts.push({
      fp: _lmObbRect(c[0], c[1], ax, 0.8, 0.8),
      z1: topZ + 1.1,
      draw: () =>
        stick([c[0], c[1], topZ - 0.1], [c[0], c[1], topZ + 0.95], 0.11, '#e2b659'),
    });
  }

  let toriiPart = null;
  if (L < 10) {
    const nx = [-ax[1], ax[0]];
    for (const dir of [1, -1]) {
      const gx = c[0] + ax[0] * dir * (L / 2 + 2.2);
      const gy = c[1] + ax[1] * dir * (L / 2 + 2.2);
      if (standable(gx, gy, 0.4)) {
        const span = 1.05;
        const pA = [gx - nx[0] * span, gy - nx[1] * span];
        const pB = [gx + nx[0] * span, gy + nx[1] * span];
        const kA = [gx - nx[0] * (span + 0.45), gy - nx[1] * (span + 0.45)];
        const kB = [gx + nx[0] * (span + 0.45), gy + nx[1] * (span + 0.45)];
        toriiPart = {
          fp: _lmObbRect(gx, gy, ax, 0.7, 2.8),
          z1: 3.1,
          draw: () =>
            stick([...pA, 0], [...pA, 2.7], 0.09, '#c4472f') +
            stick([...pB, 0], [...pB, 2.7], 0.09, '#c4472f') +
            stick([...kA, 2.2], [...kB, 2.2], 0.07, '#c4472f') +
            stick([...kA, 2.75], [...kB, 2.75], 0.1, '#c4472f') +
            stick([...kA, 2.93], [...kB, 2.93], 0.08, '#2f2b2b'),
        };
        break;
      }
    }
  }
  if (toriiPart) parts.push(toriiPart);

  const boundRing = toriiPart ? ring.concat(toriiPart.fp) : ring;
  return obj(boundRing, topZ + 1.5, () =>
    planOrder(parts.map((p) => ({ fp: p.fp, z1: p.z1, svg: p.draw() })))
  );
}

function _tplChurchBelltower(id) {
  const b = findBuilding(id);
  if (!b || !b.obb) return null;
  const { c, ax, L, W } = b.obb;
  const nx = [-ax[1], ax[0]];
  const ring = ccw(b.ring);
  const rawH = b.h || (b.lv ? b.lv * 3.4 : 9.6);
  const wallH = _lmClamp(rawH, 6.4, 15.0);
  const wallCol = _lmHex(b.col, '#efe4cd');
  const roofCol = _lmHex(b.rcol, '#737882');

  const nave = block(ring, 0, wallH, {
    facade: 'civic',
    wall: wallCol,
    trim: '#f6eedc',
    shop: 'none',
  });
  const naveRoof = roofOver({ c, ax, L, W }, wallH, {
    roof: 'gabled',
    pitch: 26,
    roofColour: roofCol,
    roofTex: 'slate',
    eaves: 0.35,
    wall: wallCol,
  });
  const naveTop = wallH + (W / 2 + 0.35) * Math.tan((26 * Math.PI) / 180);

  const tw = _lmClamp(W * 0.34, 2.8, 5.0);
  const tc = [
    c[0] + ax[0] * Math.max(0, L / 2 - tw * 0.45),
    c[1] + ax[1] * Math.max(0, L / 2 - tw * 0.45),
  ];
  const tRing = _lmObbRect(tc[0], tc[1], ax, tw, tw);
  const tShaftH = Math.max(wallH + 7.2, 16.0);
  const belfryH = tShaftH + 2.6;
  const spireH = Math.max(3.6, tw * 1.18);

  const towerShaft = block(tRing, 0, tShaftH, {
    facade: 'civic',
    wall: wallCol,
    trim: '#f6eedc',
    shop: 'none',
  });
  const belfry = block(tRing, tShaftH, belfryH, {
    facade: 'plain',
    wall: '#5c5852',
    top: '#e8dec8',
    shop: 'none',
  });

  const parts = [
    {
      fp: ring,
      z1: naveTop,
      draw: () => nave.draw() + naveRoof(),
    },
    {
      fp: tRing,
      z1: belfryH + spireH + 1.6,
      draw: () => {
        const sCol = SEASON.snow ? '#f2efe7' : roofCol;
        const tipZ = belfryH + spireH;
        const spire = peak(
          polygon(tc[0], tc[1], tw * 0.56, 8, Math.PI / 8),
          belfryH,
          [tc[0], tc[1], tipZ],
          sCol
        );
        const cross =
          stick([tc[0], tc[1], tipZ - 0.1], [tc[0], tc[1], tipZ + 1.4], 0.05, '#595550') +
          stick(
            [tc[0] - nx[0] * 0.4, tc[1] - nx[1] * 0.4, tipZ + 1.0],
            [tc[0] + nx[0] * 0.4, tc[1] + nx[1] * 0.4, tipZ + 1.0],
            0.045,
            '#595550'
          );
        return towerShaft.draw() + belfry.draw() + spire + cross;
      },
    },
  ];

  return obj(ring.concat(tRing), belfryH + spireH + 1.6, () =>
    planOrder(parts.map((p) => ({ fp: p.fp, z1: p.z1, svg: p.draw() })))
  );
}

function _tplCoveredBridge(id) {
  const b = findBuilding(id);
  if (!b || !b.obb) return null;
  const { c, ax, L, W } = b.obb;
  const deckW = _lmClamp(W, 3.6, 14.0);
  const deckRing = _lmObbRect(c[0], c[1], ax, L, deckW);

  const pierW = _lmClamp(L * 0.06, 2.0, 4.4);
  const pierD = Math.min(deckW + 0.8, 14.8);
  const pierParts = [-0.36 * L, 0, 0.36 * L].map((u) => {
    const pRing = _lmObbRect(c[0] + ax[0] * u, c[1] + ax[1] * u, ax, pierW, pierD);
    const pier = block(pRing, -1.2, 2.4, {
      facade: 'plain',
      wall: '#b8af9e',
      top: '#d4ccbc',
      shop: 'none',
    });
    return { fp: pRing, z1: 2.4, draw: pier.draw };
  });

  const deck = block(deckRing, 1.8, 2.8, {
    facade: 'plain',
    wall: '#a89f8e',
    top: '#ded5c3',
    shop: 'none',
  });

  const gLen = L * 0.84;
  const gWid = Math.min(deckW * 0.78, 10.6);
  const gRing = _lmObbRect(c[0], c[1], ax, gLen, gWid);
  const gallery = block(gRing, 2.8, 6.4, {
    facade: 'timber',
    wall: '#8f3c30',
    wood: '#5e2920',
    slat: '#a85546',
    trim: '#ead8b8',
    shop: 'none',
  });
  const galleryRoof = roofOver({ c, ax, L: gLen + 0.6, W: gWid + 0.6 }, 6.4, {
    roof: 'gabled',
    pitch: 24,
    roofColour: '#56606b',
    roofTex: 'kawara',
    eaves: 0.7,
    wall: '#8f3c30',
  });

  const pLen = _lmClamp(L * 0.30, 5.5, 20.0);
  const pWid = Math.min(gWid + 1.2, deckW * 0.94);
  const cRing = _lmObbRect(c[0], c[1], ax, pLen, pWid);
  const pavilion = block(cRing, 6.4, 9.6, {
    facade: 'timber',
    wall: '#a33e32',
    wood: '#622720',
    slat: '#c46653',
    trim: '#f2e1c0',
    shop: 'none',
  });
  const pavRoof = roofOver({ c, ax, L: pLen + 0.8, W: pWid + 0.8 }, 9.6, {
    roof: 'hipped',
    pitch: 28,
    roofColour: '#4e5863',
    roofTex: 'kawara',
    eaves: 0.9,
    wall: '#a33e32',
  });
  const pavTop = 9.6 + ((pWid + 0.8) / 2 + 0.9) * Math.tan((28 * Math.PI) / 180);

  const parts = [
    ...pierParts,
    { fp: deckRing, z1: 2.8, draw: deck.draw },
    { fp: gRing, z1: 9.2, draw: () => gallery.draw() + galleryRoof() },
    {
      fp: cRing,
      z1: pavTop + 1.2,
      draw: () =>
        pavilion.draw() +
        pavRoof() +
        stick([c[0], c[1], pavTop - 0.1], [c[0], c[1], pavTop + 1.0], 0.13, '#e2b659'),
    },
  ];

  return obj(deckRing, pavTop + 1.2, () =>
    planOrder(parts.map((p) => ({ fp: p.fp, z1: p.z1, svg: p.draw() })))
  );
}

function _tplTowerClock(id) {
  const b = findBuilding(id);
  if (!b || !b.obb) return null;
  const { c, ax, L, W } = b.obb;
  const ring = ccw(b.ring);
  const rawH = b.h || (b.lv ? b.lv * 3.4 : 24.0);
  const totalH = _lmClamp(rawH, 18.0, 48.0);
  const z1 = totalH * 0.18;
  const z2 = totalH * 0.78;
  const z3 = totalH * 0.90;
  const wallCol = _lmHex(b.col, '#ebe2cf');
  const roofCol = _lmHex(b.rcol, '#62737c');

  const plinth = block(ring, 0, z1, {
    facade: 'plain',
    wall: '#c7bfb0',
    top: '#ded6c7',
    shop: 'none',
  });
  const shaft = block(ring, z1, z2, {
    facade: 'civic',
    wall: wallCol,
    trim: '#f6eedc',
    shop: 'none',
  });
  const gRing = _lmObbRect(c[0], c[1], ax, L * 1.12, W * 1.12);
  const gallery = block(gRing, z2, z3, {
    facade: 'plain',
    wall: '#555b62',
    trim: '#e6d8b5',
    top: '#cfc7b6',
    shop: 'none',
  });
  const rad = Math.max(L, W) * 0.56;
  const spireTop = totalH + 4.2;

  const parts = [
    { fp: ring, z1: z2, draw: () => plinth.draw() + shaft.draw() },
    {
      fp: gRing,
      z1: spireTop + 2.4,
      draw: () =>
        gallery.draw() +
        peak(
          polygon(c[0], c[1], rad, 8, Math.PI / 8),
          z3,
          [c[0], c[1], spireTop],
          SEASON.snow ? '#f2efe7' : roofCol
        ) +
        stick([c[0], c[1], spireTop - 0.1], [c[0], c[1], spireTop + 2.2], 0.08, '#d4b25c'),
    },
  ];

  return obj(gRing, spireTop + 2.4, () =>
    planOrder(parts.map((p) => ({ fp: p.fp, z1: p.z1, svg: p.draw() })))
  );
}

function _tplCivicDome(id) {
  const b = findBuilding(id);
  if (!b || !b.obb) return null;
  const { c, ax, L, W } = b.obb;
  const ring = ccw(b.ring);
  const rawH = b.h || (b.lv ? b.lv * 3.4 : 11.2);
  const wallH = _lmClamp(rawH, 6.8, 18.0);
  const wallCol = _lmHex(b.col, '#efe6d5');
  const domeCol = _lmHex(b.rcol, '#6f998a');

  const hall = block(ring, 0, wallH, {
    facade: 'civic',
    wall: wallCol,
    trim: '#f8f0df',
    shop: 'none',
  });
  const roof = roofOver({ c, ax, L, W }, wallH, {
    roof: 'hipped',
    pitch: 18,
    roofColour: '#747882',
    roofTex: 'slate',
    eaves: 0.4,
    wall: wallCol,
  });

  const roofRise = (Math.min(L, W) / 2 + 0.4) * Math.tan((18 * Math.PI) / 180);
  const drumR = _lmClamp(W * 0.28, 2.2, 6.2);
  const drumZ0 = wallH + Math.min(roofRise * 0.45, 1.8);
  const drumZ1 = drumZ0 + Math.max(2.2, drumR * 0.68);
  const drumRing = polygon(c[0], c[1], drumR, 8, Math.PI / 8);

  const domeTiers = [
    [1.04, 0],
    [0.92, drumR * 0.38],
    [0.65, drumR * 0.72],
    [0.30, drumR * 0.94],
  ];
  const lanternBase = drumZ1 + drumR * 0.94;
  const lanternTop = drumZ1 + drumR * 1.38;

  const parts = [
    {
      fp: ring,
      z1: wallH + roofRise,
      draw: () => hall.draw() + roof(),
    },
    {
      fp: drumRing,
      z1: lanternTop + 1.2,
      draw: () => {
        const dCol = SEASON.snow ? '#f2efe7' : domeCol;
        let s = loft(
          drumRing.map((p) => [...p, drumZ0]),
          drumRing.map((p) => [...p, drumZ1]),
          (n) => tone(n, soft(wallCol))
        );
        const oct = (r, z) => polygon(c[0], c[1], r, 8, Math.PI / 8).map((p) => [...p, z]);
        for (let i = 0; i < domeTiers.length - 1; i++) {
          s += loft(
            oct(drumR * domeTiers[i][0], drumZ1 + domeTiers[i][1]),
            oct(drumR * domeTiers[i + 1][0], drumZ1 + domeTiers[i + 1][1]),
            (n) => tone(n, soft(dCol))
          );
        }
        s += peak(
          polygon(c[0], c[1], drumR * 0.3, 8, Math.PI / 8),
          lanternBase,
          [c[0], c[1], lanternTop],
          dCol
        );
        s += stick(
          [c[0], c[1], lanternTop - 0.1],
          [c[0], c[1], lanternTop + 0.9],
          0.08,
          '#e2b659'
        );
        return s;
      },
    },
  ];

  return obj(ring, lanternTop + 1.2, () =>
    planOrder(parts.map((p) => ({ fp: p.fp, z1: p.z1, svg: p.draw() })))
  );
}
`;

export function generateProceduralLandmarks(scene, city = {}) {
  const buildings = Array.isArray(scene?.buildings) ? scene.buildings : [];
  if (!buildings.length) {
    return { landmarksCode: '', landmarks: [] };
  }

  const asiaContext = isEastOrSouthEastAsia(scene, city);
  const candidates = [];
  const seenIds = new Set();

  for (const b of buildings) {
    if (!b || !b.id || seenIds.has(b.id)) continue;
    if (b.kind && b.kind !== 'building') continue;
    if (b.of || b.cut) continue;
    if ((b.min || 0) > 0.5) continue;
    if (!Array.isArray(b.ring) || b.ring.length < 3) continue;
    if (!b.obb?.c || !b.obb?.ax || (b.obb.L || 0) < 2.8 || (b.obb.W || 0) < 2.4) continue;

    const archetype = classifyLandmarkArchetype(b, asiaContext);
    if (!archetype) continue;

    seenIds.add(b.id);
    candidates.push({
      id: b.id,
      name: b.n || archetype,
      archetype,
      score: scoreLandmarkCandidate(b),
    });
  }

  if (!candidates.length) {
    return { landmarksCode: '', landmarks: [] };
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.slice(0, 4).map(({ id, name, archetype }) => ({
    id,
    name,
    archetype,
  }));

  const builderFnMap = {
    temple_shrine: '_tplTempleShrine',
    church_belltower: '_tplChurchBelltower',
    covered_bridge: '_tplCoveredBridge',
    tower_clock: '_tplTowerClock',
    civic_dome: '_tplCivicDome',
  };

  const landmarkEntries = selected
    .map((lm) => {
      const fn = builderFnMap[lm.archetype] || '_tplCivicDome';
      return `  { name: ${JSON.stringify(lm.name)}, ids: [${JSON.stringify(lm.id)}], build: () => ${fn}(${JSON.stringify(lm.id)}) }`;
    })
    .join(',\n');

  const targetIdsJson = JSON.stringify(selected.map((lm) => lm.id));

  const landmarksCode = `/* Procedurally generated landmark templates for extracted OSM scene */
${RUNTIME_HELPERS}
const LANDMARKS = [
${landmarkEntries}
];

let _LM_NIGHT_SPOTS = null;
function CITY_EXTRA(t) {
  if (!SEASON.night) return [];
  if (_LM_NIGHT_SPOTS === null) {
    _LM_NIGHT_SPOTS = [];
    const targetIds = ${targetIdsJson};
    for (const id of targetIds) {
      const b = findBuilding(id);
      if (!b || !b.obb) continue;
      const { c, ax, L, W } = b.obb;
      const nx = [-ax[1], ax[0]];
      const offsets = [
        [ax[0] * (L / 2 + 1.6), ax[1] * (L / 2 + 1.6)],
        [-ax[0] * (L / 2 + 1.6), -ax[1] * (L / 2 + 1.6)],
        [nx[0] * (W / 2 + 1.6), nx[1] * (W / 2 + 1.6)],
        [-nx[0] * (W / 2 + 1.6), -nx[1] * (W / 2 + 1.6)],
      ];
      let placed = 0;
      for (const [dx, dy] of offsets) {
        const px = c[0] + dx;
        const py = c[1] + dy;
        if (standable(px, py, 0.5)) {
          _LM_NIGHT_SPOTS.push([px, py]);
          placed += 1;
          if (placed >= 2) break;
        }
      }
    }
  }
  return _LM_NIGHT_SPOTS.map(([px, py]) => ({
    fp: rect(px, py, 1.0, 1.0),
    h: 0.4,
    draw: () => lightPool(px, py, 3.8, '#ffcf7a', 0.45, 0.04),
  }));
}
`;

  return { landmarksCode, landmarks: selected };
}
