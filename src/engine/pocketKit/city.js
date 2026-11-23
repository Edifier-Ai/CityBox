/* Pocket City engine for any place.
   SCENE  measured map data from prep.py (footprints, heights, streets, trees, routes, shops)
   CITY   the researched look from city.json (building styles, palette, people, seasons, occasions)
   LANDMARKS  hand-built famous buildings from landmarks.js (optional; replaces the generic block of those ids)
   Runs inside the render workers with the shared kit: projection, models, streetFigures, foliage, painter. */
const M=SCENE.meta,BASE_CORNERS=SCENE.corners,NORTH=M.north,SLAB=STY.slabDepth,HALF=M.half,LEVEL=CITY.level||M.level||3.2;
let FIG_W=540,FIG_H=675,WOBBLE=0,UPX=1,pictureBook=true,washEnabled=true;
const rnd=s=>{const v=Math.sin(s*127.1+311.7)*43758.5453;return v-Math.floor(v)};
const soft=c=>({l:STY.litWarm?mix(c,'#fff0d2',STY.litWarm):c,m:mix(c,STY.shadeColor||'#887997',STY.shadeMid),d:mix(c,STY.shadeColor||'#705f81',STY.shadeDark)});
const PLANT_INK='#231e17',lineOf=(c,plant)=>mix(c,'#51465a',Math.min(1,(plant?.38:.53)*STY.inkDark));
const groundZ=()=>0,atZ=(r,z)=>r.map(p=>[p[0],p[1],z]);
const hash=s=>{let h=7;for(const c of String(s))h=(h*31+c.charCodeAt(0))|0;return Math.abs(h)};
const pickOf=(v,seed)=>Array.isArray(v)?v[hash(seed)%v.length]:v;
const PAL={ground:'#eadfc9',road:'#b8aeb2',pavement:'#ebdfc8',walk:'#e6d7be',grass:'#b4d784',water:'#86c6cc',sand:'#ecd9a8',quay:'#d9cfbb',slab:'#d8c5a3',
  marking:'#f4ead3',kerb:'#e3c477',paving:'#c6baa7',rail:'#7d7f86',...(CITY.palette||{}),...((STY.palette&&STY.palette.ground)||{})};

/* ---------- textures that turn with a surface (roof tiles, copper, cladding) ---------- */
const sheetTiles=new Map();
function sheetInk(points,name,u,v){
  const origin=points[0],right=Dv(...u),down=Dv(...v),p=P(...origin);
  if(Math.abs(right[0]*down[1]-right[1]*down[0])<.04||UPX>.68)return '';
  const coords=points.map(q=>[dot(sub(q,origin),u),dot(sub(q,origin),v)]),xs=coords.map(q=>q[0]),ys=coords.map(q=>q[1]);
  const bounds=[Math.min(...xs)-1,Math.min(...ys)-1,Math.max(...xs)+1,Math.max(...ys)+1];
  return '<sheet name="'+name+'" d="'+pd(points)+'" matrix="'+[...right,...down,...p].join(' ')+'" bounds="'+bounds.join(' ')+'"/>';
}
function paintSheet(g,op){
  let tile=sheetTiles.get(op.name);
  if(!tile){
    const size=256,c=makeSurface(size,size),ink=c.getContext('2d');
    if(op.name==='copper'){
      for(let row=0;row<24;row++)for(let col=0;col<24;col++){const x=(col+(row%2)*.5)*size/24,y=(row+.5)*size/24;ink.fillStyle='rgba(117,63,57,.42)';ink.beginPath();ink.arc(x,y,1.45,0,Math.PI*2);ink.fill()}
    }else if(op.name==='pantile'||op.name==='kawara'){   // 8 softer rolled-tile courses per repeat to prevent sub-pixel moiré swimming
      for(let col=0;col<8;col++){const x=col*32;ink.fillStyle='rgba(55,54,66,.13)';ink.fillRect(x,0,6,256);ink.fillStyle='rgba(255,246,226,.07)';ink.fillRect(x+14,0,8,256)}
      for(let row=0;row<4;row++){ink.fillStyle='rgba(55,54,66,.08)';ink.fillRect(0,row*64,256,2.5)}
    }else if(op.name==='slate'){
      for(let row=0;row<12;row++)for(let col=-1;col<10;col++){const x=(col+(row%2)*.5)*28,y=row*(size/12),r=rnd(row*13+col);ink.fillStyle='rgba(58,62,74,'+(.04+r*.09)+')';ink.fillRect(x+.6,y+.6,27,size/12-1);ink.fillStyle='rgba(40,44,55,.14)';ink.fillRect(x,y+size/12-1.2,28,1.2)}
    }else{   // plain tiles or shingles
      for(let row=0;row<8;row++)for(let col=-1;col<8;col++){const x=(col+(row%2)*.5)*32,y=row*size/8,r=rnd(row*17+col+103);
        ink.fillStyle=r>.48?'rgba(247,229,204,'+(.04+r*.09)+')':'rgba(68,72,82,'+(.05+r*.11)+')';ink.fillRect(x+.75,y+.75,30.8,size/8-1.3);
        ink.fillStyle='rgba(62,68,77,.16)';ink.fillRect(x,y+size/8-1.4,32,1.4);ink.fillRect(x,y,1,size/8)}
    }
    tile=c;sheetTiles.set(op.name,tile);
  }
  const [l,t,r,b]=op.bounds,pitch=op.name==='copper'?3.6:op.name==='kawara'||op.name==='pantile'?2.8:4.6;
  const courses=op.name==='copper'?24:op.name==='slate'?12:8;
  const stepPx=Math.hypot(op.matrix[0],op.matrix[1])*paintScale*(pitch/courses);
  if(stepPx<2.4)return;
  const alphaFade=Math.min(1,(stepPx-2.4)/3.0);
  g.save();g.clip(op.path);g.globalAlpha*=alphaFade;g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  g.transform(...op.matrix);g.scale(pitch/tile.width,pitch/tile.height);
  const scale=tile.width/pitch;g.fillStyle=g.createPattern(tile,'repeat');g.fillRect(l*scale,t*scale,(r-l)*scale,(b-t)*scale);g.restore();
}

/* ---------- small geometry ---------- */
function inside(p,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c}return c}
const inRings=(p,groups)=>groups.some(rs=>{let c=false;for(const r of rs)if(inside(p,r))c=!c;return c});
const obj=(fp,h,draw,z0=0)=>({fp,h,draw,z0});
function rect(x,y,w,d){return [[x-w/2,y-d/2],[x+w/2,y-d/2],[x+w/2,y+d/2],[x-w/2,y+d/2]]}
const polygon=(x,y,r,n,angle=0)=>Array.from({length:n},(_,i)=>[x+r*Math.cos(i*2*Math.PI/n+angle),y+r*Math.sin(i*2*Math.PI/n+angle)]);
const footprintPath=r=>pd(atZ(r,0)),surface=(rings,color)=>'<path d="'+rings.map(footprintPath).join('')+'" fill="'+color+'" fill-rule="evenodd"/>';
const edge=(a,b,c,width)=>'<path d="'+pd([a,b],false)+'" fill="none" stroke="'+c+'" style="stroke-width:'+f(width)+'"/>';
function stripeAt(p,d,length,width){const n=[-d[1]*width/2,d[0]*width/2],a=[d[0]*length/2,d[1]*length/2];
  return footprintPath([[p[0]-a[0]-n[0],p[1]-a[1]-n[1]],[p[0]+a[0]-n[0],p[1]+a[1]-n[1]],[p[0]+a[0]+n[0],p[1]+a[1]+n[1]],[p[0]-a[0]+n[0],p[1]-a[1]+n[1]]])}
function peak(r,base,tip,col){
  return r.map((a,i)=>{const b=r[(i+1)%r.length],p=[[...a,base],[...b,base],tip];const n=vNewell(p);return {p,n,at:avg(p)}}).filter(p=>vis(p.n)).sort((a,b)=>depthOf(a.at)-depthOf(b.at)).map(p=>shape(p.p,tone(p.n,soft(col)),.65)).join('');
}
// Elevations run right-to-left as seen from outside, so lettering is drawn turned round about its anchor.
function wallText(g,str,x,y,w){const a=g.textAlign;g.save();g.translate(x,y);g.scale(-1,1);g.textAlign=a==='start'||a==='left'?'right':a==='end'||a==='right'?'left':a;g.fillText(str,0,0,w);g.restore()}

/* ---------- the look of each building: city.json rules, then per-building overrides ---------- */
const STYLES=CITY.styles||{};
function matches(c,b){
  if(!c)return true;
  const any=(v,x)=>Array.isArray(v)?v.includes(x):v===x;
  if(c.type&&!any(c.type,b.type))return false;
  if(c.use&&!any(c.use,b.use))return false;
  if(c.mat&&!any(c.mat,b.mat))return false;
  if(c.famous!==undefined&&!!b.famous!==c.famous)return false;
  if(c.cut!==undefined&&!!b.cut!==c.cut)return false;
  if(c.name&&!new RegExp(c.name,'i').test(b.n||''))return false;
  const h=b.h??(b.lv?b.lv*LEVEL:null);
  if(c.minH!==undefined&&!(h>=c.minH))return false;
  if(c.maxH!==undefined&&!(h!==null&&h<=c.maxH))return false;
  if(c.minLevels!==undefined&&!((b.lv??(h?h/LEVEL:0))>=c.minLevels))return false;
  if(c.maxLevels!==undefined&&!((b.lv??(h?h/LEVEL:99))<=c.maxLevels))return false;
  if(c.minArea!==undefined&&!(b.area>=c.minArea))return false;
  if(c.maxArea!==undefined&&!(b.area<=c.maxArea))return false;
  if(c.unknownHeight!==undefined&&(b.h==null&&b.lv==null)!==c.unknownHeight)return false;
  if(c.nearStreet!==undefined&&b.street!==c.nearStreet)return false;
  return true;
}
const NAMED_COLS={white:'#f4f1ea',black:'#3a3838',grey:'#9a9a9a',gray:'#9a9a9a',lightgrey:'#c8c8c8',lightgray:'#c8c8c8',darkgrey:'#6a6a6a',darkgray:'#6a6a6a',silver:'#c0c0c0',red:'#b5533f',maroon:'#7a3b32',brown:'#8a5a40',tan:'#d2b48c',beige:'#e8dcc0',cream:'#f2e8cf',yellow:'#e8c25a',orange:'#d9853f',pink:'#e7b5b0',green:'#6f9a63',blue:'#5b7fa8'};
function parseCol(v){if(!v)return null;let s=String(v).trim().toLowerCase();if(NAMED_COLS[s])s=NAMED_COLS[s];s=s.replace(/^#/,'');if(s.length===3)s=s.split('').map(c=>c+c).join('');if(!/^[0-9a-f]{6}$/.test(s))return null;const n=parseInt(s,16);return [n>>16,n>>8&255,n&255]}
function nearestCol(list,rgb){let best=list[0],bd=1e18;for(const h of list){const c=parseCol(h);if(!c)continue;const rm=(c[0]+rgb[0])/2,dr=c[0]-rgb[0],dg=c[1]-rgb[1],db=c[2]-rgb[2],d=(2+rm/256)*dr*dr+4*dg*dg+(2+(255-rm)/256)*db*db;if(d<bd){bd=d;best=h}}return best}
function styleFor(b){
  let s={facade:'house',wall:['#eee2ca'],roofColour:['#c8c4b8'],roof:'auto',pitch:30,eaves:.45,levels:3,floor:LEVEL,shop:'poi',parapet:.5,...(STYLES.default||{})};
  for(const rule of STYLES.rules||[])if(matches(rule.if,b)){s={...s,...rule.set};if(!rule.more)break}
  const o={...s,...((CITY.buildings||{})[b.id]||{})};
  if(STY.palette){const pl=STY.palette;if(pl.walls)o.wall=pl.walls;if(pl.roofs)o.roofColour=pl.roofs;if(pl.flatRoofs)o.flatRoof=pl.flatRoofs;
    const wc=parseCol(b.col);if(wc&&pl.walls)o.wall=[nearestCol(pl.walls,wc)];
    const rc=b.rcol&&(/^#/.test(b.rcol)||/^[a-z]+$/i.test(b.rcol))?parseCol(b.rcol):null;
    if(rc){if(pl.roofs)o.roofColour=[nearestCol(pl.roofs,rc)];if(pl.flatRoofs)o.flatRoof=nearestCol(pl.flatRoofs,rc);}
  }
  if(STY.eaveScale!==1){o.eaves=(o.eaves??.45)*STY.eaveScale;o.parapet=(o.parapet??.5)*STY.eaveScale;}
  return o;
}
const POIS=SCENE.pois||[];
const areaOf=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1]},0)/2);
const nearStreet=b=>b.ring.some((a,i)=>{const c=b.ring[(i+1)%b.ring.length],m=[(a[0]+c[0])/2,(a[1]+c[1])/2];
  return [[3,0],[-3,0],[0,3],[0,-3]].some(([dx,dy])=>inRings([m[0]+dx,m[1]+dy],SCENE.roads))});
for(const b of SCENE.buildings){
  b.area=areaOf(b.ring);b.street=nearStreet(b);b.pois=[];
}
for(const p of POIS){   // a named shop belongs to the building it stands in, or the nearest one within 6 m
  let best=null,bd=6;
  for(const b of SCENE.buildings){if(inside([p.x,p.y],b.ring)){best=b;break}
    for(let i=0;i<b.ring.length;i++){const a=b.ring[i],c=b.ring[(i+1)%b.ring.length],dx=c[0]-a[0],dy=c[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/(dx*dx+dy*dy||1)));
      const d=Math.hypot(a[0]+dx*t-p.x,a[1]+dy*t-p.y);if(d<bd){bd=d;best=b}}}
  if(best)best.pois.push(p);
}
function heightsOf(b,st){
  const pitched=roofKind(b,st)!=='flat';
  const rise=pitched?(b.rh||(ridgeFrame(b,st).W/2+st.eaves)*Math.tan(st.pitch*Math.PI/180)):0;
  let wall;
  if(b.h)wall=pitched?Math.max(2.6,b.h-rise):b.h;
  else if(b.lv)wall=b.lv*st.floor+(pitched?0:.6);
  else wall=(st.levels||3)*st.floor+(pitched?0:.6);
  if(st.height)wall=st.height;
  return {wall:Math.max(wall,(b.min||0)+2.4),top:Math.max(wall,(b.min||0)+2.4)+rise,rise};
}
const OSM_ROOFS=['flat','gabled','hipped','pyramidal','half-hipped','gambrel','mansard','saltbox','round'];
function roofKind(b,st){
  let k=STY.osmRoofs&&b.roof&&OSM_ROOFS.includes(b.roof)?b.roof:(st.roof==='auto'?(b.roof||'flat'):st.roof);
  if(k==='auto')k='flat';
  if(['gabled','hipped','pyramidal','half-hipped','gambrel','mansard','saltbox','round'].includes(k)){
    if(k==='half-hipped'||k==='mansard'||k==='gambrel'||k==='saltbox')k=k==='mansard'?'hipped':'gabled';
    if(k==='round')k='gabled';
    if(b.obb.fill<(st.rectFill||.78)||b.obb.W<2.5||ridgeFrame(b,st).W>(st.maxSpan||22))return 'flat';
    return k;
  }
  return 'flat';
}

/* ---------- walls: one face per footprint edge, each with a painted elevation ---------- */
const models=[],facades=[];
function walls(r,z,h,info){
  const area=r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1]},0);
  const faces=r.map((a,i)=>{
    const b=r[(i+1)%r.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(len<.05)return null;
    const u=[(b[0]-a[0])/len,(b[1]-a[1])/len],n=[u[1]*Math.sign(area),-u[0]*Math.sign(area),0];
    const flip=area>0,start=flip?b:a,along=flip?u.map(v=>-v):u;
    const cut=BASE_CORNERS.some((v,j)=>{const w=BASE_CORNERS[(j+1)%4];return Math.abs(v[0]-w[0])<.01?Math.abs(a[0]-v[0])<.05&&Math.abs(b[0]-v[0])<.05:Math.abs(a[1]-v[1])<.05&&Math.abs(b[1]-v[1])<.05});
    const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const street=!cut&&[2.2,4.5,7].some(d=>{const q=[mid[0]+n[0]*d,mid[1]+n[1]*d];return inRings(q,SCENE.roads)||inRings(q,SCENE.walk)||inRings(q,SCENE.paths)});
    const st=info.st,bld=info.b;
    const shop=!cut&&z<.5&&len>=3.5&&street&&st.shop!=='none'&&(st.shop==='street'||(st.shop==='poi'&&bld&&bld.pois.length));
    const sign=shop&&bld&&bld.pois.length?(bld.pois[i%bld.pois.length].name):(shop?pickOf((CITY.shops||{}).signs||[''],(bld?bld.id:'')+i):'');
    const id=facades.push({start,along,n,len,z,h,st,cut,shop,sign,seed:hash((bld?bld.id:'')+i),body:info.body,street})-1;
    return {a,b,n,id};
  }).filter(Boolean);
  return ()=>faces.filter(q=>vis(q.n)).sort((a,b)=>depthOf([(a.a[0]+a.b[0])*.5,(a.a[1]+a.b[1])*.5,0])-depthOf([(b.a[0]+b.b[0])*.5,(b.a[1]+b.b[1])*.5,0])).map(q=>{
    const wall=[...atZ([q.a,q.b],z),...atZ([q.b,q.a],h)],fac=facades[q.id];
    const ao=STY.ao>0&&z<.5&&h-z>1.2?'<g opacity="'+(.32*STY.ao).toFixed(3)+'">'+shape([...atZ([q.a,q.b],z),...atZ([q.b,q.a],z+.5)],'#2b2236',0)+'</g><g opacity="'+(.14*STY.ao).toFixed(3)+'">'+shape([...atZ([q.a,q.b],z+.5),...atZ([q.b,q.a],z+1.3)],'#2b2236',0)+'</g>':'';
    return shape(wall,tone(q.n,soft(info.body)),.7)+'<elevation id="'+q.id+'"/>'+ao+(fac.shop&&fac.st.awning!==false?canopy(fac):'')+(fac.street&&fac.st.eave1&&!fac.cut?midEave(fac):'');
  }).join('');
}
// a shop awning or canopy over each bay of a shopfront
function canopy(F){
  const st=F.st,cols=st.awnings||(CITY.shops||{}).awnings||['#af7762','#688d86','#b59972','#7a8aa8'];
  const bays=Math.max(1,Math.round(F.len/(st.bay||5.5))),bay=F.len/bays,height=Math.min(F.h-F.z-.3,st.shopHeight?st.shopHeight-.2:3.2);
  const at=(s,d,z)=>[F.start[0]+F.along[0]*s+F.n[0]*d,F.start[1]+F.along[1]*s+F.n[1]*d,z];
  let svg='';
  for(let i=0;i<bays;i++){
    if(st.awning==='some'&&(F.seed+i)%3)continue;
    const a=bay*i+.25,b=bay*(i+1)-.25,proj=st.awningDepth||.9,front=height-.42,c=cols[(F.seed+i)%cols.length];
    svg+=shape([at(a,0,height),at(b,0,height),at(b,proj,front),at(a,proj,front)],c,.36);
    if(UPX<.55&&st.stripes!==false)for(let t=a+.12;t<b-.2;t+=.6){const u=Math.min(b,t+.24);svg+=shape([at(t,0,height+.012),at(u,0,height+.012),at(u,proj,front+.012),at(t,proj,front+.012)],'#efe2c6',0)}
    svg+=shape([at(a,proj,front),at(b,proj,front),at(b,proj,front-.16),at(a,proj,front-.16)],mix(c,'#726d78',.3),.3);
  }
  return svg;
}
// a small tiled pent roof between ground and first floor (machiya ichimon-ji eave, shophouse eaves)
function midEave(F){
  const st=F.st,z=F.z+(st.shopHeight||Math.min(3.4,(F.h-F.z)*.5)),proj=st.eave1Depth||.75;
  if(z>F.h-1)return '';
  const at=(s,d,zz)=>[F.start[0]+F.along[0]*s+F.n[0]*d,F.start[1]+F.along[1]*s+F.n[1]*d,zz];
  const col=pickOf(st.roofColour,F.seed);
  return shape([at(0,0,z+.42),at(F.len,0,z+.42),at(F.len,proj,z),at(0,proj,z)],SEASON.snow?snowy(col,.75):col,.45)+edge(at(0,proj,z),at(F.len,proj,z),mix(col,'#3d3a44',.35),.07);
}

