import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCurrentExecution} from '../src/current-execution.js';
import {PRESENTATION_KEY,createPresentationPreferences,reducedGuidanceMotion} from '../src/presentation-preferences.js';
import {createStaffSelection,staffCardForExecution,staffCardHTML} from '../src/staff-card.js';
import {stationFacts,VERIFIED_INDOOR_CORRIDORS,indoorCoverageForStep} from '../src/station-guidance-data.js';
import {stationGuidanceHTML,indoorNoticeHTML} from '../src/station-guide.js';
import {makePlan,startJourney,confirmCheckpoint,acceptDetour,stopAction,transition,journeyCard,proposeRoute,acceptRoute} from '../src/journey-v2.js';
import {FIXTURE_LAYOUT,fixtureStatuses} from '../src/facility-data.js';
import {rankToilets,previewToiletDetour} from '../src/toilet-engine.js';
const name=id=>({'DT14_A':'Bugis (DT14)','DT15_A':'Promenade (DT15)','CC4_B':'Promenade (CC4)'}[id]??id);
const route=()=>({id:'route',departureSeconds:36000,arrivalSeconds:36600,walkingSeconds:120,accessibility:'unknown',steps:[
  {id:'access',type:'access',text:'access: Bugis (DT14_A) → Bugis (DT14_A)',fromStopId:'DT14_A',toStopId:'DT14_A',durationSeconds:60},
  {id:'wait',type:'wait',text:'Wait',fromStopId:'DT14_A',toStopId:'DT14_A',durationSeconds:30},
  {id:'ride',type:'ride',text:'DTL train: Bugis (DT14_A) → Promenade (DT15_A)',fromStopId:'DT14_A',toStopId:'DT15_A',source:{mode:'rail',routeId:'DTL'},durationSeconds:420},
  {id:'transfer',type:'transfer',text:'Change',fromStopId:'DT15_A',toStopId:'CC4_B',durationSeconds:60},
  {id:'exit',type:'exit',text:'Exit',fromStopId:'CC4_B',toStopId:'CC4_B',durationSeconds:30},
]});
const plan=()=>makePlan({origin:{id:'DT14_A',label:'Bugis'},destination:{id:'CC4_B',label:'Promenade'},date:'2026-09-19',departureTime:'10:00',preferences:{stepFree:false},route:route(),mode:'replay'},100);
const state=()=>startJourney(plan(),200);
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
const freeze=value=>{Object.freeze(value);for(const v of Object.values(value))if(v&&typeof v==='object')freeze(v);return value;};

