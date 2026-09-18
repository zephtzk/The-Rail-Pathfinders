import {mutateSharing,sharingStore} from './sharing-store.js';

const utf8=new TextEncoder();
export const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export function unbase64url(text) {
  if(typeof text!=='string'||!/^[A-Za-z0-9_-]+$/.test(text))throw new Error('Invalid base64url');
  return Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
}
export const randomCredential = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const credentialHash = async text => base64url(await crypto.subtle.digest('SHA-256',utf8.encode(text)));
const joinBytes = (...parts) => {const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;};
async function hkdf(input,salt,info,size) {
  const key=await crypto.subtle.importKey('raw',input,'HKDF',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,size*8));
}
export function pushConfiguration(env) {
  const configured=Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_JWK&&env.VAPID_SUBJECT);
  return {configured:configured||typeof env.PUSH_TEST_TRANSPORT==='function',transport:typeof env.PUSH_TEST_TRANSPORT==='function'?'local-test':configured?'web-push':'unconfigured',publicKey:env.VAPID_PUBLIC_KEY??null,
    missing:['VAPID_PUBLIC_KEY','VAPID_PRIVATE_JWK','VAPID_SUBJECT'].filter(key=>!env[key]),externalDelivery:'unverified',message:'Web Push is optional and delivery is not guaranteed. Local test transport does not contact a push service.'};
}
export function validateSubscription(value) {
  const url=new URL(value?.endpoint??'');
  const approved=url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.push.services.mozilla.com')||url.hostname==='web.push.apple.com'||url.hostname.endsWith('.push.apple.com')||url.hostname.endsWith('.notify.windows.com');
  if(url.protocol!=='https:'||url.username||url.password||url.hash||(url.port&&url.port!=='443')||!approved||url.href.length>2048)throw new Error('Unsupported push service endpoint');
  const p256dh=unbase64url(value.keys?.p256dh),auth=unbase64url(value.keys?.auth);
  if(p256dh.length!==65||p256dh[0]!==4||auth.length!==16)throw new Error('Invalid push subscription keys');
  if(value.expirationTime!==null&&value.expirationTime!==undefined&&(!Number.isFinite(value.expirationTime)||value.expirationTime<=Date.now()))throw new Error('Expired push subscription');
  return {endpoint:url.href,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth},expirationTime:value.expirationTime??null};
}
// RFC 8291 aes128gcm, one record, fresh ephemeral ECDH key per message.
export async function encryptPush(subscription,payload) {
  const plaintext=utf8.encode(JSON.stringify(payload));
  if(plaintext.length>3000)throw new Error('Push payload exceeds one record');
  const uaPublic=unbase64url(subscription.keys.p256dh),auth=unbase64url(subscription.keys.auth);
  const uaKey=await crypto.subtle.importKey('raw',uaPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const asPublic=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
  const secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey},pair.privateKey,256));
  const ikm=await hkdf(secret,auth,joinBytes(utf8.encode('WebPush: info\0'),uaPublic,asPublic),32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const cek=await hkdf(ikm,salt,utf8.encode('Content-Encoding: aes128gcm\0'),16);
  const nonce=await hkdf(ikm,salt,utf8.encode('Content-Encoding: nonce\0'),12);
  const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,joinBytes(plaintext,new Uint8Array([2]))));
  const header=new Uint8Array(21);header.set(salt);new DataView(header.buffer).setUint32(16,4096);header[20]=asPublic.length;
  return joinBytes(header,asPublic,encrypted);
}
export async function sendWebPush(subscription,payload,env,fetcher=fetch,now=Date.now()) {
  if(typeof env.PUSH_TEST_TRANSPORT==='function')return env.PUSH_TEST_TRANSPORT(subscription,payload);
  if(!pushConfiguration(env).configured)throw new Error('Web Push credentials missing');
  if(!/^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT))throw new Error('VAPID_SUBJECT must be mailto: or https:');
  const privateKey=await crypto.subtle.importKey('jwk',JSON.parse(env.VAPID_PRIVATE_JWK),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const header=base64url(utf8.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const claims=base64url(utf8.encode(JSON.stringify({aud:new URL(subscription.endpoint).origin,exp:Math.floor(now/1000)+3600,sub:env.VAPID_SUBJECT})));
  const signed=`${header}.${claims}`;
  const signature=base64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,utf8.encode(signed)));
  const response=await fetcher(subscription.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`vapid t=${signed}.${signature}, k=${env.VAPID_PUBLIC_KEY}`,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'300',Urgency:'normal',Topic:(await credentialHash(payload.eventId)).slice(0,32)},body:await encryptPush(subscription,payload)});
  return {status:response.status};
}
export function queueSharingPush(state,share,target,eventId,now) {
  for(const [id,subscription] of Object.entries(state.subscriptions)) {
    if(subscription.shareId!==share.id||subscription.role!==target)continue;
    if(target==='viewer'&&(!share.consent.progress||share.sharingPaused||share.accessRevoked))continue;
    const key=`${id}:${eventId}`;
    // A discreet notification means "review the latest state". Coalesce older
    // pending messages for this device instead of retaining a journey history.
    for(const [oldId,event] of Object.entries(state.outbox))if(oldId!==key&&event.subscriptionId===id&&event.leaseUntil<=now)delete state.outbox[oldId];
    if(!state.outbox[key])state.outbox[key]={subscriptionId:id,shareId:share.id,role:target,eventId,createdAt:now,nextAt:now,attempts:0,leaseUntil:0};
  }
}
export async function flushSharingPush(env,{now=Date.now(),fetcher=fetch}={}) {
  const store=sharingStore(env);if(!store||!pushConfiguration(env).configured)return {delivered:0};
  const lease=randomCredential();
  const jobs=await mutateSharing(store,state=>{
    const jobs=[];
    const busy=new Set(Object.values(state.outbox).filter(event=>event.leaseUntil>now).map(event=>event.subscriptionId));
    for(const [id,event] of Object.entries(state.outbox)) {
      const share=state.shares[event.shareId],sub=state.subscriptions[event.subscriptionId];
      if(!share||!sub||share.expiresAt<=now||event.createdAt<now-86400000||share.accessRevoked||(sub.subscription.expirationTime&&sub.subscription.expirationTime<=now)||(event.role==='viewer'&&(!share.consent.progress||share.sharingPaused))){delete state.outbox[id];continue;}
      if(event.deliveredAt||event.failedAt||event.nextAt>now||event.leaseUntil>now||busy.has(event.subscriptionId)||jobs.length>=20)continue;
      event.leaseUntil=now+60000;event.lease=lease;event.attempts++;
      busy.add(event.subscriptionId);
      jobs.push({id,event:{...event},subscription:sub.subscription});
    }
    return jobs;
  });
  let delivered=0;
  for(const job of jobs) {
    // Recheck revocation after claiming and before dispatch. An already in-flight
    // generic notification cannot be recalled, and carries no private details.
    const fresh=(await store.read()).value;
    const share=fresh.shares[job.event.shareId],subscription=fresh.subscriptions[job.event.subscriptionId];
    let status=0;
    const eligible=share&&subscription&&share.expiresAt>now&&!share.accessRevoked&&(job.event.role!=='viewer'||(share.consent.progress&&!share.sharingPaused));
    if(eligible)try{status=(await sendWebPush(job.subscription,{eventId:job.event.eventId,title:'Journey updated',body:'Open Commute Copilot to review your journey.',url:'/'},env,fetcher,now)).status;}catch{status=0;}
    const deliveredThisJob=await mutateSharing(store,state=>{
      const event=state.outbox[job.id];if(!event||event.lease!==lease)return;
      if(!eligible){delete state.outbox[job.id];return;}
      if([404,410].includes(status)){delete state.subscriptions[event.subscriptionId];delete state.outbox[job.id];return;}
      event.leaseUntil=0;
      if(status>=200&&status<300){delete state.outbox[job.id];return true;}
      else if(event.attempts>=5)delete state.outbox[job.id];
      else event.nextAt=now+Math.min(3600000,30000*2**event.attempts);
    });
    if(deliveredThisJob)delivered++;
  }
  return {delivered};
}
