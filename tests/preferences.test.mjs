import test from 'node:test';
import assert from 'node:assert/strict';
import {PREFERENCES_KEY,DEFAULT_PREFERENCES,TRAVEL_STYLES,normalizePreferences,applyTravelStyle,createPreferencesStore} from '../src/preferences.js';
import {createPersonalStore,PERSONAL_KEY,instantiateTemplate} from '../src/personal.js';
import {makePlan,routeFromLegacy,startJourney,setApproximateLocation,setPermissions,saveActive,restoreActive,validatePlan} from '../src/journey-v2.js';
import {handleSharingApi} from '../server/sharing.js';
import {emptySharingState} from '../server/sharing-store.js';

const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const endpoint=(id,label=id,lat=1.3)=>({id,label,lat,lng:103.8,sourceId:'reviewed-catalogue:'+id,coverage:'supported',accessibility:'unknown'});
const legacyInput={originId:'a',destinationId:'b',date:'2026-09-18',departureTime:'23:45',deadlineDate:'2026-09-19',deadlineTime:'00:30',timeMode:'arrive-by'};
const legacyRoute={id:'rail-trip',departureSeconds:85500,arrivalSeconds:86100,walkingSeconds:60,legs:[{type:'ride',routeId:'DT',fromStopId:'a',toStopId:'b',stopIds:['a','b'],durationSeconds:600}]};

test('editable travel styles persist every field without inferring fare eligibility or a deadline',()=>{
  const storage=memory(),store=createPreferencesStore(storage);assert.deepEqual(store.read().preferences,DEFAULT_PREFERENCES);
  store.update({fareCategory:'student'});
  for(const style of TRAVEL_STYLES){const applied=store.applyPreset(style.id);assert.equal(applied.travelStyle,style.id);assert.equal(applied.fareCategory,'student');assert.equal(applied.deadline,undefined);assert.equal(applied.walkingSpeed,undefined);assert.ok(style.explanation.length);}
  const edited=store.update({walkingLimitMinutes:12,preference:'quieter',maxExtraMinutes:25,stepFree:false,assistanceRequested:true});
  assert.deepEqual(createPreferencesStore(storage).read().preferences,edited);assert.equal(edited.travelStyle,'mdm-lim');
  assert.deepEqual(normalizePreferences({walkingLimit:8,detourLimit:10,preference:'quieter'}),{...DEFAULT_PREFERENCES,walkingLimitMinutes:8,maxExtraMinutes:10,preference:'quieter'});
});

test('invalid or blocked preference storage is reported without replacing existing data',()=>{
  const storage=memory();storage.setItem(PREFERENCES_KEY,'{broken');const store=createPreferencesStore(storage);assert.equal(store.read().ok,false);assert.throws(()=>store.applyPreset('rachel'),/preserved/);assert.equal(storage.getItem(PREFERENCES_KEY),'{broken');
  store.reset();assert.equal(store.read().ok,true);
  for(const bad of [{walkingLimitMinutes:''},{walkingLimitMinutes:NaN},{maxExtraMinutes:121},{stepFree:'true'},{travelStyle:'invented'},{schemaVersion:99}])assert.throws(()=>store.update(bad));
  assert.throws(()=>createPreferencesStore({getItem:()=>null,setItem(){throw Error('blocked');}}).update({walkingLimitMinutes:10}),/Could not save/);
});

test('preferences and cross-midnight deadline survive legacy conversion, save, reopen and active reload',()=>{
  const storage=memory(),preferences={...applyTravelStyle('arjun'),walkingLimitMinutes:18,maxExtraMinutes:25,assistanceRequested:true,fareCategory:'senior'};
  const plan=routeFromLegacy(legacyRoute,{...legacyInput,...preferences});
  assert.deepEqual(plan.preferences,preferences);assert.equal(plan.deadlineDate,'2026-09-19');assert.equal(plan.timeMode,'arrive-by');assert.equal(plan.route.arrivalSeconds,legacyRoute.arrivalSeconds);
  const store=createPersonalStore(storage),saved=store.saveRoute({label:'Morning routine',origin:endpoint('a'),destination:endpoint('b','Destination',1.31),preferences:plan.preferences,timeMode:plan.timeMode,deadlineTime:plan.deadline,deadlineDate:plan.deadlineDate});
  const draft=instantiateTemplate(saved,saved.templates[0].id,{departureDate:'2026-09-19',departureTime:'00:01'});
  assert.deepEqual(draft.preferences,preferences);assert.equal(draft.departureTime,'00:01');assert.equal(draft.deadlineDate,'2026-09-19');assert.equal(draft.deadlineTime,'00:30');assert.equal(draft.route,null);assert.equal(draft.origin.routingId,'a');assert.notEqual(draft.origin.id,'a');
  const active=startJourney(plan);assert.ok(saveActive(storage,active));assert.deepEqual(restoreActive(storage).plan.preferences,preferences);
  createPreferencesStore(storage).applyPreset('mdm-lim');assert.deepEqual(restoreActive(storage).plan,plan,'editing default preferences must not mutate the accepted trip');
});

