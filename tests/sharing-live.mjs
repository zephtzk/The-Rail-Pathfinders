// Explicit, bounded smoke check for an existing HTTPS or loopback deployment.
// Usage: set TEST_BASE_URL, then run node tests/sharing-live.mjs.
// Creates at most one synthetic share, never uploads location, and deletes the
// share in finally. Capabilities, share IDs, URLs and response bodies stay private.
import {randomUUID} from 'node:crypto';

class CheckFailure extends Error {}
const check=(condition,label)=>{if(!condition)throw new CheckFailure(label);};
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{22}$/.test(value);
const validToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const validRevision=value=>Number.isSafeInteger(value)&&value>0;
const safeFailure=problem=>problem instanceof CheckFailure?problem.message:'Unexpected check failure';

function configuredOrigin(){
  check(Boolean(process.env.TEST_BASE_URL),'TEST_BASE_URL must be explicitly provided');
  let url;
  try{url=new URL(process.env.TEST_BASE_URL);}catch{throw new CheckFailure('TEST_BASE_URL must be a valid origin');}
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  check(url.protocol==='https:'||(url.protocol==='http:'&&loopback),'TEST_BASE_URL requires HTTPS or HTTP loopback');
  check(!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/','TEST_BASE_URL must contain only an origin');
  return url.origin;
}

// Each client has only its own explicit role capability. Native fetch has no
// shared browser storage or cookie jar; redirects cannot forward credentials.
function client(origin,token){
  return async function request(path,{method='GET',body,expected=200,label}={}){
    let response;
    try{
      response=await fetch(origin+path,{
        method,credentials:'omit',redirect:'error',cache:'no-store',
        referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000),
        headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
    }catch{throw new CheckFailure(`${label}: request failed`);}
    const allowed=Array.isArray(expected)?expected:[expected];
    check(allowed.includes(response.status),`${label}: HTTP ${response.status}`);
    check((response.headers.get('cache-control')??'').includes('no-store'),`${label}: private response caching`);
    let value;
    try{value=await response.json();}catch{throw new CheckFailure(`${label}: invalid JSON response`);}
    check(value&&typeof value==='object'&&!Array.isArray(value),`${label}: invalid response shape`);
    return {status:response.status,value};
  };
}

let origin,share,travellerToken,creationAttempted=false,creationResolved=false;
let failure=null,cleanupFailure=null,cleanupComplete=false;
const plan={
  schemaVersion:2,id:'synthetic-sharing-smoke',mode:'replay',
  origin:{id:'synthetic-origin',label:'Synthetic test origin'},
  destination:{id:'synthetic-destination',label:'Synthetic test destination'},
  route:{id:'synthetic-route',steps:[]},stops:[]
};

async function cleanup(){
  if(!share){
    check(!creationAttempted||creationResolved,'Cleanup: creation outcome unknown; expiry must remove any inaccessible synthetic share');
    return;
  }
  check(validId(share.id),'Cleanup: share identity unavailable');
  const token=validToken(travellerToken)?travellerToken:share.editorToken;
  check(validToken(token),'Cleanup: deletion capability unavailable');
  const owner=client(origin,token),path='/api/shares/'+share.id;
  // Read immediately before deletion, including after an uncertain mutation,
  // instead of reusing the creator's or a previous traveller's stale revision.
  const current=await owner(path,{expected:[200,404],label:'Cleanup read'});
  if(current.status===404){cleanupComplete=true;return;}
  check(validRevision(current.value.revision),'Cleanup: current revision unavailable');
  const deleted=await owner(path,{method:'DELETE',body:{eventId:randomUUID(),expectedRevision:current.value.revision},label:'Cleanup delete'});
  check(deleted.value.deleted===true,'Cleanup: deletion was not confirmed');
  const absent=await owner(path,{expected:404,label:'Cleanup verification'});
  check(absent.status===404,'Cleanup: share remains accessible');
  cleanupComplete=true;
}

try{
  origin=configuredOrigin();
  const anonymous=client(origin);
  const config=await anonymous('/api/push/config',{label:'Storage configuration'});
  check(config.value.storageConfigured===true,'Storage configuration: persistent storage unavailable');

  creationAttempted=true;
  // Creation has no idempotency receipt: never retry it automatically.
  const created=await anonymous('/api/shares',{method:'POST',body:{plan,expiresInHours:1},expected:201,label:'Create synthetic share'});
  creationResolved=true;share=created.value;
  check(validId(share.id)&&validToken(share.inviteToken)&&validToken(share.editorToken)&&validToken(share.viewerToken),'Create synthetic share: invalid capabilities');
  check(share.revision===1,'Create synthetic share: invalid initial revision');
  const path='/api/shares/'+share.id;
  const invite=client(origin,share.inviteToken),viewer=client(origin,share.viewerToken);
  const reviewed=(await invite(path,{label:'Isolated invitation review'})).value;
  check(reviewed.role==='invite'&&reviewed.proposedPlan?.id===plan.id,'Isolated invitation review: proposed plan mismatch');
  check(reviewed.location===undefined&&reviewed.progress===undefined,'Isolated invitation review: private data exposed');

  const acceptance={eventId:randomUUID(),expectedRevision:share.revision,consent:{progress:false,location:false}};
  const accepted=(await invite(path+'/accept',{method:'POST',body:acceptance,label:'Accept invitation without consent'})).value;
  travellerToken=accepted.travellerToken;
  check(validToken(travellerToken)&&accepted.role==='traveller'&&accepted.paired===true,'Accept invitation without consent: pairing failed');
  check(accepted.consent?.progress===false&&accepted.consent?.location===false,'Accept invitation without consent: permissions changed');
  const repeated=(await invite(path+'/accept',{method:'POST',body:acceptance,label:'Identical acceptance retry'})).value;
  check(repeated.travellerToken===travellerToken&&repeated.revision===accepted.revision,'Identical acceptance retry: pairing was not idempotent');
  await invite(path,{expected:404,label:'Consumed invitation cannot read'});
  const privateView=(await viewer(path,{label:'Viewer before consent'})).value;
  check(privateView.acceptedPlan===null&&privateView.progress===null&&privateView.location===null,'Viewer before consent: private data exposed');

  const traveller=client(origin,travellerToken);
  const permitted=(await traveller(path+'/permissions',{method:'PATCH',body:{eventId:randomUUID(),expectedRevision:repeated.revision,consent:{progress:true,location:false}},label:'Explicit progress consent'})).value;
  check(permitted.consent?.progress===true&&permitted.consent?.location===false,'Explicit progress consent: incorrect permissions');
  const updated=(await traveller(path+'/progress',{method:'PATCH',body:{eventId:randomUUID(),expectedRevision:permitted.revision,sharingEpoch:permitted.sharingEpoch,routeRevision:1,status:'started',checkpoint:{id:'synthetic-checkpoint'},acceptedPlan:plan},label:'Synthetic progress update'})).value;
  check(updated.location===null,'Synthetic progress update: unexpected location');

  // A new client/request must retrieve server state without using a prior
  // response or client cache. This does not claim an actual Worker restart.
  const freshViewer=client(origin,share.viewerToken);
  const persisted=(await freshViewer(path,{label:'New-request persistence'})).value;
  check(persisted.revision===updated.revision&&persisted.acceptedPlan?.id===plan.id,'New-request persistence: accepted plan missing');
  check(persisted.progress?.status==='started'&&persisted.progress?.checkpoint?.id==='synthetic-checkpoint','New-request persistence: progress missing');
  check(persisted.location===null&&persisted.locationState==='not-shared','New-request persistence: location exposed without consent');

  const revoked=(await traveller(path+'/access',{method:'DELETE',body:{eventId:randomUUID(),expectedRevision:updated.revision},label:'Revoke caregiver access'})).value;
  check(revoked.accessRevoked===true&&revoked.location===null&&revoked.progress===null,'Revoke caregiver access: retained shared data');
  await freshViewer(path,{expected:404,label:'Revoked viewer denied'});
}catch(problem){
  failure=safeFailure(problem);
}finally{
  // Retry only cleanup, with a new read first. An earlier DELETE might have
  // committed before its response was lost; an absent record is then success.
  for(let attempt=0;attempt<2;attempt++){
    try{await cleanup();cleanupFailure=null;break;}catch(problem){cleanupFailure=safeFailure(problem);}
  }
}

if(failure||cleanupFailure){
  if(failure)console.error(`FAIL: ${failure}`);
  if(cleanupFailure)console.error(`FAIL: ${cleanupFailure}`);
  if(cleanupComplete)console.log('CLEANUP: synthetic share deleted or already unavailable.');
  process.exitCode=1;
}else{
  console.log('PASS: storage configured; one synthetic share created and reviewed by an isolated invitation client; acceptance retries are idempotent; both permissions begin off; explicit progress consent persists across a new request; location stays private; revoked viewer denied; synthetic share deleted.');
  console.log('Scope: HTTP API checks only; no physical-device, Worker-restart, scheduled-cleanup or external-push claim.');
}
