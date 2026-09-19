import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createDecipheriv} from 'node:crypto';
import {encryptPush,sendWebPush,base64url,unbase64url,validateSubscription} from '../server/push.js';

const encode=new TextEncoder();
// An independent HMAC implementation checks the Web Crypto HKDF output, header,
// record marker and GCM authentication, rather than merely asserting a POST ran.
function referenceHkdf(input,salt,info,length){const prk=createHmac('sha256',salt).update(input).digest();return createHmac('sha256',prk).update(info).update(Buffer.from([1])).digest().subarray(0,length);}
async function browserSubscription(){const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return {pair,subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/browser-fixture',expirationTime:null,keys:{p256dh:base64url(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:base64url(crypto.getRandomValues(new Uint8Array(16)))}}};}
async function decryptAsBrowser(body,pair,subscription){
  const bytes=Buffer.from(body),salt=bytes.subarray(0,16),recordSize=bytes.readUInt32BE(16),keyLength=bytes[20],serverPublic=bytes.subarray(21,21+keyLength),encrypted=bytes.subarray(21+keyLength);
  assert.equal(recordSize,4096);assert.equal(keyLength,65);
  const key=await crypto.subtle.importKey('raw',serverPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const secret=Buffer.from(await crypto.subtle.deriveBits({name:'ECDH',public:key},pair.privateKey,256));
  const info=Buffer.concat([Buffer.from('WebPush: info\0'),Buffer.from(unbase64url(subscription.keys.p256dh)),serverPublic]);
  const ikm=referenceHkdf(secret,unbase64url(subscription.keys.auth),info,32);
  const cek=referenceHkdf(ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16),nonce=referenceHkdf(ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12);
  const decipher=createDecipheriv('aes-128-gcm',cek,nonce);decipher.setAuthTag(encrypted.subarray(-16));
  const plaintext=Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]);assert.equal(plaintext.at(-1),2);
  return JSON.parse(plaintext.subarray(0,-1).toString('utf8'));
}
test('RFC8291 encrypted payload decrypts with independent HMAC and AES implementation',async()=>{
  const {pair,subscription}=await browserSubscription(),payload={eventId:'revision-123',title:'Journey updated',url:'/'};
  const body=await encryptPush(subscription,payload);assert.deepEqual(await decryptAsBrowser(body,pair,subscription),payload);
  const another=await encryptPush(subscription,payload);assert.notDeepEqual(Buffer.from(body),Buffer.from(another),'fresh salt and ECDH key per delivery');
});
test('delivery stays disabled even with credentials and a configured transport',async()=>{
  let deliveries=0,requests=0;
  const env={VAPID_PUBLIC_KEY:'configured',VAPID_PRIVATE_JWK:'configured',VAPID_SUBJECT:'mailto:test@example.com',PUSH_TEST_TRANSPORT:async()=>{deliveries++;}};
  await assert.rejects(sendWebPush({}, {},env,async()=>{requests++;}),/notifications are disabled/);
  assert.equal(deliveries,0);assert.equal(requests,0);
});

test('subscription endpoints cannot redirect requests to arbitrary or private hosts',async()=>{
  const {subscription}=await browserSubscription();
  for(const endpoint of ['http://fcm.googleapis.com/send','https://fcm.googleapis.com.attacker.test/','https://localhost/send','https://user:secret@fcm.googleapis.com/send','https://fcm.googleapis.com:8443/send'])assert.throws(()=>validateSubscription({...subscription,endpoint}));
  assert.throws(()=>validateSubscription({...subscription,keys:{...subscription.keys,auth:'abc'}}));
});
