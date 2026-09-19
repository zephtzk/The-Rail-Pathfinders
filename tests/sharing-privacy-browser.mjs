// After npm run build. Focused real-browser regressions for privacy lifecycle.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4233';
let browser;const contexts=[],errors=[];
const plan=()=>({schemaVersion:2,id:crypto.randomUUID(),mode:'replay',origin:{id:'privacy-fixture-origin',label:'Rehearsal start'},destination:{id:'privacy-fixture-destination',label:'Rehearsal end'},route:{id:'privacy-fixture-route',steps:[{id:'privacy-fixture-step',text:'Confirm test checkpoint manually',durationSeconds:60},{id:'privacy-fixture-arrival',text:'Confirm test destination manually',durationSeconds:60}],arrivalSeconds:36120,departureSeconds:36000,walkingSeconds:120,accessibility:'fixture',provenance:'Synthetic privacy lifecycle regression fixture'},preferences:{stepFree:false,walkingLimitMinutes:30},stops:[],createdAt:Date.now(),departureDate:'2026-09-18',departureTime:'10:00',deadline:null});
const active=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')));
async function share(){const response=await fetch(base+'/api/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:plan()})});assert.equal(response.status,201);return response.json();}
// Legacy privacy checks use disclosed full-guidance controls; initialize that choice without replacing it on reload.
async function client(){const context=await browser.newContext({serviceWorkers:'block'});contexts.push(context);await context.addInitScript(()=>{if(localStorage.getItem('commute-copilot-presentation-v1')===null)localStorage.setItem('commute-copilot-presentation-v1',JSON.stringify({schemaVersion:1,simpleGuidance:false}));window.geoWatches=0;Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:'prompt'})}});Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(success){window.geoWatches++;window.geoSuccess=success;return window.geoWatches;},clearWatch(){},getCurrentPosition(success){success({coords:{latitude:1.3,longitude:103.8,accuracy:50},timestamp:Date.now()});}}});});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return {context,page};}
async function paired(){const s=await share(),c=await client();await c.page.goto(`${base}/?legacy=1#invite=${s.id}.${s.inviteToken}`);await c.page.locator('#accept-invite').click();await c.page.locator('#apply-sharing').waitFor();return {...c,share:s};}
try{
  assert.equal((await fetch(base+'/api/push/config')).ok,true,'build and start the assigned preview before this test');
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const first=await paired(),p=first.page;
  await p.locator('#share-progress').check();await p.locator('#share-location').check();await p.locator('#apply-sharing').click();
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')).permissions.location);
  await p.waitForFunction(()=>window.geoWatches===1);assert.equal(await p.locator('#locate-once').isVisible(),false);
  await p.locator('#checkpoint-step').selectOption('1');await p.locator('#checkpoint-step').focus();
  await p.evaluate(()=>window.geoSuccess({coords:{latitude:1.31,longitude:103.81,accuracy:60},timestamp:Date.now()}));
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')).location?.latitude===1.31);
  assert.equal(await p.locator('#checkpoint-step').inputValue(),'1');assert.equal(await p.evaluate(()=>document.activeElement.id),'checkpoint-step');assert.equal((await active(p)).progress.stepIndex,0);
  console.log('PASS GPS callback preserves an unfinished manual selection and focus without confirming progress');
  await p.locator('#clear-location').click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-pairing-v2')).serverConsent.location===false);
  await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));assert.equal(await p.evaluate(()=>window.geoWatches),1);assert.equal((await active(p)).permissions.location,false);
  console.log('PASS Stop location persists across visibility changes and disables server geographic consent');
  await first.context.setOffline(true);await p.locator('#revoke-sharing').click();await p.locator('#retry-privacy').waitFor();assert.equal(await p.locator('#revoke-sharing').isEnabled(),true);
  await p.locator('#locate-once').click();await p.locator('#clear-location').click();assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-pairing-v2')).pendingPrivacyAction),'revoke');
  console.log('PASS Stop location cannot downgrade queued full revocation while offline');
  await first.context.setOffline(false);await p.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-pairing-v2')).accessRevoked===true);
  assert.equal((await fetch(base+'/api/shares/'+first.share.id,{headers:{Authorization:'Bearer '+first.share.viewerToken}})).status,404);
  console.log('PASS Failed revocation remains visibly pending/retryable and reconnect revokes server access');
  const second=await paired();await second.page.locator('#journey-finish').click();await second.page.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-pairing-v2')).collectionStopped===true);
  const finished=await active(second.page),finishMessage=await second.page.locator('#companion-message').innerText();
  await second.page.evaluate(()=>window.dispatchEvent(new CustomEvent('copilot:legacy-accepted',{detail:{action:'update'}})));
  assert.deepEqual(await active(second.page),finished);assert.equal(await second.page.locator('#companion-message').innerText(),finishMessage);
  console.log('PASS Stale legacy update after completion is ignored before conversion and cannot restart a journey');
  await second.page.locator('#revoke-sharing').click();await second.page.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-pairing-v2')).accessRevoked===true);
  console.log('PASS Completed journey can still revoke caregiver access');
  const recovery=await share(),eventId=crypto.randomUUID();const acceptance=await fetch(`${base}/api/shares/${recovery.id}/accept`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+recovery.inviteToken},body:JSON.stringify({eventId,expectedRevision:1,consent:{progress:false,location:false}})});assert.equal(acceptance.status,200);const accepted=await acceptance.json();
  const third=await client();await third.context.addInitScript(session=>localStorage.setItem('commute-copilot-pairing-v2',JSON.stringify(session)),{id:recovery.id,role:'recipient',inviteToken:recovery.inviteToken,revision:1,pendingAcceptance:{eventId,expectedRevision:1,consent:{progress:false,location:false}}});
  await third.page.goto(base+'/?legacy=1');await third.page.locator('#start-accepted-trip').click();await third.page.locator('#journey-finish').waitFor();const restored=await active(third.page);assert.equal(restored.plan.id,accepted.acceptedPlan.id);assert.equal(restored.sharing.shareId,recovery.id);assert.equal(restored.permissions.progress,false);assert.equal(restored.permissions.location,false);
  console.log('PASS Lost acceptance response recovers pairing and explicitly starts only its accepted plan with consent off');
  assert.deepEqual(errors,[]);console.log('PASS No browser runtime exceptions (desktop browser automation, no physical-device inference)');
}finally{for(const context of contexts)await context.close();await browser?.close();}
