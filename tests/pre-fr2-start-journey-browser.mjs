import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {choosePlannerDate,choosePlannerTime} from './planner-browser-helpers.mjs';
import {createMultimodalRouter} from '../src/multimodal-engine.js';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4235';
const out='test-results/pre-fr2-start-journey-safeguards';
await mkdir(out,{recursive:true});
const packagedNetworks=await Promise.all(['rail-network','bus-network','walking-links'].map(async file=>JSON.parse(await readFile(new URL(`../public/data/${file}.json`,import.meta.url),'utf8'))));
const expectedLocalRoutes=createMultimodalRouter(...packagedNetworks).route({originId:'CC26',destinationId:'EW9',date:'2026-09-21',departureTime:'10:00',timeMode:'depart-later',mode:'mixed',walkingLimitMinutes:40,maxExtraMinutes:15,preference:'fewer-transfers',fareCategory:'senior',stepFree:false}).routes;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks=[],errors=[];
const check=(label,pass)=>{assert.ok(pass,label);checks.push(label);console.log('PASS '+label);};
const active=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')));
const nav=(page,view)=>page.locator(`.app-nav [data-view=${view}]`).click();
async function context(){const c=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Singapore',serviceWorkers:'block',reducedMotion:'reduce'});await c.route('https://tile.openstreetmap.org/**',route=>route.abort());return c;}
async function open(c){const page=await c.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();await page.evaluate(()=>{window.__starts=[];window.addEventListener('copilot:state-changed',e=>{if(e.detail.started)window.__starts.push(e.detail.active.id);});});return page;}
async function endpoint(page,role,query){await page.locator('#'+role).fill(query);await page.locator(`#${role}-suggestions [role=option]`).first().click();}
async function timing(page,date='2026-09-21',time='10:00'){await page.locator('[data-time=depart-later]').click();await choosePlannerDate(page,'date',date);await choosePlannerTime(page,'departureTime',time);}
async function search(page){await page.locator('#find-routes').click();await page.locator('#find-routes:not([disabled])').waitFor();await page.locator('#review-route').waitFor();}
async function plan(page){await nav(page,'plan');await endpoint(page,'origin','CC26');await endpoint(page,'destination','EW9');await timing(page);await search(page);}
async function cancel(page){await nav(page,'current');await page.locator('#journey-cancel').click();await page.locator('#confirm-journey-cancel').click();await nav(page,'plan');}
async function rememberAction(page){await page.evaluate(()=>{window.__obsoleteStart=document.querySelector('#review-route').onclick;});}
async function invokeObsolete(page){await page.evaluate(()=>window.__obsoleteStart());}

let page,providerPage;
try{
  page=await open(await context());
  await page.locator('#destination').fill('EW9');
  await page.evaluate(()=>{document.querySelector('#origin').focus();document.querySelector('#destination').focus();});
  // Exercise the delayed blur callback itself; normal endpoint setup has no wait.
  await page.waitForTimeout(180);
  check('rapid endpoint refocus keeps suggestions open past the earlier blur timeout',await page.locator('#destination-suggestions').isVisible()&&await page.locator('#destination').getAttribute('aria-expanded')==='true'&&await page.evaluate(()=>document.activeElement.id==='destination'));
  const firstDestination=page.locator('#destination-suggestions [role=option]').first(),destinationLabel=await firstDestination.locator('strong').innerText();
  await firstDestination.click();
  await page.evaluate(()=>{document.querySelector('#origin').focus();document.querySelector('#destination').focus();});
  const selectedDestination=await page.locator('#destination').inputValue();
  check('a suggestion remains selectable after rapid refocus without starting a journey',selectedDestination.startsWith(destinationLabel)&&selectedDestination.includes('(EW9)')&&!await page.locator('#destination-suggestions').isVisible()&&await page.locator('#destination').getAttribute('aria-expanded')==='false'&&await active(page)===null);
  await nav(page,'preferences');await page.locator('#simple-guidance-toggle').uncheck();
  await page.locator('[name=fareCategory]').selectOption('senior');await page.locator('[name=preference]').selectOption('fewer-transfers');await page.locator('[name=walkingLimitMinutes]').fill('40');await page.locator('#preferences-form .primary').click();
  await plan(page);
  check('search leaves the route unaccepted and exposes one deliberate Start journey',await active(page)===null&&await page.locator('#review-route').innerText()==='Start journey'&&await page.locator('#start-companion').count()===0);
  check('packaged local route provides an alternative to the suggested itinerary',await page.locator('[data-route]').count()>1);
  await rememberAction(page);await page.locator('[data-route="1"]').click();await invokeObsolete(page);
  check('a detached action for a different option cannot accept the refreshed selection',await active(page)===null&&await page.locator('[data-route="1"]').getAttribute('aria-pressed')==='true'&&(await page.locator('#app-message').innerText()).includes('route has changed'));
  await page.locator('.review-details > summary').click();await page.locator('#route-plan-details > summary').click();
  const details=await page.locator('#route-plan-details').innerText();
  check('fare, accessibility and route sources are available before Start',details.includes('senior')&&details.includes('Accessibility: unknown')&&details.includes('timetable')&&await page.locator('.review-details .transit-timeline').isVisible());
  check('estimate and accessibility limitations accompany the Start action',await page.locator('#route-start-limits').isVisible()&&/estimates.*Indoor paths, accessibility and crowding are not verified/.test(await page.locator('#route-start-limits').innerText()));
  await page.locator('#save-route').click();await page.locator('#save-route-form [name=label]').fill('Direct start regression route');await page.locator('#save-route-form button').click();
  check('Save route works before Start and does not accept a journey',await active(page)===null&&(await page.locator('#route-save-status').innerText()).includes('Saved: Direct start regression route'));
  await page.locator('#review-route').click();
  const first=await active(page);
  check('one Start click accepts the explicitly selected non-default local itinerary',first?.status==='started'&&first.route.id===expectedLocalRoutes[1].id&&first.route.id!==expectedLocalRoutes[0].id&&JSON.stringify(first.routingContext.route.legs)===JSON.stringify(expectedLocalRoutes[1].legs));
  check('direct Start preserves civil timing, preferences and canonical step mapping',first.plan.departureDate==='2026-09-21'&&first.plan.departureTime==='10:00'&&first.plan.timeMode==='depart-later'&&first.plan.preferences.fareCategory==='senior'&&first.plan.preferences.preference==='fewer-transfers'&&first.plan.preferences.walkingLimitMinutes===40&&first.route.steps.length===first.routingContext.route.legs.length);
  check('direct Start leaves sharing off and opens current guidance without a second confirmation',!first.permissions.progress&&!first.permissions.location&&first.sharing===null&&await page.locator('#view-current').isVisible()&&await page.locator('#start-companion').count()===0&&await page.evaluate(()=>window.__starts.length===1));

  await plan(page);
  check('an active trip disables replacement and explains the conflict',await page.locator('#review-route').isDisabled()&&(await page.locator('#route-start-note').innerText()).includes('Finish or cancel'));
  await page.evaluate(()=>document.querySelector('#review-route').onclick());
  check('the start handler itself rejects replacement even when disabled UI is bypassed',(await active(page)).id===first.id&&await page.evaluate(()=>window.__starts.length===1));
  await nav(page,'current');await page.locator('#journey-pause').click();await nav(page,'plan');
  await page.evaluate(()=>document.querySelector('#review-route').onclick());
  check('a paused trip also blocks replacement without changing accepted state',await page.locator('#review-route').isDisabled()&&(await active(page)).status==='paused'&&(await active(page)).id===first.id);
  await cancel(page);
  check('cancelling restores Start for the valid already selected next journey',await page.locator('#review-route').isEnabled()&&await page.locator('#review-route').isVisible());
  await page.evaluate(()=>{const action=document.querySelector('#review-route').onclick;action();action();});
  const second=await active(page);
  check('two synchronous activations accept exactly one new journey',second.status==='started'&&second.id!==first.id&&await page.evaluate(()=>window.__starts.length===2&&new Set(window.__starts).size===2));
  await cancel(page);const cancelled=JSON.stringify(await active(page));

  await plan(page);await rememberAction(page);await page.locator('#destination').fill('unresolved destination');await invokeObsolete(page);
  check('endpoint editing removes Start and rejects a retained obsolete handler',await page.locator('#review-route').count()===0&&JSON.stringify(await active(page))===cancelled);
  await page.locator('#find-routes').click();await page.locator('#find-routes:not([disabled])').waitFor();
  check('incomplete endpoints explain the problem without starting',await page.locator('#review-route').count()===0&&(await page.locator('#planner-status').innerText()).includes('Select a station')&&JSON.stringify(await active(page))===cancelled);
  await plan(page);await rememberAction(page);await choosePlannerDate(page,'date','2026-09-22');await invokeObsolete(page);
  check('changing the civil date invalidates the route and obsolete action',await page.locator('#review-route').count()===0&&JSON.stringify(await active(page))===cancelled);
  await plan(page);await rememberAction(page);await choosePlannerTime(page,'departureTime','10:15');await invokeObsolete(page);
  check('changing departure time invalidates the route and obsolete action',await page.locator('#review-route').count()===0&&JSON.stringify(await active(page))===cancelled);
  await plan(page);await rememberAction(page);await nav(page,'preferences');await page.locator('[name=walkingLimitMinutes]').fill('35');await page.locator('#preferences-form .primary').click();await invokeObsolete(page);await nav(page,'plan');
  check('saving changed preferences invalidates the route and obsolete action',await page.locator('#review-route').count()===0&&JSON.stringify(await active(page))===cancelled);
  await nav(page,'preferences');await page.locator('[name=stepFree]').check();await page.locator('#preferences-form .primary').click();await plan(page);
  check('real unverified step-free options visibly block Start before acceptance',await page.locator('#review-route').isDisabled()&&(await page.locator('#route-start-note').innerText()).includes('no verified continuous step-free path'));
  await page.evaluate(()=>document.querySelector('#review-route').onclick());
  check('the start handler cannot bypass verified step-free requirements',JSON.stringify(await active(page))===cancelled&&await page.evaluate(()=>window.__starts.length===2));

  // A response that ignores cancellation models an already-arriving provider reply.
  // The generation guard must still prevent it from resurrecting an edited route.
  const providerContext=await context();
  await providerContext.grantPermissions(['geolocation']);
  await providerContext.setGeolocation({latitude:1.3005,longitude:103.8,accuracy:8});
  await providerContext.addInitScript(()=>{const fetch=window.fetch.bind(window);window.__addressBodies=0;window.fetch=async(input,init)=>{if(input!=='/api/address/route')return fetch(input,init);const {signal,...rest}=init??{};const response=await fetch(input,rest);await response.clone().text();window.__addressBodies++;return response;};});
  const points={origin:{id:'onemap:1.300000,103.800000',sourceId:'onemap:1.300000,103.800000',label:'Synthetic public origin',address:'Synthetic public start address',lat:1.3,lng:103.8,routingId:null,stationId:null},destination:{id:'onemap:1.321000,103.800000',sourceId:'onemap:1.321000,103.800000',label:'Synthetic public destination',address:'Synthetic public destination address',lat:1.321,lng:103.8,routingId:null,stationId:null}};
  await providerContext.route('**/api/address/search',route=>route.fulfill({json:{provider:'onemap',status:'ok',results:[points[route.request().postDataJSON().query.includes('origin')?'origin':'destination']]}}));
  let hold=true,release,requestSeen;
  const pendingRequest=new Promise(resolve=>requestSeen=resolve),held=new Promise(resolve=>release=resolve),retrievedAt=Date.parse('2026-09-19T02:00:00Z');
  await providerContext.route('**/api/address/route',async route=>{const body=route.request().postDataJSON();if(hold){requestSeen();await held;}const start=Date.parse(`${body.date}T${body.departureTime}:00+08:00`),p=(name,lat)=>({name,lat,lng:103.8}),leg=(mode,a,b,from,to,extra={})=>({mode,startTime:start+a*1000,endTime:start+b*1000,duration:b-a,distance:mode==='WALK'?300:3000,from,to,route:'',headsign:'',geometry:null,...extra});await route.fulfill({json:{provider:'onemap',status:'ok',retrievedAt,itineraries:[{startTime:start,endTime:start+1500000,walkTime:600,legs:[leg('WALK',0,300,p('Synthetic public start address',1.3),p('Example bus stop A',1.301)),leg('BUS',420,1200,p('Example bus stop A',1.301),p('Example bus stop B',1.32),{route:'23A',headsign:'Public terminus'}),leg('WALK',1200,1500,p('Example bus stop B',1.32),p('Synthetic public destination address',1.321))]}]}});});
  providerPage=await open(providerContext);await providerPage.waitForFunction(()=>document.querySelector('#app-location-status')?.dataset.usable==='true');await providerPage.locator('.address-search-disclosure > summary').click();
  async function address(role){await providerPage.locator('#address-role').selectOption(role);await providerPage.locator('#address-query').fill(role+' public test address');await providerPage.locator('#address-search').click();await providerPage.locator('[data-address-index="0"]').click();}
  await address('origin');await providerPage.waitForTimeout(1600);await address('destination');await timing(providerPage);
  await providerPage.locator('#find-routes').click();await pendingRequest;
  check('an in-flight provider search cannot expose Start or accept automatically',await providerPage.locator('#review-route').count()===0&&await active(providerPage)===null);
  await providerPage.locator('#destination').fill('changed while the provider was responding');release();
  await providerPage.waitForFunction(()=>window.__addressBodies===1);await providerPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  check('a delayed successful provider response cannot restore an invalidated route',await providerPage.locator('#review-route').count()===0&&await providerPage.locator('[data-route]').count()===0&&await active(providerPage)===null&&(await providerPage.locator('#planner-status').innerText()).includes('fresh route'));
  hold=false;await providerPage.waitForTimeout(1600);await address('destination');await search(providerPage);
  check('a fresh provider response still waits for explicit Start after stale rejection',await active(providerPage)===null&&await providerPage.locator('#review-route').isEnabled());
  await providerPage.locator('#review-route').click();const external=await active(providerPage);
  check('direct provider Start preserves geometry, source timestamp and canonical instructions',external.route.provider==='onemap'&&external.route.providerRetrievedAt===retrievedAt&&external.route.geometry.length===3&&external.route.steps.length===4&&external.plan.sourceTimes.onemap===retrievedAt&&!external.routingContext&&external.plan.departureDate==='2026-09-21');
  check('provider Start attaches fresh startup location with step zero, one action and caregiver consent off',external.location?.latitude===1.3005&&external.location.longitude===103.8&&external.location.accuracy===8&&Date.now()-external.location.timestamp<=60000&&external.permissions.geolocation==='granted'&&external.progress.stepIndex===0&&external.progress.kind==='unknown'&&external.progress.confirmedAt===null&&await providerPage.evaluate(()=>window.__starts.length===1)&&!external.permissions.progress&&!external.permissions.location&&external.sharing===null&&await providerPage.locator('#view-current').isVisible()&&await providerPage.locator('#start-companion,#enable-local-assistance').count()===0);
  check('no browser runtime errors',errors.length===0);
}catch(error){
  errors.push(error.stack??String(error));
  for(const [label,current]of [['local',page],['provider',providerPage]])if(current)await writeFile(`${out}/${label}-failure-state.json`,JSON.stringify(await current.evaluate(()=>({message:document.querySelector('#app-message')?.textContent,planner:document.querySelector('#planner-status')?.textContent,origin:document.querySelector('#origin')?.value,destination:document.querySelector('#destination')?.value,results:document.querySelector('#route-results')?.innerText,active:localStorage.getItem('commute-copilot-journey-v2')})),null,2));
  throw error;
}finally{
  await writeFile(`${out}/results.json`,JSON.stringify({base,passed:checks.length,checks,errors,environment:'Installed desktop Edge with mobile viewport; packaged local routes and explicitly labelled controlled OneMap response; no physical device claim'},null,2));
  await browser.close();
}
