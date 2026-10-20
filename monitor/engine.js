/* Numerical logic and topology adapted from the supplied prototype. */
window.createMineEngine=function(){
/* Smart Helmet 5.0 — browser web app. No backend required. */
const NODE_POS = {1:[110,335],2:[282,335],3:[447,335],4:[612,335],5:[777,335],6:[950,335]};
const ZONE_POS = {A:[282,543],B:[447,543],C:[612,543],D:[777,543],E:[447,142],F:[777,142]};
const ZONE_GATE = {A:2,B:3,C:4,D:5,E:3,F:5};
const ZONE_ADJ = {A:['B','E'],B:['A','C','E'],C:['B','D','F'],D:['C','F'],E:['A','B','C'],F:['C','D','E']};
const MAIN_EDGES = [ ['1','2'], ['2','3'], ['3','4'], ['4','5'], ['5','6'], ['2','A'], ['3','B'], ['4','C'], ['5','D'], ['3','E'], ['5','F'] ];
const RESERVE_EDGES = [ ['2','4'], ['3','5'], ['4','6'], ['2','5'], ['3','6'] ];
const ZONES = ['A','B','C','D','E','F'];
const HELMETS = ['HM-A104','HM-B210','HM-C305','HM-D118','HM-E441','HM-F087'];
const DANGER_LIMITS = {
  CH4_ppm:{warn:5.0,danger:7.0,label:'CH₄ / methane',unit:'ppm',avoid:'review methane readings and ventilation'},
  H2S_ppm:{warn:0.04,danger:0.07,label:'H₂S',unit:'ppm',avoid:'review the gas sensor and response plan'},
  CO_ppm:{warn:7.0,danger:12.0,label:'CO',unit:'ppm',avoid:'review combustion indicators and ventilation'},
  VOC_ppm:{warn:360,danger:520,label:'VOC',unit:'ppm',avoid:'review the vapor source and ventilation'},
  Temp_C:{warn:45,danger:55,label:'temperature',unit:'°C',avoid:'review equipment temperature'},
  Impact_N:{warn:3.2,danger:5.0,label:'impact',unit:'N',avoid:'review the impact reading'},
  Accel_Z_g:{warn:1.35,danger:1.75,label:'acceleration',unit:'g',avoid:'review equipment vibration'}
};
const SEVERITY = {'безопасно':0,'потенциально опасно':1,'опасно':2};
const SEVERITY_LABEL = ['безопасно','потенциально опасно','опасно'];
const SAMPLE_SECONDS = 20;

let tick=0, scenario='predictive', sampleTick=0, forcedDangerZone=null;
let offlineTrunks=new Set(), history=Object.fromEntries(ZONES.map(z=>[z,[]]));
let readings={}, nodeState={}, forecasts={}, routes={}, feed=null, feedIndex=0;
const miners=[
 {id:'HM-A104',zone:'A'},{id:'HM-B210',zone:'B'},{id:'HM-C305',zone:'C'},
 {id:'HM-D118',zone:'D'},{id:'HM-E441',zone:'E'},{id:'HM-F087',zone:'F'},
 {id:'HM-771',zone:'C'},{id:'HM-889',zone:'E'}
];
function fmt(v,d=2){return Number.isFinite(Number(v))?Number(v).toFixed(d):'—';}
function relu(arr){return arr.map(x=>Math.max(0,x))}
function matVec(W,x,b){return W.map((row,i)=>row.reduce((s,w,j)=>s+w*x[j],b[i]||0))}
function softmax(a){const m=Math.max(...a), ex=a.map(x=>Math.exp(x-m)), s=ex.reduce((p,c)=>p+c,0); return ex.map(x=>x/s)}
function mlpPredict(row){
  const bundle=window.MINE_MODEL_BUNDLE; if(!bundle) return {label:'безопасно',prob:0,raw:{}};
  const x=[];
  bundle.numericFeatures.forEach((f,i)=>x.push(((Number(row[f])||0)-bundle.scalerMean[i])/(bundle.scalerScale[i]||1)));
  const helmet=row.Helmet_ID || 'HM-A104';
  bundle.helmetCategories.forEach(c=>x.push(helmet===c?1:0));
  let h1=relu(matVec(bundle.weights['model.0.weight'],x,bundle.weights['model.0.bias']));
  let h2=relu(matVec(bundle.weights['model.3.weight'],h1,bundle.weights['model.3.bias']));
  let out=matVec(bundle.weights['model.6.weight'],h2,bundle.weights['model.6.bias']);
  let p=softmax(out); let idx=p.indexOf(Math.max(...p));
  return {label:bundle.classes[idx],prob:p[idx],raw:Object.fromEntries(bundle.classes.map((c,i)=>[c,p[i]]))};
}

function ruleRisk(row){
  let max=0, reasons=[], score=0;
  for(const [k,lim] of Object.entries(DANGER_LIMITS)){
    const v=Number(row[k]); if(!Number.isFinite(v)) continue;
    if(v>=lim.danger){ max=2; reasons.push(`${lim.label} exceeds the demo danger threshold: ${fmt(v,k.includes('H2S')?4:2)} ${lim.unit}`); score=Math.max(score,1); }
    else if(v>=lim.warn){ max=Math.max(max,1); reasons.push(`${lim.label} approaches the demo danger threshold: ${fmt(v,k.includes('H2S')?4:2)} ${lim.unit}`); score=Math.max(score,.55); }
    else score=Math.max(score, Math.min(.49, (v/(lim.danger||1))*.45));
  }
  return {severity:max,status:SEVERITY_LABEL[max],reasons,score};
}

function classify(row){
  const rule=ruleRisk(row); const nn=mlpPredict(row);
  let nnSeverity=SEVERITY[nn.label] ?? 0;
  // Use neural output, but keep hard safety thresholds dominant.
  let severity = Math.max(rule.severity, nn.prob>0.58 ? nnSeverity : 0);
  let reasons=[...rule.reasons];
  if(nn.prob>0.58 && nnSeverity>rule.severity) reasons.push(`The bundled MLP classified this sample as «${nn.label}» with model score ${fmt(nn.prob*100,0)}%`);
  return {status:SEVERITY_LABEL[severity], severity, confidence:Math.max(rule.score, nn.prob||0), reasons, nn};
}

function slope(values){
  if(values.length<4) return 0;
  const n=values.length, xs=values.map((_,i)=>i), mx=(n-1)/2, my=values.reduce((a,b)=>a+b,0)/n;
  let num=0,den=0; for(let i=0;i<n;i++){num+=(xs[i]-mx)*(values[i]-my); den+=(xs[i]-mx)*(xs[i]-mx)}
  return den?num/den:0;
}
function forecastZone(zone){
  const hist=history[zone].slice(-12); const current=readings[zone];
  if(!current || hist.length<5) return {zone,etaMin:999,probability:0,reason:'insufficient data',action:'continue monitoring',metrics:[]};
  let best={etaMin:999,probability:0,reason:'stable',action:'continue monitoring',metrics:[]};
  for(const [k,lim] of Object.entries(DANGER_LIMITS)){
    const vals=hist.map(r=>Number(r[k])).filter(Number.isFinite); if(vals.length<5) continue;
    const sl=slope(vals); const cur=Number(current[k]); if(!Number.isFinite(cur)) continue;
    let etaTicks=9999;
    if(cur>=lim.danger) etaTicks=0;
    else if(sl>0) etaTicks=(lim.danger-cur)/sl;
    const etaMin=etaTicks*SAMPLE_SECONDS/60;
    if(etaMin>=0 && etaMin<best.etaMin && etaMin<45){
      const p=Math.max(0,Math.min(0.98,1-etaMin/45));
      best={zone,etaMin,probability:p,reason:`${lim.label} rising (${sl>0?'+':''}${fmt(sl,k==='H2S_ppm'?5:3)} ${lim.unit}/sample), current value ${fmt(cur,k==='H2S_ppm'?4:2)} ${lim.unit}`,action:lim.avoid,metrics:[k]};
    }
  }
  return best;
}

function generateReading(zone,t,mode='predictive'){
  const i=ZONES.indexOf(zone); const helmet=HELMETS[i];
  const wave=Math.sin(t/12+i)*0.12; let row={tick:t,node_id:zone,Helmet_ID:helmet,Temp_C:35+Math.sin(t/18+i)*1.1,Humidity_Percent:47+Math.cos(t/20+i)*5,CH4_ppm:2.6+wave, H2S_ppm:0.018+Math.abs(Math.sin(t/15+i))*0.006, CO_ppm:3.6+Math.cos(t/15+i)*0.4, VOC_ppm:190+Math.sin(t/11+i)*22, Pressure_hPa:1013+Math.sin(t/16+i), Mud_Level_cm:14+Math.cos(t/17+i)*1.5, Mud_Viscosity_Index:7+Math.sin(t/22+i)*.45, Mud_Salinity_uS_cm:950+Math.cos(t/21+i)*30, Accel_Z_g:1+Math.sin(t/10+i)*.04, Light_lux:24+Math.sin(t/8+i)*6, Impact_N:1+Math.abs(Math.cos(t/13+i))*.5, Fluid_Level_cm:12+Math.sin(t/9+i)*1.0, node_online:1};
  if(mode==='predictive' && zone==='C' && t>35){ row.CH4_ppm+=(t-35)*0.05; row.CO_ppm+=(t-35)*0.035; row.Temp_C+=(t-35)*0.04; }
  if(mode==='predictive' && zone==='D' && t>70){ row.CH4_ppm+=(t-70)*0.025; row.CO_ppm+=(t-70)*0.025; }
  if(mode==='emergency' && zone==='E' && t>22){ row.CH4_ppm+=Math.min(8,(t-22)*0.18); row.H2S_ppm+=Math.min(.09,(t-22)*0.0017); row.CO_ppm+=Math.min(16,(t-22)*0.22); row.Temp_C+=Math.min(25,(t-22)*0.26); row.VOC_ppm+=Math.min(650,(t-22)*9); }
  if(mode==='emergency' && zone==='B' && t>55){ row.Impact_N+=(t-55)*0.08; row.Accel_Z_g+=(t-55)*0.007; }
  if(forcedDangerZone===zone){ row.CH4_ppm+=7.5; row.CO_ppm+=14; row.H2S_ppm+=0.08; }
  Object.keys(row).forEach(k=>{if(typeof row[k]==='number') row[k]=Number(row[k].toFixed(k==='H2S_ppm'?5:3))});
  return row;
}

function applyNeighborPropagation(){
  for(const z of ZONES){
    const dangerous = nodeState[z].severity===2 || (forecasts[z]&&forecasts[z].etaMin<10);
    if(dangerous){
      for(const n of ZONE_ADJ[z]||[]){
        if(nodeState[n].severity<2){
          nodeState[n].status='потенциально опасно'; nodeState[n].severity=1; nodeState[n].neighborCause=z;
          nodeState[n].reasons = nodeState[n].reasons||[];
          nodeState[n].reasons.unshift(`Adjacent zone ${z} has a critical state or rising trend: zone raised to warning`);
        }
      }
    }
  }
  // trunk offline affects zones connected to adjacent gateways
  offlineTrunks.forEach(id=>{
    const affected=ZONES.filter(z=>Math.abs(ZONE_GATE[z]-Number(id))<=1);
    affected.forEach(z=>{ if(nodeState[z].severity<2){ nodeState[z].status='потенциально опасно'; nodeState[z].severity=1; nodeState[z].reasons.unshift(`Nearby mesh relay failure ${id}: zone raised to warning`); }});
  });
}

function buildGraph(includeReserve=true){
  const g={}; const add=(a,b)=>{g[a]=g[a]||[];g[b]=g[b]||[]; if(!offlineTrunks.has(a)&&!offlineTrunks.has(b)){g[a].push(b);g[b].push(a)}};
  MAIN_EDGES.filter(e=>!/[A-F]/.test(e[0])&&!/[A-F]/.test(e[1])).forEach(([a,b])=>add(a,b));
  if(includeReserve) RESERVE_EDGES.forEach(([a,b])=>add(a,b));
  return g;
}
function bfsPath(start,target,g){
  if(offlineTrunks.has(start)||offlineTrunks.has(target)) return null;
  const q=[start], prev={[start]:null};
  while(q.length){const v=q.shift(); if(v===target) break; for(const n of (g[v]||[])){if(prev[n]===undefined){prev[n]=v;q.push(n)}}}
  if(prev[target]===undefined) return null; let path=[], cur=target; while(cur){path.push(cur); cur=prev[cur]} return path.reverse();
}
function computeMeshRoutes(){
  const g=buildGraph(true); routes={};
  for(const z of ZONES){
    const gate=String(ZONE_GATE[z]); const path=bfsPath('1',gate,g); const branchOnline=Number(readings[z]?.node_online)!==0;
    routes[z]={path,online:!!path && branchOnline,branchOnline};
    if(!routes[z].online){ nodeState[z].status='опасно'; nodeState[z].severity=2; nodeState[z].offline=true; nodeState[z].reasons.unshift('No available route to the dispatch node'); }
  }
}


function step(advance=true){
 if(advance){
   if(feed && feedIndex>0 && feedIndex%feed.length===0) history=Object.fromEntries(ZONES.map(z=>[z,[]]));
   sampleTick=feed?feed[feedIndex%feed.length].tick:tick;
   const rows=feed?feed[feedIndex++%feed.length].rows:ZONES.map(z=>generateReading(z,tick,scenario));
   readings=Object.fromEntries(rows.map(r=>[r.node_id,{...r}]));
   for(const z of ZONES){history[z].push(readings[z]);if(history[z].length>80)history[z].shift();}
   tick++;
 }
 nodeState={}; forecasts={};
 for(const z of ZONES){nodeState[z]=classify(readings[z]); forecasts[z]=forecastZone(z);}
 for(const z of ZONES) if(Number(readings[z].node_online)===0){nodeState[z].status=SEVERITY_LABEL[2];nodeState[z].severity=2;nodeState[z].offline=true;}
 applyNeighborPropagation();computeMeshRoutes();return snapshot();
}
function reset(mode='predictive'){
 tick=0;sampleTick=0;scenario=mode;feed=null;feedIndex=0;offlineTrunks.clear();
 history=Object.fromEntries(ZONES.map(z=>[z,[]]));readings={};
 return step();
}
function snapshot(){return {tick:sampleTick,steps:tick,scenario,uploaded:!!feed,readings,nodeState,forecasts,routes,history,offlineTrunks:[...offlineTrunks],miners,ZONES,NODE_POS,ZONE_POS,MAIN_EDGES,RESERVE_EDGES,limits:DANGER_LIMITS,sampleSeconds:SAMPLE_SECONDS};}
function toggleNode(id){offlineTrunks.has(id)?offlineTrunks.delete(id):offlineTrunks.add(id);return step(false);}
function csvCells(text){
 const rows=[];let row=[],cell='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell.trim());cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quoted)throw new Error('csvQuotes');row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
}
function loadCSV(text){
 const all=csvCells(text);if(all.length<2)throw new Error('csvEmpty');
 const headers=all.shift(); if(new Set(headers).size!==headers.length)throw new Error('csvDuplicateHeader');
 const features=window.MINE_MODEL_BUNDLE.numericFeatures;
 const required=['tick','node_id','Helmet_ID','node_online',...features];
 const missing=required.filter(k=>!headers.includes(k));if(missing.length)throw new Error('csvColumns|'+missing.join(', '));
 const groups=new Map();
 for(let i=0;i<all.length;i++){
  const cells=all[i];if(cells.length!==headers.length)throw new Error('csvRow|'+(i+2));
  const r=Object.fromEntries(headers.map((k,j)=>[k,cells[j]]));
  for(const k of ['tick','node_online',...features]){if(r[k]===''||!Number.isFinite(Number(r[k])))throw new Error('csvNumeric|'+(i+2)+' · '+k);r[k]=Number(r[k]);}
  if(!Number.isInteger(r.tick)||r.tick<0||!ZONES.includes(r.node_id)||![0,1].includes(r.node_online)||!r.Helmet_ID)throw new Error('csvRow|'+(i+2));
  if(!groups.has(r.tick))groups.set(r.tick,new Map());const group=groups.get(r.tick);
  if(group.has(r.node_id))throw new Error('csvDuplicate|'+r.tick+' / '+r.node_id);group.set(r.node_id,r);
 }
 const ticks=[...groups.keys()].sort((a,b)=>a-b);
 if(ticks.some((t,i)=>t!==i))throw new Error('csvTicks');
 if(ticks.some(t=>groups.get(t).size!==6))throw new Error('csvZones');
 // Validate completely before replacing the running dataset. Never blend CSV and demo readings.
 reset();feed=ticks.map(t=>({tick:t,rows:ZONES.map(z=>groups.get(t).get(z))}));feedIndex=0;tick=0;
 history=Object.fromEntries(ZONES.map(z=>[z,[]]));return step();
}
return {step,reset,snapshot,toggleNode,loadCSV};

};