/* ---------- painted elevations ---------- */
function paintSingaporeElevation(g,id){
  const F=facades[id],{start,along,n,len:L,z,h,st}=F,H=h-z;
  if(L<.38||H<.48)return;
  const X=Dv(...along,0),Y=Dv(0,0,-1),p=P(...start,h);
  g.save();g.transform(...X,...Y,...p);g.beginPath();g.rect(0,0,L,H);g.clip();
  const box=(x,y,w,d,c)=>{g.fillStyle=c;g.fillRect(x,y,w,d)};
  const poly=(ps,c)=>{g.fillStyle=c;g.beginPath();ps.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fill()};
  const side=dot(n,SUN)>.14,shade=c=>nightCol(side?c:mix(c,'#8e839a',.19)),lit=i=>SEASON.night&&rnd(F.seed*.013+i*3.71)<(SEASON.litShare??.55);
  const trim=shade(st.trim||'#f6ead2'),frame=shade(st.frame||'#837e7c'),dark=shade(st.dark||'#526662');
  const glass=(st.glass||['#b4d3cd','#c0d7ca','#a5c6cc','#d9d6b6']).map(shade);
  if(F.cut){box(0,0,L,H,shade('#d3c4b6'));for(let y=st.floor;y<H;y+=st.floor)box(0,y,L,.12,shade('#e6dac6'));g.restore();return}
  if(UPX>1.1){g.restore();return}
  const kind=st.facade,fl=st.floor||LEVEL;
  const shopH=F.shop?Math.min(H,st.shopHeight||Math.max(3.1,fl*1.1)):0,upper=H-shopH;
  const floors=Math.max(1,Math.round(upper/fl)),rh=upper/Math.max(1,floors);
  const bayW=(st.bay||(kind==='glass'?2:kind==='office'?2.4:kind==='timber'?1.8:kind==='civic'||kind==='temple'?4.2:kind==='painted'?2.6:3.2))*STY.bayScale;
  const cols=Math.max(1,Math.round(L/bayW)),bw=L/cols;
  function win(x,y,w,d,i){   // one window: frame, glass with a glint, glazing bars
    box(x-.09,y-.09,w+.18,d+.18,frame);
    if(lit(i)){box(x,y,w,d,(i+F.seed)%3?'#ffd98a':'#ffe7a8')}
    else{box(x,y,w,d,glass[(i+F.seed)%glass.length]);poly([[x,y],[x+w*.42,y],[x+w*.14,y+d],[x,y+d]],shade('#e2e8dc'));box(x,y,w,Math.min(.14,d*.14),shade('rgba(34,28,44,.22)'))}
    if(st.bars!==false&&STY.windowBars){box(x+w*.5-.03,y,.06,d,trim);if(d>1.2)box(x,y+d*.32,w,.05,trim)}
    box(x-.11,y+d+.04,w+.22,.08,trim);
  }
  if(kind==='blank'){g.restore();return}
  if(kind==='masonry'){
    if(UPX<.65){
      const lineC=shade('rgba(62,54,48,.16)');
      for(let y=.55;y<H;y+=.55)box(0,y,L,.04,lineC);
    }
    box(0,0,L,.16,shade('#dfd7c8'));
    g.restore();return;
  }
  if(kind==='canal'){   // Dutch canal houses: subdivide long facades into narrow 5.2-6.6m parcels with tall white-framed sash windows, stoops, and sandstone cornices
    const wallCols=Array.isArray(st.wall)?st.wall:[st.wall||F.body||'#7d3e33'];
    const pCount=L>=9.5?Math.max(2,Math.min(6,Math.round(L/5.8))):1,pw=L/pCount;
    const stone=shade(st.trim||'#f4ede0'),plinthC=shade('#42454c'),doorCols=['#253d34','#2d3b4e','#5b2e2a','#3a3f44'];
    for(let pi=0;pi<pCount;pi++){
      const px=pi*pw,pSeed=F.seed+pi*131;
      if(pCount>1){
        const pBody=shade(wallCols[pSeed%wallCols.length]);
        box(px,0,pw+.02,H,pBody);
        if(pi>0)box(px-.05,0,.10,H,shade('#3d383a'));
      }
      if(UPX<.55)for(let y=.35;y<H;y+=.32)box(px,y,pw,.016,shade('rgba(46,32,28,.16)'));
      const corniceH=.28+(pSeed%3)*.06;
      box(px,0,pw,corniceH,stone);box(px,corniceH,pw,.07,shade('#8e8579'));
      const nCols=pw<3.4?1:pw<5.2?2:3,cbw=pw/nCols;
      const dDoor=pSeed%nCols;
      const localShop=F.shop&&pi===0;
      const gTop=H-(localShop?shopH:0);
      for(let j=0;j<floors;j++){
        const y=j*rh;
        if(j===floors-1&&!localShop){
          const plinthH=Math.min(1.05,rh*.34);
          box(px,y+rh-plinthH,pw,plinthH,plinthC);
          box(px,y+rh-plinthH-.08,pw,.08,stone);
          for(let i=0;i<nCols;i++){
            const cx=px+i*cbw;
            if(i===dDoor&&pw>=3.2){
              const dw=Math.min(1.1,cbw*.52),dx=cx+(cbw-dw)/2,dy=y+rh*.22,dh=rh*.78;
              box(dx-.12,dy-.12,dw+.24,dh+.12,stone);
              box(dx,dy,dw,dh,shade(doorCols[pSeed%doorCols.length]));
              box(dx+.08,dy+.08,dw-.16,dw*.48,lit(pSeed+i*7)?'#ffe7a8':shade('#5c6c72'));
              box(dx+.08,dy+dw*.54,dw-.16,.06,stone);
              box(dx-.18,y+rh-.36,dw+.36,.18,stone);
              box(dx-.24,y+rh-.18,dw+.48,.18,shade('#b8b0a2'));
            }else if(cbw>=1.0){
              const ww=Math.min(1.15,cbw*.48),wx=cx+(cbw-ww)/2,wy=y+rh*.16,wd=rh*.56;
              box(wx-.1,wy-.12,ww+.2,wd+.22,stone);
              if(lit(j*7+i+pi*11))box(wx,wy,ww,wd,(i+pSeed)%2?'#ffd98a':'#ffe7a8');
              else{box(wx,wy,ww,wd,shade('#394750'));poly([[wx,wy],[wx+ww*.45,wy],[wx+ww*.15,wy+wd],[wx,wy+wd]],shade('#728792'))}
              box(wx+ww*.5-.03,wy,.06,wd,stone);box(wx,wy+wd*.42,ww,.05,stone);
              box(wx-.14,wy-.22,ww+.28,.12,stone);
            }
          }
        }else if(y+rh<=gTop+.2){
          const shrink=j===0?.12:0;
          for(let i=0;i<nCols;i++){
            if(cbw<1.0)continue;
            const ww=Math.min(1.12,cbw*.46),wx=px+i*cbw+(cbw-ww)/2,wy=y+rh*(.16+shrink*.5),wd=rh*(.58-shrink);
            box(wx-.09,wy-.09,ww+.18,wd+.18,stone);
            if(lit(j*11+i+pi*17)){
              box(wx,wy,ww,wd,(i+j+pSeed)%3?'#ffd98a':'#ffe7a8');
              if((pSeed+i+j)%4===0)box(wx,wy,ww,wd*.35,shade('#c8a878'));
            }else{
              box(wx,wy,ww,wd,shade('#38464f'));
              poly([[wx,wy],[wx+ww*.42,wy],[wx+ww*.14,wy+wd],[wx,wy+wd]],shade('#6f8590'));
              box(wx,wy,ww,.12,shade('rgba(20,24,32,.35)'));
            }
            box(wx+ww*.5-.025,wy,.05,wd,stone);
            if(wd>1.0)box(wx,wy+wd*.36,ww,.045,stone);
            if(wd>1.4)box(wx,wy+wd*.68,ww,.045,stone);
            box(wx-.12,wy-.18,ww+.24,.10,stone);
            box(wx-.12,wy+wd+.06,ww+.24,.09,stone);
          }
        }
      }
    }
  }else if(kind==='glass'){
    for(let j=0;j<Math.max(1,Math.round(upper/3.6));j++)for(let i=0;i<cols;i++){const x=bw*i,y=j*3.6;
      box(x,y,bw+.01,3.6,glass[(Math.floor(i/5)+Math.floor(j/3)+F.seed)%glass.length]);box(x,y,.08,3.6,frame);box(x,y+3.25,bw,.12,frame);
      if((i+j+F.seed)%11===2)poly([[x,y+.3],[x+bw*.6,y+.3],[x+bw*.2,y+3.1],[x,y+3.1]],shade('#d4e2da'))}
  }else if(kind==='office'){
    for(let j=0;j<floors;j++){const y=j*rh;box(0,y+rh*.24,L,rh*.5,glass[(j+F.seed)%glass.length]);
      for(let i=1;i<cols;i++)box(i*bw,y+rh*.24,.07,rh*.5,frame);box(0,y+rh*.74,L,.08,trim)}
  }else if(kind==='timber'){   // Kyoto-style townhouse: plastered upper storey with slit windows over wooden lattice
    for(let j=0;j<floors;j++){const y=j*rh;
      if(j===floors-1&&!F.shop){   // ground floor without a shop: wooden lattice (koshi) across the front
        box(0,y+rh*.12,L,rh*.88,shade(st.wood||'#6b5241'));
        for(let x=.08;x<L;x+=.11)box(x,y+rh*.14,.045,rh*.84,shade(st.slat||'#8d6e55'));
        const door=Math.min(1.4,L*.3);box(L*.62,y+rh*.12,door,rh*.88,shade('#3e3330'));
        box(L*.62,y+rh*.12,door,rh*.34,shade(pickOf(st.noren||['#2f4a6b','#7a3b3b','#c9b07a'],F.seed)));
      }else{
        const w=Math.min(L*.7,2.6),x=(L-w)/2;box(x,y+rh*.3,w,rh*.45,shade(st.wood||'#6b5241'));
        for(let k=x+.1;k<x+w-.05;k+=.22)box(k,y+rh*.3,.1,rh*.45,trim);
      }
    }
    for(let i=0;i<=Math.round(L/1.8);i++)box(Math.min(L-.08,i*L/Math.max(1,Math.round(L/1.8))),0,.08,upper,shade(st.wood||'#6b5241'));
  }else if(kind==='plain'||kind==='warehouse'){
    for(let j=0;j<floors;j++)for(let i=0;i<cols;i++)if((i+j+F.seed)%(kind==='warehouse'?3:2)===0)win(bw*i+bw*.3,j*rh+rh*.3,bw*.4,rh*.35,i+j);
  }else if(kind==='striped'){   // Ligurian/Genoese church walls: horizontal bands, a few tall arched windows
    const band=st.band||.62,sc=shade(st.stripe||'#a9a8a2');
    for(let y=band;y<upper;y+=band*2)box(0,y,L,band,sc);
    const n=Math.max(1,Math.round(L/(st.bay||5)));
    for(let i=0;i<n;i++){const w=.9,x=(i+.5)*L/n-w/2,y0=upper*.18,d=Math.min(3.4,upper*.32);
      box(x-.18,y0-.18,w+.36,d+.3,trim);box(x,y0+w/2,w,d-w/2,shade('#5b6266'));poly(Array.from({length:9},(_,k)=>[x+w/2+Math.cos(Math.PI+k*Math.PI/8)*w/2,y0+w/2+Math.sin(Math.PI+k*Math.PI/8)*w/2]).concat([[x+w,y0+w/2],[x,y0+w/2]]),shade('#5b6266'))}
    box(0,0,L,.3,trim);
  }else if(kind==='painted'){   // Ligurian / Italian painted front: lots of wall, narrow windows, louvred shutters, painted frames and quoins
    const sh=st.shutters||['#3f6b4c'],tr=shade(st.trim||mix(F.body||'#f0d48c','#ffffff',.55));
    const open=st.shutterOpen??.55;
    for(let j=0;j<floors;j++){const y=j*rh;
      for(let i=0;i<cols;i++){const w=Math.min(1.05,bw*.3),x=bw*i+(bw-w)/2,y0=y+rh*.2,d=rh*.56;if(bw<1.2)continue;
        box(x-.26,y0-.32,w+.52,d+.5,tr);                      // painted surround
        box(x-.36,y0-.46,w+.72,.16,tr);                       // little cornice over the window
        const c=shade(pickOf(sh,F.seed+i+j)),shut=(x0,ww)=>{box(x0,y0,ww,d,c);for(let k=y0+.12;k<y0+d-.05;k+=.16)box(x0+.05,k,ww-.1,.04,mix(c,'#1f2a22',.35))};
        if(rnd(F.seed+i*7.3+j*3.1)<open){win(x,y0,w,d,i*3+j);shut(x-w*.5-.05,w*.5);shut(x+w+.05,w*.5)}
        else shut(x,w);                                       // closed persiane
        if(j===floors-1&&st.balcony&&(i+F.seed)%2===0){box(x-.3,y0+d+.1,w+.6,.08,dark);for(let k=x-.25;k<x+w+.3;k+=.16)box(k,y0+d-.35,.035,.5,dark)}
      }
    }
    for(const x0 of [0,L-.42])for(let k=0;k<upper;k+=.62)box(x0,k,.42,.36,tr);   // painted quoins at the corners
    box(0,0,L,.34,tr);box(0,.34,L,.06,shade(mix(st.trim||'#f6ead2','#6b5a4a',.35)));          // eaves cornice
    if(!F.shop)box(0,upper-.5,L,.5,shade(mix(F.body||'#e9c27a','#7a6a5a',.18)));             // plinth
  }else{   // house, apartment, brick, stucco, civic, temple, shophouse
    const tall=kind==='civic'||kind==='temple'||kind==='stucco',m=kind==='civic'||kind==='temple'?.28:kind==='shophouse'?.2:.24;
    for(let j=0;j<floors;j++){const y=j*rh;
      if(kind==='stucco'||kind==='civic')box(0,y+rh-.16,L,.16,trim);
      for(let i=0;i<cols;i++){const x=bw*i+bw*m,w=bw*(1-2*m),y0=y+rh*(tall?.16:.22),d=rh*(tall?.66:.52);
        if(bw<.9)continue;
        win(x,y0,w,d,i*3+j);
        if(st.shutters){const c=shade(pickOf(st.shutters,F.seed+i));box(x-w*.36,y0,w*.32,d,c);box(x+w*1.04,y0,w*.32,d,c)}
        if(kind==='stucco'||kind==='civic'){box(x-.12,y0-.22,w+.24,.14,trim);box(x-.1,y0+d+.06,w+.2,.1,trim)}
        else box(x-.08,y0+d+.06,w+.16,.09,trim);
        if(st.balcony&&j<floors-1&&(i+F.seed)%(st.balcony===true?1:2)===0){box(x-.25,y0+d+.18,w+.5,.08,dark);for(let k=x-.2;k<x+w+.25;k+=.18)box(k,y0+d-.3,.035,.5,dark)}
      }
      if(kind==='brick'&&UPX<.5)for(let k=y+.25;k<y+rh;k+=.25)box(0,k,L,.012,shade('rgba(80,50,40,.18)'));
    }
    if(kind==='shophouse'||kind==='civic'||kind==='temple')for(let i=0;i<=cols;i++)box(Math.min(L-.18,i*bw-.09),0,.18,upper,trim);
    if(kind!=='house')box(0,0,L,.22,trim);
  }
  if(F.shop)shopfront(g,F,L,H,shopH,shade,box,poly,SEASON.night?['#ffe7a8','#ffd98a','#fde9b0']:glass);
  g.restore();
}
function shopfront(g,F,L,H,sh,shade,box,poly,glass){
  const st=F.st,y0=H-sh,bays=Math.max(1,Math.round(L/(st.bay||5.5))),bay=L/bays;
  const fascias=st.fascia||(CITY.shops||{}).fascias||['#526e75','#9f6554','#50776e','#a55649','#687aa0','#b77c36'];
  const ink=shade('#4f5f5c'),ivory=shade('#f5e8cc');
  box(0,y0,L,sh,shade(st.shopWall||'#a79180'));
  for(let j=0;j<bays;j++){
    g.save();g.translate(j*bay,y0);
    const fascia=shade(fascias[(F.seed+j)%fascias.length]),entry=j===Math.floor(bays/2);
    box(.12,.62,bay-.24,sh-.62,ink);
    box(.2,.7,bay-.4,sh-.82,glass[(F.seed+j)%glass.length]);
    poly([[.2,.7],[.2+(bay-.4)*.4,.7],[.2+(bay-.4)*.12,sh-.12],[.2,sh-.12]],shade('#e6ece2'));
    if(UPX<.6){   // goods on shelves behind the glass
      const goods=['#be8558','#8eac8f','#c17b6c','#d9bd78','#7f95ad'];
      for(let r=0;r<2;r++){const y=1.25+r*.62;box(.3,y+.36,bay-.6,.06,ivory);
        for(let k=0;k<6;k++)box(.36+k*(bay-.8)/6,y,(bay-.8)/6-.06,.34,shade(goods[(k+r+j+F.seed)%5]))}
    }
    const dw=Math.min(1.2,bay*.3),dx=entry?(bay-dw)/2:bay-dw-.3;
    box(dx,.7,dw,sh-.7,shade('#6f8c8a'));box(dx+.08,.8,dw-.16,sh*.35,shade('#b7cdc4'));
    box(.08,.06,bay-.16,.5,fascia);
    const text=entry||bays===1?F.sign:'';
    if(text&&UPX<.33){g.fillStyle=ivory;g.font='bold '+Math.min(.34,(bay-.4)/Math.max(3,text.length)*1.6).toFixed(2)+'px '+((CITY.shops||{}).font||'sans-serif');g.textAlign='center';g.textBaseline='middle';wallText(g,text,bay/2,.31,bay-.3)}
    g.restore();
  }
}

