// Controlled GPS and sharing responses; real same-origin documents/storage events.
// No external sharing provider, physical phone or on-site location evidence.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {makePlan,startJourney} from '../src/journey-v2.js';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4233',out='test-results/pre-fr2-location-privacy';
await mkdir(out,{recursive:true});
const plan=makePlan({origin:{id:'privacy-test-origin',label:'Privacy fixture entrance'},destination:{id:'privacy-test-destination',label:'Privacy fixture destination'},date:'2026-09-19',departureTime:'10:00',mode:'replay',route:{id:'privacy-location-route',steps:[{id:'privacy-one',text:'Confirm the test entrance',durationSeconds:60},{id:'privacy-two',text:'Confirm the test destination',durationSeconds:60}],departureSeconds:36000,arrivalSeconds:36120,walkingSeconds:120,accessibility:'fixture',provenance:'Synthetic location privacy regression fixture'}});
const session={id:'p'.repeat(22),role:'traveller',travellerToken:'t'.repeat(43),revision:1,sharingEpoch:1,serverConsent:{progress:true,location:true},sharingPaused:false,accessRevoked:false};
const checks=[],errors=[],contexts=[];
const pass=message=>{checks.push(message);console.log('PASS '+message);};
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')));
const state=page=>page.evaluate(async()=>{const {getAppLocation}=await import('/src/location-assistance.js');return getAppLocation().getState();});
const fix=(page,latitude=1.31,index=null)=>page.evaluate(({latitude,index})=>window.geoCalls[index??window.geoCalls.length-1].success({coords:{latitude,longitude:103.81,accuracy:15},timestamp:Date.now()}),{latitude,index});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});

async function createContext({paired=false,failPermissions=false}={}){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});contexts.push(context);
  const active=startJourney(plan);if(paired){active.permissions.progress=true;active.permissions.location=true;active.sharing={shareId:session.id,planId:plan.id};}
  const api={requests:[],failPermissions,revision:1,consent:{progress:true,location:true}};
  await context.route('**/api/shares/**',async route=>{
    const request=route.request(),pathname=new URL(request.url()).pathname,body=request.postDataJSON();api.requests.push({pathname,method:request.method(),body});
    if(pathname.endsWith('/permissions')){
      if(api.failPermissions){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Controlled privacy service unavailable'})});return;}
      api.consent=body.consent;api.revision++;
    }else if(request.method()!=='GET')api.revision++;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:session.id,status:'active',revision:api.revision,sharingEpoch:1,consent:api.consent,sharingPaused:false,accessRevoked:false,acceptedPlan:plan,locationState:api.consent.location?'authorised':'not shared'})});
  });
  await context.route('https://*.tile.openstreetmap.org/**',route=>route.abort());
  await context.addInitScript(({active,pairing})=>{
    if(localStorage.getItem('commute-copilot-journey-v2')===null){localStorage.setItem('commute-copilot-journey-v2',JSON.stringify(active));if(pairing)localStorage.setItem('commute-copilot-pairing-v2',JSON.stringify(pairing));}
    window.geoCalls=[];window.geoCleared=[];window.locationStorageEvents=[];window.lastJourney=null;
    window.addEventListener('copilot:state-changed',event=>{window.lastJourney=structuredClone(event.detail.active);});
    window.addEventListener('storage',event=>{if(event.key==='commute-copilot-location-v2')window.locationStorageEvents.push({oldValue:event.oldValue,newValue:event.newValue});});
    Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:'prompt'})}});
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(success,failure){window.geoCalls.push({success,failure});return window.geoCalls.length;},clearWatch:id=>window.geoCleared.push(id)}});
  },{active,pairing:paired?session:null});
  return {context,api};
}
async function pageFor(context){
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor({timeout:60000});await page.waitForFunction(()=>window.geoCalls.length===1);return page;
}
const settings=page=>page.locator('.app-nav [data-view="preferences"]').click();

