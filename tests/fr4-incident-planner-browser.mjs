import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'Asia/Singapore'});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.TEST_BASE_URL??'http://127.0.0.1:4264');await page.locator('#find-routes:not([disabled])').waitFor();
 for(const [role,value] of [['origin','EW8'],['destination','EW12']]){await page.locator('#'+role).fill(value);await page.locator('#'+role+'-suggestions [data-index="0"]').click();}
 await page.locator('[data-time="depart-later"]').click();
 await page.evaluate(()=>{const f=document.querySelector('#plan-form');f.elements.date.value='2026-09-21';f.elements.departureTime.value='10:00';f.elements.date.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.locator('#find-routes').click();await page.locator('#review-route').waitFor();
 const original=await page.locator('.route-card.is-selected .route-lines').innerText();
 const id=await page.evaluate(async()=>{const m=await import('/src/demo-incidents.js');return m.saveIncident({...m.createIncidentDraft('planned',{date:'2026-09-21'}),scope:'service',from:'',to:'',service:'EW'}).id;});
 await page.waitForFunction(()=>document.querySelector('#planner-status').textContent.includes('Demo incidents active')&&!document.querySelector('#find-routes').disabled);
 assert.ok(await page.locator('.route-card').count());
 assert.notEqual(await page.locator('.route-card.is-selected .route-lines').innerText(),original);
 assert.equal(await page.locator('.route-card .service-badge').filter({hasText:'EW'}).count(),0);
 await page.reload();await page.locator('#find-routes:not([disabled])').waitFor();
 await page.locator('#open-demo').click();
 assert.equal(await page.locator('#demo-choose-saved').evaluate(el=>Math.round(el.getBoundingClientRect().width)),await page.locator('.demo-replay-choice').evaluate(el=>Math.round(el.getBoundingClientRect().width)));
 assert.equal(await page.locator('.demo-log-link').evaluate(el=>getComputedStyle(el).textAlign),'center');
 await page.locator('.demo-close').click();
 for(const [role,value] of [['origin','EW8'],['destination','EW12']]){await page.locator('#'+role).fill(value);await page.locator('#'+role+'-suggestions [data-index="0"]').click();}
 await page.locator('[data-time="depart-later"]').click();await page.evaluate(()=>{const f=document.querySelector('#plan-form');f.elements.date.value='2026-09-21';f.elements.departureTime.value='10:00';f.elements.date.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.locator('#find-routes').click();await page.locator('#review-route').waitFor();
 assert.notEqual(await page.locator('.route-card.is-selected .route-lines').innerText(),original);
 await page.evaluate(async id=>(await import('/src/demo-incidents.js')).resolveIncident(id),id);
 await page.waitForFunction(()=>!document.querySelector('#find-routes').disabled&&!!document.querySelector('#review-route'));
 assert.equal(await page.locator('.route-card.is-selected .route-lines').innerText(),original);
 assert.deepEqual(errors,[]);console.log('PASS saved closure changes planner, persists across reload, resolution restores route, demo controls full-width and centered');
}finally{await browser.close();}