/* ---------- roofs ---------- */
// which way the ridge runs: along the footprint (long), across it (short), or parallel to the street it faces (street)
function ridgeFrame(b,st){
  const o=b.obb;let ax=o.ax,L=o.L,W=o.W;
  let mode=st.ridge||'long';
  if(mode==='street'){
    let best=null,bl=0;
    for(let i=0;i<b.ring.length;i++){const a=b.ring[i],c=b.ring[(i+1)%b.ring.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<2)continue;
      const m=[(a[0]+c[0])/2,(a[1]+c[1])/2],u=[(c[0]-a[0])/len,(c[1]-a[1])/len];
      const hit=[3,6].some(d=>[[u[1],-u[0]],[-u[1],u[0]]].some(n=>inRings([m[0]+n[0]*d,m[1]+n[1]*d],SCENE.roads)||inRings([m[0]+n[0]*d,m[1]+n[1]*d],SCENE.walk)));
      if(hit&&len>bl){bl=len;best=u}}
    mode=best&&Math.abs(best[0]*ax[0]+best[1]*ax[1])<.7?'short':'long';
  }
  if(mode==='short'){ax=[-ax[1],ax[0]];[L,W]=[W,L]}
  return {c:o.c,ax,L,W};
}
function pitchedRoof(b,st,wall,rise,kind,col){
  const o=ridgeFrame(b,st),ax=o.ax,nx=[-ax[1],ax[0]],e=st.eaves??.45,L2=o.L/2+e,W2=o.W/2+e,zE=wall-e*rise/(o.W/2+e),zR=wall+rise;
  const C=(s,t,z)=>[o.c[0]+ax[0]*s+nx[0]*t,o.c[1]+ax[1]*s+nx[1]*t,z];
  const planes=[];
  const add=(pts,isWall)=>{let n=vNewell(pts);if(!isWall&&n[2]<0){pts.reverse();n=vNewell(pts)}planes.push({p:pts,n,at:avg(pts),wall:isWall})};
  const ridge=kind==='pyramidal'?0:kind==='hipped'?Math.max(0,L2-W2):L2;
  if(kind==='gabled'){
    add([C(-L2,-W2,zE),C(L2,-W2,zE),C(L2,0,zR),C(-L2,0,zR)]);add([C(L2,W2,zE),C(-L2,W2,zE),C(-L2,0,zR),C(L2,0,zR)]);
    const g1=[C(-o.L/2,-o.W/2,wall),C(-o.L/2,o.W/2,wall),C(-o.L/2,0,zR-.05)],g2=[C(o.L/2,o.W/2,wall),C(o.L/2,-o.W/2,wall),C(o.L/2,0,zR-.05)];
    for(const gp of [g1,g2]){let n=vNewell(gp);const out=dot(n,[ax[0],ax[1],0])*(gp===g1?-1:1);if(out<0){gp.reverse();n=vNewell(gp)}planes.push({p:gp,n,at:avg(gp),wall:true})}
  }else{
    add([C(-L2,-W2,zE),C(L2,-W2,zE),C(ridge,0,zR),C(-ridge,0,zR)]);add([C(L2,W2,zE),C(-L2,W2,zE),C(-ridge,0,zR),C(ridge,0,zR)]);
    add([C(L2,-W2,zE),C(L2,W2,zE),C(ridge,0,zR)]);add([C(-L2,W2,zE),C(-L2,-W2,zE),C(-ridge,0,zR)]);
  }
  const tex=st.roofTex,wallC=pickOf(st.wall,b.id),bHash=hash(b.id);
  const isCanal=st.facade==='canal'&&kind==='gabled';
  const gableKind=isCanal?['trap','hals','klok','tuit'][bHash%4]:null;
  const trimC=st.trim||'#f4ede0';
  const drawDutchGable=(gp,endSign)=>{
    const n=gp.n;if(!vis(n))return '';
    const gCol=tone(n,soft(wallC)),tCol=tone(n,soft(trimC));
    const hw=o.W/2,pt=(v,z)=>C(endSign*o.L/2,v,z),outPt=(v,z,d)=>[...pt(v,z).slice(0,2).map((val,idx)=>val+ax[idx]*endSign*d),z];
    let s='';
    if(gableKind==='trap'){   // stepped gable (trapgevel)
      const steps=4,stepW=hw/steps,stepH=rise/steps;
      for(let k=0;k<steps;k++){
        const v0=-hw+k*stepW,v1=hw-k*stepW,z0=wall+k*stepH,z1=wall+(k+1)*stepH+.18;
        s+=shape([pt(v0,z0),pt(v1,z0),pt(v1,z1),pt(v0,z1)],gCol,.35);
        s+=edge(pt(v0,z1),pt(v0+stepW,z1),tCol,.12)+edge(pt(v1,z1),pt(v1-stepW,z1),tCol,.12);
      }
      s+=shape([pt(-stepW*.6,zR),pt(stepW*.6,zR),pt(stepW*.6,zR+.45),pt(-stepW*.6,zR+.45)],tCol,.3);
    }else if(gableKind==='hals'){   // neck gable (halsgevel)
      const nw=hw*.44;
      s+=shape([pt(-nw,wall+rise*.2),pt(nw,wall+rise*.2),pt(nw,zR+.55),pt(-nw,zR+.55)],gCol,.35);
      s+=shape([pt(-nw-.18,zR+.55),pt(nw+.18,zR+.55),pt(0,zR+1.15)],tCol,.35);
      for(const sg of [-1,1])s+=edge(pt(sg*hw,wall),pt(sg*nw,wall+rise*.45),tCol,.13);
    }else if(gableKind==='klok'){   // bell gable (klokgevel)
      const curve=[];for(let i=0;i<=8;i++){const u=i/8,v=-hw*(1-u),z=wall+rise*(Math.sin(u*Math.PI*.5)**1.2)+.25*Math.sin(u*Math.PI);curve.push(pt(v,z))}
      for(let i=7;i>=0;i--){const u=i/8,v=hw*(1-u),z=wall+rise*(Math.sin(u*Math.PI*.5)**1.2)+.25*Math.sin(u*Math.PI);curve.push(pt(v,z))}
      s+=shape(curve,gCol,.35)+edge(curve[0],curve[Math.floor(curve.length/2)],tCol,.11)+edge(curve[curve.length-1],curve[Math.floor(curve.length/2)],tCol,.11);
    }else{   // spout gable (tuitgevel) with white sandstone coping
      s+=edge(pt(-hw,wall),pt(0,zR+.35),tCol,.14)+edge(pt(hw,wall),pt(0,zR+.35),tCol,.14);
      s+=shape([pt(-.45,zR+.1),pt(.45,zR+.1),pt(.45,zR+.55),pt(-.45,zR+.55)],tCol,.3);
    }
    // Attic loft shutter (luik) and projecting hoisting beam (hijsbalk)
    if(UPX<.68&&rise>1.4){
      const lw=Math.min(.95,hw*.38),lz0=wall+rise*.18,lz1=wall+rise*.62;
      s+=shape([outPt(-lw,lz0,.03),outPt(lw,lz0,.03),outPt(lw,lz1,.03),outPt(-lw,lz1,.03)],'#2e463a',.28);
      s+=edge(outPt(-lw,lz0,.04),outPt(lw,lz0,.04),tCol,.08);
      const bz=zR-.12;
      s+=stick(outPt(0,bz,0),outPt(0,bz,.62),.08,'#2c2624')+stick(outPt(0,bz,.54),outPt(0,bz-.22,.54),.035,'#4a4448');
    }
    return s;
  };
  const hasChimney=(st.facade==='canal'||st.facade==='brick'||st.facade==='house')&&st.roofTex!=='kawara'&&st.chimney!==false&&!String(b.id).startsWith('roof')&&o.L>=7&&o.W>=4.2&&(bHash%3!==0);
  const chimneyAt=hasChimney?C((bHash%2?-.26:.26)*o.L,(bHash%3===1?-.14:.14)*o.W,zR-.1):null;
  const hasDormer=isCanal&&o.L>=11&&o.W>=4.8&&rise>1.8;
  return ()=>{const roofC=SEASON.snow?snowy(col,.82):col;
    const sortedPlanes=planes.filter(q=>vis(q.n)).sort((a,b)=>((a.wall?0:1)-(b.wall?0:1))||(depthOf(a.at)-depthOf(b.at)));
    let s=sortedPlanes.map(q=>{
      let ps=shape(q.p,tone(q.n,soft(q.wall?wallC:roofC)),.6);
      if(!q.wall&&tex&&!SEASON.snow&&q.p.length===4){const u=norm(sub(q.p[1],q.p[0])),v=norm(sub(q.p[0],q.p[3]));ps+=sheetInk(q.p,tex,u,v.map(x=>-x))}
      return ps}).join('')+(st.ridgeCap!==false&&kind!=='pyramidal'?edge(C(-ridge,0,zR+.04),C(ridge,0,zR+.04),mix(roofC,'#3a3742',.4),Math.max(.12,(st.ridgeCap||.18))):'');
    if(isCanal)for(const q of sortedPlanes)if(q.wall)s+=drawDutchGable(q,dot(q.n,[ax[0],ax[1],0])>0?1:-1);
    if(chimneyAt&&UPX<.75){
      const [cx,cy,cz]=chimneyAt,cw=.42,cd=.36,ch=1.15;
      const cr=rect(cx,cy,cw*2,cd*2);
      const cQuads=cr.map((a,i)=>{const b2=cr[(i+1)%4],q=[[...a,cz],[...b2,cz],[...b2,cz+ch],[...a,cz+ch]],n=vNewell(q);return n&&vis(n)?{q,n,at:avg(q)}:null}).filter(Boolean).sort((a,b)=>depthOf(a.at)-depthOf(b.at));
      s+=cQuads.map(({q,n})=>shape(q,tone(n,soft(wallC)),.35)).join('');
      s+=shape(atZ(cr,cz+ch),SEASON.snow?'#f4f1ea':'#5c5450',.35);
      s+=stick([cx-cw*.35,cy,cz+ch],[cx-cw*.35,cy,cz+ch+.24],.08,'#b56b4d')+stick([cx+cw*.35,cy,cz+ch],[cx+cw*.35,cy,cz+ch+.24],.08,'#b56b4d');
    }
    if(hasDormer&&UPX<.65){
      for(const sg of [-1,1]){
        if(!vis([nx[0]*sg,nx[1]*sg,.35]))continue;
        const dc=C(0,sg*o.W*.30,wall+rise*.35),dr=rect(dc[0],dc[1],1.6,1.1);
        const dQuads=dr.map((a,i)=>{const b2=dr[(i+1)%4],q=[[...a,dc[2]-.3],[...b2,dc[2]-.3],[...b2,dc[2]+.95],[...a,dc[2]+.95]],n=vNewell(q);return n&&vis(n)?{q,n,at:avg(q)}:null}).filter(Boolean).sort((a,b)=>depthOf(a.at)-depthOf(b.at));
        s+=dQuads.map(({q,n})=>shape(q,tone(n,soft(trimC)),.3)).join('');
        s+=shape(atZ(dr,dc[2]+.95),SEASON.snow?snowy(roofC,.8):roofC,.35);
      }
    }
    return s};
}
const ROOF_MAPS=[];
const ROOF_MAP_CANVAS=new Map();
function paintRoofTex(g,id){
  const item=ROOF_MAPS[id];if(!item)return;
  const {ring,wall,map}=item;
  if(!map||!map.pal||!map.pal.length||!map.data)return;
  const key=id+'|'+(!!SEASON.night)+'|'+(!!SEASON.snow);
  let cv=ROOF_MAP_CANVAS.get(key);
  const cw=map.w*2,ch=map.h*2;
  if(!cv){
    cv=makeSurface(cw,ch);
    const cg=cv.getContext('2d');
    const colFor=idx=>{
      const hex=map.pal[idx]||'#d6cec0';
      return SEASON.snow?snowy(hex,.74):SEASON.night?nightCol(hex):hex;
    };
    for(let iy=0;iy<map.h;iy++){
      for(let ix=0;ix<map.w;ix++){
        const ch0=map.data[iy*map.w+ix];
        if(!ch0||ch0==='.')continue;
        const idx=parseInt(ch0,16);
        cg.fillStyle=colFor(idx);
        cg.fillRect(ix*2,iy*2,2,2);
      }
    }
    // Delicate watercolor contour lines where roof material/zone changes
    cg.fillStyle=SEASON.night?'rgba(20,24,38,0.28)':'rgba(81,70,90,0.22)';
    for(let iy=0;iy<map.h;iy++){
      for(let ix=0;ix<map.w;ix++){
        const ch0=map.data[iy*map.w+ix];
        if(!ch0||ch0==='.')continue;
        if(ix+1<map.w){
          const chR=map.data[iy*map.w+ix+1];
          if(chR&&chR!=='.'&&chR!==ch0)cg.fillRect(ix*2+1.6,iy*2,.4,2);
        }
        if(iy+1<map.h){
          const chD=map.data[(iy+1)*map.w+ix];
          if(chD&&chD!=='.'&&chD!==ch0)cg.fillRect(ix*2,iy*2+1.6,2,.4);
        }
      }
    }
    ROOF_MAP_CANVAS.set(key,cv);
  }
  const [x0,y0,x1,y1]=map.bounds;
  const o=P(x0,y0,wall),X=Dv((x1-x0)/cw,0,0),Y=Dv(0,(y1-y0)/ch,0);
  if(Math.abs(X[0]*Y[1]-X[1]*Y[0])<1e-6)return;
  g.save();
  g.beginPath();
  ring.forEach((pt,i)=>{const [sx,sy]=P(pt[0],pt[1],wall);if(i===0)g.moveTo(sx,sy);else g.lineTo(sx,sy)});
  g.closePath();
  g.clip();
  g.globalAlpha=.92;
  g.transform(...X,...Y,...o);
  g.drawImage(cv,0,0);
  g.restore();
}
function flatRoof(b,st,wall,col){
  const r=b.ring,rim=st.parapet??.5;
  const isEdgeCut=(a,c)=>BASE_CORNERS.some((v,j)=>{const w=BASE_CORNERS[(j+1)%4];return Math.abs(v[0]-w[0])<.01?Math.abs(a[0]-v[0])<.05&&Math.abs(c[0]-v[0])<.05:Math.abs(a[1]-v[1])<.05&&Math.abs(c[1]-v[1])<.05});
  const rf=b.roofFeatures||{};
  const ax=rf.ax||(b.obb&&b.obb.ax)||[1,0],nx=[-ax[1],ax[0]];
  const obbBox=(cx,cy,w,d)=>{const hw=w*.5,hd=d*.5,pt=(u,v)=>[cx+ax[0]*u+nx[0]*v,cy+ax[1]*u+nx[1]*v];return ccw([pt(-hw,-hd),pt(hw,-hd),pt(hw,hd),pt(-hw,hd)])};
  const fixtures=[];

  for(const tr of rf.terraces||[]){
    const fp=obbBox(tr.x,tr.y,tr.w,tr.d),th=tr.h||.35;
    const baseDraw=walls(fp,wall,wall+th,{st:{facade:'plain',floor:5,shop:'none'},body:'#cfc7b8'});
    fixtures.push({fp,z:wall,draw:()=>{
      const topC=SEASON.snow?'#f2efe8':'#ebe3d3';
      let s=baseDraw()+shape(atZ(fp,wall+th),topC,.5);
      const steps=Math.max(2,Math.min(6,Math.round(tr.w/5)));
      for(let i=1;i<steps;i++){
        const u=(i/steps-.5)*tr.w,pA=[tr.x+ax[0]*u-nx[0]*tr.d*.48,tr.y+ax[1]*u-nx[1]*tr.d*.48,wall+th+.02],pB=[tr.x+ax[0]*u+nx[0]*tr.d*.48,tr.y+ax[1]*u+nx[1]*tr.d*.48,wall+th+.02];
        s+=edge(pA,pB,'#d3cab8',.08);
      }
      return s;
    }});
  }

  for(const ph of rf.penthouses||[]){
    const fp=obbBox(ph.x,ph.y,ph.w,ph.d),capFp=obbBox(ph.x,ph.y,ph.w+.4,ph.d+.4),topZ=wall+(ph.h||2.3);
    const bodyDraw=walls(fp,wall+.3,topZ,{st:{facade:'office',floor:2.4,shop:'none'},body:'#e7dfd0'});
    fixtures.push({fp,z:wall+.3,draw:()=>{
      const capC=SEASON.snow?'#f4f1ea':'#d5cdc0';
      return bodyDraw()+shape(atZ(capFp,topZ),capC,.55);
    }});
  }

  for(const sk of rf.skylights||[]){
    const fp=obbBox(sk.x,sk.y,sk.w,sk.d),sh=sk.h||1.75;
    const curbDraw=walls(fp,wall+.3,wall+.75,{st:{facade:'plain',floor:5,shop:'none'},body:'#5e646d'});
    fixtures.push({fp,z:wall+.3,draw:()=>{
      const glassC=SEASON.night?'#ffe299':SEASON.snow?'#e8eef0':'#b4d6e0';
      const hw=sk.w*.5,hd=sk.d*.5,z0=wall+.75,apexZ=wall+sh;
      const pt=(u,v,z)=>[sk.x+ax[0]*u+nx[0]*v,sk.y+ax[1]*u+nx[1]*v,z];
      const p0=pt(-hw,-hd,z0),p1=pt(hw,-hd,z0),p2=pt(hw,hd,z0),p3=pt(-hw,hd,z0);
      const rA=pt(-(sk.w>=sk.d?hw*.72:0),-(sk.w<sk.d?hd*.72:0),apexZ);
      const rB=pt(sk.w>=sk.d?hw*.72:0,sk.w<sk.d?hd*.72:0,apexZ);
      const tris=sk.w>=sk.d?[[p0,p1,rB,rA],[p2,p3,rA,rB],[p1,p2,rB],[p3,p0,rA]]:[[p1,p2,rB,rA],[p3,p0,rA,rB],[p0,p1,rA],[p2,p3,rB]];
      let s=curbDraw();
      for(const q of tris){
        let n=vNewell(q);if(!n)continue;if(n[2]<0){q.reverse();n=vNewell(q)}
        if(vis(n))s+=shape(q,SEASON.night?glassC:tone(n,soft(glassC)),.45);
      }
      const bays=Math.max(2,Math.min(6,Math.round(Math.max(sk.w,sk.d)/2.6)));
      for(let i=1;i<bays;i++){
        const k=i/bays-.5;
        if(sk.w>=sk.d){
          const u=k*sk.w,m=[sk.x+ax[0]*u,sk.y+ax[1]*u,apexZ];
          s+=edge(pt(u,-hd,z0),m,'#525861',.09)+edge(pt(u,hd,z0),m,'#525861',.09);
        }else{
          const v=k*sk.d,m=[sk.x+nx[0]*v,sk.y+nx[1]*v,apexZ];
          s+=edge(pt(-hw,v,z0),m,'#525861',.09)+edge(pt(hw,v,z0),m,'#525861',.09);
        }
      }
      s+=edge(rA,rB,'#3f444c',.12);
      return s;
    }});
  }

  for(const gd of rf.gardens||[]){
    const gw=gd.w||gd.r*2,gdD=gd.d||gd.r*1.7;
    const fp=obbBox(gd.x,gd.y,gw,gdD);
    const bedDraw=walls(fp,wall+.3,wall+.68,{st:{facade:'plain',floor:4,shop:'none'},body:'#8d7256'});
    fixtures.push({fp,z:wall+.3,draw:()=>{
      const leafC=SEASON.snow?'#ecebe4':SEASON.leaves==='autumn'?'#de9a3c':'#72a65c';
      const turfC=SEASON.snow?'#e6e3da':'#8ab868';
      let s=bedDraw()+shape(atZ(fp,wall+.68),turfC,.45);
      const count=Math.min(5,Math.max(2,Math.round((gw+gdD)*.3)));
      for(let i=0;i<count;i++){
        const k=(i+.5)/count-.5,px=gd.x+ax[0]*k*gw*.62+nx[0]*Math.sin(i*2.1)*gdD*.18,py=gd.y+ax[1]*k*gw*.62+nx[1]*Math.sin(i*2.1)*gdD*.18;
        s+=ball([px,py,wall+1.05],.52,soft(leafC),.35);
      }
      return s;
    }});
  }

  if(!fixtures.length&&st.rooftop!=='none'&&b.area>120&&!b.cut){
    const xs=r.map(p=>p[0]),ys=r.map(p=>p[1]);
    for(let x=Math.ceil(Math.min(...xs)/7)*7;x<Math.max(...xs);x+=7)for(let y=Math.ceil(Math.min(...ys)/9)*9;y<Math.max(...ys);y+=9){
      if(rnd(x*3.1+y*9.7+hash(b.id))>.16)continue;const fp=rect(x,y,2.6,1.8);if(!fp.every(p=>inside(p,r)))continue;
      fixtures.push({fp,z:wall,draw:()=>peak(fp,wall,[x,y,wall+.01],'#c3c8c2')+shape(atZ(fp,wall+.75),'#d7dbd2',.45)+shape(atZ(rect(x,y,1.5,.8),wall+.82),'#9aa5a4',.3)});
    }
  }
  return ()=>{
    const roofC=SEASON.snow?snowy(col,.85):col;let s=shape(atZ(r,wall),roofC,.8);
    if(rim)for(let j=0;j<r.length;j++){const a=r[j],c=r[(j+1)%r.length];if(Math.hypot(c[0]-a[0],c[1]-a[1])<1||isEdgeCut(a,c))continue;
      s+=shape([...atZ([a,c],wall),...atZ([c,a],wall+rim)],mix(pickOf(st.wall,b.id),'#a99d90',.25),.45)+edge([...a,wall+rim],[...c,wall+rim],'#efe6d2',.14)}
    return s+fixtures.sort((p,q)=>depthOf([...p.fp[0],p.z||wall])-depthOf([...q.fp[0],q.z||wall])).map(x=>x.draw()).join('');
  };
}

