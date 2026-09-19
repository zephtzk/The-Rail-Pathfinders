export const PRESENTATION_KEY='commute-copilot-presentation-v1';
export const TEXT_SIZE_MIN=80;
export const TEXT_SIZE_MAX=200;
export const TEXT_SIZE_STEP=10;
export const DEFAULT_TEXT_SIZE=100;
const defaults=()=>({schemaVersion:2,simpleGuidance:true,textSizePercent:DEFAULT_TEXT_SIZE});
const validTextSize=value=>typeof value==='number'&&Number.isFinite(value)&&value>=TEXT_SIZE_MIN&&value<=TEXT_SIZE_MAX&&(value-TEXT_SIZE_MIN)%TEXT_SIZE_STEP===0;
const sessions=new WeakMap();
const unavailableSession={preferences:defaults(),pending:false};
function sessionFor(storage){
  if(!storage||(typeof storage!=='object'&&typeof storage!=='function'))return unavailableSession;
  if(!sessions.has(storage))sessions.set(storage,{preferences:defaults(),pending:false});
  return sessions.get(storage);
}
function normalize(value){
  if(!value||![1,2].includes(value.schemaVersion))return defaults();
  return {
    schemaVersion:2,
    simpleGuidance:typeof value.simpleGuidance==='boolean'?value.simpleGuidance:true,
    textSizePercent:value.schemaVersion===2&&validTextSize(value.textSizePercent)?value.textSizePercent:DEFAULT_TEXT_SIZE,
  };
}
export function readPresentationPreferences(storage){
  const session=sessionFor(storage);
  // A blocked or unverified write still applies throughout this page session.
  if(!session.pending){
    try{
      const raw=storage?.getItem(PRESENTATION_KEY);
      try{session.preferences=normalize(JSON.parse(raw??'null'));}catch{session.preferences=defaults();}
    }catch{/* Retain the last readable values if storage becomes unavailable. */}
  }
  return {...session.preferences};
}
export function createPresentationPreferences(storage){
  function save(changes,label){
    const session=sessionFor(storage),preferences={...readPresentationPreferences(storage),...changes};
    session.preferences=preferences;
    session.pending=true;
    try{
      const text=JSON.stringify(preferences);
      storage.setItem(PRESENTATION_KEY,text);
      if(storage.getItem(PRESENTATION_KEY)!==text)throw Error('Storage did not confirm the preference.');
      session.pending=false;
      return {ok:true,preferences:{...preferences}};
    }catch{return {ok:false,preferences:{...preferences},error:`${label} is applied for this session but could not be saved on this device.`};}
  }
  return {
    read:()=>readPresentationPreferences(storage),
    setSimple(value){
      if(typeof value!=='boolean')return {ok:false,preferences:readPresentationPreferences(storage),error:'Choose whether simple guidance is on or off.'};
      return save({simpleGuidance:value},'This guidance setting');
    },
    setTextSize(value){
      if(!validTextSize(value))return {ok:false,preferences:readPresentationPreferences(storage),error:`Choose a text size from ${TEXT_SIZE_MIN}% to ${TEXT_SIZE_MAX}% in ${TEXT_SIZE_STEP}% steps.`};
      return save({textSizePercent:value},'This text size');
    },
  };
}
export function reducedGuidanceMotion(preferences,{systemReducedMotion=false}={}){return preferences?.simpleGuidance===true||systemReducedMotion===true;}
