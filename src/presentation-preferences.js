export const PRESENTATION_KEY='commute-copilot-presentation-v1';
const defaults=()=>({schemaVersion:1,simpleGuidance:true});
export function readPresentationPreferences(storage){try{const value=JSON.parse(storage?.getItem(PRESENTATION_KEY));return value?.schemaVersion===1&&typeof value.simpleGuidance==='boolean'?{schemaVersion:1,simpleGuidance:value.simpleGuidance}:defaults();}catch{return defaults();}}
export function createPresentationPreferences(storage){
  return {read:()=>readPresentationPreferences(storage),setSimple(value){
    if(typeof value!=='boolean')return {ok:false,preferences:readPresentationPreferences(storage),error:'Choose whether simple guidance is on or off.'};
    const preferences={schemaVersion:1,simpleGuidance:value};
    try{const text=JSON.stringify(preferences);storage.setItem(PRESENTATION_KEY,text);if(storage.getItem(PRESENTATION_KEY)!==text)throw Error();return {ok:true,preferences};}catch{return {ok:false,preferences:readPresentationPreferences(storage),error:'This guidance setting could not be saved on this device.'};}
  }};
}
export function reducedGuidanceMotion(preferences,{systemReducedMotion=false}={}){return preferences?.simpleGuidance===true||systemReducedMotion===true;}