/* ---------- helpers for hand-built landmarks (landmarks.js) ---------- */
// a full style object for walls(): the city's defaults with your changes
function makeStyle(o={}){return {facade:'plain',wall:['#eee2ca'],roofColour:['#c8c4b8'],roof:'flat',pitch:30,eaves:.45,levels:3,floor:LEVEL,shop:'none',parapet:.5,...(STYLES.default||{}),shop:'none',eave1:false,...o}}
// a gabled, hipped or pyramidal roof over any rectangle: centre c, ridge axis ax (unit), length L along it, width W
function roofOver({c,ax,L,W},wall,o={}){
  const st=makeStyle(o),b={id:'roof'+c.join(','),ring:[],obb:{c,ax,L,W,fill:1}},kind=o.roof||'gabled';
  const rise=o.rise||(W/2+st.eaves)*Math.tan(st.pitch*Math.PI/180);
  return pitchedRoof(b,{...st,ridge:'long'},wall,rise,kind,pickOf(st.roofColour,b.id));
}
// a flat-roofed block with painted elevations, as one model part: ring, base z, top z, style changes
function block(ring,z0,z1,o={}){const st=makeStyle(o),body=pickOf(st.wall,ring.join());const sides=walls(ring,z0,z1,{st,body});
  return {fp:ring,z1,draw:()=>sides()+shape(atZ(ring,z1),pickOf(o.top||st.flatRoof||st.roofColour,ring.join()),.7)}}

/* ---------- every building: generic block, or a hand-built landmark ---------- */
const REPLACED=new Set();
const LANDMARK_LIST=typeof LANDMARKS==='undefined'?[]:LANDMARKS;
for(const lm of LANDMARK_LIST)for(const id of lm.ids||[])REPLACED.add(id);
const findBuilding=id=>SCENE.buildings.find(b=>b.id===id)||SCENE.buildings.find(b=>b.of===id);   // an outline drawn as its parts: the first part
function buildingModel(b){
  const st=styleFor(b),kind=roofKind(b,st),{wall,top,rise}=heightsOf(b,st),z0=b.min||0;
  const body=pickOf(st.wall,b.id),roofCol=kind==='flat'&&st.roof!=='flat'&&st.roof!=='auto'?pickOf(st.flatRoof||'#c9c4ba',b.id+'r'):pickOf(kind==='flat'&&st.flatRoof?st.flatRoof:st.roofColour,b.id+'r');
  b.top=top;b.wall=wall;b.style=st;b.body=body;b.roofCol=roofCol;
  const shell=walls(b.ring,z0,wall,{st,b,body});
  const roof=kind==='flat'?flatRoof(b,st,wall,roofCol):pitchedRoof(b,st,wall,rise,kind,roofCol);
  return obj(b.ring,top+.3,()=>shell()+roof());
}
for(const b of SCENE.buildings){
  if(REPLACED.has(b.id)||REPLACED.has(b.of))continue;
  models.push(buildingModel(b));
}
for(const lm of LANDMARK_LIST){try{const out=lm.build();for(const m of [].concat(out))if(m)models.push(m)}catch(e){console.error('landmark',lm.name,e)}}

/* ccw(ring): the same outline running counter-clockwise. OSM outlines run either way; faces you build yourself from a ring
   ([a, b, b-up, a-up] for each edge a→b) face outward only on a counter-clockwise ring, so always pass rings through ccw. */
function ccw(r){const a=r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1]},0);return a<0?r.slice().reverse():r}
/* lightPool(x, y, r, colour, strength): light on the ground from a lamp, a fire or a tree, fading softly to its edge
   (stacked thin rings, brightest at the centre). Use a light colour (see LIT) so night does not dim it. */
function lightPool(x,y,r,col='#ffcf7a',a=.5,z=.03){let s='';const n=9;
  for(let k=n;k>=1;k--){const rr=r*k/n;s+='<g opacity="'+(a/n*1.6).toFixed(3)+'">'+shape(atZ(polygon(x,y,rr,Math.max(10,Math.round(rr*4))),z+.001*(n-k)),col,0)+'</g>'}
  return s}

/* standable(x, y): a person or a prop can stand here: inside the plot, not on water, not inside a building, and at least
   `gap` metres from the water's edge (the quay). Use it for any crowd or object a landmarks.js places by hand. */
function standable(x,y,gap=1){
  if(Math.abs(x)>HALF-.6||Math.abs(y)>HALF-.6)return false;
  const inRs=rs=>inside([x,y],rs[0])&&!rs.slice(1).some(h=>inside([x,y],h));
  for(const w of SCENE.water||[]){if(inRs(w))return false;
    if(gap>0)for(const r of w)for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy||1,
      t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/l));if(Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t)<gap)return false}}
  return !SCENE.buildings.some(b=>inside([x,y],b.ring));
}

/* ---------- planOrder: back-to-front order for parts that touch (a tower against a nave, wings of one building) ----------
   planSort compares footprints and can guess wrong when volumes touch or differ a lot in size. Here every pair whose
   footprints can be split by a line (allowing tol metres of overlap, e.g. eaves) is ordered by the side of that line
   the reader is on; pairs that overlap in plan go lower-first. Parts: {fp, z1, svg}. Use it for any landmark made of
   several volumes. */
function planOrder(parts,tol=.35){
  const n=parts.length,H=parts.map(p=>hull(p.fp.map(q=>[q[0],q[1]]))),after=parts.map(()=>new Set()),deg=new Array(n).fill(0);
  const sep=(A,B)=>{for(const P of [A,B])for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],m=norm([b[1]-a[1],a[0]-b[0],0]);
      const pa=A.map(q=>q[0]*m[0]+q[1]*m[1]),pb=B.map(q=>q[0]*m[0]+q[1]*m[1]);
      if(Math.max(...pa)<=Math.min(...pb)+tol)return m;if(Math.max(...pb)<=Math.min(...pa)+tol)return m.map(v=>-v)}return null};
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const m=sep(H[i],H[j]);let first;
    if(m)first=vis([m[0],m[1],0])?i:j;           // m points from i toward j: a reader on j's side sees j in front
    else first=(parts[i].z0||0)+parts[i].z1<=(parts[j].z0||0)+parts[j].z1?i:j;
    const second=first===i?j:i;if(!after[first].has(second)){after[first].add(second);deg[second]++}}
  const out=[],queue=[];for(let i=0;i<n;i++)if(!deg[i])queue.push(i);
  while(queue.length){const i=queue.shift();out.push(i);for(const j of after[i])if(!--deg[j])queue.push(j)}
  if(out.length<n)return planSort(parts);        // a cycle (interlocking shapes): fall back
  return out.map(i=>parts[i].svg).join('');
}

/* ---------- trees ---------- */
const TREE_RULES=(CITY.trees||{}).rules||[],TREE_DEFAULT={style:3,colours:['#8ab673','#adca7c'],height:8,...((CITY.trees||{}).default||{})};
const treeRule=sp=>TREE_RULES.find(r=>new RegExp(r.match,'i').test(sp))||TREE_DEFAULT;
const TREE_SOURCE=SCENE.trees.concat(((CITY.trees||{}).extra||[]).map(([x,y,h,sp])=>[x,y,-2,String(h||''),sp]));
// many trees (a wood): each one gets fewer, larger leaves, since crowns overlap and the detail never shows; this keeps turning smooth
const CITY_LOD=Math.max(.13,TREE_LOD*Math.min(1,220/Math.max(1,TREE_SOURCE.length)));
const TREES=TREE_SOURCE.map(([x,y,s,hs,extraSp],i)=>{
  const species=extraSp||SCENE.species[s]||'',base={...TREE_DEFAULT,...treeRule(species)};
  // a rule may hold a mix (woods: holm oak, pine, cypress): each tree picks one by its position, weighted by share
  let rule=base;if(base.mix){const tot=base.mix.reduce((a,m)=>a+(m.share||1),0);let r=rnd(x*.37+y*1.71)*tot;rule={...base,...(base.mix.find(m=>(r-=(m.share||1))<0)||base.mix[0])}}
  const h=(+hs||rule.height||8)*(rule.vary?1-rule.vary/2+rule.vary*rnd(x*1.3+y*.7):1)*STY.treeScale;
  const style=rule.style||3,cols=rule.colours||TREE_DEFAULT.colours,m=soft(cols[i%cols.length]);
  const geo=makeTree(style,{x,y,H:h,seed:i+1,m,lod:CITY_LOD});
  // limbs: the same tree without its twigs. A tree in leaf is drawn from this, so no twig can poke out of its crown (twigs belong to bare trees)
  return {x,y,i,h,base:0,style,m,geo,limbs:{...geo,twigs:[]},ext:geo.ext,zTop:geo.zTop,rule,species};
});
const LOOK=new Map();
function treeLook(tr){
  let o=LOOK.get(tr);if(o)return o;
  const L=SEASON.leaves||'summer',r=tr.rule;
  o=r.evergreen?{}:L==='bare'?{keep:r.winter?.4:0,m:r.winter?soft(r.winter):undefined}
    :L==='spring'?{keep:.82,m:soft(r.spring||'#c4e481'),m2:soft('#a3d873'),share:.4}
    :L==='blossom'?(r.blossom?{keep:.96,m:soft(r.blossom),m2:soft(mix(r.blossom,'#ffffff',.4)),share:.45}:{keep:.85,m:soft(r.spring||'#c4e481')})
    :L==='autumn'?{keep:.86,m:soft(r.autumn||'#dba646'),m2:soft(mix(r.autumn||'#dba646','#c25a3c',.45)),share:.35}
    :{};
  const lit=SEASON.night&&SEASON.decor&&SEASON.decor.litTrees&&new RegExp(SEASON.decor.litTrees,'i').test(tr.species);   // light-up: these trees stay bright
  o={keep:1,...o};if(SEASON.night&&!lit){o.m=softNight(o.m||tr.m);if(o.m2)o.m2=softNight(o.m2)}LOOK.set(tr,o);return o;
}

/* ---------- people and vehicles ---------- */
const PEOPLE=CITY.people||{};
const SKINS=(PEOPLE.skin||['#f0c5a1','#dcaa82','#c48d65','#a87154','#f6d2b4']).map(soft);
const CLOTHES=PEOPLE.clothes||['#d68070','#538e91','#e2ad59','#7994b4','#b991a3','#efe3cd','#5f9e7f'];
const PANTS=PEOPLE.pants||['#515c70','#3f4a6e','#5a5560','#7a6a58','#2f3a52'],HAIR=PEOPLE.hair||['#2b211c','#3d2c1f','#1f1b22','#5a3a26','#8a6a4a'];
const pk=(list,r)=>list[Math.floor(r*list.length)%list.length];
function pedDressed(k){
  const o={skin:pk(SKINS,rnd(k*5.1)),shirt:pk(CLOTHES,rnd(k*6.3)),pants:pk(PANTS,rnd(k*7.9)),hair:pk(HAIR,rnd(k*8.7)),tall:.94+.13*rnd(k+2)};
  const oc=SEASON.dress;
  if(oc&&rnd(k*3.3+.7)<(oc.share??.6))o.shirt=pk(oc.colours,rnd(k*4.1));
  else if(SEASON.coats)winterWear(o,k);
  if(SEASON.umbrellas&&rnd(k+14)<.78)o.umb=soft(pk(PEOPLE.umbrellas||CLOTHES,rnd(k*2.3)));
  if(rnd(k*4.7+.2)<.34)o.bag=pk(['#4a3b34','#2d3a4b','#8c5b3e','#5b6b58'],rnd(k*9.1));
  return o;
}
function bikeLook(k){
  const o={
    k,
    skin:pk(SKINS,rnd(k*5.3+.1)),
    shirt:pk(CLOTHES,rnd(k*3.7)),
    pants:pk(PANTS,rnd(k*8.1+.3)),
    hair:pk(HAIR,rnd(k*6.7+.2)),
    frame:pk(PEOPLE.bikes||['#387779','#ba7663','#629684','#4b4b55'],rnd(k*1.9)),
    stepThrough:rnd(k*2.9+.4)<.6,
    basket:rnd(k*4.3+.7)<.45,
    pannier:rnd(k*7.1+.5)<.32?pk(['#334155','#7f3e34','#3f5e4d','#a8763e'],rnd(k*5.9)):null,
  };
  return SEASON.coats?winterWear(o,k):o;
}
const VEH=CITY.vehicles||{};
const VKINDS=(VEH.kinds||['sedan','hatch','suv','small','mpv']).map(kind=>makeCar(kind,{plate:VEH.plate||'#f2f2ee',frontPlate:VEH.frontPlate||VEH.plate||'#f2f2ee'}));
const TAXI=VEH.taxi?makeCar(VEH.taxi.kind||'sedan',{plate:VEH.plate||'#f2f2ee',sign:VEH.taxi.sign||'#fbefd5'}):null;
const isTaxi=k=>TAXI&&rnd(k*5.1)<(VEH.taxi.share||.2);
const carModel=k=>isTaxi(k)?TAXI:VKINDS[k%VKINDS.length];
const carProps=k=>({mesh:carModel(k),m:soft(isTaxi(k)?pk(VEH.taxi.colours||['#f2c230'],rnd(k*6.1)):pk(VEH.colours||['#d48a79','#eff0da','#90b7ab','#a5afcb','#4b4b55','#f2f2ee'],rnd(k*2.7)))});