try{
  const cross=await createContext({paired:true});const first=await pageFor(cross.context),second=await pageFor(cross.context);
  await fix(first,1.31);await fix(second,1.32);
  assert.equal((await stored(first)).permissions.location,true);assert.equal((await state(first)).usable,true);assert.equal((await state(second)).usable,true);
  pass('two same-origin app documents collect through their own foreground watches with separately seeded sharing consent');
  await settings(second);await second.locator('#app-location-settings [data-location-stop]').click();
  await first.waitForFunction(()=>window.geoCleared.length===window.geoCalls.length&&window.lastJourney?.permissions.location===false);
  await second.waitForFunction(()=>window.geoCleared.length===window.geoCalls.length&&window.lastJourney?.permissions.location===false);
  for(const page of [first,second]){
    assert.equal((await state(page)).enabled,false);assert.equal((await state(page)).position,null);assert.equal((await stored(page)).location,null);
    assert.equal(await page.evaluate(()=>window.lastJourney.location),null);assert.equal(await page.evaluate(()=>window.lastJourney.permissions.location),false);
    await fix(page,1.4,0);await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));assert.equal((await state(page)).position,null);assert.equal(await page.evaluate(()=>window.geoCalls.length),1);
  }
  pass('Settings stop in another document clears every local watch, remembered coordinate and geographic-sharing permission; late callbacks stay invalid');
  await first.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-pairing-v2')).serverConsent.location===false);
  assert.equal(await first.evaluate(()=>window.locationStorageEvents.filter(event=>event.newValue==='off').length),1);
  assert.equal(await second.evaluate(()=>window.locationStorageEvents.filter(event=>event.newValue==='off').length),0);
  assert.ok(cross.api.requests.some(request=>request.pathname.endsWith('/permissions')&&request.body.consent.location===false));
  pass('native storage events propagate explicit disable once without pingpong and queue geographic-sharing removal');
  await cross.context.close();

  const loss=await createContext();const page=await pageFor(loss.context);await fix(page);
  assert.equal((await stored(page)).location.latitude,1.31);
  await page.evaluate(()=>window.geoCalls[0].failure({code:1}));
  assert.equal((await state(page)).status,'denied');assert.equal((await stored(page)).location,null);assert.equal((await stored(page)).permissions.geolocation,'denied');assert.deepEqual(await page.evaluate(()=>window.geoCleared),[1]);
  await fix(page,1.4,0);assert.equal((await stored(page)).location,null);
  pass('permission denial removes prior accepted-trip coordinates and late callbacks cannot restore them');
  await settings(page);await page.locator('#app-location-settings [data-location-enable]').click();await fix(page);
  await page.evaluate(()=>window.geoCalls[1].failure({code:3}));assert.equal((await stored(page)).location,null);assert.equal((await state(page)).enabled,true);
  await fix(page);assert.equal((await stored(page)).location.latitude,1.31);
  await page.evaluate(()=>window.geoCalls[1].success({coords:{latitude:1.4,longitude:103.9,accuracy:10},timestamp:Date.now()-61000}));assert.equal((await stored(page)).location,null);
  await fix(page);await page.evaluate(()=>window.geoCalls[1].failure({code:2}));assert.equal((await stored(page)).location,null);assert.equal((await state(page)).status,'unavailable');
  pass('timeout, stale callback and device unavailability remove remembered coordinates while a subsequent fresh fix can recover');
  await loss.context.close();

  const pending=await createContext({paired:true,failPermissions:true});const stopped=await pageFor(pending.context);await fix(stopped);
  await settings(stopped);await stopped.locator('#app-location-settings [data-location-stop]').click();
  await stopped.waitForFunction(()=>document.querySelector('#app-location-settings [data-location-status]')?.textContent.includes('pending on the server'));
  assert.equal((await state(stopped)).enabled,false);assert.equal((await stored(stopped)).location,null);assert.equal((await stored(stopped)).permissions.location,false);
  assert.equal(await stopped.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-pairing-v2')).pendingPrivacyAction),'stop-location');
  assert.equal(await stopped.locator('#app-location-settings [data-location-enable]').isVisible(),true);
  assert.match(await stopped.locator('#app-location-settings [data-location-status]').innerText(),/Collection is stopped on this device/);
  await stopped.locator('#app-location-settings').scrollIntoViewIfNeeded();await stopped.screenshot({path:out+'/settings-pending-stop-mobile.png',animations:'disabled'});
  pass('Settings catches a failed sharing stop, keeps local collection disabled and clearly reports the pending server change');
  await stopped.locator('.app-nav [data-view="caregiver"]').click();assert.equal(await stopped.locator('#retry-privacy').isVisible(),true);
  pending.api.failPermissions=false;await stopped.locator('#retry-privacy').click();await stopped.waitForFunction(()=>!JSON.parse(localStorage.getItem('commute-copilot-pairing-v2')).pendingPrivacyAction);
  assert.equal(await stopped.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-pairing-v2')).serverConsent.location),false);assert.equal((await state(stopped)).enabled,false);
  pass('retry completes the controlled privacy request without restarting local collection or geographic sharing');
  assert.deepEqual(errors,[]);pass('all controlled privacy scenarios finish without uncaught browser exceptions');
  await writeFile(out+'/verification.json',JSON.stringify({base,checks,errors,fixture:'Synthetic trip, controlled GPS and intercepted sharing API responses; genuine multi-document storage events',physicalPhone:false},null,2));
}finally{for(const context of contexts)await context.close();await browser.close();}
