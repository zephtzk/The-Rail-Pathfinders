export const OFFLINE_LIMITS='Live reports, caregiver updates and external street-map tiles need a connection. Browser storage may be removed by the device.';

// A persisted trip and a verified cache from the CURRENT controller are both required.
export function requestShellReadiness(serviceWorker,{timeout=4000,Channel=globalThis.MessageChannel}={}) {
  return new Promise(resolve=>{
    const controller=serviceWorker?.controller;
    if(!controller||!Channel){resolve({ready:false,reason:'Offline shell is not ready on this page.'});return;}
    const channel=new Channel();let done=false;
    const finish=result=>{if(done)return;done=true;clearTimeout(timer);channel.port1.close();resolve(result);};
    const timer=setTimeout(()=>finish({ready:false,reason:'Offline cache verification timed out.'}),timeout);
    channel.port1.onmessage=event=>{const result=event.data;if(serviceWorker.controller!==controller){finish({ready:false,reason:'App update detected. Rechecking offline assets.'});return;}finish(result?.type==='offline-readiness'&&result.ready===true?{ready:true,cache:result.cache,checkedAt:result.checkedAt}:{ready:false,reason:result?.reason??'Required offline assets are missing.'});};
    try{controller.postMessage({type:'check-offline-readiness'},[channel.port2]);}catch{finish({ready:false,reason:'Offline cache could not be checked.'});}
  });
}

export function createOfflineReadiness({storage,key,serviceWorker,onChange=()=>{},checkShell=()=>requestShellReadiness(serviceWorker)}={}) {
  let trip=null,shell={ready:false,reason:'Checking offline assets…'},epoch=0;
  function state(){
    let durable=false;try{durable=!!trip&&storage.getItem(key)===JSON.stringify(trip);}catch{}
    return {ready:durable&&shell.ready,durable,shellReady:shell.ready,savedAt:durable?trip.updatedAt:null,cache:shell.cache??null,reason:!trip?'Start Journey to preserve your accepted trip on this device.':!durable?'The current trip is not saved on this device.':!shell.ready?shell.reason:'Available offline on this device'};
  }
  function publish(){const value=state();onChange(value);return value;}
  async function verify(){const token=++epoch;shell={ready:false,reason:'Checking offline assets…'};publish();let result;try{result=await checkShell();}catch{result={ready:false,reason:'Offline cache verification failed.'};}if(token!==epoch)return state();shell=result;return publish();}
  serviceWorker?.addEventListener?.('controllerchange',verify);
  return {setTrip(value){trip=value;return publish();},getState:state,verify,storageChanged:publish,dispose(){epoch++;serviceWorker?.removeEventListener?.('controllerchange',verify);}};
}
