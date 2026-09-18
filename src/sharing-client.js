// Credentials live in the recipient's browser and Authorization headers only.
// Location uploads are never persisted as an offline queue.
const KEY='commute-copilot-pairing-v2';
const clone=value=>structuredClone(value);
const validToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
function validSession(value){return value&&/^[A-Za-z0-9_-]{22}$/.test(value.id)&&['travellerToken','viewerToken','inviteToken','editorToken'].some(k=>validToken(value[k]));}
export class SharingClient {
  constructor(storage=globalThis.localStorage,{fetcher=globalThis.fetch.bind(globalThis),online=()=>globalThis.navigator?.onLine!==false,timeoutMs=12000}={}) {
    this.storage=storage;this.fetcher=fetcher;this.online=online;this.timeoutMs=timeoutMs;this.session=null;this.epoch=0;this.queue=Promise.resolve();this.needsRefresh=false;this.lastSent=null;
    try{const saved=JSON.parse(storage.getItem(KEY));if(validSession(saved))this.session=saved;}catch{}
  }
  persist(){try{this.storage.setItem(KEY,JSON.stringify(this.session));}catch{throw Error('Pairing works in this tab but could not be saved on this device.');}}
  enqueue(action){const result=this.queue.catch(()=>{}).then(action);this.queue=result;return result;}
  token(){return this.session?.travellerToken??this.session?.viewerToken??this.session?.inviteToken??this.session?.editorToken;}
  async api(path='',{method='GET',body,token=this.token()}={}) {
    const serialized=body===undefined?undefined:JSON.stringify(body);
    // A lost response is retried with exactly the original event and payload.
    // Unauthenticated creation has no receipt and is never automatically retried.
    const attempts=(method==='GET'||body?.eventId)?2:1;
    let lastError;
    for(let attempt=0;attempt<attempts;attempt++) {
      try {
        const response=await this.fetcher('/api/shares'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:serialized,cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(this.timeoutMs)});
        const result=await response.json();
        if(!response.ok){const error=new Error(result.error?.message??result.message??(typeof result.error==='string'?result.error:'Sharing request failed'));error.status=response.status;error.details=result;throw error;}
        return result;
      }catch(problem){lastError=problem;if(problem.status||!this.online())break;}
    }
    if(!lastError.status||lastError.status===409)this.needsRefresh=true;
    throw lastError;
  }
  remember(result,session) {
    if(!this.session||this.session.id!==session.id||this.token()!==(session.travellerToken??session.viewerToken??session.inviteToken??session.editorToken))return;
    // Even if a pause was requested while an upload was in flight, retain its
    // revision before the queued permission change executes. No data is queued.
    this.session={...this.session,revision:result.revision,sharingEpoch:result.sharingEpoch??this.session.sharingEpoch,
      ...(result.consent?{serverConsent:result.consent,sharingPaused:result.sharingPaused,accessRevoked:result.accessRevoked,collectionStopped:result.collectionStopped}:{})};
    this.persist();
  }
  async readNow(){if(!this.session)return null;if(this.session.inviteToken&&this.session.pendingAcceptance)return this.acceptNow(this.session.pendingAcceptance.consent);const s=this.session;const result=await this.api('/'+s.id);this.remember(result,s);this.needsRefresh=false;return result;}
  read(){return this.enqueue(()=>this.readNow());}
  async refreshIfNeeded(){if(this.needsRefresh)await this.readNow();}
  create(plan){this.epoch++;return this.enqueue(async()=>{const result=await this.api('',{method:'POST',body:{plan,expiresInHours:24},token:null});this.session={...result,role:'caregiver'};this.lastSent=null;this.needsRefresh=false;this.persist();return result;});}
  useFragment(){
    const match=location.hash.match(/^#(invite|caregiver)=([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/);if(!match)return false;
    // Strip before storage or any later application navigation can expose it.
    history.replaceState(null,'',location.pathname+location.search);this.epoch++;this.lastSent=null;
    this.session={id:match[2],role:match[1]==='invite'?'recipient':'caregiver',[match[1]==='invite'?'inviteToken':'viewerToken']:match[3]};this.persist();return true;
  }
  accept(consent={progress:false,location:false}) {return this.enqueue(()=>this.acceptNow(consent));}
  async acceptNow(consent) {
    const s=this.session;if(!s?.inviteToken)throw Error('Open a valid recipient invitation first.');
    if(!s.pendingAcceptance){await this.refreshIfNeeded();this.session.pendingAcceptance={eventId:crypto.randomUUID(),expectedRevision:this.session.revision,consent:clone(consent)};this.persist();}
    else if(JSON.stringify(s.pendingAcceptance.consent)!==JSON.stringify(consent))throw Error('Finish the pending acceptance, then change sharing permissions separately.');
    const body=this.session.pendingAcceptance;
    try{
      const result=await this.api(`/${s.id}/accept`,{method:'POST',token:s.inviteToken,body});
      this.session={id:s.id,role:'traveller',travellerToken:result.travellerToken,revision:result.revision,sharingEpoch:result.sharingEpoch,serverConsent:result.consent,sharingPaused:result.sharingPaused,accessRevoked:result.accessRevoked};
      this.lastSent=null;this.needsRefresh=false;this.persist();return result;
    }catch(problem){if(problem.status===409){delete this.session.pendingAcceptance;this.persist();}throw problem;}
  }
  permissions(consent,paused=false){this.epoch++;this.lastSent=null;return this.enqueue(async()=>{
    await this.refreshIfNeeded();const s=this.session;if(!s?.travellerToken)throw Error('Only the paired traveller can change consent.');
    const result=await this.api(`/${s.id}/permissions`,{method:'PATCH',body:{eventId:crypto.randomUUID(),expectedRevision:s.revision,consent,paused}});this.remember(result,s);return result;
  });}
  update(journey) {
    const epoch=this.epoch,snapshot=clone(journey),queuedSession=this.session?.id;
    return this.enqueue(async()=>{
      const terminal=['completed','cancelled'].includes(snapshot.status);
      if(!this.session?.travellerToken||this.session.id!==queuedSession||epoch!==this.epoch||(!terminal&&snapshot.permissions.revoked))return null;
      if(!this.online()){this.needsRefresh=true;return null;}
      const previousEpoch=this.session.sharingEpoch;await this.refreshIfNeeded();
      if(previousEpoch!==this.session.sharingEpoch||epoch!==this.epoch)throw Error('Sharing permissions changed. The queued location was discarded; review consent before sending a fresh update.');
      const s=this.session,p=snapshot.permissions,server=s.serverConsent??{progress:false,location:false};
      const progress=p.progress&&server.progress&&!p.paused&&!s.sharingPaused&&!s.accessRevoked;
      const location=p.location&&server.location&&!p.paused&&!s.sharingPaused&&!s.accessRevoked&&!terminal;
      if(!terminal&&!progress&&!location)return null;
      const key=`${snapshot.id}_${snapshot.revision}_${s.sharingEpoch}`;
      if(this.lastSent?.key===key)return this.lastSent.result;
      const freshLocation=location&&snapshot.location&&Date.now()-snapshot.location.timestamp<=120000&&snapshot.location.timestamp<=Date.now()+10000;
      const body={eventId:crypto.randomUUID(),expectedRevision:s.revision,sharingEpoch:s.sharingEpoch,routeRevision:snapshot.revision,status:snapshot.status,
        checkpoint:progress?snapshot.progress.checkpoint:null,eta:progress?snapshot.route.arrivalSeconds:null,
        acceptedPlan:progress?{...snapshot.plan,route:snapshot.route,stops:snapshot.stops}:undefined,
        ...(freshLocation?{location:snapshot.location}:{})};
      const result=await this.api(`/${s.id}/progress`,{method:'PATCH',body});this.remember(result,s);this.lastSent={key,result};return result;
    });
  }
  revoke(){this.epoch++;this.lastSent=null;return this.enqueue(async()=>{
    await this.refreshIfNeeded();const s=this.session;const result=await this.api(`/${s.id}/access`,{method:'DELETE',body:{eventId:crypto.randomUUID(),expectedRevision:s.revision}});this.remember(result,s);return result;
  });}
  delete(){this.epoch++;this.lastSent=null;return this.enqueue(async()=>{
    // A creator also holds a viewer token for ordinary reads. Deletion needs
    // their editor capability (or the traveller's), and a freshly read revision
    // because the other person may have accepted since the last local read.
    const session=this.session,token=session?.travellerToken??session?.editorToken;
    if(!token)throw Error('Only the traveller or the person who created this share can delete its data.');
    const current=await this.api('/'+session.id,{token});
    await this.api('/'+session.id,{method:'DELETE',token,body:{eventId:crypto.randomUUID(),expectedRevision:current.revision}});this.session=null;this.needsRefresh=false;this.persist();
  });}
  propose(plan){return this.enqueue(async()=>{await this.refreshIfNeeded();const s=this.session;const result=await this.api(`/${s.id}/plan`,{method:'PATCH',token:s.editorToken,body:{eventId:crypto.randomUUID(),expectedRevision:s.revision,plan}});this.remember(result,s);return result;});}
  links(){const s=this.session;if(!s)return {};const base=location.origin+'/';return {invite:s.inviteToken?`${base}#invite=${s.id}.${s.inviteToken}`:null,viewer:s.viewerToken?`${base}#caregiver=${s.id}.${s.viewerToken}`:null};}
}
export async function enablePush(session){
  if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw Error('Web Push unavailable here. Journey updates remain in the app. On iPhone/iPad use an optional Home Screen installation.');
  if(!session?.travellerToken&&!session?.viewerToken)throw Error('Accept a trip or open a caregiver view before enabling its notifications.');
  if(Notification.permission==='denied')throw Error('Notifications are denied. Change the browser setting to enable them; in-app updates still work.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notifications were not enabled. In-app updates remain available.');
  const config=await fetch('/api/push/config',{cache:'no-store'}).then(r=>r.json());if(!config.publicKey||!config.configured)throw Error('Push delivery is not configured: server VAPID public/private keys and subject are required.');
  const raw=atob(config.publicKey.replaceAll('-','+').replaceAll('_','/'));const key=Uint8Array.from(raw,c=>c.charCodeAt(0));const registration=await navigator.serviceWorker.ready;
  const subscription=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  const response=await fetch('/api/push/subscriptions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.travellerToken??session.viewerToken}`},body:JSON.stringify({shareId:session.id,subscription:subscription.toJSON()}),cache:'no-store',referrerPolicy:'no-referrer'});if(!response.ok)throw Error('Could not register notification delivery.');return subscription;
}
export async function disablePush(session){
  if(!('serviceWorker'in navigator))return;
  const reg=await navigator.serviceWorker.ready,subscription=await reg.pushManager.getSubscription();if(!subscription)return;
  const response=await fetch('/api/push/subscriptions',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.travellerToken??session.viewerToken}`},body:JSON.stringify({shareId:session.id,endpoint:subscription.endpoint}),cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok&&response.status!==404)throw Error('Could not remove server subscription; retry.');await subscription.unsubscribe();
}