/* ---------- seasons, weather and special occasions ---------- */
const SEASONS=(CITY.seasons||[{id:'summer',label:'Summer'}]).concat((CITY.occasions||[]).map(o=>({...o,special:true})));
let SEASON={},TRAFFIC=null,DECOR=null,GROUND,ROAD,PAVE,WALK,GRASS,WATER;
function setGroundColours(){
  const wet=c=>mix(c,'#6f7390',.14),sn=!!SEASON.snow;
  GROUND=sn?snowy(PAL.ground,.9):SEASON.wet?wet(PAL.ground):PAL.ground;
  PAVE=sn?snowy(PAL.pavement,.7):SEASON.wet?wet(PAL.pavement):PAL.pavement;
  WALK=sn?snowy(PAL.walk,.7):SEASON.wet?wet(PAL.walk):PAL.walk;
  ROAD=sn?snowy(PAL.road,.3):SEASON.wet?mix(PAL.road,'#7d82a8',.2):PAL.road;
  GRASS=sn?snowy(PAL.grass,.88):SEASON.grass||(SEASON.leaves==='bare'?mix(PAL.grass,'#c9bf98',.35):PAL.grass);   // "grass": "#hex" on a season overrides it (a Mediterranean winter is green)
  WATER=SEASON.ice?'#dfe9ec':PAL.water;
}
const ALL_ROUTES=(SCENE.routes||[]).concat(CITY.extraRoutes||[],typeof LANDMARK_ROUTES!=='undefined'?LANDMARK_ROUTES:[]);
const PED_PAIR_KEYS=new Set();
for(const r of ALL_ROUTES){if(r.kind==='ped'&&r.p.length>=2){const a=r.p[0],b=r.p[r.p.length-1];PED_PAIR_KEYS.add(`${Math.round(a[0])},${Math.round(a[1])}->${Math.round(b[0])},${Math.round(b[1])}`)}}
const TR_CFG=CITY.traffic||{};
const FEEDS=ALL_ROUTES.map((r,i)=>{
  let sideOff=0;
  if(r.kind==='ped'&&r.p.length>=2){
    const a=r.p[0],b=r.p[r.p.length-1];
    const revKey=`${Math.round(b[0])},${Math.round(b[1])}->${Math.round(a[0])},${Math.round(a[1])}`;
    if(PED_PAIR_KEYS.has(revKey))sideOff=.55;
  }
  const baseInt=r.kind==='car'?(TR_CFG.carInterval??7.5):r.kind==='bike'?(TR_CFG.bikeInterval??10):(TR_CFG.pedInterval??7.5);
  return {kind:r.kind,paths:[measuredLane({...r,sideOff,junctions:[]})],interval:baseInt*(PHONE?1.4:1)};
});
function setSeason(id){
  const st=SEASONS.find(s=>s.id===id)||SEASONS[0];
  SEASON={...st};SEASON_ID=st.id;LOOK.clear();DECOR=null;setGroundColours();
  const c=SEASON.crowd??1;
  const flow=FEEDS.map((f,i)=>({...f,walkSpeed:1.12,interval:f.interval/(f.kind==='ped'?c:Math.max(.4,Math.min(1.4,c)))}));
  const cap=TR_CFG.capacity||(PHONE?90:155);
  TRAFFIC=streetSimulation(flow,Math.round(cap*Math.min(1.6,c)),500);
}
setSeason(SEASON_Q||SEASONS[0].id);

/* ---------- night (a season or occasion with night: true) ----------
   Every colour the painter fills is turned to dusk; the warm light colours below stay as they are, so windows,
   shopfronts, lamps and fairy lights read as lit. No glow: lights are flat bright marks, like the rest of the style. */
const LIT=new Set(['#ffe6ec','#fbd3dd','#ffd98a','#ffe7a8','#fff3c4','#fbefc8','#f6c445','#ffb85c','#fff8e0','#f2c94c','#fde9b0','#ffcf7a','#ff8a3d','#f26a2e','#ffc069']);
const NIGHTC=new Map();
function nightCol(c){
  if(!SEASON.night||typeof c!=='string'||c[0]!=='#'||LIT.has(c))return c;
  let o=NIGHTC.get(c);if(o)return o;
  let h=c.slice(1);if(h.length===3||h.length===4)h=h.slice(0,3).split('').map(x=>x+x).join('');if(h.length<6)return c;
  const n=parseInt(h.slice(0,6),16),r=n>>16,g=n>>8&255,b=n&255,K=SEASON.night===true?1:+SEASON.night;
  const R=Math.round(r*(1-.5*K)+12*K),G=Math.round(g*(1-.52*K)+16*K),B=Math.round(b*(1-.4*K)+40*K);   // dusk: keep each colour's hue, sink it toward blue
  o='#'+((1<<24)+(Math.min(255,R)<<16)+(Math.min(255,G)<<8)+Math.min(255,B)).toString(16).slice(1);NIGHTC.set(c,o);return o;
}
const softNight=m=>SEASON.night&&m?{l:nightCol(m.l),m:nightCol(m.m),d:nightCol(m.d)}:m;
if(typeof compileInk==='function'){const inkOps=compileInk;compileInk=function(markup){const ops=inkOps(markup);
  if(SEASON.night)for(const op of ops){if(op.fill)op.fill=nightCol(op.fill);if(op.stroke)op.stroke=nightCol(op.stroke)}return ops}}

