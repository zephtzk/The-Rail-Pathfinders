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
export function pushConfiguration() {
  return {configured:false,transport:'disabled',publicKey:null,missing:[],externalDelivery:'disabled',message:'Journey notifications are disabled in this build.'};
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
// Delivery is disabled at the server boundary, regardless of credentials or
// test transports. Pure encryption helpers above remain independently testable.
export async function sendWebPush() { throw new Error('Journey notifications are disabled in this build.'); }
export function queueSharingPush() {}
export async function flushSharingPush(env) {
  const store=sharingStore(env);
  if(store)await mutateSharing(store,state=>{state.subscriptions={};state.outbox={};});
  return {delivered:0,disabled:true};
}
