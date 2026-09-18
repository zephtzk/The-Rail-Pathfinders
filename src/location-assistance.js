// Foreground collection is a separate, explicit choice from caregiver upload consent.
// Consent is intentionally not restored from storage or after tab visibility changes.
export function createLocationAssistance({geolocation,canCollect=()=>false,isVisible=()=>true,onPosition=()=>{},onState=()=>{},now=()=>Date.now()}={}) {
  let watch=null,epoch=0,status='stopped';
  const report=(next,reason)=>{status=next;onState({status,reason,collecting:status==='watching'});};
  function stop(reason='stopped') {epoch++;if(watch!==null)geolocation?.clearWatch(watch);watch=null;report('stopped',reason);}
  function start() {
    if(!canCollect())throw Error('Start or resume a journey before enabling location assistance.');
    if(!isVisible())throw Error('Keep this page visible to enable location assistance.');
    stop();
    if(!geolocation?.watchPosition){report('unavailable','Browser location is unavailable. Use manual correction.');return false;}
    const token=epoch;report('watching','Waiting for an approximate location.');
    const success=position=>{
      if(token!==epoch||!canCollect()||!isVisible())return;
      const {latitude,longitude,accuracy}=position.coords??{},timestamp=position.timestamp;
      if(![latitude,longitude,accuracy,timestamp].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180||accuracy<0||timestamp>now()+30000||now()-timestamp>120000){report('watching','Location is missing or stale. Use manual correction.');return;}
      onPosition({latitude,longitude,accuracy,timestamp});
      report('watching',accuracy>100?'Low accuracy. Confirm your position manually.':'Approximate position only; floor and boarding remain unconfirmed.');
    };
    const failure=error=>{
      if(token!==epoch)return;
      if(error?.code===1){stop('denied');report('denied','Location permission denied. Manual correction remains available.');}
      else report('watching',error?.code===3?'Location timed out. Use manual correction while waiting.':'No usable location signal. Use manual correction.');
    };
    try{const id=geolocation.watchPosition(success,failure,{maximumAge:30000,timeout:10000,enableHighAccuracy:false});if(token===epoch)watch=id;else geolocation.clearWatch(id);}
    catch{stop();report('unavailable','Location is unavailable. Use manual correction.');return false;}
    return status==='watching';
  }
  return {start,stop,getState:()=>({status,collecting:status==='watching'}),visibilityChanged(){if(!isVisible())stop('Page hidden. Tap Enable location assistance when you return.');},lifecycleChanged(){if(!canCollect())stop('Journey paused or ended.');}};
}

export function locationDescription(location,{collecting=false,reason='',now=Date.now()}={}) {
  const prefix=collecting?'Local assistance on':'Local assistance off';
  if(!location)return `${prefix}. ${reason||'Manual correction is always available.'}`;
  const age=Math.max(0,Math.floor((now-location.timestamp)/1000));
  return `${prefix} · Approximate ±${Math.round(location.accuracy)} m · ${age<60?`${age} sec`:`${Math.floor(age/60)} min`} old${age>120?' · stale':location.accuracy>100?' · low accuracy':''}. Floor, boarding and arrival are unconfirmed. ${reason}`;
}
