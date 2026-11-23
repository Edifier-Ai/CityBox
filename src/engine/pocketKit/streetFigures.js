function ball(c, r, m, w=.9){
  const [X, Y] = P(...c), R = r*CAM_K;
  return `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(R)}" fill="${m.m}" stroke="${INK}" stroke-width="${w}"/>`
    + `<circle cx="${f(X+R*.15)}" cy="${f(Y-R*.18)}" r="${f(R*.7)}" fill="${m.l}"/>`;
}


const stick = (a, b, r, col, w=.45) => { const d = pd([a, b], false), W = 2*r*CAM_K;
  return `<path d="${d}" fill="none" stroke="${col}" style="stroke-width:${W.toFixed(2)}" stroke-linecap="round"/>`; };
// Draw order from plan footprints. Everything here stands on the ground, so for two things whose footprints are
// disjoint convex polygons, the one nearer the viewer along the ground (g = view direction flattened) goes later.
// Only pairs that overlap on screen are compared; the result is a topological sort (ties: nearer last).
function planSort(items){
  const g = norm([CAM_V[0], CAM_V[1], 0]), pp = [-g[1], g[0]], N = items.length;
  for (const it of items){
    it.pg = it.fp.map(q => [q[0]*pp[0] + q[1]*pp[1], q[0]*g[0] + q[1]*g[1]]);
    const ps = it.pg.map(q => q[0]); it.p0 = Math.min(...ps); it.p1 = Math.max(...ps);
    it.dep = it.pg.reduce((a, q) => a + q[1], 0) / it.pg.length;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const q of it.fp) for (const z of [it.z0 || 0, it.z1]){ const [X, Y] = P(q[0], q[1], z); x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
    it.sb = [x0, y0, x1, y1];
  }
  const gRange = (pg, pm) => { let lo = 1e9, hi = -1e9;
    for (let i = 0; i < pg.length; i++){ const [p1, g1] = pg[i], [p2, g2] = pg[(i+1) % pg.length];
      if ((p1 - pm)*(p2 - pm) <= 0 && p1 !== p2){ const gg = g1 + (g2 - g1)*(pm - p1)/(p2 - p1); lo = Math.min(lo, gg); hi = Math.max(hi, gg); } }
    if (lo > hi){ const avgG = pg.reduce((a, q) => a + q[1], 0) / pg.length; return [avgG, avgG]; }
    return [lo, hi]; };
  const after = Array.from({ length: N }, () => []), indeg = new Array(N).fill(0);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++){
    const A = items[i], B = items[j];
    if (A.sb[2] < B.sb[0] || B.sb[2] < A.sb[0] || A.sb[3] < B.sb[1] || B.sb[3] < A.sb[1]) continue;
    const lo = Math.max(A.p0, B.p0), hi = Math.min(A.p1, B.p1);
    if (hi - lo < 1e-4) continue;
    const pm = (lo + hi) / 2, ra = gRange(A.pg, pm), rb = gRange(B.pg, pm);
    let order = 0;
    if (ra[1] <= rb[0] + 1e-4) order = -1;
    else if (rb[1] <= ra[0] + 1e-4) order = 1;
    else if ((A.z1 || 0) <= (B.z0 || 0) + 0.15) order = -1;
    else if ((B.z1 || 0) <= (A.z0 || 0) + 0.15) order = 1;
    else {
      const ga = (ra[0] + ra[1]) * 0.5, gb = (rb[0] + rb[1]) * 0.5;
      if (Math.abs(ga - gb) >= 1e-6) order = ga < gb ? -1 : 1;
    }
    if (order < 0){ after[i].push(j); indeg[j]++; } else if (order > 0){ after[j].push(i); indeg[i]++; }
  }
  const done = new Array(N).fill(false), out = [];
  for (let n = 0; n < N; n++){
    let best = -1;
    for (let i = 0; i < N; i++) if (!done[i] && indeg[i] === 0 && (best < 0 || items[i].dep < items[best].dep)) best = i;
    if (best < 0) for (let i = 0; i < N; i++) if (!done[i] && (best < 0 || items[i].dep < items[best].dep)) best = i;   // a cycle: nearest-last
    done[best] = true; out.push(items[best].svg);
    for (const j of after[best]) indeg[j]--;
  }
  return out.join('');
}
const sq = (x, y, r) => [[x-r, y-r], [x+r, y-r], [x+r, y+r], [x-r, y+r]];

const pfig = limbs => { const outl = new Map(), runs = [];
  for (const { a, b, r, col } of limbs){ const d = pd([a, b], false), k = r + col;
    const o = outl.get(k); if (o) o.d += d; else outl.set(k, { r, col, d });
    const last = runs[runs.length - 1]; if (last && last.k === k) last.d += d; else runs.push({ k, r, col, d }); }
  let s = '';
  for (const { r, col, d } of outl.values()) s += `<path d="${d}" fill="none" stroke="${mix(col, '#24182a', .5)}" style="stroke-width:${(2*r*CAM_K + .7*INK_K).toFixed(2)}" stroke-linecap="round"/>`;
  for (const { r, col, d } of runs) s += `<path d="${d}" fill="none" stroke="${col}" style="stroke-width:${(2*r*CAM_K).toFixed(2)}" stroke-linecap="round"/>`;
  return s; };