test('direct Save Route is atomic, reuses endpoint identities, and recovers duplicate labels',()=>{
  const storage=memory(),store=createPersonalStore(storage),input={label:'Daily journey',origin:endpoint('a','Stop'),destination:endpoint('b','Stop',1.31)};
  store.saveRoute(input);store.saveRoute(input);const state=store.read().state;assert.equal(state.places.length,2);assert.deepEqual(state.places.map(p=>p.label),['Stop','Stop (2)']);assert.deepEqual(state.templates.map(t=>t.label),['Daily journey','Daily journey (2)']);
  const before=storage.getItem(PERSONAL_KEY);assert.throws(()=>store.saveRoute({...input,destination:{id:'unresolved',label:'An address'}}),/resolved/);assert.equal(storage.getItem(PERSONAL_KEY),before);assert.throws(()=>store.saveRoute({...input,destination:input.origin}),/different/);assert.equal(storage.getItem(PERSONAL_KEY),before);
  const unsupported=store.saveRoute({origin:{...endpoint('manual','Manual',1.32),coverage:'unknown'},destination:endpoint('a')});assert.equal(unsupported.places.find(p=>p.label==='Manual').routingId,null);assert.equal(unsupported.places.find(p=>p.label==='Manual').coverage,'unknown');
});

test('legacy saved pairs gain defaults on reopening and invalid civil deadline modes fail closed',()=>{
  const storage=memory(),store=createPersonalStore(storage);store.addPlace(endpoint('a'));store.addPlace(endpoint('b','B',1.31));store.addTemplate({label:'Old pair',originId:'a',destinationId:'b',preferences:{walkingLimitMinutes:10,stepFree:false}});
  const saved=store.read().state,draft=instantiateTemplate(saved,saved.templates[0].id);assert.equal(draft.preferences.maxExtraMinutes,15);assert.equal(draft.timeMode,'leave-now');
  for(const timing of [{timeMode:'arrive-by'},{timeMode:'arrive-by',deadlineTime:'24:00',deadlineDate:'2026-09-20'},{deadlineTime:'09:00',deadlineDate:'2026-02-29'},{timeMode:'invented'}])assert.throws(()=>store.saveRoute({label:'Bad timing',origin:endpoint('a'),destination:endpoint('b','B',1.31),...timing}));
  const plan=routeFromLegacy(legacyRoute,legacyInput);for(const mutation of [{deadlineDate:'2026-02-29'},{timeMode:'arrive-by',deadlineDate:null},{timeMode:'invented'},{timeZone:'UTC'}])assert.equal(validatePlan({...plan,...mutation}),null);
  const old=structuredClone(plan);delete old.deadlineDate;delete old.timeMode;delete old.timeZone;delete old.preferences.schemaVersion;assert.ok(validatePlan(old),'old accepted snapshots remain valid');
});

test('legacy rail snapshot imports reusable choices once through current resolved endpoints',()=>{
  const storage=memory(),key='commute-copilot-rail-guidance-v1',snapshot={schemaVersion:1,savedAt:'2026-09-18T10:00:00Z',input:{...legacyInput,walkingLimitMinutes:15,preference:'quieter',maxExtraMinutes:20},route:legacyRoute,network:{stations:[{id:'a'},{id:'b'}]},manifest:{schemaVersion:1}};
  storage.setItem(key,JSON.stringify(snapshot));const original=storage.getItem(key),store=createPersonalStore(storage),resolve=id=>endpoint(id,id,id==='a'?1.3:1.31);
  assert.equal(store.migratePlannerSnapshots(()=>null).state.templates.length,0);const migrated=store.migratePlannerSnapshots(resolve);assert.equal(migrated.state.templates.length,1);assert.equal(migrated.state.templates[0].preferences.preference,'quieter');assert.equal(migrated.state.templates[0].deadlineDate,'2026-09-19');assert.equal(migrated.state.templates[0].route,undefined);assert.equal(store.migratePlannerSnapshots(resolve).state.templates.length,1);assert.equal(storage.getItem(key),original);
});

test('independent local assistance retains its fix across caregiver-only consent changes',()=>{
  let active=startJourney(routeFromLegacy(legacyRoute,legacyInput),100);active=setApproximateLocation(active,{latitude:1.3,longitude:103.8,accuracy:20,timestamp:200},200);
  const local=setPermissions(active,{progress:false,location:false,revoked:true},300,{preserveLocalLocation:true});assert.deepEqual(local.location,active.location);assert.equal(local.permissions.location,false);assert.equal(setPermissions(active,{location:false},300).location,null,'legacy callers retain conservative clearing behavior');
});

test('shared review and accepted plans retain all preferences and the civil deadline',async()=>{
  let stored=emptySharingState(),revision=0;const env={SHARING_STORE:{async read(){return {revision,value:structuredClone(stored)};},async compareAndSwap(expected,value){if(expected!==revision)return false;stored=structuredClone(value);revision++;return true;}}};
  const plan=routeFromLegacy(legacyRoute,{...legacyInput,...applyTravelStyle('mdm-lim')});
  async function api(method,path,token,body){const response=await handleSharingApi(new Request('https://commute.test/api/shares'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);assert.ok(response.status<300);return response.json();}
  const share=await api('POST','',null,{plan});const review=await api('GET','/'+share.id,share.inviteToken);assert.deepEqual(review.proposedPlan.preferences,plan.preferences);assert.equal(review.proposedPlan.deadlineDate,'2026-09-19');
  const accepted=await api('POST','/'+share.id+'/accept',share.inviteToken,{eventId:'accept-preferences',expectedRevision:share.revision,consent:{progress:true,location:false}});const view=await api('GET','/'+share.id,share.viewerToken);assert.deepEqual(view.acceptedPlan.preferences,plan.preferences);assert.equal(view.acceptedPlan.timeMode,'arrive-by');assert.equal(view.acceptedPlan.deadlineDate,'2026-09-19');assert.ok(accepted.travellerToken);
});
