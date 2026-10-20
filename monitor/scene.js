/* Local Three.js scene. The same engine snapshot drives the 3D and 2D views. */
window.createMineScene=function(container,labelLayer,onSelect){
  const T=window.THREE;
  let renderer,scene,camera,world,frame=0,lastFrame=0,snapshot=null,selected='C',view='3d',autoMotion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  let routesVisible=true,minersVisible=true,sensorsVisible=true,sensorGroup=null,sensorNodes=[],yaw=.26,pitch=.84,distance=34,panX=0,panZ=0,idleAt=performance.now(),lastTime=0;
  let available=true,dirty=true,lastLabelUpdate=0;
  const zones={},relays={},edgeObjects=[],reserveObjects=[],people=[],labels={},relayLabels={},picks=[],pointers=new Map();
  const baseYaw=.26,basePitch=.84,baseDistance=34;
  const zonePositions={A:[-7.6,5.95],B:[-2.8,5.95],C:[1.9,5.95],D:[6.6,5.95],E:[-2.8,-5.55],F:[6.6,-5.55]};
  const relayPositions={'1':[-12.5,0],'2':[-7.6,0],'3':[-2.8,0],'4':[1.9,0],'5':[6.6,0],'6':[11.6,0]};
  const mainEdges=[['1','2'],['2','3'],['3','4'],['4','5'],['5','6'],['2','A'],['3','B'],['4','C'],['5','D'],['3','E'],['5','F']];
  const reserveEdges=[['2','4'],['3','5'],['4','6'],['2','5'],['3','6']];
  const pos=id=>zonePositions[id]||relayPositions[id];
  const colorFor=level=>level==='critical'||level==='offline'?0xef645d:level==='warning'?0xd8a45e:0xb4c4bc;
  const levelFor=z=>snapshot?.nodeState[z]?.offline?'offline':['normal','warning','critical'][snapshot?.nodeState[z]?.severity??0];
  const material=(color,roughness=.6,metalness=.25)=>new T.MeshStandardMaterial({color,roughness,metalness});
  function box(w,h,d,mat,x,y,z,parent=world){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);parent.add(m);return m;}
  function cylinder(rt,rb,h,mat,x,y,z,parent=world,segments=20){const m=new T.Mesh(new T.CylinderGeometry(rt,rb,h,segments),mat);m.position.set(x,y,z);parent.add(m);return m;}
  function ring(r,mat,x,y,z,parent=world){const m=new T.Mesh(new T.TorusGeometry(r,.035,5,48),mat);m.rotation.x=Math.PI/2;m.position.set(x,y,z);parent.add(m);return m;}
  function makeSlab(){
    const shape=new T.Shape();const points=[[-15,-8.3],[-12,-9],[-7,-8.7],[-3,-9.4],[1,-9.1],[5,-8.5],[10,-8.8],[14,-7.3],[15,0],[14,7.1],[10,9],[5,8.7],[0,9.3],[-4,8.8],[-10,9.1],[-14,6.8],[-15,-2]];
    points.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();
    const geo=new T.ExtrudeGeometry(shape,{depth:.65,bevelEnabled:true,bevelThickness:.12,bevelSize:.12,bevelSegments:2,steps:1});
    for(let i=0;i<3;i++){
      const slab=new T.Mesh(geo,material([0x303436,0x282c2e,0x24282b][i],.93,.04));slab.rotation.x=-Math.PI/2;slab.position.y=-.67-i*.61;slab.scale.setScalar(1+i*.015);world.add(slab);
      const edges=new T.LineSegments(new T.EdgesGeometry(geo,25),new T.LineBasicMaterial({color:0x4d5356,transparent:true,opacity:.35}));slab.add(edges);
    }
    const grid=new T.GridHelper(32,32,0x555c5d,0x42494a);grid.position.y=.035;grid.material.transparent=true;grid.material.opacity=.18;world.add(grid);
    // Exposed strata use deterministic geometry, keeping startup reproducible.
    for(let i=0;i<24;i++){
      const x=Math.sin(i*2.91)*12.2,z=Math.cos(i*2.37)*7.4;
      if(Math.abs(z)<1.4||Object.values(zonePositions).some(p=>Math.hypot(p[0]-x,p[1]-z)<1.7))continue;
      const rock=new T.Mesh(new T.DodecahedronGeometry(.22+(i%4)*.13,0),material(0x464b4c,.9,.05));rock.scale.set(1.8,.5,1);rock.position.set(x,.13,z);rock.rotation.y=i*1.7;world.add(rock);
    }
  }
  function tunnel(a,b){
    const pa=pos(a),pb=pos(b),len=Math.hypot(pb[0]-pa[0],pb[1]-pa[1]),cx=(pa[0]+pb[0])/2,cz=(pa[1]+pb[1])/2;
    const group=new T.Group();group.position.set(cx,0,cz);group.rotation.y=-Math.atan2(pb[1]-pa[1],pb[0]-pa[0]);world.add(group);
    box(len,.15,1.18,material(0x171b1d,.84,.1),0,.09,0,group);
    const wallMat=material(0x6a7272,.5,.3);
    box(len,.33,.13,wallMat,0,.26,-.6,group);box(len,.33,.13,wallMat,0,.26,.6,group);
    const centerMat=new T.MeshBasicMaterial({color:0x8c9b95});
    const line=box(len,.015,.035,centerMat,0,.18,0,group);
    for(let i=0;i<=Math.floor(len/1.3);i++){
      const x=-len/2+i*len/Math.max(1,Math.floor(len/1.3));
      const beamMat=material(0x4d5758,.45,.4);
      box(.075,.84,.075,beamMat,x,.5,-.57,group);box(.075,.84,.075,beamMat,x,.5,.57,group);box(.075,.075,1.22,beamMat,x,.92,0,group);
    }
    edgeObjects.push({a,b,line,group});
  }
  function addZone(z,p){
    const group=new T.Group();group.position.set(p[0],.15,p[1]);world.add(group);
    const pad=cylinder(1.2,1.28,.12,material(0x363e3e,.7,.3),0,0,0,group,32);pad.userData.zone=z;picks.push(pad);
    const outer=ring(1.24,new T.MeshBasicMaterial({color:0x8c9c94}),0,.09,0,group);
    const inner=ring(1.43,new T.MeshBasicMaterial({color:0xd4dad6,transparent:true,opacity:.5}),0,.08,0,group);inner.visible=z===selected;
    const body=box(.5,.52,.55,material(0x707a7a,.5,.45),0,.32,0,group);
    box(.6,.06,.65,material(0xabb5b0,.4,.5),0,.61,0,group);
    const light=cylinder(.14,.14,.09,new T.MeshBasicMaterial({color:0xb4c4bc}),0,.72,0,group);
    cylinder(.025,.025,.4,material(0xb5bdb7),.17,.9,.13,group,8);
    body.userData.zone=z;picks.push(body);zones[z]={group,pad,outer,inner,light};
    const label=document.createElement('button');label.className='scene-label';label.dataset.zone=z;label.addEventListener('click',()=>onSelect(z));labelLayer.appendChild(label);labels[z]=label;
  }
  function makeRelays(){
    Object.entries(relayPositions).forEach(([id,p])=>{
      const group=new T.Group();group.position.set(p[0],.2,p[1]);world.add(group);
      const pad=cylinder(.31,.4,.25,material(0x778583,.5,.4),0,.05,0,group);
      const light=cylinder(.13,.14,.06,new T.MeshBasicMaterial({color:0xd5dfda}),0,.23,0,group);
      cylinder(.025,.025,.55,material(0x9ba8a3),.13,.45,0,group,8);relays[id]={group,pad,light};
      const label=document.createElement('span');label.className='relay-label';label.textContent='N'+id;labelLayer.appendChild(label);relayLabels[id]=label;
    });
    // The shaft and headframe identify the dispatch end of the existing graph.
    const steel=material(0x818b8a,.55,.4),dark=material(0x252d2e,.65,.2);
    cylinder(.65,.65,3.6,dark,-12.5,1.8,0);ring(.68,steel,-12.5,3.62,0);
    box(1.8,.25,1.65,steel,-12.5,3.68,0);
    [[-.65,-.55],[.65,-.55],[-.65,.55],[.65,.55]].forEach(([dx,dz])=>box(.1,1.5,.1,steel,-12.5+dx,4.5,dz));
    box(1.6,.15,1.4,dark,-12.5,5.25,0);
    const wheel=new T.Mesh(new T.TorusGeometry(.42,.07,6,24),steel);wheel.position.set(-12.5,4.65,0);world.add(wheel);
    box(1.15,.6,1.0,material(0x5b6463),-10.7,.4,-1.3);box(1.25,.08,1.1,steel,-10.7,.75,-1.3);
  }
  function makeReserve(){reserveEdges.forEach(([a,b],i)=>{
    const pa=pos(a),pb=pos(b);const curve=new T.CatmullRomCurve3([new T.Vector3(pa[0],.55,pa[1]),new T.Vector3((pa[0]+pb[0])/2,1.1+(i%2)*.35,-1.6-i*.38),new T.Vector3(pb[0],.55,pb[1])]);
    const geometry=new T.BufferGeometry().setFromPoints(curve.getPoints(50));const line=new T.Line(geometry,new T.LineDashedMaterial({color:0x9ca9a5,dashSize:.16,gapSize:.12,transparent:true,opacity:.7}));line.computeLineDistances();world.add(line);reserveObjects.push({a,b,line});
  });}
  function makePeople(){const roster=[['A',-.55,.55],['B',.55,.45],['C',-.55,.5],['D',.5,.55],['E',-.55,-.45],['F',.55,-.45],['C',.55,-.45],['E',.6,.55]];
    roster.forEach(([z,dx,dz],i)=>{
      const group=new T.Group(),p=zonePositions[z];group.position.set(p[0]+dx,.23,p[1]+dz);world.add(group);
      const uniform=material(0x99a8a0,.72,.1);cylinder(.09,.12,.26,uniform,0,.19,0,group,8);
      const helmet=new T.Mesh(new T.SphereGeometry(.12,10,8),new T.MeshBasicMaterial({color:0xd6dfd9}));helmet.position.y=.4;group.add(helmet);
      box(.07,.15,.07,material(0x414849),-.055,.03,0,group);box(.07,.15,.07,material(0x414849),.055,.03,0,group);
      const marker=ring(.22,new T.MeshBasicMaterial({color:0x929f98,transparent:true,opacity:.65}),0,-.03,0,group);
      helmet.userData.zone=z;picks.push(helmet);people.push({group,z,dx,dz,helmet,marker,index:i});
    });
  }
  function makeSensorLens(){
    sensorGroup=new T.Group();world.add(sensorGroup);
    [['CH4_ppm','CH₄',[-2.0,2.8,-.9],2],['CO_ppm','CO',[1.6,3.4,-.6],2],['H2S_ppm','H₂S',[-1.3,1.9,1.7],4],['Temp_C','°C',[1.8,2.4,1.5],1]].forEach(([key,name,p,decimals])=>{
      const mesh=new T.Mesh(new T.SphereGeometry(.13,14,10),new T.MeshStandardMaterial({color:0xc7d7ce,emissive:0x95a69c,emissiveIntensity:.35,roughness:.3,metalness:.25}));mesh.position.set(...p);sensorGroup.add(mesh);
      const halo=new T.Mesh(new T.SphereGeometry(.21,12,10),new T.MeshBasicMaterial({color:0xa3b8aa,transparent:true,opacity:.10,depthWrite:false}));mesh.add(halo);
      const points=[new T.Vector3(0,.8,0),new T.Vector3(...p)],line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0xb2c3b7,transparent:true,opacity:.36}));sensorGroup.add(line);
      const label=document.createElement('div');label.className='sensor-lens-label';labelLayer.appendChild(label);sensorNodes.push({key,name,p,decimals,mesh,halo,line,label});
    });
  }
  try{
    if(!T)throw new Error('Three.js not available');
    renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.8));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;container.appendChild(renderer.domElement);
    scene=new T.Scene();camera=new T.PerspectiveCamera(40,1,.1,160);world=new T.Group();scene.add(world);
    scene.add(new T.HemisphereLight(0xe4eeef,0x272a2d,2));const key=new T.DirectionalLight(0xe0e7e4,3);key.position.set(-8,20,12);scene.add(key);const rim=new T.DirectionalLight(0x9bafb4,1.8);rim.position.set(15,8,-18);scene.add(rim);
    makeSlab();mainEdges.forEach(([a,b])=>tunnel(a,b));Object.entries(zonePositions).forEach(([z,p])=>addZone(z,p));makeRelays();makeReserve();makePeople();makeSensorLens();
  }catch(error){available=false;view='2d';renderer?.dispose();container.innerHTML='';console.warn('Mine 3D fallback:',error.message);}
  const fallback=document.createElementNS('http://www.w3.org/2000/svg','svg');fallback.setAttribute('viewBox','0 0 980 470');fallback.classList.add('fallback-svg');fallback.style.display='none';container.appendChild(fallback);
  function draw2D(){
    if(view!=='2d')return;const xy=id=>{const p=pos(id);return [90+(p[0]+12.5)*31,235+p[1]*24];};
    let s='<defs><pattern id="floorGrid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#ffffff" stroke-opacity=".04"/></pattern></defs><rect x="35" y="55" width="910" height="370" rx="22" fill="url(#floorGrid)" stroke="#4d5558" stroke-opacity=".5"/>';
    mainEdges.forEach(([a,b])=>{const [x1,y1]=xy(a),[x2,y2]=xy(b),off=snapshot?.offlineTrunks.includes(a)||snapshot?.offlineTrunks.includes(b)||snapshot?.nodeState[b]?.offline;s+=`<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#596265" stroke-width="18"/><path d="M${x1} ${y1}L${x2} ${y2}" stroke="${off?'#994a44':'#252e31'}" stroke-width="12"/>`;});
    if(routesVisible)reserveEdges.forEach(([a,b],i)=>{const [x1,y1]=xy(a),[x2,y2]=xy(b);s+=`<path d="M${x1} ${y1}Q${(x1+x2)/2} ${130-i*13} ${x2} ${y2}" fill="none" stroke="#a6b6ad" stroke-opacity=".55" stroke-dasharray="4 5"/>`;});
    Object.keys(relayPositions).forEach(id=>{const [x,y]=xy(id);s+=`<circle cx="${x}" cy="${y}" r="10" fill="${snapshot?.offlineTrunks.includes(id)?'#ef645d':'#a8bbb3'}"/><text x="${x}" y="${y-20}" text-anchor="middle" fill="#a4b1b3" font-size="11">N${id}</text>`;});
    Object.keys(zonePositions).forEach(z=>{const [x,y]=xy(z),color='#'+colorFor(levelFor(z)).toString(16);s+=`<circle cx="${x}" cy="${y}" r="25" fill="#252f32" stroke="${color}" stroke-width="${selected===z?3:1}"/><text x="${x}" y="${y+5}" text-anchor="middle" fill="${color}" font-size="14">${z}</text>`;if(minersVisible)s+=`<circle cx="${x+30}" cy="${y+15}" r="4" fill="${color}"/>`;});
    fallback.innerHTML=s;
  }
  function resize(){const rect=container.getBoundingClientRect();if(renderer){renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/Math.max(1,rect.height);camera.updateProjectionMatrix();}dirty=true;placeLabels(performance.now(),true);}
  function placeLabels(now,force=false){if(!force&&now-lastLabelUpdate<65)return;lastLabelUpdate=now;const {width:w,height:h}=container.getBoundingClientRect();
    Object.entries(labels).forEach(([z,el])=>{
      if(view==='2d'){const p=zonePositions[z],scale=Math.min(w/980,h/470),ox=(w-980*scale)/2,oy=(h-470*scale)/2;el.style.transform=`translate(${ox+(90+(p[0]+12.5)*31)*scale}px,${oy+(235+p[1]*24)*scale-38}px) translate(-50%,-100%)`;}
      else{const p=new T.Vector3(zonePositions[z][0],1.2,zonePositions[z][1]);p.project(camera);el.style.transform=`translate(${(p.x*.5+.5)*w}px,${(-p.y*.5+.5)*h}px) translate(-50%,-100%)`;el.hidden=p.z>1;}
    });
    Object.entries(relayLabels).forEach(([id,el])=>{el.hidden=view==='2d';if(view!=='2d'){const p=new T.Vector3(relayPositions[id][0],.3,relayPositions[id][1]+.8).project(camera);el.style.transform=`translate(${(p.x*.5+.5)*w}px,${(-p.y*.5+.5)*h}px) translate(-50%,0)`;}});
    const occupied=Object.values(labels).filter(el=>!el.hidden).map(el=>{const r=el.getBoundingClientRect(),base=container.getBoundingClientRect();return {x:r.left-base.left,y:r.top-base.top,w:r.width,h:r.height};});
    sensorNodes.forEach(s=>{s.label.hidden=view==='2d'||!sensorsVisible;if(!s.label.hidden){
      const p=s.mesh.getWorldPosition(new T.Vector3()).project(camera),anchorX=(p.x*.5+.5)*w,anchorY=(-p.y*.5+.5)*h;
      const sw=s.label.offsetWidth,sh=s.label.offsetHeight;let candidate;
      for(const [dx,dy] of [[0,-28],[-25,-47],[25,-47],[-55,-25],[55,-25],[0,-65],[-70,-65],[70,-65],[0,12]]){
        const r={x:Math.max(8,Math.min(w-sw-60,anchorX-sw/2+dx)),y:Math.max(35,Math.min(h-60,anchorY+dy)),w:sw,h:sh};candidate=r;
        if(!occupied.some(o=>r.x<o.x+o.w+7&&r.x+r.w+7>o.x&&r.y<o.y+o.h+5&&r.y+r.h+5>o.y))break;
      }
      occupied.push(candidate);s.label.style.transform=`translate(${candidate.x}px,${candidate.y}px)`;
    }});
  }
  function updateText(){Object.entries(labels).forEach(([z,el])=>{el.replaceChildren();const dot=document.createElement('span');dot.className='label-dot';el.append(dot,document.createTextNode(MineI18n.t('zoneName',{zone:z})));el.title=MineI18n.t(levelFor(z));});dirty=true;}
  if(!available){Object.keys(zonePositions).forEach(z=>{const el=document.createElement('button');el.className='scene-label';el.onclick=()=>onSelect(z);labelLayer.appendChild(el);labels[z]=el;});}
  function setState(state,zone){snapshot=state;selected=zone;const off=new Set(state.offlineTrunks);const used=new Set();Object.values(state.routes).forEach(r=>{if(r.online)r.path?.forEach((a,i)=>{if(i)used.add([r.path[i-1],a].sort().join('-'));});});
    Object.entries(labels).forEach(([z,el])=>{el.dataset.level=levelFor(z);el.classList.toggle('selected',z===zone);el.setAttribute('aria-pressed',String(z===zone));el.title=MineI18n.t(levelFor(z));});
    if(available){Object.entries(zones).forEach(([z,obj])=>{const color=colorFor(levelFor(z));obj.outer.material.color.setHex(color);obj.light.material.color.setHex(color);obj.inner.visible=z===zone;obj.pad.material.color.setHex(z===zone?0x4b5654:0x363e3e);});
      Object.entries(relays).forEach(([id,obj])=>{obj.light.material.color.setHex(off.has(id)?0xef645d:0xd0ded7);obj.pad.material.color.setHex(off.has(id)?0x713c37:0x778583);});
      edgeObjects.forEach(e=>{const failed=off.has(e.a)||off.has(e.b)||state.nodeState[e.b]?.offline;e.line.material.color.setHex(failed?0xec655c:0x8b9b94);e.line.visible=routesVisible;});
      reserveObjects.forEach(e=>{const active=used.has([e.a,e.b].sort().join('-'));e.line.visible=routesVisible;e.line.material.opacity=(off.has(e.a)||off.has(e.b))?0:active?.75:.15;});
      people.forEach(p=>{const isLost=state.nodeState[p.z].offline||(state.scenario==='emergency'&&p.z==='E'&&state.tick>55);const color=isLost?0xef645d:colorFor(levelFor(p.z));p.helmet.material.color.setHex(color);p.marker.material.color.setHex(color);p.group.visible=minersVisible;});
      sensorGroup.position.set(zonePositions[zone][0],0,zonePositions[zone][1]);sensorGroup.visible=sensorsVisible;
      sensorNodes.forEach(s=>{const v=state.readings[zone][s.key],l=state.limits[s.key],status=v>=l.danger?'critical':v>=l.warn?'warning':'normal',color=colorFor(status);s.mesh.material.color.setHex(color);s.mesh.material.emissive.setHex(color);s.halo.material.color.setHex(color);s.line.material.color.setHex(color);s.label.dataset.level=status;s.label.textContent=s.name+' · '+Number(v).toFixed(s.decimals)+(s.key==='Temp_C'?'':' ppm');});
    }draw2D();dirty=true;
  }
  function setView(next){view=next==='3d'&&available?'3d':'2d';if(renderer)renderer.domElement.style.display=view==='3d'?'block':'none';fallback.style.display=view==='2d'?'block':'none';draw2D();dirty=true;placeLabels(performance.now(),true);return view;}
  function zoomBy(factor){distance=Math.max(18,Math.min(58,distance*factor));idleAt=performance.now();dirty=true;}
  function resetCamera(){yaw=baseYaw;pitch=basePitch;distance=baseDistance;panX=panZ=0;idleAt=performance.now();dirty=true;}
  function orbit(dx,dy){yaw-=dx*.005;pitch=Math.max(.33,Math.min(1.35,pitch+dy*.004));dirty=true;idleAt=performance.now();}
  function pan(dx,dy){panX-=dx*.018*(distance/34);panZ-=dy*.018*(distance/34);panX=Math.max(-12,Math.min(12,panX));panZ=Math.max(-10,Math.min(10,panZ));dirty=true;idleAt=performance.now();}
  let moved=0,startX=0,startY=0;
  container.addEventListener('pointerdown',e=>{if(view!=='3d')return;container.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});startX=e.clientX;startY=e.clientY;moved=0;idleAt=performance.now();});
  container.addEventListener('pointermove',e=>{if(view!=='3d'||!pointers.has(e.pointerId))return;const old=pointers.get(e.pointerId);moved+=Math.abs(e.clientX-old.x)+Math.abs(e.clientY-old.y);if(pointers.size===2){const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)?.[1];if(other){const oldD=Math.hypot(old.x-other.x,old.y-other.y),newD=Math.hypot(e.clientX-other.x,e.clientY-other.y);if(newD>0&&oldD>0)zoomBy(oldD/newD);pan((e.clientX-old.x)/2,(e.clientY-old.y)/2);}}else if(e.shiftKey||e.buttons===2)pan(e.clientX-old.x,e.clientY-old.y);else orbit(e.clientX-old.x,e.clientY-old.y);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});});
  container.addEventListener('pointerup',e=>{if(view==='3d'&&moved<6&&pointers.size===1){const rect=container.getBoundingClientRect();const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hit=ray.intersectObjects(picks)[0];if(hit?.object.userData.zone)onSelect(hit.object.userData.zone);}pointers.delete(e.pointerId);});
  container.addEventListener('pointercancel',e=>pointers.delete(e.pointerId));container.addEventListener('contextmenu',e=>e.preventDefault());container.addEventListener('wheel',e=>{if(view==='3d'){e.preventDefault();zoomBy(Math.exp(e.deltaY*.001));}},{passive:false});
  container.addEventListener('keydown',e=>{if(view!=='3d')return;if(e.key==='ArrowLeft')orbit(-20,0);else if(e.key==='ArrowRight')orbit(20,0);else if(e.key==='ArrowUp')orbit(0,-20);else if(e.key==='ArrowDown')orbit(0,20);else if(e.key==='+'||e.key==='=')zoomBy(.9);else if(e.key==='-')zoomBy(1.1);else if(e.key==='Home')resetCamera();else return;e.preventDefault();});
  function animate(now){frame=requestAnimationFrame(animate);if(document.hidden||now-lastFrame<32)return;lastFrame=now;const time=now*.001;
    if(available&&view==='3d'&&(dirty||autoMotion)){
      const idle=autoMotion&&pointers.size===0&&now-idleAt>3500;const drift=idle?Math.sin((now-idleAt-3500)*.00018)*.07:0;
      const fittedDistance=distance*Math.max(1,1.38/camera.aspect);
      camera.position.set(panX+Math.sin(yaw+drift)*Math.cos(pitch)*fittedDistance,Math.sin(pitch)*fittedDistance,panZ+Math.cos(yaw+drift)*Math.cos(pitch)*fittedDistance);camera.lookAt(panX,-.3,panZ);
      if(autoMotion)people.forEach(p=>{const base=zonePositions[p.z];p.group.position.x=base[0]+p.dx+Math.sin(time*.5+p.index)*.035;});
      renderer.render(scene,camera);placeLabels(now);const needle=document.getElementById('compassNeedle');if(needle)needle.style.transform=`rotate(${-(yaw+drift)*180/Math.PI}deg)`;dirty=false;
    }if(view==='2d'&&dirty){placeLabels(now,true);dirty=false;}lastTime=now;
  }
  new ResizeObserver(resize).observe(container);updateText();setView(view);resize();frame=requestAnimationFrame(animate);
  return {setState,setView,updateText,zoomBy,resetCamera,get available(){return available;},get view(){return view;},get motion(){return autoMotion;},setMotion(value){autoMotion=value;dirty=true;idleAt=performance.now();},setSensorLens(value){sensorsVisible=value;if(sensorGroup)sensorGroup.visible=value;dirty=true;placeLabels(performance.now(),true);},setLayers(routes,miners){routesVisible=routes;minersVisible=miners;if(snapshot)setState(snapshot,selected);},destroy(){cancelAnimationFrame(frame);renderer?.dispose();}};
};