test('one accepted resolver keeps exact canonical phase and excludes route previews, clock and location',()=>{
  const s=confirmCheckpoint(state(),{stepIndex:1},300);s.proposal={route:{...route(),steps:[{text:'UNACCEPTED PREVIEW'}]}};s.location={latitude:5,longitude:9};freeze(s);
  const e=resolveCurrentExecution(s,{name,prepared:{route:{steps:[{text:'OTHER SEARCH'}]}}});
  assert.equal(e.canonicalStepIndex,1);assert.match(e.current,/Wait at Bugis.*Downtown Line/);assert.match(e.next,/Ride Downtown Line/);assert.doesNotMatch(e.current,/PREVIEW|_A/);
  assert.equal(journeyCard(s,{name,now:99999999999}).current,e.current);assert.equal(e.primaryAction,'checkpoint');
});
test('staff context prefers public endpoint identity over a saved private nickname',()=>{const s=state();s.plan.destination.label='Private saved nickname';assert.equal(resolveCurrentExecution(s,{name}).destination,'Promenade (CC4)');assert.doesNotMatch(staffCardForExecution(resolveCurrentExecution(s,{name})).context,/Private/);});
test('missing, invalid and unavailable presentation preferences default to simple without writing storage',()=>{
  const store=storage(),settings=createPresentationPreferences(store);
  for(const raw of [null,'','{broken','null','false','[]','{}',JSON.stringify({schemaVersion:2,simpleGuidance:false}),JSON.stringify({schemaVersion:1}),JSON.stringify({schemaVersion:1,simpleGuidance:'false'})]){
    if(raw===null)store.removeItem(PRESENTATION_KEY);else store.setItem(PRESENTATION_KEY,raw);
    assert.deepEqual(settings.read(),{schemaVersion:1,simpleGuidance:true},String(raw));
    assert.equal(store.getItem(PRESENTATION_KEY),raw,'reading must not overwrite stored data');
  }
  assert.equal(createPresentationPreferences().read().simpleGuidance,true);
  assert.equal(createPresentationPreferences({getItem(){throw Error();}}).read().simpleGuidance,true);
});
test('both explicit presentation choices persist independently and never replace travel/accepted state',()=>{
  const store=storage();store.setItem('commute-copilot-journey-v2',JSON.stringify(state()));store.setItem('preferences','unchanged');const before=store.getItem('commute-copilot-journey-v2');
  const settings=createPresentationPreferences(store);assert.equal(settings.read().simpleGuidance,true);
  for(const value of [false,true,false]){
    assert.equal(settings.setSimple(value).ok,true);assert.equal(createPresentationPreferences(store).read().simpleGuidance,value);
    assert.equal(store.getItem('preferences'),'unchanged');assert.equal(store.getItem('commute-copilot-journey-v2'),before);
  }
  const saved=store.getItem(PRESENTATION_KEY);assert.equal(settings.setSimple('false').ok,false);assert.equal(store.getItem(PRESENTATION_KEY),saved);
  assert.equal(reducedGuidanceMotion(settings.read()),false);assert.equal(reducedGuidanceMotion(settings.read(),{systemReducedMotion:true}),true);assert.equal(reducedGuidanceMotion({simpleGuidance:true}),true);
});
test('failed presentation writes retain an explicit choice or the simple fallback',()=>{
  const store=storage();store.setItem(PRESENTATION_KEY,JSON.stringify({schemaVersion:1,simpleGuidance:false}));
  const blocked=createPresentationPreferences({...store,setItem(){throw Error();}}).setSimple(true);
  assert.equal(blocked.ok,false);assert.equal(blocked.preferences.simpleGuidance,false);
  const unavailable=createPresentationPreferences({getItem(){throw Error();},setItem(){throw Error();}}).setSimple(false);
  assert.equal(unavailable.ok,false);assert.equal(unavailable.preferences.simpleGuidance,true);
});
test('outbound, reached and return detours use confirmed accepted phase in all cards',()=>{
  const now=1000,ranked=rankToilets(FIXTURE_LAYOUT,{from:'platform',allowFixtures:true,statuses:fixtureStatuses('none',now),now,arrivalBaseMs:now}),preview=previewToiletDetour(FIXTURE_LAYOUT,ranked[0],{now});
  let s=acceptDetour(state(),preview,now);const original=JSON.stringify(s.route.steps);
  assert.equal(resolveCurrentExecution(s).phase,'detour-outbound');assert.match(staffCardForExecution(resolveCurrentExecution(s)).message,/Continue via passage/);
  s=confirmCheckpoint(s,{nodeId:'a-bottom',stationId:FIXTURE_LAYOUT.id},1100);assert.match(resolveCurrentExecution(s).current,/Take Lift A/);assert.doesNotMatch(resolveCurrentExecution(s).current,/fixture-lift/);
  assert.equal(journeyCard(s).current,resolveCurrentExecution(s).current);assert.equal(resolveCurrentExecution(s).indoorNotice.kind,'fixture');
  s=stopAction(s,'reached',1200);assert.equal(resolveCurrentExecution(s).phase,'detour-reached');assert.equal(resolveCurrentExecution(s).primaryAction,'resume-detour');
  s=stopAction(s,'resume',1300);assert.equal(resolveCurrentExecution(s).phase,'detour-return');assert.match(staffCardForExecution(resolveCurrentExecution(s)).message,/Continue via passage/);
  s=confirmCheckpoint(s,{nodeId:'a-top',stationId:FIXTURE_LAYOUT.id},1400);assert.match(resolveCurrentExecution(s).current,/Lift A.*platform/);assert.equal(JSON.stringify(s.route.steps),original);assert.equal(s.progress.stepIndex,0);
});
test('terminal and paused states take precedence over blocked paths, review and detours',()=>{
  let s=state();s.facilityBlocked=true;s.facilityReview=true;assert.equal(resolveCurrentExecution(s).phase,'blocked');assert.equal(resolveCurrentExecution({...s,facilityBlocked:false}).phase,'review');
  s=transition(s,'pause',500);assert.equal(resolveCurrentExecution(s).phase,'paused');assert.match(staffCardForExecution(resolveCurrentExecution(s)).message,/paused/);assert.doesNotMatch(resolveCurrentExecution(s).next,/Ride/);
  s=transition(s,'cancel',600);assert.equal(resolveCurrentExecution(s).phase,'cancelled');assert.equal(resolveCurrentExecution(s).indoorNotice,null);assert.equal(staffCardForExecution(resolveCurrentExecution(s)).context,'No active travel instruction');
  assert.equal(resolveCurrentExecution(null,{prepared:plan()}).phase,'prepared');assert.equal(resolveCurrentExecution(null).phase,'none');assert.equal(resolveCurrentExecution(transition(state(),'finish',700)).phase,'completed');
});
test('staff alternate selection never mutates the journey and resets on canonical route/progress changes',()=>{
  let s=state();const choices=createStaffSelection(),original=structuredClone(s);choices.resolve(resolveCurrentExecution(s));choices.select('lift');assert.match(choices.resolve(resolveCurrentExecution(s)).message,/check which lift/);assert.deepEqual(s,original);
  s={...s,revision:100,permissions:{...s.permissions,progress:true}};assert.equal(choices.resolve(resolveCurrentExecution(s)).request,'lift','unrelated permission revision does not erase explicit choice');
  s=confirmCheckpoint(s,{stepIndex:2},1100);const changed=choices.resolve(resolveCurrentExecution(s,{name}));assert.equal(changed.request,'automatic');assert.equal(changed.selectionReset,true);choices.select('alert');assert.match(choices.resolve(resolveCurrentExecution(s,{name})).message,/Promenade.*get off/);
  s=proposeRoute(s,{...route(),id:'replacement'},'review',1200);assert.equal(choices.resolve(resolveCurrentExecution(s,{name})).request,'alert');s=acceptRoute(s,1300);assert.equal(choices.resolve(resolveCurrentExecution(s,{name})).request,'automatic');choices.select('lift');s=transition(s,'finish',1400);assert.equal(choices.resolve(resolveCurrentExecution(s)).request,'automatic');
});
test('WIP notices apply to enclosed rail transitions without declaring each ride unsupported',()=>{
  for(const step of route().steps){assert.equal(!!indoorCoverageForStep(step),['access','transfer','exit'].includes(step.type),step.id);}
  assert.equal(indoorCoverageForStep({type:'access',fromStopId:'bus:01012',toStopId:'bus:01012'}),null);
  assert.equal(indoorCoverageForStep({type:'transfer',source:{indoor:true}}).kind,'work-in-progress');
  assert.equal(VERIFIED_INDOOR_CORRIDORS.length,0);assert.equal(stationFacts('DT14_A').name,'Bugis');assert.equal(stationFacts('DT140'),null);
  assert.equal(stationFacts('DT14arbitrary-label'),null);
  const e=resolveCurrentExecution(state(),{name});assert.match(indoorNoticeHTML(e),/Work in progress/);assert.match(stationGuidanceHTML(e),/exits D and E/);assert.match(stationGuidanceHTML(e),/A\/B/);assert.match(stationGuidanceHTML(e),/no field survey/i);
});
test('external labels stay inert in staff cards, station headings and notices',()=>{
  const e={...resolveCurrentExecution(state()),current:'<img src=x onerror=alert(1)>',destination:'<script>bad</script>',stationLabel:'<b>Fake</b>',stationId:'unknown',indoorNotice:{title:'<svg onload=bad()>',message:'<em>x</em>'}};
  for(const html of [staffCardHTML(staffCardForExecution(e)),stationGuidanceHTML(e),indoorNoticeHTML(e)]){assert.doesNotMatch(html,/<script>|<img|<svg|<em>/);assert.match(html,/&lt;/);}
});
test('OneMap rail access warnings preserve supplied directions without inventing stop IDs',()=>{const s=state();s.route={...s.route,provider:'onemap',steps:[{id:'a',type:'walk',text:'Walk from public address to Bugis',durationSeconds:90,source:{mode:'walk',fromLabel:'Public address',toLabel:'Bugis'}},{id:'b',type:'wait',text:'Wait for planned connection',durationSeconds:60,source:{fromLabel:'Bugis',toLabel:'Bugis'}},{id:'c',type:'ride',text:'Ride Downtown Line toward Expo',durationSeconds:300,source:{mode:'rail',routeId:'DTL',fromLabel:'Bugis',toLabel:'Promenade'}},{id:'d',type:'walk',text:'Walk from Promenade to public destination',durationSeconds:90,source:{mode:'walk',fromLabel:'Promenade',toLabel:'Public destination'}}]};for(let i=0;i<s.route.steps.length;i++){s.progress.stepIndex=i;const e=resolveCurrentExecution(s);assert.equal(e.current,s.route.steps[i].text);assert.equal(e.stationId,null);assert.equal(!!e.indoorNotice,i!==2);}});
