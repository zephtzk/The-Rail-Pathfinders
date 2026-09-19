// Controlled GPS and OneMap fixtures in desktop Edge mobile emulation.
// No physical-device, live-location or live-provider claim.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {makePlan,startJourney} from '../src/journey-v2.js';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4251';
const out='test-results/fr3-location';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const contexts=[],checks=[],failures=[],errors=[];
const pointA={latitude:1.3,longitude:103.8},pointB={latitude:1.321,longitude:103.81},pointC={latitude:1.33,longitude:103.82};
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
const readPersonal=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-personal-v2')));
const nav=(page,view)=>page.locator(`.app-nav [data-view="${view}"]`).click();
const ready=page=>page.locator('#find-routes:not([disabled])').waitFor({timeout:60000});
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const fix=(page,{latitude=1.3,longitude=103.8,accuracy=12,age=0,index}={})=>page.evaluate(({latitude,longitude,accuracy,age,index})=>window.fr3Geo[index??window.fr3Geo.length-1].success({coords:{latitude,longitude,accuracy},timestamp:Date.now()-age}),{latitude,longitude,accuracy,age,index});
const fail=(page,code)=>page.evaluate(code=>window.fr3Geo.at(-1).failure({code}),code);
async function capture(page,name){await page.evaluate(()=>document.querySelector('#app-message')?.classList.remove('is-visible'));await page.screenshot({path:`${out}/${name}.png`,animations:'disabled'});}
async function chooseLocation(page,role,{keyboard=false}={}){
  await page.locator('#'+role).click();await page.locator(`#${role}-my-location`).waitFor();
  if(keyboard){
    const index=Number(await page.locator(`#${role}-my-location`).getAttribute('data-index'));
    for(let i=0;i<=index;i++)await page.locator('#'+role).press('ArrowDown');
    check(`${role} keyboard highlights My location`,await page.locator('#'+role).getAttribute('aria-activedescendant')===`${role}-my-location`);
    await page.locator('#'+role).press('Enter');
  }else await page.locator(`#${role}-my-location`).click();
  await page.waitForFunction(role=>document.getElementById(role).value==='My location'&&document.getElementById(role).getAttribute('aria-busy')===null,role);
}
async function station(page,role,query='EW12'){
  await page.locator('#'+role).fill(query);
  await page.locator(`#${role}-suggestions .suggestion-option:not(.my-location-option)`).filter({hasNot:page.locator('small:has-text("OneMap")')}).first().click();
}
async function plan(page){await page.locator('#find-routes').click();await page.locator('#review-route').waitFor();}
function seedJourney(){return startJourney(makePlan({origin:{id:'fr3-o',label:'Fixture start',lat:1.3,lng:103.8},destination:{id:'fr3-d',label:'Fixture destination',lat:1.321,lng:103.81},date:'2026-09-21',departureTime:'10:00',route:{id:'fr3-location-fixture',steps:[{id:'fr3-step',type:'walk',text:'Follow the accepted fixture instruction',durationSeconds:600}],departureSeconds:36000,arrivalSeconds:36600,walkingSeconds:600,accessibility:'unknown',provenance:'Controlled regression fixture'}}));}
async function controlled({seed=null,delayRouting=false,preference='off'}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Singapore',serviceWorkers:'block',reducedMotion:'reduce',isMobile:true,hasTouch:true});contexts.push(context);
  const api={searches:[],routes:[]};
  await context.route('https://**.tile.openstreetmap.org/**',route=>route.abort());
  await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
  await context.route('**/api/address/search',route=>{api.searches.push(route.request().postDataJSON());return route.fulfill({json:{provider:'onemap',status:'ok',results:[]}});});
  await context.route('**/api/address/route',route=>{
    const body=route.request().postDataJSON();api.routes.push(body);
    const start=Date.parse(`${body.date}T${body.departureTime}:00+08:00`);
    return route.fulfill({json:{provider:'onemap',status:'ok',retrievedAt:Date.now(),itineraries:[{startTime:start,endTime:start+900000,walkTime:0,legs:[{mode:'BUS',startTime:start,endTime:start+900000,duration:900,distance:3000,from:{name:'origin',...body.origin},to:{name:'destination',...body.destination},route:'Fixture 23',headsign:'Fixture terminus',geometry:null}]}]}});
  });
  let releaseRouting;
  if(delayRouting){const gate=new Promise(resolve=>releaseRouting=resolve);await context.route('**/data/rail-network.json',async route=>{await gate;await route.continue();});}
  await context.addInitScript(({seed,preference})=>{
    localStorage.setItem('commute-copilot-location-v2',preference);
    localStorage.setItem('commute-copilot-presentation-v1',JSON.stringify({schemaVersion:1,simpleGuidance:false}));
    if(seed)localStorage.setItem('commute-copilot-journey-v2',JSON.stringify(seed));
    window.fr3Geo=[];window.fr3Cleared=[];window.fr3ClockOffset=0;
    const realNow=Date.now.bind(Date);Date.now=()=>realNow()+window.fr3ClockOffset;
    Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:'prompt'})}});
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(success,failure,options){window.fr3Geo.push({success,failure,options});return window.fr3Geo.length;},clearWatch(id){window.fr3Cleared.push(id);},getCurrentPosition(){throw Error('Unexpected second location API');}}});
  },{seed,preference});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('#location-toggle').waitFor();if(!delayRouting)await ready(page);
  return {context,page,api,releaseRouting};
}
async function enableFix(page,position=pointA){
  await page.evaluate(async()=>{const {getAppLocation}=await import('/src/location-assistance.js');getAppLocation().start();});await fix(page,position);
}
async function scenario(name,run){
  const errorCount=errors.length;
  try{await run();assert.equal(errors.length,errorCount,'no uncaught browser exceptions');}
  catch(error){failures.push({name,error:error.stack??String(error)});console.error('FAIL '+name+'\n'+error.stack);}
}

