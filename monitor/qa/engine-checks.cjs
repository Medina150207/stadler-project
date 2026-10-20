const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');const context=vm.createContext({window:{},console});context.window=context;
for(const name of ['assets/model_bundle.js','engine.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context);
const create=()=>context.createMineEngine();let engine=create(),state=engine.reset();
const results=[];const check=(name,fn)=>{fn();results.push({name,passed:true});};
check('Baseline: all six zones and eight helmets available',()=>{assert.equal(state.ZONES.length,6);assert.equal(state.miners.length,8);assert.ok(state.ZONES.every(z=>state.routes[z].online));});
check('Relay failure disconnects its branches, preserves reachable branches, and restores',()=>{state=engine.toggleNode('3');assert.equal(state.routes.B.online,false);assert.equal(state.routes.E.online,false);assert.equal(state.routes.A.online,true);assert.equal(state.routes.C.online,true);state=engine.toggleNode('3');assert.ok(state.ZONES.every(z=>state.routes[z].online));assert.equal(state.tick,0);});
check('Emergency scenario crosses the retained methane limit and produces a trend estimate',()=>{engine.reset('emergency');for(let i=0;i<65;i++)state=engine.step();assert.ok(state.readings.E.CH4_ppm>=state.limits.CH4_ppm.danger);assert.equal(state.nodeState.E.severity,2);assert.equal(state.forecasts.E.etaMin,0);});
check('Predictive scenario develops a forecast before the methane threshold',()=>{engine.reset();for(let i=0;i<90;i++)state=engine.step();assert.ok(state.forecasts.C.etaMin<15);assert.ok(state.readings.C.CH4_ppm<state.limits.CH4_ppm.danger);});
const csv=fs.readFileSync(path.join(root,'data/sensor_stream_predictive_mesh.csv'),'utf8');
check('CSV tick zero retains all six input readings without synthesized replacements',()=>{state=engine.loadCSV(csv);assert.equal(state.tick,0);assert.equal(state.uploaded,true);const first=csv.trim().split(/\r?\n/).slice(1,7);for(const row of first){const cells=row.split(',');assert.equal(state.readings[cells[1]].CH4_ppm,Number(cells[5]));assert.equal(state.readings[cells[1]].tick,0);}});
check('Incomplete CSV is rejected atomically',()=>{const before=JSON.stringify(engine.snapshot());const lines=csv.trim().split(/\r?\n/);lines.splice(2,1);assert.throws(()=>engine.loadCSV(lines.join('\n')),/csvZones/);assert.equal(JSON.stringify(engine.snapshot()),before);});
check('Training table is not silently interpreted as a streaming CSV',()=>{assert.throws(()=>engine.loadCSV(fs.readFileSync(path.join(root,'data/smart_helmet_dataset_with_danger_level.csv'),'utf8')),/csvColumns/);});
check('Non-numeric data and duplicate zone/tick pairs are rejected',()=>{const lines=csv.trim().split(/\r?\n/),cells=lines[1].split(',');cells[5]='';const bad=[lines[0],cells.join(','),...lines.slice(2)].join('\n');assert.throws(()=>engine.loadCSV(bad),/csvNumeric/);assert.throws(()=>engine.loadCSV(csv.trim()+'\n'+lines[1]),/csvDuplicate/);});
check('CSV replay resets trend history at the loop boundary',()=>{engine.loadCSV(csv);for(let i=0;i<180;i++)state=engine.step();assert.equal(state.tick,0);assert.equal(state.history.A.length,1);});
const original=process.argv.find(arg=>arg.startsWith('--original='))?.slice(11);
if(original){
 const source=fs.readFileSync(path.join(original,'app.js'),'utf8').replace('buildSvg(); wireControls(); reset();','');
 const baseline=vm.createContext({window:{},console});baseline.window=baseline;
 vm.runInContext(fs.readFileSync(path.join(original,'assets/model_bundle.js'),'utf8'),baseline);vm.runInContext(source,baseline);vm.runInContext('renderAll=()=>{};',baseline);
 check('Bundled neural weights are byte-identical to the original',()=>{assert.equal(fs.readFileSync(path.join(root,'assets/model_bundle.js'),'utf8'),fs.readFileSync(path.join(original,'assets/model_bundle.js'),'utf8'));});
 for(const mode of ['predictive','emergency'])check(`Original algorithm equivalence: ${mode}, 160 samples × 6 zones`,()=>{
   vm.runInContext(`scenario='${mode}';tick=0;dataFeed=null;offlineTrunks.clear();history=Object.fromEntries(ZONES.map(z=>[z,[]]));`,baseline);
   const updated=create();updated.reset(mode);
   for(let i=0;i<160;i++){
     vm.runInContext('updateSimulation()',baseline);const old=JSON.parse(vm.runInContext('JSON.stringify({readings,nodeState,forecasts,routes})',baseline));const fresh=JSON.parse(JSON.stringify(i?updated.step():updated.snapshot()));
     assert.deepEqual(fresh.readings,old.readings);
     for(const z of fresh.ZONES){assert.equal(fresh.nodeState[z].severity,old.nodeState[z].severity);assert.deepEqual(fresh.nodeState[z].nn,old.nodeState[z].nn);assert.equal(fresh.forecasts[z].etaMin,old.forecasts[z].etaMin);assert.deepEqual(fresh.routes[z],old.routes[z]);}
   }
 });
}
console.log(JSON.stringify({passed:results.length,results},null,2));
