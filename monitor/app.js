/* Presentation layer. Measurements and classifications come from engine.js. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), t=(key,vars)=>MineI18n.t(key,vars);
  const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const number=(n,d=2)=>Number.isFinite(Number(n))?Number(n).toFixed(d):'—';
  const clock=seconds=>[Math.floor(seconds/3600),Math.floor(seconds/60)%60,Math.floor(seconds)%60].map(x=>String(x).padStart(2,'0')).join(':');
  const engine=createMineEngine();
  let state=engine.reset(),selected='C',running=false,timer=null,speed=1,metric='CH4_ppm',filter='all',sourceFile='',events=[],previous={},toastTimer;
  const levels=['normal','warning','critical'];
  const level=z=>state.nodeState[z].offline?'offline':levels[state.nodeState[z].severity];
  const metricName=k=>k==='Temp_C'?t('temperature'):k==='Humidity_Percent'?t('humidity'):({CH4_ppm:'CH₄',CO_ppm:'CO',H2S_ppm:'H₂S',VOC_ppm:'VOC',Impact_N:t('impact'),Accel_Z_g:t('acceleration')}[k]||k);
  const isLost=m=>state.nodeState[m.zone].offline||!state.routes[m.zone].online||(state.scenario==='emergency'&&m.zone==='E'&&state.tick>55);
  function preserveFocusHTML(el,html){const focus=document.activeElement;const zone=el.contains(focus)?focus.dataset.zone:null;el.innerHTML=html;if(zone)el.querySelector(`[data-zone="${zone}"]`)?.focus({preventScroll:true});}
  function eventText(row){const vars={...row.vars};if(vars.level)vars.level=t(vars.level);if(vars.name)vars.name=t(vars.name);return t(row.key,vars);}
  function addEvent(key,vars={},category='info'){events.push({time:new Date(),sim:state.tick*20,key,vars,category});if(events.length>160)events.shift();renderJournal();}
  function trackTransitions(){for(const z of state.ZONES){const next=level(z);if(previous[z]&&previous[z]!==next)addEvent('evtState',{zone:z,level:next},next==='offline'?'network':next==='normal'?'info':'alert');previous[z]=next;}}
  function toast(key,vars={},error=false){clearTimeout(toastTimer);$('toast').textContent=t(key,vars);$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,error?8500:3500);}
  function renderKPIs(){
    const online=6-state.offlineTrunks.length+state.ZONES.filter(z=>state.routes[z].online).length;
    const miners=state.miners.filter(m=>!isLost(m)).length;
    const critical=state.ZONES.filter(z=>state.nodeState[z].severity===2).length;
    const warning=state.ZONES.filter(z=>state.nodeState[z].severity===1).length;
    const forecasts=state.ZONES.filter(z=>state.forecasts[z].etaMin<15).length;
    $('nodesValue').innerHTML=`${online}<span>/ 12</span>`;$('minersValue').innerHTML=`${miners}<span>/ 8</span>`;
    $('criticalValue').innerHTML=`${critical}<span>/ 6</span>`;$('forecastValue').innerHTML=`${forecasts}<span>/ 6</span>`;
    $('nodesPercent').textContent=Math.round(online/12*100)+'%';$('minersPercent').textContent=Math.round(miners/8*100)+'%';
    $('nodesBar').innerHTML=Array.from({length:12},(_,i)=>`<i class="${i<online?'on':'off'}"></i>`).join('');
    $('minersBar').innerHTML=Array.from({length:16},(_,i)=>`<i class="${i<miners*2?'on':'off'}"></i>`).join('');
    $('criticalKpi').dataset.alert=String(critical>0);$('criticalCaption').textContent=t(critical?'needsAttention':'noCritical');
    $('criticalLine').style.background=critical?`linear-gradient(90deg,var(--red) ${critical/6*100}%,#4b3533 ${critical/6*100}%)`:'';
    const status=critical?'critical':warning?'warning':'normal';$('systemStatus').dataset.level=status;
    $('systemStatus').innerHTML=`<i></i><span>${t(status==='critical'?'systemCritical':status==='warning'?'systemWarning':'systemNormal')}</span>`;
    $('elapsed').textContent=clock(state.tick*20);
    $('sourceLabel').textContent=state.uploaded?t('csvReplay')+' · '+sourceFile:t('builtIn');
    document.querySelector('[data-i18n="footerNote"]').textContent=t(state.uploaded?'footerCSV':'footerNote');
    $('sourceLabel').title=state.uploaded?sourceFile:t('builtIn');
    $('playBtn').innerHTML=icon(running?'pause':'play')+`<span>${t(running?'pause':state.tick?'resume':'start')}</span>`;
    $('playBtn').setAttribute('aria-pressed',String(running));
    $('predictiveBtn').setAttribute('aria-pressed',String(!state.uploaded&&state.scenario==='predictive'));
    $('emergencyBtn').setAttribute('aria-pressed',String(!state.uploaded&&state.scenario==='emergency'));
    [3,4].forEach(id=>{const button=$('offline'+id+'Btn'),off=state.offlineTrunks.includes(String(id));button.setAttribute('aria-pressed',String(off));button.textContent=t(off?'restoreRelay':'relay',{id});});
  }
  function insight(){
    if(state.nodeState[selected].offline)return t('insightOffline');
    const rd=state.readings[selected];
    const danger=Object.entries(state.limits).find(([k,l])=>rd[k]>=l.danger),warn=Object.entries(state.limits).find(([k,l])=>rd[k]>=l.warn);
    if(danger||warn){const [key]=danger||warn;return t('insightThreshold',{metric:metricName(key),level:t(danger?'critical':'warning')});}
    if(state.nodeState[selected].neighborCause||state.offlineTrunks.length&&state.nodeState[selected].severity)return t('insightNeighbor');
    if(state.nodeState[selected].severity>0)return t('insightModel');return t('insightNormal');
  }
  function sparkline(values,color='#b9c8c0'){if(values.length<2)return '<path d="M0 25H110" stroke="#555e61" stroke-width="1" stroke-dasharray="3 4"/>';const lo=Math.min(...values)-.1,hi=Math.max(...values)+.1;return `<path d="${values.map((v,i)=>`${i?'L':'M'}${(i/(values.length-1)*110).toFixed(1)} ${(31-(v-lo)/(hi-lo)*26).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="1.6"/>`;}
  function renderSensorDetails(){
    const rd=state.readings[selected],labels={Temp_C:[t('temperature'),'°C'],Humidity_Percent:[t('humidity'),'%'],CH4_ppm:['CH₄','ppm'],H2S_ppm:['H₂S','ppm'],CO_ppm:['CO','ppm'],VOC_ppm:['VOC','ppm'],Pressure_hPa:[t('pressure'),'hPa'],Mud_Level_cm:[t('mudLevel'),'cm'],Mud_Viscosity_Index:[t('mudViscosity'),'—'],Mud_Salinity_uS_cm:[t('conductivity'),'µS/cm'],Accel_Z_g:[t('acceleration'),'g'],Light_lux:[t('light'),'lux'],Impact_N:[t('impact'),'N'],Fluid_Level_cm:[t('fluidLevel'),'cm']};
    $('sensorDialogTitle').textContent=t('zoneName',{zone:selected});
    $('allSensorTable').innerHTML='<table><thead><tr><th>'+t('sensor')+'</th><th>'+t('reading')+'</th><th>'+t('unit')+'</th></tr></thead><tbody>'+Object.entries(labels).map(([key,[name,unit]])=>'<tr><td>'+name+'</td><td>'+number(rd[key],key==='H2S_ppm'?4:2)+'</td><td>'+unit+'</td></tr>').join('')+'</tbody></table>';
  }
  function renderInspector(){
    const rd=state.readings[selected],status=level(selected),r=state.routes[selected];
    $('zoneTitle').textContent=t('zoneName',{zone:selected});
    $('zonePicker').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.zone===selected)));
    $('selectedStatus').textContent=t(status);$('selectedStatus').className='badge '+status;
    $('selectedConnection').textContent=t(r.online?'online':'offline');
    $('methaneValue').textContent=number(rd.CH4_ppm);$('methaneBar').style.width=Math.min(100,rd.CH4_ppm/10*100)+'%';
    const color=status==='critical'||status==='offline'?'#ef645d':status==='warning'?'#d8a45e':'#b9c8c0';$('methaneBar').style.background=color;
    $('gasSparkline').innerHTML=sparkline(state.history[selected].slice(-25).map(r=>r.CH4_ppm),color);
    $('sensorGrid').innerHTML=[['CO_ppm','CO','ppm',2],['Temp_C',t('temperature'),'°C',1],['H2S_ppm','H₂S','ppm',4],['Humidity_Percent',t('humidity'),'%',1]].map(([k,name,unit,d])=>{
      const lim=state.limits[k],severity=lim?(rd[k]>=lim.danger?'critical':rd[k]>=lim.warn?'warning':''):'';
      return `<div class="sensor-cell ${severity}"><small>${name}</small><strong>${number(rd[k],d)}</strong><span>${unit}</span></div>`;
    }).join('');
    $('inspectorInsight').textContent=insight();$('inspectorInsight').dataset.level=status;
    $('selectedRoute').textContent=r.online?r.path.join(' → ')+' → '+selected:t('noRoute');
    if($('sensorDialog').open)renderSensorDetails();
  }
  function renderForecast(){
    const list=state.ZONES.map(z=>state.forecasts[z]).filter(f=>f.etaMin<45).sort((a,b)=>a.etaMin-b.etaMin);
    if(!list.length){const collecting=state.history.A.length<5;$('forecastPanel').innerHTML=`<div class="forecast-empty"><div class="empty-ring">${icon(collecting?'clock':'check')}</div><h3>${t(collecting?'collecting':'stableTitle')}</h3><p>${t(collecting?'collectingText':'stableText')}</p></div>`;}
    else preserveFocusHTML($('forecastPanel'),list.map(f=>`<button class="forecast-item ${f.etaMin<7?'critical':''}" data-zone="${f.zone}" aria-label="${escapeHTML(t('zoneName',{zone:f.zone}))}"><span class="zone-avatar">${f.zone}</span><div><h3>${t('zoneName',{zone:f.zone})}</h3><p>${f.etaMin===0?t('thresholdReached'):t('metricRising',{metric:metricName(f.metrics[0])})}</p></div><strong>${f.etaMin===0?t('now'):number(f.etaMin,1)+`<small>${t('minutes')}</small>`}</strong></button>`).join(''));
  }
  function renderNetwork(){
    const reserve=new Set(state.RESERVE_EDGES.map(e=>e.slice().sort().join('-')));
    $('routeCount').textContent=t('routeCount',{count:state.ZONES.filter(z=>state.routes[z].online).length});
    $('meshPanel').innerHTML=state.ZONES.map(z=>{const r=state.routes[z],used=r.path?.some((node,i)=>i&&reserve.has([r.path[i-1],node].sort().join('-')));return `<div class="mesh-row ${r.online?'':'offline'}"><div><h3>${t('zoneName',{zone:z})}</h3><div class="route">${r.online?r.path.join(' → ')+' → '+z:t('noRoute')}</div><small>${t(r.online?(used?'reserveActive':'mainRoute'):'offline')}</small></div><span class="mesh-dot" role="img" aria-label="${t(r.online?'online':'offline')}"></span></div>`;}).join('');
    preserveFocusHTML($('helmetPanel'),state.miners.map(m=>`<tr><td>${icon('helmet')}<span>${m.id}</span></td><td><button class="table-zone-button" data-zone="${m.zone}" aria-label="${t('zoneName',{zone:m.zone})}">${m.zone}</button></td><td><span class="connection-text ${isLost(m)?'offline':''}">${t(isLost(m)?'offline':'online')}</span></td><td><span class="badge ${level(m.zone)}">${t(level(m.zone))}</span></td></tr>`).join(''));
  }
  let chartCache=null;
  function renderChart(){
    const histories=state.history,chosen=[selected,...['E','D','C','A','B','F'].filter(z=>z!==selected)].slice(0,3),colors=['#e5e7e2','#ce8c83','#98a79b'];
    const rd=state.readings[selected],values=histories[selected].slice(-60).map(r=>Number(r[metric]));
    const unit=metric==='Temp_C'?'°C':'ppm',delta=values.length>1?values.at(-1)-values[0]:0;
    $('chartValue').textContent=number(rd[metric],metric==='Temp_C'?1:2);$('chartUnit').textContent=unit;
    $('chartChange').textContent=values.length>1?`${delta>=0?'+':''}${number(delta,2)} ${unit}`:'—';$('chartChange').title=t('delta');
    $('chartLegend').innerHTML=chosen.map((z,i)=>`<span><i style="background:${colors[i]}"></i>${t('zoneName',{zone:z})}</span>`).join('');
    $('chartSamples').textContent=t('samples',{count:values.length});
    const width=Math.max(280,$('chartContainer').clientWidth),height=$('chartContainer').clientHeight||195,pad={l:34,r:13,t:18,b:28},limit=state.limits[metric].danger;
    $('historyChart').setAttribute('viewBox',`0 0 ${width} ${height}`);
    const rawMax=Math.max(limit*1.15,...chosen.flatMap(z=>histories[z].slice(-60).map(r=>Number(r[metric]))));
    const max=Math.ceil(rawMax/(metric==='Temp_C'?10:2))*(metric==='Temp_C'?10:2),plotW=width-pad.l-pad.r,plotH=height-pad.t-pad.b;
    const y=v=>pad.t+plotH-(v/max)*plotH;let svg='<defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#d8ddd9" stop-opacity=".12"/><stop offset="100%" stop-color="#d8ddd9" stop-opacity="0"/></linearGradient></defs>';
    for(let i=0;i<=4;i++){const value=max*i/4,py=y(value);svg+=`<path d="M${pad.l} ${py}H${width-pad.r}" stroke="#42474a" stroke-opacity=".45" stroke-dasharray="2 5"/><text x="${pad.l-10}" y="${py+4}" text-anchor="end" fill="#949da2" font-size="10">${Number(value.toFixed(1))}</text>`;}
    svg+=`<path d="M${pad.l} ${y(limit)}H${width-pad.r}" stroke="#c4746b" stroke-width="1" stroke-dasharray="4 5" opacity=".6"/><text x="${width-pad.r}" y="${y(limit)-5}" text-anchor="end" fill="#c48e87" font-size="9">${t('threshold')} · ${limit}</text>`;
    const count=values.length,arrays=chosen.map(z=>histories[z].slice(-60));
    chosen.forEach((z,zi)=>{const arr=arrays[zi];if(arr.length<2)return;const points=arr.map((r,i)=>[pad.l+i/(count-1)*plotW,y(r[metric])]);const path=points.map(([x,py],i)=>`${i?'L':'M'}${x.toFixed(1)} ${py.toFixed(1)}`).join(' ');if(zi===0)svg+=`<path d="${path} L${width-pad.r} ${height-pad.b}H${pad.l}Z" fill="url(#chartFill)"/>`;svg+=`<path d="${path}" fill="none" stroke="${colors[zi]}" stroke-width="${zi===0?2:1.4}" stroke-linejoin="round"/><circle cx="${width-pad.r}" cy="${points.at(-1)[1]}" r="${zi===0?3:2}" fill="${colors[zi]}"/>`;});
    for(let i=0;i<5;i++){const idx=Math.round(Math.max(0,count-1)*i/4),row=arrays[0][idx],seconds=(row?.tick??0)*20;svg+=`<text x="${pad.l+i/4*plotW}" y="${height-5}" text-anchor="${i===0?'start':i===4?'end':'middle'}" fill="#949da2" font-size="9">${clock(seconds).slice(3)}</text>`;}
    if(count<2){const words=t('historyEmpty').split(' '),lines=[''],maxChars=Math.floor((plotW-12)/6);words.forEach(word=>{if((lines.at(-1)+' '+word).length>maxChars)lines.push(word);else lines[lines.length-1]+=(lines.at(-1)?' ':'')+word;});svg+=`<text x="${width/2}" y="${height/2+14}" text-anchor="middle" fill="#b5bdbf" font-size="11">${lines.map((line,i)=>`<tspan x="${width/2}" dy="${i?16:0}">${line}</tspan>`).join('')}</text>`;}
    svg+=`<line id="chartCursor" x1="0" x2="0" y1="18" y2="${height-pad.b}" stroke="#e1e6e0" stroke-dasharray="3 3" opacity="0"/>`;
    $('historyChart').innerHTML=svg;chartCache={count,arrays,pad,plotW,width,height};
  }
  function renderJournal(){
    const rows=events.filter(e=>filter==='all'||e.category===filter).slice().reverse();$('eventCount').textContent=t('events',{count:rows.length});
    $('eventLog').innerHTML=rows.length?rows.map(row=>`<div class="event ${row.category}"><div class="event-time">${row.time.toLocaleTimeString('en-GB',{hour12:false})}<small>${t('demo')} ${clock(row.sim)}</small></div><div class="event-icon">${icon(row.category==='alert'?'alert':row.category==='network'?'network':'check')}</div><p>${escapeHTML(eventText(row))}</p><span class="event-category">${t('category'+row.category[0].toUpperCase()+row.category.slice(1))}</span></div>`).join(''):`<p class="event-empty">${t('noEvents')}</p>`;
  }
  const scene=createMineScene($('sceneCanvas'),$('sceneLabels'),selectZone);
  function renderAll(){renderKPIs();renderInspector();renderForecast();renderChart();renderNetwork();scene.setState(state,selected);}
  function selectZone(zone){if(!state.ZONES.includes(zone))return;selected=zone;renderInspector();renderChart();scene.setState(state,selected);}
  function advance(){const oldTick=state.tick;state=engine.step();if(state.uploaded&&state.tick<oldTick)addEvent('evtReplay');trackTransitions();renderAll();}
  function setRunning(value,record=true){running=value;clearInterval(timer);timer=null;if(running)timer=setInterval(advance,1000/speed);if(record)addEvent(running?'evtStart':'evtPause');renderKPIs();}
  function switchScenario(mode){sourceFile='';state=engine.reset(mode);previous={};trackTransitions();addEvent('evtScenario',{name:mode==='emergency'?'emergency':'predictive'},mode==='emergency'?'alert':'info');renderAll();}
  function setView(next){const actual=scene.setView(next);$('threeDBtn').setAttribute('aria-pressed',String(actual==='3d'));$('twoDBtn').setAttribute('aria-pressed',String(actual==='2d'));[$('zoomInBtn'),$('zoomOutBtn'),$('resetViewBtn'),$('motionBtn'),$('sensorsToggle')].forEach(b=>b.disabled=actual==='2d');document.querySelector('.map-hint').textContent=t(actual==='3d'?'mapHint':'mapHint2D');}
  function localize(){MineI18n.apply();scene.updateText();$('motionBtn').setAttribute('aria-pressed',String(scene.motion));renderAll();renderJournal();setView(scene.view);}
  function exportJournal(){
    const escapeCSV=v=>'"'+String(v).replace(/"/g,'""')+'"';
    const rows=[['timestamp','simulation_time','category','message'],...events.map(e=>[e.time.toISOString(),clock(e.sim),e.category,eventText(e)])];
    const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(escapeCSV).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='no-shutdown-events-'+MineI18n.language+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('exportDone');
  }
  $('zonePicker').innerHTML=state.ZONES.map(z=>`<button data-zone="${z}" aria-pressed="${z===selected}">${z}</button>`).join('');
  $('zonePicker').addEventListener('click',e=>{const b=e.target.closest('[data-zone]');if(b)selectZone(b.dataset.zone);});
  ['forecastPanel','helmetPanel'].forEach(id=>$(id).addEventListener('click',e=>{const b=e.target.closest('[data-zone]');if(b){selectZone(b.dataset.zone);$('mineTitle').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}}));
  $('playBtn').onclick=()=>setRunning(!running);
  $('resetBtn').onclick=()=>{setRunning(false,false);state=engine.reset();previous={};sourceFile='';events=[];trackTransitions();addEvent('evtReset');renderAll();};
  $('predictiveBtn').onclick=()=>switchScenario('predictive');$('emergencyBtn').onclick=()=>switchScenario('emergency');
  document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{speed=Number(b.dataset.speed);document.querySelectorAll('[data-speed]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(running)setRunning(true,false);addEvent('evtSpeed',{speed});});
  [3,4].forEach(id=>$('offline'+id+'Btn').onclick=()=>{state=engine.toggleNode(String(id));addEvent(state.offlineTrunks.includes(String(id))?'evtFailure':'evtRestore',{id},'network');trackTransitions();renderAll();});
  document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>{MineI18n.set(b.dataset.lang);localize();});
  document.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{metric=b.dataset.metric;document.querySelectorAll('[data-metric]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderChart();});
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderJournal();});
  $('zoomInBtn').onclick=()=>scene.zoomBy(.85);$('zoomOutBtn').onclick=()=>scene.zoomBy(1.15);$('resetViewBtn').onclick=()=>scene.resetCamera();
  $('motionBtn').onclick=()=>{scene.setMotion(!scene.motion);$('motionBtn').setAttribute('aria-pressed',String(scene.motion));};
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');reducedMotion.addEventListener('change',e=>{if(e.matches){scene.setMotion(false);$('motionBtn').setAttribute('aria-pressed','false');}});
  $('threeDBtn').onclick=()=>setView('3d');$('twoDBtn').onclick=()=>setView('2d');
  $('sensorsToggle').onchange=()=>scene.setSensorLens($('sensorsToggle').checked);
  $('routesToggle').onchange=$('minersToggle').onchange=()=>scene.setLayers($('routesToggle').checked,$('minersToggle').checked);
  $('threeDBtn').disabled=!scene.available;$('webglNotice').hidden=scene.available;
  $('csvInput').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    if(file.size>5*1024*1024){toast('csvTooLarge',{},true);e.target.value='';return;}
    const wasRunning=running;setRunning(false,false);e.target.disabled=true;toast('csvLoading');
    try{const text=await file.text();state=engine.loadCSV(text);sourceFile=file.name;previous={};trackTransitions();addEvent('evtCSV',{file:sourceFile,count:text.trim().split(/\r?\n/).length-1});$('toast').hidden=true;renderAll();}
    catch(error){const [key,detail]=error.message.split('|');toast(MineI18n.keys.includes(key)?key:'csvError',{detail},true);}
    finally{e.target.disabled=false;e.target.value='';if(wasRunning)setRunning(true,false);}
  });
  $('exportBtn').onclick=exportJournal;
  $('sensorDetailsBtn').onclick=()=>{renderSensorDetails();$('sensorDialog').showModal();};$('closeSensors').onclick=()=>$('sensorDialog').close();
  ['helpBtn','aboutFooter'].forEach(id=>$(id).onclick=()=>$('aboutDialog').showModal());$('closeDialog').onclick=()=>$('aboutDialog').close();$('aboutDialog').addEventListener('click',e=>{if(e.target===$('aboutDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  document.querySelectorAll('[data-nav]').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x===a));}));
  $('historyChart').addEventListener('pointermove',e=>{if(!chartCache||chartCache.count<2)return;const rect=e.currentTarget.getBoundingClientRect(),localX=(e.clientX-rect.left)/rect.width*chartCache.width,index=Math.max(0,Math.min(chartCache.count-1,Math.round((localX-chartCache.pad.l)/chartCache.plotW*(chartCache.count-1))));const row=chartCache.arrays[0][index];if(!row)return;const x=chartCache.pad.l+index/(chartCache.count-1)*chartCache.plotW,cursor=$('chartCursor');cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);cursor.setAttribute('opacity','.6');$('chartTooltip').textContent=`${clock(row.tick*20)} · ${t('zoneName',{zone:selected})} · ${number(row[metric])} ${metric==='Temp_C'?'°C':'ppm'}`;$('chartTooltip').hidden=false;const available=$('chartContainer').clientWidth-$('chartTooltip').offsetWidth;$('chartTooltip').style.left=Math.min(available,Math.max(0,e.clientX-rect.left-60))+'px';});
  $('historyChart').addEventListener('pointerleave',()=>{$('chartTooltip').hidden=true;$('chartCursor')?.setAttribute('opacity','0');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)setRunning(false);});
  window.addEventListener('beforeunload',()=>{clearInterval(timer);scene.destroy();});
  localize();trackTransitions();addEvent('evtReady');
  new ResizeObserver(()=>renderChart()).observe($('chartContainer'));
  // A compact public read-only snapshot is useful during demonstrations and QA.
  window.mineDashboard={get state(){return state;},get language(){return MineI18n.language;},get selectedZone(){return selected;},get running(){return running;},get sceneAvailable(){return scene.available;}};
})();