try{
  await scenario('both endpoint selectors, immutable route coordinates and saved snapshots',async()=>{
    const {context,page,api}=await controlled();
    for(const role of ['origin','destination']){await page.locator('#'+role).click();check(`${role} empty selector exposes My location`,await page.locator(`#${role}-my-location`).isVisible());await page.locator('#'+role).press('Escape');}
    for(const role of ['origin','destination']){await station(page,role,role==='origin'?'EW8':'EW12');await page.locator('#'+role).click();check(`${role} selected station can be replaced by My location`,await page.locator(`#${role}-my-location`).isVisible());await page.locator('#'+role).press('Escape');}
    check('opening endpoint suggestions respects saved location off',await page.evaluate(()=>window.fr3Geo.length)===0);
    await page.locator('#origin').click();await page.locator('#origin-my-location').click();await fix(page,pointA);
    await page.waitForFunction(()=>document.querySelector('#origin').value==='My location');
    await fix(page,pointB);await chooseLocation(page,'destination',{keyboard:true});
    check('selecting either device endpoint does not call address search or routing',api.searches.length===0&&api.routes.length===0);
    for(const role of ['origin','destination']){await page.locator('#'+role).click();check(`${role} selected selector still offers My location`,await page.locator(`#${role}-my-location`).isVisible());await page.locator('#'+role).press('Escape');}
    await capture(page,'selected-endpoints-390');
    await fix(page,pointC);await plan(page);
    check('route sends the two explicitly selected fixes even after the GPS moves',api.routes.length===1&&api.routes[0].origin.lat===pointA.latitude&&api.routes[0].origin.lng===pointA.longitude&&api.routes[0].destination.lat===pointB.latitude&&api.routes[0].destination.lng===pointB.longitude);
    check('routing request exposes coordinates only and never device accuracy, time or labels',Object.keys(api.routes[0].origin).sort().join()==='lat,lng'&&Object.keys(api.routes[0].destination).sort().join()==='lat,lng');
    await fix(page,{latitude:1.34,longitude:103.83});
    await page.locator('#save-route').click();await page.locator('#save-route-form [name=label]').fill('FR3 fixed location snapshot');await page.locator('#save-route-form button').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-personal-v2'))?.templates.some(t=>t.label==='FR3 fixed location snapshot'));
    const saved=await readPersonal(page),template=saved.templates.find(t=>t.label==='FR3 fixed location snapshot'),origin=saved.places.find(p=>p.id===template.originId),destination=saved.places.find(p=>p.id===template.destinationId);
    check('saved snapshot keeps reviewed coordinates after device movement',origin.lat===pointA.latitude&&destination.lat===pointB.latitude);
    check('saved device endpoints carry dated Singapore snapshot labels',origin.label!=='My location'&&/Selected location.*\d.*SGT/.test(origin.label)&&/Selected location.*\d.*SGT/.test(destination.label));
    await nav(page,'saved');await page.locator(`[data-open="${template.id}"]`).click();
    check('reopened saved location is clearly a fixed snapshot',/Selected location.*SGT/.test(await page.locator('#origin').inputValue()));
    await plan(page);check('reopened snapshot retains original coordinates',api.routes.at(-1).origin.lat===pointA.latitude&&api.routes.at(-1).destination.lat===pointB.latitude);
    await context.close();
  });

  await scenario('same location, expired selection, poor GPS, offline routing and network icon',async()=>{
    const {context,page,api}=await controlled();await enableFix(page);await chooseLocation(page,'origin',{keyboard:true});await chooseLocation(page,'destination');
    await page.locator('#find-routes').click();await page.waitForFunction(()=>document.querySelector('#planner-status').textContent.includes('different starting'));
    check('identical device coordinates reject before a route request',api.routes.length===0);
    await station(page,'destination');await page.evaluate(()=>window.fr3ClockOffset=61001);await fix(page,pointB);
    await page.locator('#find-routes').click();await page.waitForFunction(()=>document.querySelector('#planner-status').textContent.includes('selected location is stale'));
    check('a fresh current watch cannot revive an expired selected coordinate',api.routes.length===0);
    await chooseLocation(page,'origin');await fix(page,{accuracy:120});await page.locator('#find-routes').click();
    await page.waitForFunction(()=>document.querySelector('#planner-status').textContent.includes('accuracy is too low'));
    check('low accuracy blocks routing with a manual-place fallback',/enter a place/.test(await page.locator('#planner-status').innerText())&&api.routes.length===0);
    await fix(page,{age:61001});await page.locator('#find-routes').click();await page.waitForFunction(()=>document.querySelector('#planner-status').textContent.includes('stale'));
    check('stale GPS feedback remains explicit',api.routes.length===0);
    await fix(page,pointA);await chooseLocation(page,'origin');await context.setOffline(true);
    await page.waitForFunction(()=>document.querySelector('#network-status').getAttribute('aria-label')==='Offline');
    check('offline signal has an accessible status name, live announcement and visible X',await page.locator('#network-status').getAttribute('role')==='status'&&await page.locator('#network-status').getAttribute('aria-live')==='polite'&&await page.locator('#network-status .network-signal-cross').count()===1&&await page.locator('#network-status svg').getAttribute('aria-hidden')==='true');
    await page.locator('#find-routes').click();await page.waitForFunction(()=>document.querySelector('#planner-status').textContent.includes('requires a connection'));
    check('offline device routing preserves the selected place and explains the network requirement',api.routes.length===0&&await page.locator('#origin').inputValue()==='My location');
    await capture(page,'offline-feedback-390');await context.setOffline(false);
    await page.waitForFunction(()=>document.querySelector('#network-status').getAttribute('aria-label')==='Online');
    check('online returns to a full signal without a crossed X',await page.locator('#network-status .network-signal-cross').count()===0);
    await context.close();
  });

  await scenario('pending selection cancellation, denied and unavailable recovery',async()=>{
    const {context,page,api}=await controlled();
    await page.locator('#origin').click();await page.locator('#origin-my-location').click();
    check('pending location is announced at its endpoint',/Getting a fresh location/.test(await page.locator('#origin-search-status').innerText()));
    await page.locator('#origin').fill('EW8');await fix(page,pointA);await settle(page);
    check('editing cancels pending selection without a late coordinate overwrite',await page.locator('#origin').inputValue()==='EW8'&&await page.locator('#origin').getAttribute('aria-busy')===null);
    await fail(page,3);await page.locator('#origin').click();await page.locator('#origin-my-location').click();await page.locator('#destination').focus();await fix(page,pointB);await settle(page);
    check('blur cancels pending selection and clears its loading announcement',await page.locator('#origin').inputValue()==='EW8'&&await page.locator('#origin').getAttribute('aria-busy')===null&&await page.locator('#origin-search-status').textContent()==='');
    check('field cancellations leave the shared watch running',await page.evaluate(()=>window.fr3Geo.length===1&&window.fr3Cleared.length===0));
    await fail(page,3);await page.locator('#origin').click();await page.locator('#origin-my-location').click();await fail(page,1);
    await page.waitForFunction(()=>document.querySelector('#origin-search-status').textContent.includes('permission denied'));
    check('permission denied keeps a selectable retry and manual entry',await page.locator('#origin-my-location').isVisible()&&/enter a place/.test(await page.locator('#origin-search-status').innerText()));
    await page.locator('#origin-my-location').click();check('explicit denied retry starts one new watch',await page.evaluate(()=>window.fr3Geo.length)===2);await fail(page,2);
    await page.waitForFunction(()=>document.querySelector('#origin-search-status').textContent.includes('unavailable'));
    check('unavailable location is explained without substituting old coordinates',/Retry My location/.test(await page.locator('#origin-search-status').innerText())&&await page.locator('#origin').inputValue()==='EW8');
    await capture(page,'unavailable-endpoint-390');
    await page.locator('#origin-my-location').click();await fix(page,pointA);await page.waitForFunction(()=>document.querySelector('#origin').value==='My location');
    check('explicit unavailable retry recovers and remains private until routing',await page.evaluate(()=>window.fr3Geo.length)===3&&api.searches.length===0&&api.routes.length===0);
    await context.close();
  });

  await scenario('location popover on every tab and mobile viewport',async()=>{
    const {context,page}=await controlled({seed:seedJourney()});await enableFix(page);
    for(const view of ['plan','current','saved','facilities','caregiver','spending','preferences','staff']){
      await nav(page,view);await page.locator('#location-toggle').click();
      const box=await page.locator('#location-popover').boundingBox(),viewport=page.viewportSize();
      const above=await page.locator('#location-popover-title').evaluate(element=>{const b=element.getBoundingClientRect();return element.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));});
      check(`${view} location popover is readable above its tab content`,await page.locator('#location-popover').isVisible()&&await page.locator('#location-toggle').getAttribute('aria-expanded')==='true'&&box.x>=0&&box.x+box.width<=viewport.width+1&&above);
      check(`${view} location popover retains status and privacy details`,/Approximate.*12 m/.test(await page.locator('#app-location-status').innerText())&&/Caregiver sharing is a separate choice/.test(await page.locator('#location-popover').innerText()));
      if(['current','facilities','preferences','staff'].includes(view))await capture(page,`${view}-popover-390`);
      await page.keyboard.press('Escape');check(`${view} Escape closes popover and restores trigger focus`,!await page.locator('#location-popover').isVisible()&&await page.locator('#location-toggle').evaluate(element=>element===document.activeElement));
    }
    await page.locator('#location-toggle').click();await page.locator('#home-plan').click();
    check('outside interaction closes location popover',!await page.locator('#location-popover').isVisible()&&await page.locator('#location-toggle').getAttribute('aria-expanded')==='false');
    await page.setViewportSize({width:320,height:740});await page.locator('#location-toggle').click();
    check('320px controls and popover fit without document overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const small=await page.locator('#location-popover').boundingBox();check('320px popover remains inside viewport',small.x>=0&&small.x+small.width<=321);
    await capture(page,'popover-320');await page.keyboard.press('Escape');await page.locator('#origin').click();
    check('320px My location action remains available',await page.locator('#origin-my-location').isVisible());await capture(page,'endpoint-selector-320');
    await page.locator('#origin').press('Escape');await page.addStyleTag({content:'html{font-size:200%!important}'});await page.locator('#location-toggle').click();
    check('320px at 200% text keeps header and location details within the document',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await capture(page,'popover-320-large-text');
    const enlarged=await page.locator('#location-popover').boundingBox();check('enlarged popover stays within viewport height',enlarged.y>=0&&enlarged.y+enlarged.height<=741);
    await page.locator('#location-popover-stop').scrollIntoViewIfNeeded();
    check('enlarged popover action remains reachable above navigation and trip overlays',await page.locator('#location-popover-stop').evaluate(element=>{const b=element.getBoundingClientRect();return element.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}));
    await capture(page,'popover-320-large-text-actions');
    await page.locator('#location-popover-stop').focus();await page.locator('#location-popover-stop').press('Enter');
    check('popover stop clears location',await page.evaluate(async()=>{const {getAppLocation}=await import('/src/location-assistance.js');return !getAppLocation().getState().enabled&&getAppLocation().getState().position===null;}));
    const stoppedFocus=await page.evaluate(()=>({focused:document.activeElement?.id,tag:document.activeElement?.tagName,popoverHidden:document.querySelector('#location-popover').hidden,enableHidden:document.querySelector('#location-popover-enable').hidden}));
    assert.equal(stoppedFocus.focused,'location-popover-enable',JSON.stringify(stoppedFocus));check('keyboard stop focuses the available enable action',true);
    await context.close();
  });

  await scenario('My location can be selected while route data is still loading',async()=>{
    const {context,page,releaseRouting,api}=await controlled({delayRouting:true});
    try{
      await page.locator('#origin').click();await page.locator('#origin-my-location').click();await fix(page,pointA);
      await page.waitForFunction(()=>document.querySelector('#origin').value==='My location');
      check('early location selection stays confirmed while planner data is pending',await page.locator('#find-routes').isDisabled()&&api.routes.length===0);
    }finally{releaseRouting();}
    await ready(page);check('route-data completion preserves early location selection',await page.locator('#origin').inputValue()==='My location');await context.close();
  });
}finally{
  await writeFile(`${out}/verification.json`,JSON.stringify({base,checks,failures,errors,limits:'Controlled GPS and OneMap responses; desktop Edge mobile emulation. No physical-phone, actual travel or live-provider evidence.'},null,2));
  for(const context of contexts)await context.close().catch(()=>{});await browser.close();
}
assert.deepEqual(failures,[],'all FR3 location browser scenarios pass');
assert.deepEqual(errors,[],'no uncaught application errors');
