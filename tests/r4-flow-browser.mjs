import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {choosePlannerTime,choosePlannerDate} from './planner-browser-helpers.mjs';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4194',out=process.env.CAPTURE_DIR??'test-results/r4-flow';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Singapore',serviceWorkers:'block',reducedMotion:'reduce'});
await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
const page=await context.newPage(),errors=[],checks=[];
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
async function capture(path){await page.locator('#app-message.is-visible').waitFor({state:'hidden'});await page.screenshot({path});}
const active=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')));
const view=async name=>page.locator(`.app-nav [data-view=${name}]`).click();
async function endpoint(role,value){await page.locator('#'+role).fill(value);await page.locator('#'+role).press('ArrowDown');await page.locator('#'+role).press('Enter');}
async function plan(){await view('plan');await endpoint('origin','CC26');await endpoint('destination','EW9');await page.locator('[data-time=depart-later]').click();await choosePlannerDate(page,'date','2026-09-21');await choosePlannerTime(page,'departureTime','10:00');await page.locator('#find-routes').click();await page.locator('#review-route').waitFor();}
try{
 await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
 // This flow uses direct pause/cancel controls; choose full guidance once and retain it on reload.
 await view('preferences');await page.locator('#simple-guidance-toggle').uncheck();await page.locator('[name=fareCategory]').selectOption('senior');await page.locator('[name=preference]').selectOption('fewer-transfers');await page.locator('#preferences-form button').click();
 await plan();
 check('selected route has one explicit Start journey action without duplicate preference editors',await page.locator('#review-route').innerText().then(t=>t.trim()==='Start journey')&&await active()===null&&await page.locator('#need-step-free,#fare-category,#start-companion').count()===0&&!await page.locator('#review-selected').isVisible());
 await page.locator('#route-results > .review-details > summary').click();
 const instructions=await page.locator('#route-results .transit-timeline').innerText();
 check('human timeline retains Circle-to-East West transfer',instructions.includes('Circle Line')&&instructions.includes('East West Line')&&instructions.includes('Buona Vista')&&!/CCL_LOOP|CC26_B|EW21_A|\d+\. access:/.test(instructions));
 await page.locator('#route-plan-details > summary').click();
 check('fare accessibility and sources remain available before starting',await page.locator('#route-plan-details').innerText().then(t=>/fare/i.test(t)&&/accessibility/i.test(t)&&/Preferences:/.test(t)));
 check('toilet and caregiver controls are outside the planner details',await page.locator('#route-results button').allTextContents().then(a=>!a.some(t=>/toilet|recipient/i.test(t))));
 await page.locator('#review-route').scrollIntoViewIfNeeded();await capture(out+'/start-mobile.png');
 await page.locator('#review-route').click();const initial=await active();
 check('selected preferences and canonical leg mapping reach active journey',initial.plan.preferences.fareCategory==='senior'&&initial.route.steps.length===initial.routingContext.route.legs.length);
 check('direct start opens current trip without an extra confirmation',initial.status==='started'&&await page.locator('#view-current').isVisible()&&await page.locator('#start-companion').count()===0&&!await page.locator('#review-companion').isVisible());
 await page.getByRole('button',{name:'Update my current step',exact:true}).click();
 const options=await page.locator('#checkpoint-step option').evaluateAll(nodes=>nodes.map(n=>({value:Number(n.value),label:n.textContent})));
 check('checkpoint display is grouped without raw indices or platform IDs',options.length<initial.route.steps.length&&options.every(o=>!/^\d+\.|CCL_|_(?:A|B)\b|\b(?:access|wait|exit):/.test(o.label)));
 const transferIndex=initial.route.steps.findIndex(s=>s.type==='transfer');
 check('real interchange remains selectable at original index',options.some(o=>o.value===transferIndex&&o.label.includes('Circle Line')&&o.label.includes('East West Line')));
 await page.locator('#checkpoint-step').selectOption(String(transferIndex));await page.locator('#confirm-step').click();
 await page.waitForFunction(()=>document.querySelector('.panel-scroll').scrollTop<3);
 const confirmed=await active();
 check('successful checkpoint focuses current guidance and scrolls the trip sheet',await page.evaluate(()=>document.activeElement.id==='current-summary'&&document.querySelector('.panel-scroll').scrollTop<3&&window.scrollY===0));
 check('checkpoint preserves canonical route and explicit position',confirmed.progress.stepIndex===transferIndex&&confirmed.progress.kind==='checkpoint'&&JSON.stringify(confirmed.route.steps)===JSON.stringify(initial.route.steps)&&JSON.stringify(confirmed.routingContext.route.legs)===JSON.stringify(initial.routingContext.route.legs));
 await page.evaluate(()=>{const select=document.querySelector('#checkpoint-step');select.append(new Option('Invalid test choice','999'));select.value='999';document.querySelector('.panel-scroll').scrollTop=200;document.querySelector('#confirm-step').click();});
 check('failed confirmation leaves checkpoint and scroll unchanged',(await active()).progress.stepIndex===transferIndex&&await page.evaluate(()=>document.querySelector('.panel-scroll').scrollTop)>150);
 await page.locator('#journey-pause').click();check('paused guidance stays human-readable',!/_A|_B|CCL_LOOP/.test(await page.locator('#current-summary').innerText()));await page.locator('#journey-pause').click();
 await page.locator('#trip-details > summary').click();await page.locator('#trip-details .transit-timeline').scrollIntoViewIfNeeded();await capture(out+'/timeline-mobile.png');
 await page.locator('#station-tools > summary').click();
 check('station and toilet tools share one section',await page.locator('#companion-facilities [data-action=layout]').isVisible()&&await page.locator('#companion-facilities [data-action=toilets]').isVisible()&&await page.locator('#map-layout,#map-find-toilet,#prepare-toilet').count()===0);
 await page.locator('#companion-facilities [data-action=toilets]').click();
 check('station limitation is distinct and real toilet directions stay gated',await page.locator('.facility-notice.wip-banner').innerText().then(t=>t.includes('Work in progress'))&&await page.locator('[data-action=accept-detour]').count()===0&&!await page.locator('#companion-facilities').innerText().then(t=>t.includes('Toilets from your confirmed checkpoint')));
 await page.locator('#station-tools').scrollIntoViewIfNeeded();await capture(out+'/station-mobile.png');
 await view('caregiver');await page.locator('#prepare-link').click();await page.locator('[data-copy=invite]').waitFor();
 const session=await page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-pairing-v2')));
 const recipientContext=await browser.newContext({serviceWorkers:'block'});await recipientContext.route('https://tile.openstreetmap.org/**',r=>r.abort());const recipient=await recipientContext.newPage();recipient.on('pageerror',e=>errors.push(e.message));
 await recipient.goto(base+`/#invite=${session.id}.${session.inviteToken}`);await recipient.locator('#shared-view .transit-timeline').waitFor();
 check('shared invitation uses same human timeline',!/_A|_B|CCL_LOOP/.test(await recipient.locator('#shared-view').innerText()));
 await recipient.locator('#accept-invite').click();await recipient.waitForFunction(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2'))?.status==='started');
 check('accepted invitation retains preferences and sharing starts off',await recipient.evaluate(()=>{const a=JSON.parse(localStorage.getItem('commute-copilot-journey-v2'));return a.plan.preferences.fareCategory==='senior'&&!a.permissions.progress&&!a.permissions.location;}));await recipientContext.close();
 await page.reload();await page.locator('#find-routes:not([disabled])').waitFor();await view('current');
 check('reload preserves confirmed canonical index and preferences',(await active()).progress.stepIndex===transferIndex&&(await active()).plan.preferences.fareCategory==='senior');
 await plan();check('new selection cannot start while another trip is active',await page.locator('#review-route').isDisabled()&&await page.locator('#route-start-note').innerText().then(t=>/Finish or cancel/i.test(t))&&(await active()).id===initial.id);
 await page.locator('#swap').click();check('editing endpoints removes the stale Start action and details',await page.locator('#review-route,#route-plan-details').count()===0&&!await page.locator('#review-companion').isVisible());
 await plan();await view('current');await page.locator('#journey-cancel').click();await page.locator('#confirm-journey-cancel').click();await view('plan');check('ending current trip enables Start for the selected next trip',await page.locator('#review-route').isVisible()&&await page.locator('#review-route').isEnabled());
 await page.locator('#review-route').click();check('new start keeps canonical identity distinct',(await active()).id!==initial.id&&(await active()).plan.preferences.fareCategory==='senior');
 for(const size of [{width:1440,height:1000,label:'desktop'},{width:320,height:900,label:'large-text'}]){
  await page.setViewportSize(size);await page.evaluate(large=>document.documentElement.style.fontSize=large?'200%':'',size.label==='large-text');
  for(const screen of ['plan','current','saved','caregiver','spending','preferences']){await view(screen);check(`${screen} fits ${size.label}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await capture(`${out}/${screen}-${size.label}.png`);}
 }
 check('no browser runtime errors',errors.length===0);
 await writeFile(out+'/browser.json',JSON.stringify({checks,passed:checks.length,errors},null,2));
}catch(error){console.log('APP MESSAGE',await page.locator('#app-message').innerText());console.log('SHARE',await page.locator('#companion-sharing').innerText());await page.screenshot({path:out+'/failure.png'});throw error;}finally{await browser.close();}