const pstick = (a, b, r, col) => { const d = pd([a, b], false), W = 2*r*CAM_K;
  return `<path d="${d}" fill="none" stroke="${mix(col, '#24182a', .5)}" style="stroke-width:${(W + .7*INK_K).toFixed(2)}" stroke-linecap="round"/>`
    + `<path d="${d}" fill="none" stroke="${col}" style="stroke-width:${W.toFixed(2)}" stroke-linecap="round"/>`; };
// walkers' shadows: collected while the frame is built and drawn as one path on the street, under everyone
let PED_SH = '';
const pedShadow = (x, y, z, k=1) => { const [X, Y] = P(x, y, z), rx = .34*CAM_K*k, ry = .17*CAM_K*k;
  PED_SH += `M${f(X-rx)} ${f(Y)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2*rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2*rx)} 0`; };
const bikeShadow = (x, y, z, d, k=1) => {
  const [X0, Y0] = P(x - d[0]*.55*k, y - d[1]*.55*k, z), [X1, Y1] = P(x + d[0]*.55*k, y + d[1]*.55*k, z);
  const mx = (X0 + X1)*.5, my = (Y0 + Y1)*.5, dx = X1 - X0, dy = Y1 - Y0, L = Math.max(.2, Math.hypot(dx, dy));
  const rx = L*.62 + .22*CAM_K*k, ry = .22*CAM_K*k;
  PED_SH += `M${f(mx-rx)} ${f(my)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2*rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2*rx)} 0`;
};
function pedestrian(pd_, t){
  const K=STY.peopleScale;
  const L = [], pst = (a, b, r, col) => L.push({ a, b, r:r*K, col });
  const [x, y] = pd_.p, d = pd_.d, s = pd_.walked || 0, h = pd_.tall, n = [-d[1], d[0]], bz = pd_.z || 0;
  const ph = s * 2.5 + (pd_.phaseOff || 0), sw = Math.sin(ph) * .29, bob = Math.abs(Math.cos(ph)) * .045;
  const at = (fwd, side, z) => [x + (d[0]*fwd + n[0]*side)*K, y + (d[1]*fwd + n[1]*side)*K, bz + z*K];
  pedShadow(x, y, bz, K);
  let svg = '';
  // legs and arms: draw the far side first
  const legs = [[sw, .1], [-sw, -.1]].sort((p, q) => depthOf(at(0, p[1], 0)) - depthOf(at(0, q[1], 0)));
  for (const [fw, sd] of legs){
    pst(at(0, sd, .78*h + bob), at(fw, sd, .07), .095, pd_.pants);
    pst(at(fw, sd, .07), at(fw + .08, sd, .04), .065, '#35313a');
  }
  const armL = at(-sw*.85, .25, .97*h + bob), armR = at(sw*.85, -.25, .97*h + bob);
  const arms = [[armL, .25], [armR, -.25]].sort((p, q) => depthOf(p[0]) - depthOf(q[0]));
  dressTop(pst, at, h, bob, pd_, arms, d);
  if (pd_.bag) pst(at(-.12, .22, .85*h + bob), at(-.14, .22, 1.15*h + bob), .11, pd_.bag);
  svg += pfig(L);
  svg += ball([x, y, bz + (1.6*h + bob)*K], .21*K, pd_.skin, .5);
  const [HX, HY] = P(x, y, bz + (1.62*h + bob)*K), R = .215*CAM_K*K;      // hair (a cap over the top of the head) or a woolly hat
  svg += headTop(HX, HY, R, pd_.hair, pd_.hat);
  if (pd_.umb){   // an umbrella: a stick from the hand, a wide rim and the raised middle of the canopy
    const zc = bz + (2.08*h + bob)*K, ring = (r, z) => Array.from({ length: 12 }, (_, k) => [x + Math.cos(k*Math.PI/6)*r, y + Math.sin(k*Math.PI/6)*r, z]);
    svg += pstick(at(.12, -.18, 1.2*h + bob), [x, y, zc + .2*K], .03*K, '#3a3540') + shape(ring(.8*K, zc - .08*K), pd_.umb.m, .45) + fill(pd(ring(.48*K, zc + .16*K)), pd_.umb.l); }
  return { fp: sq(x, y, .35*K), z0: bz, z1: bz + (pd_.umb ? 2.9 : 2.3)*K, svg };
}

function carDraw(cr){
  const K=STY.vehicleScale;
  const c = cr.p, d = cr.d, M = cr.mesh, n = [-d[1], d[0]], hl = M.L/2*K, hw = M.W/2*K, bz = cr.z || 0;
  const svg = drawVehicle(M, { c, d, z: bz, mats: { paint: cr.m, tail: cr.v < 1.2 ? V_BRAKE : V_TAIL }, w: .5 });   // brake lights while slowing or stopped
  const fp = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a, b]) => [c[0] + d[0]*hl*a + n[0]*hw*b, c[1] + d[1]*hl*a + n[1]*hw*b]);
  return { fp, z0: bz, z1: bz + M.H*K, c, d, hl, hw, H: M.H*K, svg };
}
