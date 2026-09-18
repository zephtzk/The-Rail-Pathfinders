import {choosePlannerTime,choosePlannerDate} from './planner-browser-helpers.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4193',out=process.env.CAPTURE_DIR??'test-results/r3';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Singapore'});
const page=await context.newPage(),errors=[],results=[],tileRequests=[],addressRequests=[];
page.on('pageerror',e=>errors.push(e.message));
await context.route('https://tile.openstreetmap.org/**',async route=>{tileRequests.push(route.request().headers());await route.fulfill({status:403,body:'Blocked test tile'});});
await context.route('https://photon.komoot.io/**',async route=>{
  addressRequests.push(route.request().url());
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[103.9886,1.3573]},properties:{name:'Changi Airport',street:'Airport Boulevard',housenumber:'80',postcode:'819642',countrycode:'SG',osm_type:'W',osm_id:12345}}]})});
});
const check=(label,ok)=>{assert.ok(ok,label);results.push(label);console.log('PASS '+label);};
const active=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')));
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-personal-v2')));
async function endpoint(role,query){await page.locator('#'+role).fill(query);await page.locator('#'+role).press('ArrowDown');await page.locator('#'+role).press('Enter');}
async function plan(){await page.locator('.app-nav [data-view=plan]').click();await endpoint('origin','EW2');await endpoint('destination','EW12');await page.locator('[data-time=depart-later]').click();await choosePlannerDate(page,'date','2026-09-21');await choosePlannerTime(page,'departureTime','10:00');await page.locator('#find-routes').click();await page.locator('#review-route').waitFor();}
try {
  const response=await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
  check('app responses preserve a valid origin referrer',response.headers()['referrer-policy']==='strict-origin-when-cross-origin');
  check('seven reachable pages share one map',await page.locator('.app-nav button').count()===7&&await page.locator('.leaflet-container').count()===1);
  await page.locator('#retry-street-map').waitFor();
  check('blocked tiles leave a usable schematic and a deliberate retry',await page.locator('.leaflet-tile').count()===0&&await page.locator('.leaflet-overlay-pane path').count()>0&&tileRequests.length>0);
  check('tile request sends origin only',tileRequests.some(h=>h.referer===base+'/'));
  await page.locator('.app-nav [data-view=current]').click();check('no unsupported connection form before a trip',!await page.locator('#rerouting-host').isVisible());
  await page.locator('#station-tools > summary').click();check('station layout and toilet entry points remain together',await page.locator('#companion-facilities [data-action=layout]').isVisible()&&await page.locator('#companion-facilities [data-action=toilets]').isVisible());await page.locator('#station-tools > summary').click();
  await page.locator('.app-nav [data-view=preferences]').click();check('preference choices omit persona names',!/(Rachel|Arjun|Mdm Lim)/.test(await page.locator('#preferences-content').innerText()));
  await page.locator('[data-preset=arjun]').click();
  await page.locator('.app-nav [data-view=caregiver]').click();check('caregiver controller lives on its own page',await page.locator('#view-caregiver #companion-sharing').isVisible()&&await page.locator('#view-current #companion-sharing').count()===0);
  await page.locator('.app-nav [data-view=spending]').click();check('spending controller lives on its own page',await page.locator('#view-spending #companion-fares').isVisible());
  await page.evaluate(()=>{window.__r3PageIdentity='preserve-me';});await page.locator('#home-plan').click();
  check('home icon returns to Plan without a document reload',await page.evaluate(()=>window.__r3PageIdentity==='preserve-me')&&await page.locator('#view-plan').isVisible());
  await plan();await page.locator('#save-route').click();await page.locator('#save-route-form [name=label]').fill('Work commute');await page.locator('#save-route-form button').click();
  check('save confirms the chosen name and location',await page.locator('#route-save-status').innerText().then(t=>t.includes('Work commute')&&t.includes('View saved routes')));
  await page.locator('#view-saved-route').click();check('one saved route without duplicated manager',await page.locator('.saved-route-card').count()===1&&await page.locator('#pair-add').count()===0);
  check('saving a route does not start a trip or add station bookmarks',(await active())===null&&await page.locator('.personal-list [data-place]').count()===0);
  check('add a place does not ask for coordinates',await page.locator('#place-add input[name=lat], #place-add input[name=lng]').count()===0);
  await page.locator('#app-message').waitFor({state:'hidden'});await page.screenshot({animations:'disabled',path:out+'/saved-mobile.png'});
  await page.locator('[data-open]').click();await page.locator('[data-time=depart-later]').click();await choosePlannerDate(page,'date','2026-09-21');await choosePlannerTime(page,'departureTime','10:00');await page.locator('#find-routes').click();await page.locator('#review-route').click();await page.locator('#start-companion').click();
  const first=await active();check('reopened route retains preferences in the canonical journey',first.plan.preferences.travelStyle==='arjun');
  check('technical trip detail is collapsed by default',!await page.locator('#trip-details').evaluate(el=>el.open));
  check('connection helper explains its purpose',!await page.locator('#rerouting-host').innerText().then(t=>t.includes('Check connections from a confirmed point')));
  await page.locator('#manual-correction').click();check('position correction opens the relevant form',await page.locator('#checkpoint-step').isVisible());
  for(const tab of ['caregiver','spending','saved','preferences','current'])await page.locator(`.app-nav [data-view=${tab}]`).click();
  check('page navigation retains one trip identity and controller',(await active()).id===first.id&&await page.locator('#companion').count()===1);
  await page.locator('#journey-cancel').click();check('cancel requires a clear in-app choice',(await active()).status==='started'&&await page.locator('#confirm-journey-cancel').isVisible());
  await page.locator('#keep-current-trip').click();check('keep trip preserves active guidance',(await active()).status==='started');
  await page.locator('#journey-cancel').click();await page.locator('#app-message').waitFor({state:'hidden'});await page.screenshot({animations:'disabled',path:out+'/cancel-mobile.png'});await page.locator('#confirm-journey-cancel').click();
  const cancelled=await active();check('cancel ends same trip and clears geographic permissions',cancelled.id===first.id&&cancelled.status==='cancelled'&&cancelled.location===null&&!cancelled.permissions.location&&!cancelled.permissions.progress);
  check('cancel is excluded from completed spending',await page.evaluate(()=>!JSON.parse(localStorage.getItem('commute-copilot-expenditure-v2'))?.records?.length));
  check('cancel preserves reusable routes',(await saved()).templates.some(t=>t.label==='Work commute'));
  check('ended trip hides obsolete active tools',await page.locator('#journey-cancel').count()===0&&!await page.locator('#rerouting-host').isVisible()&&!await page.locator('#trip-peek').isVisible());
  await page.locator('#app-message').waitFor({state:'hidden'});await page.screenshot({animations:'disabled',path:out+'/cancelled-mobile.png'});
  await page.reload();await page.locator('#find-routes:not([disabled])').waitFor();await page.locator('.app-nav [data-view=current]').click();check('cancelled state survives reload',(await active()).status==='cancelled');
  await plan();await page.locator('#review-route').click();await page.locator('#start-companion').click();check('a new trip can start after cancellation',(await active()).id!==first.id);
  await page.locator('#app-message').waitFor({state:'hidden'});await page.screenshot({animations:'disabled',path:out+'/current-mobile.png'});
  await page.locator('#journey-finish').click();await page.locator('#retry-fare').click();
  check('completed fare action opens Spending',await page.locator('#view-spending').isVisible());
  const ledger=await page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-expenditure-v2')));check('completed journey is recorded once',ledger.records.length===1);
  await page.locator('#app-message').waitFor({state:'hidden'});await page.screenshot({animations:'disabled',path:out+'/spending-mobile.png'});
  // Every dedicated view must fit narrow screens and larger text.
  await page.setViewportSize({width:320,height:740});await page.addStyleTag({content:'html{font-size:200%}'});
  for(const tab of ['plan','current','saved','caregiver','spending','preferences']){await page.locator(`.app-nav [data-view=${tab}]`).click();check(`${tab} fits 320px at large text`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.locator('#app-message').waitFor({state:'hidden'});await page.screenshot({animations:'disabled',path:out+'/large-text.png'});
  await page.setViewportSize({width:1440,height:960});await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();await page.locator('#app-message').waitFor({state:'hidden'});await page.screenshot({animations:'disabled',path:out+'/plan-desktop.png'});
  check('no runtime errors',errors.length===0);
} finally {await writeFile(out+'/results.json',JSON.stringify({results,errors,tileRequestCount:tileRequests.length,addressRequestCount:addressRequests.length,environment:'Edge desktop mobile/touch emulation; 403 tile fixture; not physical phones'},null,2));await browser.close();}