/* ---------- street furniture ---------- */
const streetFurniture=[];
const LAMP=CITY.lamp||{};
const LAMP_AT=[];   // lamp positions: at night their light pools are painted with the ground, so no part box clips them
function lamp(x,y){
  LAMP_AT.push([x,y]);
  const col=LAMP.colour||'#5d6b66',hgt=LAMP.height||5.2,head=LAMP.head||'#f3e7c4';
  streetFurniture.push(obj(rect(x,y,.5,.5),hgt+.5,()=>stick([x,y,0],[x,y,hgt],.07,col)+ball([x,y,hgt+.15],.24,SEASON.night?{l:'#fff3c4',m:'#fff3c4',d:'#ffd98a'}:soft(head),.4)+stick([x,y,hgt+.32],[x,y,hgt+.42],.1,col)));
}
for(const fu of SCENE.furniture||[]){
  if(fu.k==='lamp')lamp(fu.x,fu.y);
  else if(fu.k==='cafe'){const C=CITY.cafes||{},col=pickOf(C.umbrellas||['#f3efe4','#2f5f8a','#b8483b','#e8c36a'],'u'+fu.i),x=fu.x,y=fu.y,r=1.15;
    streetFurniture.push(Object.assign(obj(rect(x,y,2.3,2.3),2.6,()=>{let g=shape(atZ(polygon(x,y,.36,8),.74),C.table||'#f1ece0',.35)+stick([x,y,0],[x,y,.74],.04,'#6b6660');
      for(const a of [0,Math.PI])g+=shape(atZ(rect(x+Math.cos(a)*.62,y+Math.sin(a)*.62,.36,.36),.45),C.chair||'#8a6f55',.3);
      // "cafes":"closed" on a season folds the umbrellas (rain, off-hours); "cafes":false puts the tables away (see scene)
      const shut=SEASON.cafes==='closed',rr=shut?.2:r;
      g+=stick([x,y,.74],[x,y,2.25],.035,'#d8d2c6');const rim=polygon(x,y,rr,8,.39).map(p=>[...p,shut?1.2:1.95]),apex=[x,y,shut?2.3:2.45];
      for(let i=0;i<8;i++){const a=rim[i],b=rim[(i+1)%8],n=norm(cross(sub(b,a),sub(apex,a)));if(vis(n))g+=shape([a,b,apex],tone(n,soft(i%2&&C.stripes!==false?mix(col,'#ffffff',.55):col)),.35)}
      return g}),{kind:'cafe'}))}
  else if(fu.k==='bench'){const fp=rect(fu.x,fu.y,1.6,.6);streetFurniture.push(obj(fp,.9,()=>shape(atZ(fp,.45),'#a98a68',.45)+shape([[fu.x-.8,fu.y+.28,.48],[fu.x+.8,fu.y+.28,.48],[fu.x+.8,fu.y+.3,.9],[fu.x-.8,fu.y+.3,.9]],'#b39470',.4)))}
  else if(fu.k==='planter'){const fp=rect(fu.x,fu.y,1.5,.85),boxDraw=walls(fp,0,.5,{st:{facade:'plain',floor:2,shop:'none'},body:'#d8cfc0'});streetFurniture.push(obj(fp,1.1,()=>{const lc=SEASON.snow?'#ecebe4':SEASON.leaves==='autumn'?'#d99842':'#6fa458',fc=SEASON.snow?'#f4f2ec':(fu.i%2?'#df7665':'#e8be59');return boxDraw()+shape(atZ(fp,.5),'#7c6852',.35)+ball([fu.x-.32,fu.y,.72],.32,soft(lc),.3)+ball([fu.x+.25,fu.y,.76],.34,soft(lc),.3)+ball([fu.x,fu.y+.05,.86],.16,soft(fc),.25)}))}
  else if(fu.k==='kiosk'){const fp=rect(fu.x,fu.y,2.6,1.8),bodyDraw=walls(fp,0,2.2,{st:{facade:'timber',floor:2.2,shop:'none',wood:'#5e3c2d',slat:'#845944'},body:'#efe5d0'});streetFurniture.push(obj(fp,3.2,()=>{const ac=SEASON.snow?'#f2efe8':'#b85444',winC=SEASON.night?'#ffe299':'#a8cad4';return bodyDraw()+shape([[fu.x-1.2,fu.y-.92,.9],[fu.x+1.2,fu.y-.92,.9],[fu.x+1.2,fu.y-.92,1.85],[fu.x-1.2,fu.y-.92,1.85]],winC,.35)+peak(rect(fu.x,fu.y,2.95,2.15),2.2,[fu.x,fu.y,2.95],ac)}))}
  else if(fu.k==='vending'){const fp=rect(fu.x,fu.y,1,.8);streetFurniture.push(obj(fp,1.9,()=>walls(fp,0,1.85,{st:{facade:'plain',floor:2,shop:'none'},body:'#d9dde0'})()+shape(atZ(fp,1.85),'#c9cdd0',.4)))}
  else if(fu.k==='bus_stop'&&fu.shelter){
    let best=null,bd=1e9;for(const r of SCENE.routes)if(r.kind==='car')for(let i=1;i<r.p.length;i++){const a=r.p[i-1],c=r.p[i],dx=c[0]-a[0],dy=c[1]-a[1],t=Math.max(0,Math.min(1,((fu.x-a[0])*dx+(fu.y-a[1])*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(a[0]+dx*t-fu.x,a[1]+dy*t-fu.y);if(d<bd){bd=d;best=[dx,dy]}}
    if(!best)continue;const l=Math.hypot(...best),u=[best[0]/l,best[1]/l],n=[-u[1],u[0]];
    const at=(s,d)=>[fu.x+u[0]*s+n[0]*d,fu.y+u[1]*s+n[1]*d],q=(s0,s1,d0,d1)=>[at(s0,d0),at(s1,d0),at(s1,d1),at(s0,d1)];
    const roofFp=q(-3,3,-.9,.9);
    streetFurniture.push(obj(roofFp,2.9,()=>[-2.6,2.6].map(s=>stick([...at(s,.7),0],[...at(s,.7),2.7],.06,'#6b7275')).join('')+shape(atZ(q(-2.2,2.2,.3,.7),.46),'#9aa1a3',.35)+shape(atZ(roofFp,2.75),'#5e6568',.45)));
  }
}
if(!(SCENE.furniture||[]).some(f=>f.k==='lamp')&&LAMP.auto!==false){   // no mapped lamps: one every 24 m along each pavement edge
  const seen=[];
  for(const r of SCENE.routes){if(r.kind!=='ped')continue;const L=measuredLane({p:r.p,junctions:[]});
    for(let s=6;s<L.len-4;s+=24){const {p,d}=tAt(L,s),q=[p[0]+d[1]*.9,p[1]-d[0]*.9];
      if(seen.some(o=>Math.hypot(o[0]-q[0],o[1]-q[1])<14)||!inRings(q,SCENE.paths.concat(SCENE.walk)))continue;
      if(SCENE.buildings.some(b=>inside(q,b.ring)))continue;seen.push(q);lamp(...q)}}
}

/* ---------- boats moored on the quays and at anchor (prep.py places them; colours from CITY.boats) ---------- */
const BOATCFG={hulls:['#f3efe4','#f3efe4','#2f5f8a','#b8483b','#3f7a5c','#f3efe4'],stripes:['#2f5f8a','#b8483b','#3f7a5c','#e0b04a'],
  covers:['#3f6e9a','#5c8c6a','#c9c2b0'],inside:'#c8a27a',cabin:'#f6f3ea',...(CITY.boats||{})};
const SLOOP_POOL=BOATCFG.style==='amsterdam'?Array.from({length:8},(_,i)=>{
  const hCol=BOATCFG.hulls[i%BOATCFG.hulls.length];
  const ppl=Array.from({length:3+(i%4)},(__,j)=>({shirt:CLOTHES[(i*3+j)%CLOTHES.length],skin:SKINS[(i+j)%SKINS.length]}));
  return makeBoat('sloop',{hull:soft(hCol),people:ppl});
}):null;
const TOUR_MESH=BOATCFG.style==='amsterdam'?makeBoat('tour',{hull:soft('#2d4b5e')}):null;
const CRUISING_LANES=(BOATCFG.cruising||[]).map((cr,i)=>({
  ...cr,
  lane:measuredLane({p:cr.p,junctions:[]}),
  mesh:cr.kind==='tour'?TOUR_MESH:(SLOOP_POOL?SLOOP_POOL[i%SLOOP_POOL.length]:null),
})).filter(cr=>cr.lane.len>10&&cr.mesh);
function cruisingBoats(t){
  if(SEASON.ice||!CRUISING_LANES.length)return [];
  const out=[];
  for(const [ci,cr] of CRUISING_LANES.entries()){
    const L=cr.lane.len,speed=cr.speed||1.6,period=L/speed*2;
    const ph=((t+(cr.phase||ci*11))%period)/period,fwd=ph<.5?ph*2:2-ph*2,dir=ph<.5?1:-1;
    const s=Math.max(4,Math.min(L-4,4+fwd*(L-8))),{p,d}=tAt(cr.lane,s);
    const vx=d[0]*dir,vy=d[1]*dir,nx=-vy,ny=vx;
    const hLen=cr.mesh.L*.5,hWid=cr.mesh.W*.5;
    const fp=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[p[0]+vx*hLen*a+nx*hWid*b,p[1]+vy*hLen*a+nx*hWid*b]);
    const z1=cr.kind==='tour'?1.9:1.35;
    out.push({fp,z0:0,z1,svg:(()=>{
      const wk1=[p[0]-vx*hLen,p[1]-vy*hLen,.02],wkL=[p[0]-vx*(hLen+4.8)+nx*1.2,p[1]-vy*(hLen+4.8)+ny*1.2,.02],wkR=[p[0]-vx*(hLen+4.8)-nx*1.2,p[1]-vy*(hLen+4.8)-ny*1.2,.02];
      const wake=edge(wk1,wkL,'rgba(244,251,248,.62)',.14)+edge(wk1,wkR,'rgba(244,251,248,.62)',.14);
      return wake+drawVehicle(cr.mesh,{c:p,d:[vx,vy],z:0,mats:{},w:.45});
    })()});
  }
  return out;
}
const BOATS=(SCENE.boats||[]).map((b,bi)=>{
  const L=b.l,W=Math.max(1.5,L*.31),ca=Math.cos(b.a*Math.PI/180),sa=Math.sin(b.a*Math.PI/180),k=b.k;
  if(SLOOP_POOL&&!b.anchor&&L<=8.6){
    const mesh=SLOOP_POOL[bi%SLOOP_POOL.length];
    return obj(polygon(b.x,b.y,L*.52,8),1.35,()=>drawVehicle(mesh,{c:[b.x,b.y],d:[ca,sa],z:0,mats:{},w:.42}));
  }
  const at=(u,v,z)=>[b.x+u*ca-v*sa,b.y+u*sa+v*ca,z];
  const N=7,st=[];for(let i=0;i<=N;i++)st.push(-1+2*i/N);
  const half=t=>Math.pow(Math.max(0,1-Math.pow(Math.abs(t),2.4)),.55);
  const side=sgn=>st.map(t=>({t,w:half(t)*sgn}));
  const outline=[...side(1),...side(-1).reverse()].filter((q,i,arr)=>i===0||Math.abs(q.w)>.01||Math.abs(arr[i-1].w)>.01);
  const sheer=t=>.95+.3*t*t,top=outline.map(q=>at(q.t*L/2,q.w*W/2,sheer(q.t))),low=outline.map(q=>at(q.t*L*.45,q.w*W*.38,.04));
  const hull=pickOf(BOATCFG.hulls,'h'+k),stripe=pickOf(BOATCFG.stripes,'s'+k),big=b.anchor&&L>=9;
  const cover=!big&&rnd(k*3.7)<.45?pickOf(BOATCFG.covers,'c'+k):null,sail=big&&rnd(k*1.3)<.55;
  const fp=rect(b.x,b.y,L,L).map(([x,y])=>[x,y]);
  return obj(polygon(b.x,b.y,L*.5,8),sail?L*1.3:2,()=>{
    let g='';
    for(let i=0;i<top.length;i++){const j=(i+1)%top.length,a1=top[i],b1=top[j],a0=low[i],b0=low[j];
      let n=norm([b1[1]-a1[1],-(b1[0]-a1[0]),-.12]);const mx=(a1[0]+b1[0])/2-b.x,my=(a1[1]+b1[1])/2-b.y;
      if(n[0]*mx+n[1]*my<0)n=[-n[0],-n[1],n[2]];if(!vis(n))continue;   // outward, whichever way the outline runs
      const mid=(p,q,t)=>p.map((v,d)=>v+(q[d]-v)*t);
      g+=shape([a0,b0,mid(b0,b1,.78),mid(a0,a1,.78)],tone(n,soft(hull)),.45)+shape([mid(a0,a1,.78),mid(b0,b1,.78),b1,a1],tone(n,soft(stripe)),.45)}
    g+=shape(top,cover||hull,.5);
    if(!cover){g+=shape(outline.map(q=>at(q.t*L*.4,q.w*W*.3,sheer(q.t)-.05)),BOATCFG.inside,.35);const inner=outline.map(q=>at(q.t*L*.36,q.w*W*.22,.6));g+=shape(inner,mix(BOATCFG.inside,'#5c4632',.25),.3);
      for(const t of [-.3,.2])g+=shape([at(t*L/2-.12,-W*.28,.8),at(t*L/2+.12,-W*.28,.8),at(t*L/2+.12,W*.28,.8),at(t*L/2-.12,W*.28,.8)],BOATCFG.inside,.3)}
    if(big){const cu=-.05*L,cl=L*.32,cw=W*.55,ch=1.1,box=[at(cu-cl/2,-cw/2,.9),at(cu+cl/2,-cw/2,.9),at(cu+cl/2,cw/2,.9),at(cu-cl/2,cw/2,.9)];
      g+=walls(box.map(p=>[p[0],p[1]]),.9,.9+ch,{st:{facade:'plain',floor:9,shop:'none'},body:BOATCFG.cabin})()+shape(box.map(p=>[p[0],p[1],.9+ch]),BOATCFG.cabin,.45)}
    if(sail){const m=at(L*.12,0,0);g+=stick([m[0],m[1],.9],[m[0],m[1],L*1.25],.05,'#8a8478')+stick([m[0],m[1],1.9],[...at(-L*.38,0,0).slice(0,2),1.9],.04,'#8a8478')}
    return g});
});

/* ---------- multi-level bridges, footbridges, monorails & tunnel portals ---------- */
function extrudeBoxQuad(a,b,hw,z0a,z1a,z0b,z1b,topCol,sideCol,ink=.45){
  const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1,nx=-dy/L*hw,ny=dx/L*hw;
  const aL=[a[0]+nx,a[1]+ny],aR=[a[0]-nx,a[1]-ny],bL=[b[0]+nx,b[1]+ny],bR=[b[0]-nx,b[1]-ny];
  const quads=[
    [...atZ([aL,bL],z0a),...atZ([bL,aL],z1a)],
    [...atZ([bR,aR],z0b),...atZ([aR,bR],z1b)],
    [[...aR,z0a],[...aL,z0a],[...aL,z1a],[...aR,z1a]],
    [[...bL,z0b],[...bR,z0b],[...bR,z1b],[...bL,z1b]],
  ];
  let s='';
  for(const q of quads){
    if(Math.abs(z1a-z0a)<.02&&Math.abs(z1b-z0b)<.02)continue;
    let n=vNewell(q);if(n&&vis(n))s+=shape(q,tone(n,soft(sideCol)),ink);
  }
  const topQ=[[...aL,z1a],[...aR,z1a],[...bR,z1b],[...bL,z1b]];
  let tn=vNewell(topQ);
  if(tn&&tn[2]<0){topQ.reverse();tn=vNewell(topQ)}
  if(tn&&vis(tn))s+=shape(topQ,tone(tn,soft(topCol)),ink);
  return {fp:[aL,aR,bR,bL],svg:s};
}
function addBridgePier(cx,cy,z0,z1,r,col,capW=0){
  const fp=rect(cx,cy,Math.max(r*2,capW),Math.max(r*2,capW));
  models.push(obj(fp,z1,()=>{
    let s='';
    const shaft=rect(cx,cy,r*2,r*2);
    const zShaft=capW>0?Math.max(z0,z1-.75):z1;
    for(let i=0;i<4;i++){
      const p0=shaft[i],p1=shaft[(i+1)%4],q=[[...p0,z0],[...p1,z0],[...p1,zShaft],[...p0,zShaft]];
      const n=vNewell(q);if(n&&vis(n))s+=shape(q,tone(n,soft(col)),.45);
    }
    if(capW>0&&z1>zShaft+.05){
      const cap=rect(cx,cy,capW,capW);
      for(let i=0;i<4;i++){
        const p0=cap[i],p1=cap[(i+1)%4],q=[[...p0,zShaft],[...p1,zShaft],[...p1,z1],[...p0,z1]];
        const n=vNewell(q);if(n&&vis(n))s+=shape(q,tone(n,soft(mix(col,'#ffffff',.12))),.45);
      }
      s+=shape(atZ(cap,z1),mix(col,'#ffffff',.16),.4);
    }
    return s;
  },z0));
}
const MONORAIL_TRACKS=[];
for(const br of SCENE.bridges||[]){
  if(!br.p||br.p.length<2)continue;
  const lane=measuredLane({p:br.p,junctions:[]});
  if(lane.len<1.5)continue;
  if(br.kind==='monorail'&&lane.len>=24)MONORAIL_TRACKS.push({lane,z:br.z,name:br.name||''});

  const depth=br.kind==='monorail'?1.25:br.kind==='road_bridge'?1.05:br.kind==='rail_viaduct'?1.0:0.6;
  const deckBot=Math.max(0.1,br.z-depth);
  if(br.kind!=='steps_bridge'&&br.z>=2.2){
    const step=br.kind==='footbridge'?16:20;
    for(let s=Math.min(6,lane.len*.3);s<lane.len-3;s+=step){
      let p=tAt(lane,s).p;
      if(inRings(p,SCENE.roads)){
        const pFwd=tAt(lane,Math.min(lane.len-1.5,s+4)).p,pBack=tAt(lane,Math.max(1.5,s-4)).p;
        if(!inRings(pFwd,SCENE.roads))p=pFwd;
        else if(!inRings(pBack,SCENE.roads))p=pBack;
        else continue;
      }
      if(br.kind==='monorail')addBridgePier(p[0],p[1],0,deckBot,.52,'#b8b1a5',2.0);
      else if(br.kind==='footbridge')addBridgePier(p[0],p[1],0,deckBot,.34,'#c2bab0');
      else addBridgePier(p[0],p[1],0,deckBot,.65,'#b5aea2');
    }
  }

  for(let i=0;i<br.p.length-1;i++){
    const P0=br.p[i],P1=br.p[i+1],segL=Math.hypot(P1[0]-P0[0],P1[1]-P0[1]);
    if(segL<.2)continue;
    const nSegs=Math.max(1,Math.ceil(segL/12));
    for(let k=0;k<nSegs;k++){
      const u0=k/nSegs,u1=(k+1)/nSegs;
      const a=[P0[0]+(P1[0]-P0[0])*u0,P0[1]+(P1[1]-P0[1])*u0];
      const b=[P0[0]+(P1[0]-P0[0])*u1,P0[1]+(P1[1]-P0[1])*u1];
      const hw=br.w*.5;
      const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L;
      const fp=[[a[0]+nx*hw,a[1]+ny*hw],[a[0]-nx*hw,a[1]-ny*hw],[b[0]-nx*hw,b[1]-ny*hw],[b[0]+nx*hw,b[1]+ny*hw]];

      if(br.kind==='steps_bridge'){
        const za=(br.z0??br.z)+((br.z1??0)-(br.z0??br.z))*(i+u0)/Math.max(1,br.p.length-1);
        const zb=(br.z0??br.z)+((br.z1??0)-(br.z0??br.z))*(i+u1)/Math.max(1,br.p.length-1);
        const zMin=Math.max(0,Math.min(za,zb)-.55),zMax=Math.max(za,zb)+1.1;
        models.push(obj(fp,zMax,()=>{
          const topC=SEASON.snow?'#f1eee8':'#e2dac8';
          let s=extrudeBoxQuad(a,b,hw,Math.max(0,za-.55),za,Math.max(0,zb-.55),zb,topC,'#c6beb0').svg;
          const steps=Math.max(2,Math.round(L/.55));
          for(let st=1;st<steps;st++){
            const t=st/steps,px=a[0]+dx*t,py=a[1]+dy*t,pz=za+(zb-za)*t+.04;
            s+=edge([px+nx*(hw-.15),py+ny*(hw-.15),pz],[px-nx*(hw-.15),py-ny*(hw-.15),pz],'#7d7569',.08);
          }
          for(const sg of [-1,1]){
            const ox=nx*(hw-.1)*sg,oy=ny*(hw-.1)*sg;
            s+=stick([a[0]+ox,a[1]+oy,za+.92],[b[0]+ox,b[1]+oy,zb+.92],.055,'#59646d');
          }
          return s;
        },zMin));
      }else if(br.kind==='footbridge'){
        models.push(obj(fp,br.z+1.15,()=>{
          const topC=SEASON.snow?'#f1eee8':'#ebe2cf';
          let s=extrudeBoxQuad(a,b,hw,deckBot,br.z,deckBot,br.z,topC,'#cfc7b8').svg;
          for(const sg of [-1,1]){
            const ox=nx*(hw-.1)*sg,oy=ny*(hw-.1)*sg;
            s+=stick([a[0]+ox,a[1]+oy,br.z+1.0],[b[0]+ox,b[1]+oy,br.z+1.0],.05,'#59646d');
            for(let st=0;st<=Math.max(1,Math.round(L/3));st++){
              const t=st/Math.max(1,Math.round(L/3)),px=a[0]+dx*t+ox,py=a[1]+dy*t+oy;
              s+=stick([px,py,br.z],[px,py,br.z+1.0],.04,'#6d7780');
            }
          }
          return s;
        },deckBot));
      }else if(br.kind==='monorail'){
        models.push(obj(fp,br.z+.2,()=>{
          let s=extrudeBoxQuad(a,b,hw,deckBot,br.z,deckBot,br.z,'#d2ccc0','#b5aea2',.5).svg;
          for(const sg of [-1,1]){
            const ox=nx*(hw+.04)*sg,oy=ny*(hw+.04)*sg;
            s+=edge([a[0]+ox,a[1]+oy,br.z-.28],[b[0]+ox,b[1]+oy,br.z-.28],'#4c5159',.12);
          }
          return s;
        },deckBot));
      }else if(br.kind==='rail_viaduct'){
        models.push(obj(fp,br.z+.95,()=>{
          let s=extrudeBoxQuad(a,b,hw,deckBot,br.z,deckBot,br.z,SEASON.snow?'#f1eee8':'#c9c2b4','#b5aea2').svg;
          for(const sg of [-1,1]){
            const rx=nx*.72*sg,ry=ny*.72*sg;
            s+=edge([a[0]+rx,a[1]+ry,br.z+.05],[b[0]+rx,b[1]+ry,br.z+.05],PAL.rail,.13);
            const px=nx*(hw-.12)*sg,py=ny*(hw-.12)*sg;
            s+=stick([a[0]+px,a[1]+py,br.z+.45],[b[0]+px,b[1]+py,br.z+.45],.14,'#d2ccc0');
          }
          return s;
        },deckBot));
      }else{
        models.push(obj(fp,br.z+.9,()=>{
          const topC=SEASON.snow?'#f1eee8':ROAD;
          let s=extrudeBoxQuad(a,b,hw,deckBot,br.z,deckBot,br.z,topC,'#beb7aa').svg;
          for(let d=1.5;d<L-1;d+=5){
            const t0=d/L,t1=Math.min(1,(d+2.2)/L);
            s+=edge([a[0]+dx*t0,a[1]+dy*t0,br.z+.04],[a[0]+dx*t1,a[1]+dy*t1,br.z+.04],PAL.marking,.14);
          }
          for(const sg of [-1,1]){
            const ox=nx*(hw-.12)*sg,oy=ny*(hw-.12)*sg;
            s+=stick([a[0]+ox,a[1]+oy,br.z+.42],[b[0]+ox,b[1]+oy,br.z+.42],.18,'#dcd6ca');
          }
          return s;
        },deckBot));
      }
    }
  }
}

for(const tu of SCENE.tunnels||[]){
  for(const pt of tu.portals||[]){
    const hw=tu.w*.5+.7,ux=pt.dx,uy=pt.dy,nx=-uy,ny=ux;
    const fp=[
      [pt.x-nx*hw,pt.y-ny*hw],[pt.x+nx*hw,pt.y+ny*hw],
      [pt.x+nx*hw+ux*3.2,pt.y+ny*hw+uy*3.2],[pt.x-nx*hw+ux*3.2,pt.y-ny*hw+uy*3.2],
    ];
    models.push(obj(fp,4.6,()=>{
      let s=extrudeBoxQuad([pt.x,pt.y],[pt.x+ux*3.0,pt.y+uy*3.0],hw,0,4.2,0,4.2,'#d4ccbe','#bfb7a8',.5).svg;
      const mouth=[[pt.x-nx*(hw-.8)-ux*.05,pt.y-ny*(hw-.8)-uy*.05,0],[pt.x+nx*(hw-.8)-ux*.05,pt.y+ny*(hw-.8)-uy*.05,0],
        [pt.x+nx*(hw-.8)-ux*.05,pt.y+ny*(hw-.8)-uy*.05,3.2],[pt.x-nx*(hw-.8)-ux*.05,pt.y-ny*(hw-.8)-uy*.05,3.2]];
      const mn=vNewell(mouth);
      if(mn&&vis(mn))s+=shape(mouth,'#282c34',.45);
      return s;
    },0));
  }
}

function monorailTrains(t){
  const out=[];
  for(const [ti,tr] of MONORAIL_TRACKS.entries()){
    const L=tr.lane.len,carLen=6.8,gap=.6,cars=4,span=cars*carLen+(cars-1)*gap;
    if(L<span+4)continue;
    const travel=L-span,speed=10.5,period=travel/speed*2;
    const ph=((t+ti*7.3)%period)/period,fwd=ph<.5?ph*2:2-ph*2;
    const sHead=fwd*travel+span*.5,dir=ph<.5?1:-1;
    for(let c=0;c<cars;c++){
      const sc=Math.max(3.5,Math.min(L-3.5,sHead-c*(carLen+gap)*dir));
      const {p,d}=tAt(tr.lane,sc),vx=d[0]*dir,vy=d[1]*dir,a=[p[0]-vx*carLen*.48,p[1]-vy*carLen*.48],b=[p[0]+vx*carLen*.48,p[1]+vy*carLen*.48];
      const hw=1.22,nx=-vy*hw,ny=vx*hw,fp=[[a[0]+nx,a[1]+ny],[a[0]-nx,a[1]-ny],[b[0]-nx,b[1]-ny],[b[0]+nx,b[1]+ny]];
      const z0=tr.z+.05,z1=tr.z+2.65;
      out.push({fp,z0,z1,svg:(()=>{
        let s=extrudeBoxQuad(a,b,hw,z0,z1,z0,z1,'#f2efe8','#e6e2d8',.4).svg;
        s+=extrudeBoxQuad(a,b,hw+.03,z0+.35,z0+.72,z0+.35,z0+.72,'#3a8a6e','#3a8a6e',0).svg;
        s+=extrudeBoxQuad(a,b,hw+.03,z0+1.15,z0+1.95,z0+1.15,z0+1.95,'#465664','#465664',0).svg;
        if(c===0){
          const hl=SEASON.night?'#fff3c4':'#f7e8b2';
          s+=ball([b[0]+nx*.5,b[1]+ny*.5,z0+.65],.14,soft(hl),0)+ball([b[0]-nx*.5,b[1]-ny*.5,z0+.65],.14,soft(hl),0);
        }
        return s;
      })()});
    }
  }
  return out;
}

/* ---------- occasion decorations: bunting across the main streets, lanterns under shop eaves, flags on lamps ---------- */
function decorations(){
  if(DECOR)return DECOR;DECOR=[];const d=SEASON.decor;if(!d)return DECOR;
  const lines=SCENE.centerlines.length?SCENE.centerlines:SCENE.routes.filter(r=>r.kind==='car');
  const long=lines.map(l=>measuredLane({p:l.p,junctions:[]})).sort((a,b)=>b.len-a.len).slice(0,2);
  if(d.bunting)for(const [li,L] of long.entries())for(const k of [.25,.5,.75]){
    const {p,d:dir}=tAt(L,L.len*k),w=d.span||7,n=[-dir[1],dir[0]],a=[p[0]+n[0]*w,p[1]+n[1]*w,d.height||6.5],b=[p[0]-n[0]*w,p[1]-n[1]*w,d.height||6.5];
    const fp=[[a[0]+dir[0]*.2,a[1]+dir[1]*.2],[b[0]+dir[0]*.2,b[1]+dir[1]*.2],[b[0]-dir[0]*.2,b[1]-dir[1]*.2],[a[0]-dir[0]*.2,a[1]-dir[1]*.2]];
    DECOR.push({fp,h:a[2]+.3,anim:true,draw:t=>{
      const pts=[];for(let i=0;i<=14;i++){const u=i/14;pts.push([a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,a[2]-Math.sin(Math.PI*u)*1.1])}
      let s=stick([a[0],a[1],0],a,.08,'#6b7275')+stick([b[0],b[1],0],b,.08,'#6b7275')+edge(pts[0],pts[14],'#6b6470',.05);
      for(let i=0;i<14;i++){const m=[(pts[i][0]+pts[i+1][0])/2,(pts[i][1]+pts[i+1][1])/2,(pts[i][2]+pts[i+1][2])/2],sw=Math.sin(t*3.2+i*.9+li)*.3;
        s+=shape([pts[i],pts[i+1],[m[0]+sw*.3,m[1]+sw*.3,m[2]-.9]],d.bunting[(i+li)%d.bunting.length],.4)}
      return s}});
  }
  if(d.lanterns){let n=0;for(const F of facades){if(!F.shop||n>(PHONE?60:140))continue;
    for(let s=1.2;s<F.len-.8;s+=d.lanternGap||2.6){const z=Math.min(F.h-.6,(F.st.shopHeight||3.2)-.1),x=F.start[0]+F.along[0]*s+F.n[0]*.55,y=F.start[1]+F.along[1]*s+F.n[1]*.55,c=d.lanterns[(n++)%d.lanterns.length];
      DECOR.push({fp:rect(x,y,.5,.5),h:z+.2,draw:()=>stick([x,y,z+.15],[x,y,z-.15],.02,'#3d3a44')+stick([x,y,z-.28],[x,y,z-.78],.2,c)+stick([x,y,z-.24],[x,y,z-.3],.12,'#2f2b33')+stick([x,y,z-.8],[x,y,z-.86],.12,'#2f2b33')})}}}
  if(d.fairy){   // strings of small lights along street fronts (under the eaves and over the shops) and the quay edge
    const cols=d.fairy,dot=(p,c)=>stick(p,[p[0],p[1],p[2]+.02],.075,c);let n=0;
    for(const F of facades){if(!F.street||F.cut||F.len<3||n>(PHONE?90:220))continue;n++;
      const zs=[F.h-.45];if(F.shop)zs.push(F.z+(F.st.shopHeight||3.2)+.25);
      const pts=[];
      for(const z of zs){const segs=Math.max(1,Math.round(F.len/4));for(let k=0;k<segs;k++)for(let s=0;s<=8;s++){const u=(k+s/8)/segs,sag=Math.sin(Math.PI*s/8)*.35;
        pts.push([F.start[0]+F.along[0]*u*F.len+F.n[0]*.18,F.start[1]+F.along[1]*u*F.len+F.n[1]*.18,z-sag])}}
      const fp=[F.start,[F.start[0]+F.along[0]*F.len,F.start[1]+F.along[1]*F.len]].map(p=>[p[0]+F.n[0]*.4,p[1]+F.n[1]*.4]);
      const ring=[fp[0],fp[1],[fp[1][0]-F.n[0]*.5,fp[1][1]-F.n[1]*.5],[fp[0][0]-F.n[0]*.5,fp[0][1]-F.n[1]*.5]];
      DECOR.push({fp:ring,h:F.h,draw:()=>vis([F.n[0],F.n[1],0])?pts.map((p,i)=>dot(p,cols[i%cols.length])).join(''):''})}
    for(const line of SCENE.shore||[]){   // along the water's edge, in short runs so boats and people sort against them
      const pts=[];for(let i=0;i<line.length-1;i++){const a=line[i],b=line[i+1],l=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let s=0;s<l;s+=.6)pts.push([a[0]+(b[0]-a[0])*s/l,a[1]+(b[1]-a[1])*s/l,.3])}
      for(let k=0;k<pts.length;k+=8){const run=pts.slice(k,k+9);if(!run.length)continue;
        const xs=run.map(p=>p[0]),ys=run.map(p=>p[1]),fp=[[Math.min(...xs)-.2,Math.min(...ys)-.2],[Math.max(...xs)+.2,Math.min(...ys)-.2],[Math.max(...xs)+.2,Math.max(...ys)+.2],[Math.min(...xs)-.2,Math.max(...ys)+.2]];
        DECOR.push({fp,h:.45,draw:()=>run.map((p,i)=>dot(p,cols[(i+k)%cols.length])).join('')})}}
  }
  if(d.flags)for(const [i,item] of streetFurniture.entries()){if(i%2)continue;const [x,y]=avg(item.fp.map(p=>[...p,0]));const h=item.h-1,c=d.flags[i%d.flags.length];
    DECOR.push({fp:rect(x,y,.9,.9),h:h+.6,anim:true,draw:t=>{const sw=Math.sin(t*2.6+i)*.12;return shape([[x,y,h+.5],[x+.7,y+sw,h+.45],[x+.7,y+sw,h-.15],[x,y,h-.1]],c,.35)}})}
  return DECOR;
}

/* ---------- the ground: plate, streets, green, water, markings, shadows ---------- */
const CENTER=SCENE.centerlines.map(l=>measuredLane({p:l.p,junctions:[]}));
const CROSSING=SCENE.markings.map(p=>measuredLane({p,junctions:[]}));
function cityGround(){
  const top=atZ(BASE_CORNERS,0);let g='';
  for(const l of SCENE.lawns)g+=surface(l.r,GRASS);
  for(const w of SCENE.water||[])g+=surface(w,WATER);
  for(const w of SCENE.sand||[])g+=surface(w,SEASON.snow?snowy(PAL.sand,.8):PAL.sand);
  for(const w of SCENE.quayShade||[])g+=surface(w,mix(WATER,'#2f6474',.32));   // the quay wall's shadow on the water
  for(const p of SCENE.walk)g+=surface(p,WALK);
  for(const p of SCENE.paths)g+=surface(p,PAVE);
  for(const p of SCENE.roads)g+=surface(p,ROAD);
  for(const p of SCENE.quay||[])g+=surface(p,SEASON.snow?'#f4f1ea':PAL.quay);   // stone coping along the water's edge
  if(SEASON.night)for(const [x,y] of LAMP_AT)g+=lightPool(x,y,3.4,'#ffcf7a',.55);
  if(SEASON.night&&SEASON.decor&&SEASON.decor.litTrees){const re=new RegExp(SEASON.decor.litTrees,'i');for(const tr of TREES)if(re.test(tr.species))g+=lightPool(tr.x,tr.y,tr.ext*1.3+1,'#fff3c4',.5)}
  g+='<pavementink/>';
  let paint='';
  for(const lane of CENTER)for(let s=3;s<lane.len-2;s+=7.4){const {p,d}=tAt(lane,s);paint+=stripeAt(p,d,2.9,.15)}
  for(const lane of CROSSING)for(let s=.4;s<lane.len;s+=1.1){const {p,d}=tAt(lane,s);paint+=stripeAt(p,d,.46,2.4)}
  if(paint)g+=fill(paint,SEASON.snow?'#f7f3ea':PAL.marking);
  for(const r of SCENE.rails||[])for(const off of [-.72,.72]){const L=measuredLane({p:r.p,junctions:[]}),pts=[];for(let s=0;s<=L.len;s+=1){const {p,d}=tAt(L,s);pts.push([p[0]-d[1]*off,p[1]+d[0]*off,.02])}
    if(pts.length>1)g+='<path d="'+pd(pts,false)+'" fill="none" stroke="'+PAL.rail+'" style="stroke-width:'+f(.11)+'"/>'}
  let sh='';
  for(const m of models)sh+=castShadow([...atZ(m.fp,m.z0||0),...atZ(m.fp,Math.min(m.h,30))]);
  for(const tr of TREES)sh+=castShadow([...atZ(sq(tr.x,tr.y,.35),0),...atZ(polygon(tr.x,tr.y,tr.ext*.72,10),tr.h*.68)]);
  const slabWalls=BASE_CORNERS.map((a,i)=>{const b=BASE_CORNERS[(i+1)%4],n=norm([b[1]-a[1],a[0]-b[0],0]);
    let svg=vis(n)?(STY.strata?[[0,-.35,'#7a5a3e'],[-.35,-SLAB*.45,'#cdb48a'],[-SLAB*.45,-SLAB*.82,'#b39570'],[-SLAB*.82,-SLAB,'#6e4f3a']].map(([z0,z1,c])=>shape([[...a,z0],[...b,z0],[...b,z1],[...a,z1]],tone(n,soft(c)),.5)).join(''):shape([[...a,-SLAB],[...b,-SLAB],[...b,0],[...a,0]],tone(n,soft(PAL.slab)),.7)):'';
    // where the sea or a river reaches the edge, the cut shows water down to a sandy bed
    if(svg&&(SCENE.water||[]).length){const len=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(len/.8),runs=[];let s0=null;
      for(let k=0;k<=steps;k++){const t=k/steps,q=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],inn=[q[0]-n[0]*.3,q[1]-n[1]*.3];
        const w=k<steps&&SCENE.water.some(rs=>inside(inn,rs[0])&&!rs.slice(1).some(h=>inside(inn,h)));
        if(w&&s0===null)s0=t;if(!w&&s0!==null){runs.push([s0,t]);s0=null}}
      const at=(t,z)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,z],deep=-SLAB*.72;
      for(const [t0,t1] of runs)svg+=shape([at(t0,deep),at(t1,deep),at(t1,0),at(t0,0)],tone(n,soft(mix(WATER,'#3f7f95',.28))),.6)+
        shape([at(t0,-SLAB),at(t1,-SLAB),at(t1,deep),at(t0,deep)],tone(n,soft(mix(PAL.sand||'#ecd9a8',PAL.slab,.4))),.5)}
    if(svg&&(SCENE.tunnels||[]).length){
      const len=Math.hypot(b[0]-a[0],b[1]-a[1])||1,ux=(b[0]-a[0])/len,uy=(b[1]-a[1])/len;
      for(const tu of SCENE.tunnels){
        for(const endPt of [tu.p[0],tu.p[tu.p.length-1]]){
          const proj=(endPt[0]-a[0])*ux+(endPt[1]-a[1])*uy,t=proj/len;
          if(t<.02||t>.98)continue;
          const px=a[0]+(b[0]-a[0])*t,py=a[1]+(b[1]-a[1])*t;
          if(Math.hypot(endPt[0]-px,endPt[1]-py)>1.8)continue;
          const dt=Math.min(.48,Math.min(tu.w,7.5)/(2*len)),t0=Math.max(0,t-dt),t1=Math.min(1,t+dt);
          const at=(tt,z)=>[a[0]+(b[0]-a[0])*tt,a[1]+(b[1]-a[1])*tt,z];
          svg+=shape([at(t0,-SLAB*.82),at(t1,-SLAB*.82),at(t1,-SLAB*.18),at(t0,-SLAB*.18)],'#282c34',.5)
            +edge(at(t0,-SLAB*.18),at(t1,-SLAB*.18),'#cfc7b8',.18);
        }
      }
    }
    return {at:[(a[0]+b[0])/2,(a[1]+b[1])/2,0],svg}});
  return byDepth(slabWalls)+shape(top,GROUND,.75)+clipTo(top,g+'<g opacity="'+Math.min(1,(SEASON.wet?.18:SEASON.haze?.14:SEASON.snow?.3:.45)*STY.shadowAlpha).toFixed(3)+'">'+sh+'</g>');
}
/* ---------- water: a painted wash, reflections and ripples (the look of the atlas's Amsterdam canals) ----------
   1. a wash: one soft gradient over the whole plate, a darker band that hugs the banks, a bright waterline. Painted once
      per season into a texture and reused on every redraw.
   2. reflections: every waterside building, tree and boat mirrored in the water. A point h metres up is seen in the water
      h * cot(pitch) metres toward the viewer, so each reflection is its footprint swept that way; it fades with distance.
   3. ripples: short light and dark strokes that drift, drawn with each frame (they stop when the simulation is paused).
   Frozen water (a season with "ice") keeps the plain flat fill. */
