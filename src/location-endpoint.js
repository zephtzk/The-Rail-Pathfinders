import {usableLocation} from './location-assistance.js';
import {validCoordinate} from './external-geometry.js';

export function locationEndpoint(state,now=Date.now()){
  if(!state.usable||!usableLocation(state.position,now))throw Error(locationEndpointProblem(state));
  const {latitude:lat,longitude:lng,accuracy,timestamp}=state.position;
  if(!validCoordinate([lat,lng]))throw Error('Your location is outside the supported Singapore area. Choose a station or address.');
  return {id:'device-location',kind:'device-location',label:'My location',lat,lng,routingId:null,accuracy,timestamp,detail:`Approximate · ±${Math.round(accuracy)} m`};
}

export function locationEndpointProblem(state){
  if(state.status==='denied')return 'Location permission denied. Allow location in your browser, then choose My location again, or enter a place.';
  if(state.status==='unavailable')return 'Device location is unavailable. Retry My location or enter a place.';
  if(!state.enabled)return 'Location is off. Choose My location to enable it, or enter a place.';
  if(state.position&&state.position.accuracy>50)return `Location accuracy is too low (±${Math.round(state.position.accuracy)} m). Retry My location or enter a place.`;
  if(state.status==='suspended')return 'Location is paused while this page is hidden. Return and choose My location again.';
  if(/stale/i.test(state.reason))return 'Your location is stale. Choose My location again for a fresh position, or enter a place.';
  return 'A fresh, accurate location is not available yet. Retry My location or enter a place.';
}

// Only an explicit endpoint action enables/retries the existing foreground watch.
// Cancelling a field selection never stops the session used by other views.
export function requestLocationEndpoint(service,{signal,timeoutMs=13000}={}){
  return new Promise((resolve,reject)=>{
    let unsubscribe=()=>{},timer,settled=false;
    const finish=(error,point)=>{
      if(settled)return;settled=true;clearTimeout(timer);unsubscribe();signal?.removeEventListener('abort',abort);
      if(error)reject(error);else resolve(point);
    };
    const abort=()=>finish(new DOMException('Location selection cancelled','AbortError'));
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    if(!service.getState().enabled)service.start();
    const inspect=state=>{
      if(state.usable){try{finish(null,locationEndpoint(state));}catch(error){finish(error);}}
      else if(['denied','unavailable','stopped','suspended'].includes(state.status))finish(Error(locationEndpointProblem(state)));
    };
    unsubscribe=service.subscribe(inspect);
    if(settled)unsubscribe();
    else timer=setTimeout(()=>finish(Error(locationEndpointProblem(service.getState()))),timeoutMs);
  });
}
