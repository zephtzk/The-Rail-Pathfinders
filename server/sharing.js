import {mutateSharing,sharingStore} from './sharing-store.js';
import {credentialHash,randomCredential,pushConfiguration,validateSubscription,queueSharingPush,flushSharingPush} from './push.js';

const DAY=86400000;
// The 15-minute deployed cron has a one-hour margin inside the 24-hour policy.
const RETENTION=23*3600000;
const error=(message,status=400,extra={})=>Object.assign(new Error(message),{status,...extra});
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','Pragma':'no-cache','Vary':'Authorization','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
function boundedObject(value,maxBytes=24576) {
  if(!record(value)||new TextEncoder().encode(JSON.stringify(value)).byteLength>maxBytes)throw error('Invalid or oversized object');
  let count=0;
  function visit(v,depth=0) {
    if(++count>2500||depth>14)throw error('Object is too complex');
    if(typeof v==='number'&&!Number.isFinite(v))throw error('Numbers must be finite');
    if(typeof v==='string'&&v.length>3000)throw error('Text is too long');
    if(Array.isArray(v)){if(v.length>300)throw error('Too many entries');for(const item of v)visit(item,depth+1);}
    else if(record(v)){if(Object.keys(v).length>80)throw error('Too many fields');for(const [key,item] of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(key))throw error('Forbidden object key');visit(item,depth+1);}}
  }
  visit(value);return structuredClone(value);
}
function validatePlan(value){
  const plan=boundedObject(value);if(plan.schemaVersion!==2||!record(plan.origin)||!record(plan.destination))throw error('A version 2 plan with origin and destination is required');
  // External geometry is optional for legacy plans. New provider overlays must
  // stay bounded and attached to real canonical phases before being persisted.
  if(plan.route?.provider!=null||plan.route?.geometry!=null){
    const route=plan.route,indices=new Set();let count=0;
    if(route.provider!=='onemap'||!Number.isFinite(route.providerRetrievedAt)||route.providerRetrievedAt<0||!Array.isArray(route.steps)||!route.steps.length||!Array.isArray(route.geometry)||route.geometry.length>24)throw error('Invalid external route');
    for(const segment of route.geometry){
      if(!record(segment)||!Number.isInteger(segment.stepIndex)||segment.stepIndex<0||segment.stepIndex>=route.steps.length||indices.has(segment.stepIndex)||!['provider','schematic'].includes(segment.kind)||!Array.isArray(segment.points)||segment.points.length<2)throw error('Invalid external route geometry');
      indices.add(segment.stepIndex);count+=segment.points.length;
      if(count>192||segment.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<1.144||p[0]>1.494||p[1]<103.535||p[1]>104.502))throw error('Invalid external route geometry');
    }
  }
  return plan;
}
function consentValue(value){if(!record(value)||typeof value.progress!=='boolean'||typeof value.location!=='boolean')throw error('Choose progress and location consent separately');return {progress:value.progress,location:value.location};}
async function readBody(request) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw error('Use application/json',415);
  const reader=request.body?.getReader();if(!reader)throw error('JSON body required');let total=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>49152){await reader.cancel();throw error('Request is too large',413);}chunks.push(value);}
  const bytes=new Uint8Array(total);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  try {const body=JSON.parse(new TextDecoder().decode(bytes));if(!record(body))throw Error();return body;}catch{throw error('Invalid JSON object');}
}
function purge(state,now) {
  for(const [id,share] of Object.entries(state.shares)) {
    if(share.purgeAt<=now){delete state.shares[id];continue;}
    if(share.expiresAt<=now){share.location=null;share.progress=null;share.consent={progress:false,location:false};}
  }
  for(const [id,sub] of Object.entries(state.subscriptions))if(!state.shares[sub.shareId]||state.shares[sub.shareId].expiresAt<=now||(sub.subscription.expirationTime&&sub.subscription.expirationTime<=now))delete state.subscriptions[id];
  for(const [id,event] of Object.entries(state.outbox))if(!state.subscriptions[event.subscriptionId]||event.createdAt<=now-DAY)delete state.outbox[id];
  for(const [id,rate] of Object.entries(state.rates))if(rate.expiresAt<=now)delete state.rates[id];
}
function authorize(share,hash,now,roles) {
  if(!share||share.expiresAt<=now)throw error('Access expired or unavailable',404);
  const role=Object.keys(share.tokens).find(role=>share.tokens[role]===hash);
  if(!role||!roles.includes(role)||(share.accessRevoked&&role!=='traveller'))throw error('Access expired or unavailable',404);
  return role;
}
function view(share,role,now) {
  const base={id:share.id,revision:share.revision,expiresAt:share.expiresAt,role,paired:share.paired,sharingEpoch:share.sharingEpoch};
  if(['invite','editor'].includes(role))return {...base,proposedPlan:share.proposedPlan,planRevision:share.planRevision,status:share.paired?'paired':'awaiting-acceptance'};
  const progressAllowed=role==='traveller'||(share.consent.progress&&!share.sharingPaused&&!share.accessRevoked);
  const locationAllowed=role==='traveller'||(share.consent.location&&!share.sharingPaused&&!share.accessRevoked);
  return {...base,consent:share.consent,sharingPaused:share.sharingPaused,accessRevoked:share.accessRevoked,status:progressAllowed?share.status:'sharing-not-enabled',
    proposedPlan:role==='traveller'?share.proposedPlan:null,planRevision:share.planRevision,acceptedPlan:progressAllowed?share.acceptedPlan:null,
    progress:progressAllowed?share.progress:null,location:locationAllowed?share.location:null,
    locationState:!locationAllowed?'not-shared':share.sharingPaused?'paused':!share.location?'unknown':now-share.location.timestamp>120000?'stale':'last-known',
    collectionStopped:['completed','cancelled'].includes(share.status)||share.accessRevoked};
}
function writable(share){if(['completed','cancelled'].includes(share.status))throw error('Journey ended; collection stopped',409);}
function checkEvent(share,body,payloadHash) {
  if(typeof body.eventId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(body.eventId))throw error('A stable random eventId is required');
  const previous=share.events.find(event=>event.id===body.eventId);
  if(previous){if(previous.hash!==payloadHash)throw error('eventId reused with different data',409);return true;}
  if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision!==share.revision)throw error('Revision changed; review before retrying',409,{currentRevision:share.revision});
  return false;
}
function remember(share,body,payloadHash){share.events.push({id:body.eventId,hash:payloadHash});share.events=share.events.slice(-128);share.revision++;}
function clearViewerQueue(state,share) {
  for(const [id,event] of Object.entries(state.outbox))if(event.shareId===share.id&&event.role==='viewer')delete state.outbox[id];
}
function validateLocation(value,now) {
  if(!record(value)||!Number.isFinite(value.latitude)||value.latitude< -90||value.latitude>90||!Number.isFinite(value.longitude)||value.longitude< -180||value.longitude>180||!Number.isFinite(value.accuracy)||value.accuracy<0||value.accuracy>100000||!Number.isFinite(value.timestamp)||value.timestamp>now+10000||value.timestamp<now-300000)throw error('Location must include recent coordinates, accuracy and timestamp');
  return {latitude:value.latitude,longitude:value.longitude,accuracy:value.accuracy,timestamp:value.timestamp};
}
export async function runSharingMaintenance(env,options={}) {
  const store=sharingStore(env);if(!store)return {configured:false};
  await mutateSharing(store,state=>purge(state,options.now??Date.now()));
  return flushSharingPush(env,options);
}
export async function handleSharingApi(request,env={},ctx={}) {
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/shares')&&!url.pathname.startsWith('/api/push/'))return null;
  try {
    const store=sharingStore(env);
    if(url.pathname==='/api/push/config'&&request.method==='GET')return response({...pushConfiguration(env),storageConfigured:Boolean(store)});
    if(!store)throw error('Sharing storage is not configured. Bind SHARING_DB (D1) or use the persistent local server.',503);
    if(url.search)throw error('Credentials and personal data must not be placed in query strings');
    const origin=request.headers.get('origin');if(origin&&origin!==url.origin)throw error('Cross-origin request denied',403);
    const now=Date.now(),token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]??'';
    const hash=token?await credentialHash(token):'';
    const address=request.headers.get('cf-connecting-ip')??'local';
    const isCreate=url.pathname==='/api/shares'&&request.method==='POST';
    const rateKey=await credentialHash(`${address}|${isCreate?'':hash}|${isCreate?'create':'access'}`);
    const addressKey=await credentialHash(`address:${address}`);
    const limited=await mutateSharing(store,state=>{
      purge(state,now);
      const addressRate=state.rates[addressKey]??{count:0,expiresAt:now+60000};
      addressRate.count++;state.rates[addressKey]=addressRate;
      if(addressRate.count>600)return true;
      const rate=state.rates[rateKey]??{count:0,expiresAt:now+(isCreate?3600000:60000)};
      if(!state.rates[rateKey]&&Object.keys(state.rates).length>=1000)return true;
      rate.count++;state.rates[rateKey]=rate;return rate.count>(isCreate?10:120);
    });
    if(limited)throw error('Rate limit reached; retry later',429);
    const body=['GET','HEAD'].includes(request.method)?null:await readBody(request);
    if(url.pathname==='/api/shares'&&request.method==='POST') {
      const plan=validatePlan(body.plan),hours=body.expiresInHours??48;
      if(!Number.isInteger(hours)||hours<1||hours>168)throw error('Expiry must be 1–168 hours');
      const id=randomCredential().slice(0,22),inviteToken=randomCredential(),editorToken=randomCredential(),viewerToken=randomCredential();
      const tokens={invite:await credentialHash(inviteToken),editor:await credentialHash(editorToken),viewer:await credentialHash(viewerToken)};
      await mutateSharing(store,state=>{
        if(Object.keys(state.shares).length>=20)throw error('Pilot sharing capacity reached; delete an old share or wait for retention cleanup',503);
        state.shares[id]={id,revision:1,planRevision:1,proposedPlan:plan,acceptedPlan:null,status:'awaiting-acceptance',tokens,events:[],paired:false,consent:{progress:false,location:false},sharingPaused:false,sharingEpoch:0,accessRevoked:false,progress:null,location:null,createdAt:now,expiresAt:now+hours*3600000,purgeAt:now+hours*3600000+RETENTION};
      });
      return response({id,revision:1,expiresAt:now+hours*3600000,inviteToken,editorToken,viewerToken},201);
    }
    const match=url.pathname.match(/^\/api\/shares\/([A-Za-z0-9_-]{22})(?:\/(accept|plan|progress|permissions|access))?$/);
    const pushPath=url.pathname==='/api/push/subscriptions';
    if(!match&&!pushPath)throw error('Not found',404);
    const id=match?.[1]??body?.shareId,action=match?.[2];
    if(request.method==='GET'&&match&&!action) {
      const state=(await store.read()).value,share=state.shares[id],role=authorize(share,hash,now,['invite','editor','viewer','traveller']);
      return response(view(share,role,now));
    }
    if(pushPath) {
      if(!['POST','DELETE'].includes(request.method))throw error('Method not allowed',405);
      let subscription=null;
      if(request.method==='POST')try{subscription=validateSubscription(body.subscription);}catch(problem){throw error(problem.message);}
      if(subscription&&!pushConfiguration(env).configured)throw error('Web Push credentials are missing; use the in-app updates',503);
      const subscriptionId=await credentialHash(`${id}|${hash}|${subscription?.endpoint??body.endpoint??''}`);
      await mutateSharing(store,state=>{
        const share=state.shares[id],role=authorize(share,hash,now,['viewer','traveller']);
        if(subscription){writable(share);if(Object.values(state.subscriptions).filter(s=>s.shareId===id&&s.role===role).length>=5&&!state.subscriptions[subscriptionId])throw error('At most five subscriptions per role');state.subscriptions[subscriptionId]={shareId:id,role,subscription,createdAt:now};}
        else {delete state.subscriptions[subscriptionId];for(const [key,event] of Object.entries(state.outbox))if(event.subscriptionId===subscriptionId)delete state.outbox[key];}
      });
      return response({ok:true,subscriptionId,transport:pushConfiguration(env).transport});
    }
    const payloadHash=await credentialHash(`${request.method}:${action??'delete'}:${JSON.stringify(body)}`);
    let travellerToken,travellerHash;
    if(action==='accept'){travellerToken=await credentialHash(`commute-traveller-v1:${token}:${body.eventId}`);travellerHash=await credentialHash(travellerToken);}
    const result=await mutateSharing(store,state=>{
      const share=state.shares[id];
      // The consumed invitation only retries its original acceptance operation;
      // it cannot GET data or pair a second traveller.
      if(action==='accept'&&request.method==='POST') {
        if(share?.paired&&share.usedInviteHash===hash&&share.claimEventId===body.eventId&&share.tokens.traveller===travellerHash&&share.expiresAt>now&&!share.accessRevoked){checkEvent(share,body,payloadHash);return {...view(share,'traveller',now),travellerToken};}
        authorize(share,hash,now,['invite']);
        if(checkEvent(share,body,payloadHash))throw error('Invitation already used',409);
        share.consent=consentValue(body.consent??{progress:false,location:false});share.acceptedPlan=structuredClone(share.proposedPlan);share.status='accepted';share.paired=true;share.usedInviteHash=hash;share.claimEventId=body.eventId;delete share.tokens.invite;share.tokens.traveller=travellerHash;
        remember(share,body,payloadHash);queueSharingPush(state,share,'viewer',body.eventId,now);
        return {...view(share,'traveller',now),travellerToken};
      }
      const roles=action==='plan'?['editor']:request.method==='DELETE'&&!action?['editor','traveller']:['traveller'];
      const role=authorize(share,hash,now,roles);
      if(checkEvent(share,body,payloadHash))return view(share,role,now);
      if(action==='plan'&&request.method==='PATCH') {
        writable(share);share.proposedPlan=validatePlan(body.plan);share.planRevision++;remember(share,body,payloadHash);queueSharingPush(state,share,'traveller',body.eventId,now);
      }else if(action==='permissions'&&request.method==='PATCH') {
        writable(share);if(share.accessRevoked)throw error('Access was revoked; create a new invitation to pair again',409);
        share.consent=consentValue(body.consent);share.sharingPaused=body.paused===true;share.sharingEpoch++;
        if(!share.consent.location||share.sharingPaused)share.location=null;
        if(!share.consent.progress||share.sharingPaused)share.progress=null;
        clearViewerQueue(state,share);remember(share,body,payloadHash);
      }else if(action==='access'&&request.method==='DELETE') {
        share.accessRevoked=true;share.consent={progress:false,location:false};share.sharingEpoch++;share.location=null;share.progress=null;delete share.tokens.viewer;delete share.tokens.editor;delete share.tokens.invite;share.usedInviteHash=null;
        share.purgeAt=Math.min(share.purgeAt,now+RETENTION);
        for(const [key,sub] of Object.entries(state.subscriptions))if(sub.shareId===id&&sub.role!=='traveller')delete state.subscriptions[key];
        clearViewerQueue(state,share);remember(share,body,payloadHash);
      }else if(!action&&request.method==='DELETE') {
        delete state.shares[id];purge(state,now);return {deleted:true,id};
      }else if(action==='progress'&&request.method==='PATCH') {
        writable(share);
        const previousAcceptedPlan=JSON.stringify(share.acceptedPlan);
        if(body.sharingEpoch!==share.sharingEpoch)throw error('Sharing permissions changed; discard queued location updates',409,{sharingEpoch:share.sharingEpoch,currentRevision:share.revision});
        if(!['accepted','started','active','paused','completed','cancelled'].includes(body.status))throw error('Invalid journey status');
        if(!Number.isSafeInteger(body.routeRevision)||body.routeRevision<0||body.routeRevision<(share.progress?.routeRevision??0))throw error('Invalid route revision');
        const terminal=['completed','cancelled'].includes(body.status);
        if(body.location&&(!share.consent.location||share.sharingPaused||share.accessRevoked||terminal))throw error('Location collection is not authorised',403);
        if(!share.sharingPaused&&!share.accessRevoked) {
          if(share.consent.progress){
            const checkpoint=body.checkpoint==null?null:boundedObject(body.checkpoint,2048);
            if(body.eta!=null&&typeof body.eta!=='string'&&typeof body.eta!=='number')throw error('Invalid ETA');
            if(typeof body.eta==='string'&&body.eta.length>100)throw error('Invalid ETA');
            share.progress={routeRevision:body.routeRevision,checkpoint,eta:body.eta??null,status:body.status,updatedAt:now};
            if(body.acceptedPlan)share.acceptedPlan=validatePlan(body.acceptedPlan);
          }
          if(body.location)share.location=validateLocation(body.location,now);
        }
        const material=terminal||JSON.stringify(share.acceptedPlan)!==previousAcceptedPlan||share.status!==body.status;
        share.status=body.status;remember(share,body,payloadHash);
        if(material)queueSharingPush(state,share,'viewer',body.eventId,now);
        if(terminal){share.location=null;share.sharingEpoch++;share.completedAt=now;share.purgeAt=Math.min(share.purgeAt,now+RETENTION);}
      }else throw error('Method not allowed',405);
      return view(share,role,now);
    });
    const delivery=flushSharingPush(env);
    if(ctx.waitUntil)ctx.waitUntil(delivery);else await delivery;
    return response(result);
  }catch(problem) {
    const status=problem.status??(problem instanceof TypeError?400:500);
    return response({error:status===500?'Sharing service unavailable':problem.message,...(problem.currentRevision!==undefined?{currentRevision:problem.currentRevision}:{}),...(problem.sharingEpoch!==undefined?{sharingEpoch:problem.sharingEpoch}:{})},status);
  }
}