const WATERS=SCENE.water||[],inW=p=>inRings(p,WATERS);
const WATER_BANK=new Path2D();let WATER_REACH=3,WATER_AREA=0;
{ const edge=p=>Math.max(Math.abs(p[0]),Math.abs(p[1]))>HALF-1.4;let bank=0;   // a side of the water on the plate's edge is open water, not a bank
  for(const rs of WATERS)rs.forEach((r,k)=>{WATER_AREA+=areaOf(r)*(k?-1:1);
    for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];if(edge(a)&&edge(b))continue;WATER_BANK.moveTo(a[0],a[1]);WATER_BANK.lineTo(b[0],b[1]);bank+=Math.hypot(b[0]-a[0],b[1]-a[1])}});
  WATER_REACH=Math.max(.7,Math.min(3.6,bank?WATER_AREA*2/bank*.3:3)); }   // a narrow canal gets a narrow band
const nearWater=(x,y,r)=>{for(let k=0;k<12;k++){const a=k*Math.PI/6;if(inW([x+Math.cos(a)*r,y+Math.sin(a)*r])||inW([x+Math.cos(a)*r*.5,y+Math.sin(a)*r*.5]))return true}return false};
const WATERSIDE=WATERS.length?SCENE.buildings.filter(b=>{const c=b.obb?b.obb.c:b.ring[0];return nearWater(c[0],c[1],46)}).map(b=>({b,ring:ccw(b.ring),c:b.obb?b.obb.c:b.ring[0]})):[];
let WATER_TREES=null;   // trees close enough to show in the water (worked out on first use: TREES is built later)
const RIPPLES=[];
if(WATERS.length){const want=Math.max(50,Math.min(PHONE?320:760,Math.round(WATER_AREA/13)));
  for(let i=0;i<60000&&RIPPLES.length<want;i++){const x=(rnd(i*2.41+.33)-.5)*2*HALF,y=(rnd(i*4.71+1.5)-.5)*2*HALF;
    if(!inW([x,y]))continue;let ok=true;for(let k=0;k<6&&ok;k++){const a=k*Math.PI/3;ok=inW([x+Math.cos(a)*1.5,y+Math.sin(a)*1.5])}
    if(ok)RIPPLES.push({x,y,len:.42+rnd(i+6)*1.6,ph:rnd(i+.21)*6.28,k:rnd(74+i)})}}
const WASHES=new Map();
function waterWash(){
  const N=c=>SEASON.night?nightCol(c):c,key=WATER+'|'+(SEASON.night||0);let cv=WASHES.get(key);if(cv)return cv;
  const res=PHONE?2.5:4,size=Math.round(2*HALF*res);cv=makeSurface(size,size);const g=cv.getContext('2d');
  g.setTransform(res,0,0,res,HALF*res,HALF*res);
  const wash=g.createLinearGradient(-HALF*.86,HALF*.58,HALF*.92,-HALF*.3);
  [mix(WATER,'#2f8796',.24),mix(WATER,'#e2f6e8',.3),mix(WATER,'#2f8796',.13)].forEach((c,i)=>wash.addColorStop(i*.5,N(c)));
  g.fillStyle=wash;g.fillRect(-HALF,-HALF,2*HALF,2*HALF);
  g.lineCap=g.lineJoin='round';g.strokeStyle=N(mix(WATER,'#1d5b68',.75));g.globalAlpha=.04;
  for(let i=14;i>0;i--){g.lineWidth=2*WATER_REACH*i/14;g.stroke(WATER_BANK)}
  g.globalAlpha=.6;g.strokeStyle=N(mix(WATER,'#ffffff',.62));g.lineWidth=.2;g.stroke(WATER_BANK);
  WASHES.set(key,cv);return cv;
}
function waterInk(ctx){
  const N=c=>SEASON.night?nightCol(c):c,A=(hex,a)=>{const c=N(hex);return 'rgba('+parseInt(c.slice(1,3),16)+','+parseInt(c.slice(3,5),16)+','+parseInt(c.slice(5,7),16)+','+a+')'};
  ctx.drawImage(waterWash(),-HALF,-HALF,2*HALF,2*HALF);
  const deep=mix(WATER,'#1d5b68',.6);
  ctx.fillStyle=A(deep,.3);for(const w of SCENE.quayShade||[]){ctx.beginPath();for(const r of w){ctx.moveTo(r[0][0],r[0][1]);for(let i=1;i<r.length;i++)ctx.lineTo(r[i][0],r[i][1]);ctx.closePath()}ctx.fill('evenodd')}
  let d=[CAM_V[0]/CAM_V[2],CAM_V[1]/CAM_V[2]];   // where a point one metre up is mirrored: toward the viewer
  {const l=Math.hypot(d[0],d[1]);if(l>2.8)d=[d[0]*2.8/l,d[1]*2.8/l]}   // a camera almost level with the water would smear a wall across the whole harbour
  // Reflections are broken up by the ripples. The water is cut into level bands (along CAM_R, level on the screen); the bands
  // fall into a few groups, and each group draws the whole mirror image nudged sideways by its own amount and at its own
  // strength. A wall's straight edge comes out ragged and the image soft, never a ruled sheet
  const rx=CAM_R[0],ry=CAM_R[1],nl=Math.hypot(d[0],d[1])||1,nx=d[0]/nl,ny=d[1]/nl,L=HALF*1.5,G=PHONE?4:6,groups=Array.from({length:G},()=>new Path2D());
  for(let v=-L,i=0;v<L;i++){const th=.26+rnd(i*1.7+.2)*.5,ax=nx*v,ay=ny*v,bx=nx*(v+th),by=ny*(v+th),band=groups[Math.floor(rnd(i*3.1+.9)*G)%G];
    band.moveTo(ax-rx*L,ay-ry*L);band.lineTo(ax+rx*L,ay+ry*L);band.lineTo(bx+rx*L,by+ry*L);band.lineTo(bx-rx*L,by-ry*L);band.closePath();v+=th}
  const TINT='#517f83',K0=SEASON.night?.34:.5;
  // buildings: the footprint swept toward the viewer, the walls in the wall colour and the roof beyond them in the roof colour.
  // Only what lies past the quay lands on the water
  const sweep=(ring,bx,by,ox,oy)=>{ctx.beginPath();
    for(let i=0;i<ring.length;i++){const a=ring[i],e=ring[(i+1)%ring.length],q=[[a[0]+bx,a[1]+by],[e[0]+bx,e[1]+by],[e[0]+bx+ox,e[1]+by+oy],[a[0]+bx+ox,a[1]+by+oy]];
      if((e[0]-a[0])*oy-(e[1]-a[1])*ox<0)q.reverse();   // every piece runs the same way round, so the pieces add up to one shape
      ctx.moveTo(q[0][0],q[0][1]);for(let k=1;k<4;k++)ctx.lineTo(q[k][0],q[k][1]);ctx.closePath()}
    ctx.fill()};
  if(!WATER_TREES)WATER_TREES=TREES.filter(tr=>nearWater(tr.x,tr.y,tr.h*2.2+4));
  const ang=Math.atan2(d[1],d[0]);
  for(let g=0;g<G;g++){
    const K=K0*(.42+.58*rnd(g*7.3+1.1)),sh=Math.sin(g*2.4+.6)*.62+Math.sin(g*1.3+2)*.4;
    ctx.save();ctx.clip(groups[g]);ctx.translate(rx*sh,ry*sh);
    for(const {b,ring} of WATERSIDE){const h=Math.min(b.wall||0,34),top=Math.min(Math.max(b.top||h,h),h+9);if(h<2||REPLACED.has(b.id)||REPLACED.has(b.of))continue;
      ctx.fillStyle=A(mix(b.body||'#e8dcc4',TINT,.4),K);sweep(ring,0,0,d[0]*h,d[1]*h);
      if(top>h+.4){ctx.fillStyle=A(mix(b.roofCol||'#b9b4aa',TINT,.4),K);sweep(ring,d[0]*h,d[1]*h,d[0]*(top-h),d[1]*(top-h))}}
    // trees: the trunk as a line, the crown as a soft blob in the season's leaf colour
    for(const tr of WATER_TREES){const look=treeLook(tr),zc=tr.h*.67,cx=tr.x+d[0]*zc,cy=tr.y+d[1]*zc;
      ctx.strokeStyle=A(mix('#7a6654',TINT,.4),K*.8);ctx.lineWidth=.24;ctx.beginPath();ctx.moveTo(tr.x,tr.y);ctx.lineTo(tr.x+d[0]*tr.h*.5,tr.y+d[1]*tr.h*.5);ctx.stroke();
      if((look.keep??1)<.3)continue;
      ctx.fillStyle=A(mix((look.m||tr.m).m,TINT,.3),K);ctx.beginPath();ctx.ellipse(cx,cy,tr.h*.27*nl+tr.ext*.45,tr.ext*.8,ang,0,Math.PI*2);ctx.fill()}
    ctx.restore()}
  // boats: a dark patch under each hull (solid: it is shade as much as reflection)
  ctx.fillStyle=A(deep,.32);
  (SCENE.boats||[]).forEach((b,i)=>{if(SEASON.boats!=null&&rnd(i*5.31+2.7)>=SEASON.boats)return;
    ctx.beginPath();ctx.ellipse(b.x+d[0]*.5,b.y+d[1]*.5,b.l*.5,Math.max(1.5,b.l*.31)*.52,b.a*Math.PI/180,0,Math.PI*2);ctx.fill()});
}
// ripples: light and dark strokes lying level on the screen, each swaying a little; one path each
function waterRipples(t){
  if(SEASON.ice||!RIPPLES.length)return '';
  let light='',dark='';const step=PHONE?2:1;
  for(let i=0;i<RIPPLES.length;i+=step){const r=RIPPLES[i],q=P(r.x+Math.sin(t*.45+r.ph)*.18,r.y+Math.cos(t*.35+r.ph)*.09,0);
    if(q[0]<-4||q[1]<-4||q[0]>VIEW_BOX[0]+4||q[1]>VIEW_BOX[1]+4)continue;
    const half=r.len*(.56+.16*Math.sin(t*.6+r.ph))*CAM_K,seg='M'+f(q[0]-half)+' '+f(q[1])+'Q'+f(q[0]-.15*half)+' '+f(q[1]-.14*CAM_K)+' '+f(q[0]+half)+' '+f(q[1]+.06*CAM_K);
    if(r.k>.6){light+=seg;if(r.k>.83)light+='M'+f(q[0]-.11*half)+' '+f(q[1]+.29*CAM_K)+'L'+f(q[0]+.51*half)+' '+f(q[1]+.28*CAM_K)}else dark+=seg}
  const w=INK_K;
  return (dark?'<path d="'+dark+'" fill="none" stroke="'+mix(WATER,'#1d5b68',.62)+'" stroke-opacity=".34" style="stroke-width:'+(w*.85).toFixed(2)+'" stroke-linecap="round"/>':'')
    +(light?'<path d="'+light+'" fill="none" stroke="'+mix(WATER,'#f4fbf0',.82)+'" stroke-opacity=".72" style="stroke-width:'+(w*1.05).toFixed(2)+'" stroke-linecap="round"/>':'');
}
function paintSingaporeGround(ctx){
  // at night the paving joints, grass strokes and ripples painted here are dimmed like everything else
  if(SEASON.night){const proto=Object.getPrototypeOf(ctx);for(const k of ['strokeStyle','fillStyle']){const d=Object.getOwnPropertyDescriptor(proto,k);
    Object.defineProperty(ctx,k,{configurable:true,get(){return d.get.call(this)},set(v){d.set.call(this,typeof v==='string'?nightCol(v):v)}})}
    try{paintGroundInk(ctx)}finally{delete ctx.strokeStyle;delete ctx.fillStyle}return}
  paintGroundInk(ctx);
}
/* pavingInk: the joints and stones of the pavements, in CITY.paving.style
   'grid'       square joints only (the old look; size = slab size)
   'slabs'      stone slabs in running bond, each a slightly different tone (piazzas, Mediterranean towns)
   'ishidatami' long narrow granite slabs in running bond (Kyoto lanes)
   'tiles'      square concrete tiles with a faint tone change (modern city pavements)
   colour = joint colour; stone = slab colour (defaults from the walk colour) */
