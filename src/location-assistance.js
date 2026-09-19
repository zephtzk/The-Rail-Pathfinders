// One local foreground session. Browser permission never grants caregiver sharing.
export const LOCATION_PREFERENCE_KEY='commute-copilot-location-v2';
export const LOCATION_MAX_AGE=60000;
export const LOCATION_MAX_ACCURACY=50;
export function usableLocation(position,now=Date.now()) {
  return !!position&&[position.latitude,position.longitude,position.accuracy,position.timestamp].every(Number.isFinite)&&Math.abs(position.latitude)<=90&&Math.abs(position.longitude)<=180&&position.accuracy>=0&&position.accuracy<=LOCATION_MAX_ACCURACY&&position.timestamp<=now+1000&&now-position.timestamp<=LOCATION_MAX_AGE;
}
export function createLocationAssistance({geolocation,permissions,storage,isVisible=()=>true,onPosition=()=>{},onState=()=>{},now=Date.now}={}) {
  let watch=null,epoch=0,intentEpoch=0,status='stopped',reason='Location assistance has not started.',enabled=false,position=null,booted=false;
  const listeners=new Set();
  const read=()=>{try{return storage?.getItem(LOCATION_PREFERENCE_KEY);}catch{return null;}};
  const remember=value=>{try{storage?.setItem(LOCATION_PREFERENCE_KEY,value);}catch{/* Still respect this session's choice. */}};
  const getState=()=>({enabled,collecting:status==='watching',status,reason,position,usable:status==='watching'&&usableLocation(position,now())});
  function report(next,message){status=next;reason=message;const state=getState();onState(state);for(const listener of listeners)listener(state);}
  function clear(){epoch++;if(watch!==null)geolocation?.clearWatch(watch);watch=null;position=null;}
  function stop(message='Location assistance is off. Use manual areas or current-step correction.',{persist=true}={}) {intentEpoch++;enabled=false;if(persist)remember('off');clear();report('stopped',message);}
  function suspend(){clear();report(enabled?'suspended':status,enabled?'Location paused while this page is hidden.':reason);}
  function collect(){
    if(!enabled||!isVisible()){if(enabled)report('suspended','Location paused while this page is hidden.');return false;}
    if(watch!==null||status==='watching')return true;
    clear();
    if(!geolocation?.watchPosition){enabled=false;remember('unavailable');report('unavailable','Browser location is unavailable. Choose an area or correct your step manually.');return false;}
    const token=epoch;report('watching','Waiting for your device location. Manual areas and step correction remain available.');
    const success=fix=>{
      if(token!==epoch||!enabled||!isVisible())return;
      const {latitude,longitude,accuracy}=fix.coords??{},timestamp=fix.timestamp;
      if(![latitude,longitude,accuracy,timestamp].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180||accuracy<0||timestamp>now()+1000||now()-timestamp>LOCATION_MAX_AGE){position=null;report('watching','Location is missing or stale. Use a manual area or correct your step.');return;}
      position={latitude,longitude,accuracy,timestamp};onPosition(position);
      report('watching',accuracy>LOCATION_MAX_ACCURACY?'Low accuracy. Use a manual area or correct your step.':'Fresh approximate position.');
    };
    const failure=error=>{
      if(token!==epoch||!enabled)return;
      position=null;
      if(error?.code===1){enabled=false;remember('denied');clear();report('denied','Location permission denied. Choose an area or correct your step manually. You can change browser permission and retry in Settings.');}
      else if(error?.code===2){enabled=false;remember('unavailable');clear();report('unavailable','Device location is unavailable. Choose an area or correct your step manually; retry in Settings when ready.');}
      else report('watching','Location timed out. Use a manual area or correct your step while waiting for a signal.');
    };
    try{const id=geolocation.watchPosition(success,failure,{maximumAge:0,timeout:12000,enableHighAccuracy:true});if(token===epoch)watch=id;else geolocation.clearWatch(id);}
    catch{enabled=false;remember('unavailable');clear();report('unavailable','Browser location is unavailable. Choose an area or correct your step manually.');return false;}
    return status==='watching';
  }
  function start(){intentEpoch++;remember('on');enabled=true;if(status!=='watching')status='stopped';return collect();}
  async function boot(){
    if(booted)return;booted=true;const token=intentEpoch,preference=read();
    if(preference==='off'){report('stopped','Location assistance is off. Enable it in Settings when ready.');return;}
    let permission;try{permission=(await permissions?.query({name:'geolocation'}))?.state;}catch{/* Older browsers still use the real location API. */}
    if(token!==intentEpoch)return;
    if(permission==='denied'||preference==='denied'&&permission!=='granted'){report('denied','Location permission denied. Choose an area manually, or change browser permission and retry in Settings.');return;}
    if(preference==='unavailable'&&permission!=='granted'){report('unavailable','Device location was unavailable. Choose an area manually or retry in Settings.');return;}
    start();
  }
  return {start,stop,boot,getState,subscribe(listener){listeners.add(listener);listener(getState());return()=>listeners.delete(listener);},visibilityChanged(){if(!isVisible())suspend();else if(enabled)collect();},suspend,refresh(){if(position&&!usableLocation(position,now())&&now()-position.timestamp>LOCATION_MAX_AGE){position=null;report(status,'Location is stale. Use a manual area or correct your step while waiting.');}},lifecycleChanged(){/* A trip is not the owner of this session. */}};
}
let appLocation;
export function getAppLocation(){
  if(appLocation)return appLocation;
  let storage;try{storage=globalThis.localStorage;}catch{}
  appLocation=createLocationAssistance({geolocation:globalThis.navigator?.geolocation,permissions:globalThis.navigator?.permissions,storage,isVisible:()=>!globalThis.document?.hidden});
  globalThis.document?.addEventListener('visibilitychange',()=>appLocation.visibilityChanged());
  globalThis.addEventListener?.('pagehide',()=>appLocation.suspend());
  globalThis.addEventListener?.('pageshow',()=>appLocation.visibilityChanged());
  globalThis.addEventListener?.('storage',event=>{if(event.key===LOCATION_PREFERENCE_KEY&&event.newValue==='off')appLocation.stop();});
  if(globalThis.document){setInterval(()=>{if(!document.hidden)appLocation.refresh();},5000);void appLocation.boot();}
  return appLocation;
}
export function locationDescription(location,{collecting=false,reason='',now=Date.now()}={}) {
  if(!location)return reason||`${collecting?'Location assistance on':'Location assistance off'}. Manual areas and step correction are available.`;
  const age=Math.max(0,Math.floor((now-location.timestamp)/1000));
  return `${collecting?'Location assistance on':'Location assistance off'} · Approximate ±${Math.round(location.accuracy)} m · measured ${new Date(location.timestamp).toLocaleTimeString('en-SG',{timeZone:'Asia/Singapore',hour12:false})} SGT${age>60?' · stale':location.accuracy>LOCATION_MAX_ACCURACY?' · low accuracy':''}. Floor and boarding remain unconfirmed.`;
}
