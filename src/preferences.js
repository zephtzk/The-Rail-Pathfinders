// One versioned preference contract for planning, saved routes and shared plans.
// These are editable choices, never a walking-speed model or timetable changes.
export const PREFERENCES_KEY='commute-copilot-preferences-v1';
export const DEFAULT_PREFERENCES=Object.freeze({schemaVersion:1,travelStyle:'custom',walkingLimitMinutes:30,preference:'fastest',maxExtraMinutes:15,stepFree:false,assistanceRequested:false,fareCategory:'adult'});
export const TRAVEL_STYLES=Object.freeze([
  {id:'rachel',label:'Fixed schedule (Rachel)',values:{walkingLimitMinutes:30,preference:'fastest',maxExtraMinutes:0,stepFree:false,assistanceRequested:false},explanation:'Fastest arrival, up to 30 minutes walking, and no extra time for route preferences. Enter your own deadline if needed.'},
  {id:'arjun',label:'Flexible and comfort-focused (Arjun)',values:{walkingLimitMinutes:30,preference:'fewer-transfers',maxExtraMinutes:15,stepFree:false,assistanceRequested:false},explanation:'Fewer transfers, up to 30 minutes walking, and up to 15 extra minutes for that preference. Crowding and shelter are not verified.'},
  {id:'mdm-lim',label:'Accessibility and assistance (Mdm Lim)',values:{walkingLimitMinutes:30,preference:'less-walking',maxExtraMinutes:15,stepFree:true,assistanceRequested:true},explanation:'Less walking, up to 30 minutes walking, up to 15 extra minutes for that preference, and a request for step-free access and assistance. No walking speed or extra transfer time is assumed; a continuous accessible path still needs verification.'}
].map(style=>Object.freeze({...style,values:Object.freeze(style.values)})));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const numeric=(value,label,max)=>{if(typeof value==='string'&&!value.trim()||!['number','string'].includes(typeof value)||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>max)throw Error(`${label} must be between 0 and ${max} minutes.`);return Number(value);};
const boolean=(value,label)=>{if(typeof value!=='boolean')throw Error(`${label} must be on or off.`);return value;};
export function normalizePreferences(value={}) {
  if(!object(value)||value.schemaVersion!=null&&value.schemaVersion!==1)throw Error('Unsupported preference format. Existing preferences have been preserved.');
  const result={...DEFAULT_PREFERENCES};
  result.walkingLimitMinutes=numeric(value.walkingLimitMinutes??value.walkingLimit??result.walkingLimitMinutes,'Walking limit',240);
  result.maxExtraMinutes=numeric(value.maxExtraMinutes??value.extraTimeTolerance??value.detourLimit??result.maxExtraMinutes,'Extra-time allowance',120);
  for(const key of ['stepFree','assistanceRequested'])if(value[key]!==undefined)result[key]=boolean(value[key],key==='stepFree'?'Step-free access':'Assistance request');
  for(const [key,allowed] of [['travelStyle',['custom',...TRAVEL_STYLES.map(s=>s.id)]],['preference',['fastest','less-walking','fewer-transfers','quieter']],['fareCategory',['adult','senior','pwd','student']]]) {
    const candidate=value[key]??(key==='preference'?value.routePriority:undefined);
    if(candidate!==undefined){if(!allowed.includes(candidate))throw Error(`Choose a supported ${key==='preference'?'route preference':key==='travelStyle'?'travel style':'fare category'}.`);result[key]=candidate;}
  }
  return result;
}
export function validatePreferences(value){try{return normalizePreferences(value);}catch{return null;}}
export function applyTravelStyle(styleId,current={}) {
  const preferences=normalizePreferences(current);
  if(styleId==='custom')return {...preferences,travelStyle:'custom'};
  const style=TRAVEL_STYLES.find(s=>s.id===styleId);if(!style)throw Error('Choose a supported travel style.');
  return normalizePreferences({...preferences,...style.values,travelStyle:styleId});
}
export function createPreferencesStore(storage) {
  function read(){try{const raw=storage.getItem(PREFERENCES_KEY);if(raw===null)return {ok:true,preferences:{...DEFAULT_PREFERENCES}};const data=JSON.parse(raw);if(!object(data)||data.schemaVersion!==1||!object(data.preferences))throw Error();return {ok:true,preferences:normalizePreferences(data.preferences)};}catch{return {ok:false,preferences:{...DEFAULT_PREFERENCES},error:'Preferences could not be read. Existing data has been preserved; repair or explicitly reset preferences before changing them.'};}}
  function write(preferences){try{const raw=JSON.stringify({schemaVersion:1,preferences});storage.setItem(PREFERENCES_KEY,raw);if(storage.getItem(PREFERENCES_KEY)!==raw)throw Error();}catch{throw Error('Could not save preferences on this device. Browser storage may be full or blocked.');}return structuredClone(preferences);}
  return {read,
    update(patch){const current=read();if(!current.ok)throw Error(current.error);if(!object(patch))throw Error('Invalid preference changes.');return write(normalizePreferences({...current.preferences,...patch}));},
    applyPreset(styleId){const current=read();if(!current.ok)throw Error(current.error);return write(applyTravelStyle(styleId,current.preferences));},
    reset(){try{storage.removeItem(PREFERENCES_KEY);if(storage.getItem(PREFERENCES_KEY)!==null)throw Error();}catch{throw Error('Could not reset preferences on this device.');}return {...DEFAULT_PREFERENCES};}
  };
}