function pavingInk(ctx,groups,pv,H){
  const st=pv.style||'tiles',snow=SEASON.snow,joint=snow?'#e2ddd2':pv.colour||PAL.paving;
  let x0=H,y0=H,x1=-H,y1=-H;for(const rings of groups)for(const r of rings)for(const [x,y] of r){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
  if(st==='grid'){ctx.strokeStyle=joint;ctx.lineWidth=.05;ctx.beginPath();const s=pv.size||2.4;
    for(let i=-H;i<H;i+=s){ctx.moveTo(i,-H);ctx.lineTo(i,H);ctx.moveTo(-H,i);ctx.lineTo(H,i)}ctx.stroke();return}
  const spec={slabs:{h:.62,a:.7,b:1.5,var:.09},ishidatami:{h:.45,a:1.0,b:2.1,var:.11},tiles:{h:.6,a:.6,b:.6,var:.05}}[st]||{h:.6,a:.8,b:1.4,var:.08};
  const h=pv.size||spec.h,base=snow?'#f1eee8':pv.stone||WALK,N=x=>SEASON.night?nightCol(x):x;
  // one patch of paving (16 rows) is drawn once and repeated: a single fill instead of a rectangle per stone on every redraw
  const ppm=[12,24,36,48,72].find(v=>v>=1.6/UPX)||72,key=[st,h,base,joint,ppm,!!SEASON.night].join('|');
  let cv=PAVE_PATCH.get(key);
  if(!cv){
    const rows=16,Wm=spec.a===spec.b?spec.a*16:spec.b*9,W=Math.round(Wm*ppm),Hh=Math.round(h*ppm)*rows;cv=new OffscreenCanvas(W,Hh);const g=cv.getContext('2d');
    const tones=[mix(base,'#ffffff',spec.var),base,mix(base,'#5e564f',spec.var*.8),mix(base,'#d8b98c',spec.var)].map(N);
    g.strokeStyle=N(mix(joint,'#4f4740',.15));g.lineWidth=Math.max(1,(st==='tiles'?.03:.045)*ppm);let k=0;
    for(let r=0;r<rows;r++){const y=r*Hh/rows,hh=Hh/rows;let x=-rnd(r*3.7+h)*spec.b*ppm;
      while(x<W){const L=(spec.a===spec.b?spec.a:spec.a+rnd(k*1.37+r)*(spec.b-spec.a))*ppm,x2=spec.a===spec.b?x+L:Math.min(x+L,W+1);
        g.fillStyle=tones[Math.floor(rnd(k*2.91+.3)*4)%4];g.fillRect(x,y,x2-x,hh);if(x<0)g.fillRect(x+W,y,x2-x,hh);   // the stone cut by the left edge finishes at the right edge
        for(const jx of x<0?[x+W]:[x]){g.beginPath();g.moveTo(Math.round(jx)+.5,y);g.lineTo(Math.round(jx)+.5,y+hh);g.stroke()}x=x2;k++}
      g.beginPath();g.moveTo(0,Math.round(y)+.5);g.lineTo(W,Math.round(y)+.5);g.stroke()}
    PAVE_PATCH.set(key,cv)}
  ctx.save();ctx.scale(1/ppm,1/ppm);ctx.fillStyle=ctx.createPattern(cv,'repeat');ctx.fillRect(x0*ppm,y0*ppm,(x1-x0)*ppm,(y1-y0)*ppm);ctx.restore();
}
const PAVE_PATCH=new Map();
function paintGroundInk(ctx){
  const X=Dv(1,0,0),Y=Dv(0,1,0),o=P(0,0,0),H=HALF+2;
  ctx.save();ctx.transform(...X,...Y,...o);
  function onRings(groups,draw){ctx.save();ctx.beginPath();for(const rings of groups)for(const r of rings){ctx.moveTo(...r[0]);for(let i=1;i<r.length;i++)ctx.lineTo(...r[i]);ctx.closePath()}ctx.clip('evenodd');draw();ctx.restore()}
  if(!SEASON.ice&&WATERS.length)onRings(WATERS,()=>waterInk(ctx));
  const pv=CITY.paving||{};
  if(UPX<.6)onRings(SCENE.walk.concat(SCENE.paths),()=>pavingInk(ctx,SCENE.walk.concat(SCENE.paths),pv,H));
  if(SEASON.wet)onRings(SCENE.walk.concat(SCENE.paths),()=>{   // rain: shallow puddles on squares and pavements, each a pale patch with a bright edge
    for(let i=0;i<(PHONE?220:520);i++){const x=rnd(i+5.2)*2*H-H,y=rnd(i+71.9)*2*H-H,l=.5+rnd(i*3.3)*1.5,w=.18+rnd(i*1.7)*.2;
      ctx.save();ctx.translate(x,y);ctx.rotate(rnd(i*9.1)*3.14);ctx.fillStyle='rgba(170,188,202,.55)';ctx.beginPath();ctx.ellipse(0,0,l,w,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(236,242,246,.7)';ctx.lineWidth=.035;ctx.beginPath();ctx.ellipse(0,0,l*.6,w*.45,0,3.4,5.6);ctx.stroke();ctx.restore()}});
  if(!SEASON.snow)onRings(SCENE.lawns.map(l=>l.r),()=>{ctx.strokeStyle=mix(GRASS,'#5d7a58',.25);ctx.lineWidth=.12;ctx.beginPath();
    for(let i=0;i<(PHONE?500:1200);i++){const x=rnd(i+.4)*2*H-H,y=rnd(i+143.4)*2*H-H;ctx.moveTo(x-.18,y);ctx.lineTo(x,y+.29);ctx.lineTo(x+.16,y+.1)}ctx.stroke()});
  onRings(SCENE.roads,()=>{
    const rStyle=(CITY.paving||{}).roadStyle;
    if((rStyle==='klinkers'||rStyle==='cobble')&&UPX<.75&&!SEASON.snow){
      const ppm=[12,24,36,48].find(v=>v>=1.6/UPX)||48,rk=[rStyle,ROAD,ppm,!!SEASON.night].join('|');
      let cv=PAVE_PATCH.get(rk);
      if(!cv){
        const bw=.38*ppm,bh=.22*ppm,cols=12,rows=12,W=Math.round(bw*cols),Hh=Math.round(bh*rows);
        cv=new OffscreenCanvas(W,Hh);const g=cv.getContext('2d'),N=x=>SEASON.night?nightCol(x):x;
        const baseR=rStyle==='klinkers'?mix(ROAD,'#8b5c4d',.24):ROAD;
        const tones=[mix(baseR,'#ffffff',.08),baseR,mix(baseR,'#4d3b38',.12),mix(baseR,'#a87058',.10)].map(N);
        g.strokeStyle=N(mix(baseR,'#332a2c',.35));g.lineWidth=Math.max(.8,.03*ppm);let k=0;
        for(let r=0;r<rows;r++){const y=r*bh,off=(r%2)*bw*.5;for(let c=-1;c<=cols;c++){const x=c*bw+off;g.fillStyle=tones[Math.floor(rnd(k*3.71+r)*.999*4)%4];g.fillRect(x,y,bw,bh);g.strokeRect(x+.25,y+.25,bw-.5,bh-.5);k++}}
        PAVE_PATCH.set(rk,cv);
      }
      ctx.save();ctx.scale(1/ppm,1/ppm);ctx.fillStyle=ctx.createPattern(cv,'repeat');ctx.fillRect(-H*ppm,-H*ppm,2*H*ppm,2*H*ppm);ctx.restore();
    }else{
      for(let i=0;i<(PHONE?500:1300);i++){const x=rnd(i+.36)*2*H-H,y=rnd(i+2.41)*2*H-H;ctx.fillStyle=i%2?mix(ROAD,'#ffffff',.18):mix(ROAD,'#5d5867',.15);ctx.fillRect(x,y,.15+rnd(i*9)*.26,.13)}
    }
    ctx.lineWidth=.22;ctx.strokeStyle=PAL.kerb;for(const p of SCENE.roads)for(const r of p){ctx.beginPath();ctx.moveTo(...r[0]);for(const q of r.slice(1))ctx.lineTo(...q);ctx.closePath();ctx.stroke()}
    if(SEASON.wet)for(const [j,lane] of CENTER.entries())for(let s=2,i=0;s<lane.len-2;s+=3.6+rnd(i++ +j)*5){const {p,d}=tAt(lane,s),off=2.4*(i%2?1:-1);
      ctx.save();ctx.translate(p[0]-d[1]*off,p[1]+d[0]*off);ctx.rotate(Math.atan2(d[1],d[0]));const l=.8+rnd(i+j*17)*2.4;ctx.fillStyle='#a5b5bd';ctx.beginPath();ctx.ellipse(0,0,l,.3,0,0,Math.PI*2);ctx.fill();ctx.restore()}
  });
  if((SCENE.quay||[]).length&&UPX<.7){
    ctx.save();ctx.strokeStyle=SEASON.night?nightCol('#6f6457'):'#7a6f61';ctx.lineWidth=.11;ctx.beginPath();
    for(const rs of SCENE.quay)for(const r of rs)for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(L<2)continue;const ux=(b[0]-a[0])/L,uy=(b[1]-a[1])/L,nx=-uy,ny=ux;
      for(let s=1.2;s<L;s+=1.4){const px=a[0]+ux*s,py=a[1]+uy*s;ctx.moveTo(px-nx*.45,py-ny*.45);ctx.lineTo(px+nx*.45,py+ny*.45)}}
    ctx.stroke();ctx.restore();
  }
  if(SEASON.night&&SEASON.decor&&SEASON.decor.fairy&&(SCENE.water||[]).length)onRings(SCENE.water,()=>{   // lit quays shimmer on the water
    ctx.save();ctx.globalAlpha=.55;ctx.strokeStyle='#ffcf7a';ctx.lineWidth=.12;ctx.beginPath();let i=0;
    for(const rs of SCENE.quay||[])for(const q of rs[0]){if((i++)%3)continue;for(let k=0;k<4;k++){const x=q[0]+(rnd(i*3.1+k)-.5)*9,y=q[1]+(rnd(i*7.7+k*1.3)-.5)*9,l=.5+rnd(i+k*5)*1.6;ctx.moveTo(x,y);ctx.lineTo(x+l,y+l*.2)}}
    ctx.stroke();ctx.restore()});
  if(SEASON.ice&&WATERS.length)onRings(WATERS,()=>{ctx.strokeStyle='#f2f6ef';ctx.lineWidth=.08;ctx.beginPath();for(let i=0;i<260;i++){const x=rnd(i+7.1)*2*H-H,y=rnd(i+3.3)*2*H-H,l=.6+rnd(i)*1.4;ctx.moveTo(x,y);ctx.lineTo(x+l,y)}ctx.stroke()});   // ice keeps a few scratches
  if((SCENE.tunnels||[]).length){
    ctx.save();ctx.lineCap=ctx.lineJoin='round';
    for(const tu of SCENE.tunnels){
      if(!tu.p||tu.p.length<2)continue;
      ctx.beginPath();ctx.moveTo(...tu.p[0]);for(let i=1;i<tu.p.length;i++)ctx.lineTo(...tu.p[i]);
      ctx.strokeStyle='rgba(64,78,98,0.16)';ctx.lineWidth=tu.w||6;ctx.setLineDash([]);ctx.stroke();
      ctx.strokeStyle='rgba(56,68,88,0.58)';ctx.lineWidth=.24;ctx.setLineDash([1.6,1.4]);ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

/* ---------- the frame ---------- */
const EXTRA=typeof CITY_EXTRA==='function'?CITY_EXTRA:null;   // landmarks.js may add its own parts per frame
/* many trees (a wood): each crown is painted from fewer, larger leaf sprays. A crown is 43 sprays; with 500 trees that is 21 000
   fills and strokes on every redraw. Crowns overlap in a wood, so thinning them keeps the look and makes turning smooth. */
let CROWNS_READY=false;
function thinCrowns(){
  CROWNS_READY=true;const q=Math.min(1,110/Math.max(1,TREES.length));if(q>=1)return;   // a budget of about 110 full crowns for the whole city
  for(const tr of TREES){const all=makeSprays(tr),n=Math.max(9,Math.round(all.length*q)),step=all.length/n,k=Math.sqrt(all.length/n)*.97;
    tr.sprays=Array.from({length:n},(_,i)=>all[Math.floor(i*step)]).map(sp=>({...sp,r:sp.r*k,ry:sp.ry*k}))}
}
function scene(t){
  if(!CROWNS_READY)thinCrowns();
  PED_SH='';let out=stamp('ground',cityGround,BASE_CORNERS,-SLAB,1)+waterRipples(t);const parts=[];
  for(const [i,m] of models.entries())if(!offView(m.fp,m.z0||0,m.h))parts.push({fp:m.fp,z0:m.z0||0,z1:m.h,svg:stamp('block'+i,m.draw,m.fp,m.z0||0,m.h+.3)});
  for(const tr of TREES){const fp=sq(tr.x,tr.y,tr.ext*1.4);if(offView(fp,0,tr.zTop+2))continue;
    parts.push({fp:sq(tr.x,tr.y,.48),z1:tr.zTop,svg:stamp('tree'+tr.i,()=>drawTree(treeLook(tr).keep>=.5?tr.limbs:tr.geo,{ink:PLANT_INK,inkK:INK_K,bark:tr.rule.bark||'#9b795d',keep:0})+'<crown id="'+tr.i+'"/>',fp,0,tr.zTop+2)})}
  for(const [i,item] of streetFurniture.entries())if(!(item.kind==='cafe'&&SEASON.cafes===false)&&!offView(item.fp,0,item.h))parts.push({fp:item.fp,z1:item.h,svg:stamp('street'+i,item.draw,item.fp,0,item.h+.45)});
  for(const [i,item] of BOATS.entries())if(!(SEASON.boats!=null&&rnd(i*5.31+2.7)>=SEASON.boats)&&!offView(item.fp,0,item.h))parts.push({fp:item.fp,z1:item.h,svg:stamp('boat'+i,item.draw,item.fp,0,item.h+.4)});
  for(const item of cruisingBoats(t))if(!offView(item.fp,0,item.z1))parts.push(item);
  for(const [i,item] of decorations().entries())if(!offView(item.fp,0,item.h))parts.push({fp:item.fp,z1:item.h,svg:item.anim?item.draw(t):stamp('decor'+i,item.draw,item.fp,0,item.h+.4)});
  for(const tr of monorailTrains(t))if(!offView(tr.fp,tr.z0,tr.z1))parts.push(tr);
  if(EXTRA)for(const p of [].concat(EXTRA(t)||[]))if(p&&!offView(p.fp,0,p.h||p.z1||3))parts.push({fp:p.fp,z1:p.h||p.z1,svg:typeof p.draw==='function'?p.draw(t):p.svg});
  for(const a of TRAFFIC.to(t)){const az=a.z||0;if(offView(sq(...a.p,3),az,az+3))continue;
    const part=a.kind==='car'?carDraw(a):a.kind==='bike'?bikeDraw(a,t):pedestrian(a,t);
    if(a.alpha<1)part.svg='<g opacity="'+a.alpha.toFixed(2)+'">'+part.svg+'</g>';parts.push(part)}
  if(PED_SH)out+='<path d="'+PED_SH+'" fill="#65576e" opacity="'+(.23*STY.shadowAlpha).toFixed(3)+'"/>';
  const wx=SEASON.wx||(SEASON.wet?'rain':SEASON.snow?'snow':null);
  return out+planSort(parts)+(SEASON.petals?petals(t):'')+(wx?weather(wx,t,HALF+2,groundZ,(x,y)=>inside([x,y],BASE_CORNERS)):'');
}
/* petals: "petals": true on a season or occasion with blossom. Each blossoming tree sheds a few petals that drift down
   from its crown and sideways in the wind, then start again. One path in two pinks (kept bright at night: they are in LIT). */
function petals(t){
  if(SEASON.leaves!=='blossom')return '';
  const h=(i,k)=>{const x=Math.sin(i*127.1+k*311.7)*43758.5453;return x-Math.floor(x)};
  const per=PHONE?14:30;let a='',b='';
  for(const tr of TREES){
    if(!tr.rule.blossom||offView(sq(tr.x,tr.y,tr.ext),0,tr.zTop))continue;
    for(let k=0;k<per;k++){
      const i=tr.i*31+k,top=tr.zTop*.85,fall=top+.3,v=.35+h(i,3)*.25,ph=(t*v/fall+h(i,4))%1;   // ph: 0 at the crown, 1 on the ground
      const r=tr.ext*(.4+h(i,1)*.8),an=h(i,2)*6.283,w=t*.9+h(i,5)*6.3,dr=ph*2.4;
      const x=tr.x+Math.cos(an)*r+Math.sin(w)*.35+dr,y=tr.y+Math.sin(an)*r+Math.cos(w*.8)*.25+dr*.4,z=top*(1-ph);
      if(!inside([x,y],BASE_CORNERS))continue;
      const [X,Y]=P(x,y,z+groundZ(x,y)),seg='M'+f(X)+' '+f(Y)+'h0';
      if(k%3)a+=seg;else b+=seg;
    }
  }
  const [ax,ay]=P(0,0,0),[bx,by]=P(.32,0,0),w=Math.max(4*INK_K,Math.hypot(bx-ax,by-ay)),dot=   // a petal is about 32 cm across on screen, never smaller than 4 ink units
  (d,c,k)=>d?'<path d="'+d+'" fill="none" stroke="#c98a9c" stroke-opacity=".7" style="stroke-width:'+(w*k+Math.max(.5*INK_K,w*.14)).toFixed(2)+'" stroke-linecap="round"/><path d="'+d+'" fill="none" stroke="'+c+'" style="stroke-width:'+(w*k).toFixed(2)+'" stroke-linecap="round"/>':'';
  return dot(a,'#ffe6ec',1)+dot(b,'#fbd3dd',.8);
}
