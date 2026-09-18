// Output contains a private secret: redirect into ignored local configuration;
// never commit or paste it into a browser bundle.
import {base64url} from '../server/push.js';
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
console.log(`VAPID_PUBLIC_KEY=${base64url(await crypto.subtle.exportKey('raw',pair.publicKey))}`);
console.log(`VAPID_PRIVATE_JWK=${JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey))}`);
console.log('VAPID_SUBJECT=mailto:replace-with-your-contact@example.com');
