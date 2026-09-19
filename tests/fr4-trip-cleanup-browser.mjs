import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {makePlan,startJourney,JOURNEY_KEY} from '../src/journey-v2.js';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
if(process.env.TEST_SOURCE_OVERLAY==='1')for(const file of ['copilot-ui.js','guidance.css','rerouting-ui.js'])await page.route('**/src/'+file,async route=>route.fulfill({body:await readFile(new URL('../src/'+file,import.meta.url)),contentType:file.endsWith('.css')?'text/css':'text/javascript'}));
const plan=makePlan({origin:{id:'test-a',label:'Test start'},destination:{id:'test-b',label:'Test end'},date:'2026-09-21',departureTime:'10:00',mode:'replay',route:{id:'test',departureSeconds:36000,arrivalSeconds:36120,walkingSeconds:120,steps:[{id:'walk',type:'walk',text:'Walk to test end',durationSeconds:120}]}});
await page.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('commute-copilot-location-v2','off');},{key:JOURNEY_KEY,state:startJourney(plan)});
try{
 await page.goto(process.env.TEST_BASE_URL??'http://127.0.0.1:4260');await page.locator('#find-routes:not([disabled])').waitFor();
 await page.locator('.app-nav [data-view="current"]').click();
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:844});
  const boxes=await page.locator('.trip-actions>button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}}));
  assert.equal(boxes.length,3);assert.ok(boxes.every(b=>Math.abs(b.y-boxes[0].y)<1&&b.height>=44&&b.width>=44));
  assert.ok(boxes.at(-1).x+boxes.at(-1).width<=width);
 }
 assert.equal(await page.locator('#trip-location').count(),0);
 assert.equal(await page.locator('#view-current .service-notices,#r2-manual-correction').count(),0);
 await page.locator('#guidance-primary').click();assert.equal(await page.locator('#checkpoint-step').isVisible(),true);
 await page.locator('#confirm-step').click();
 await page.locator('#journey-pause').click();assert.match(await page.locator('#journey-pause').innerText(),/Resume trip/);
 await page.locator('#journey-pause').click();assert.match(await page.locator('#journey-pause').innerText(),/Pause trip/);
 await page.locator('#journey-cancel').click();assert.equal(await page.locator('#cancel-trip-confirmation').isVisible(),true);
 await page.locator('#keep-current-trip').click();assert.equal(await page.locator('#cancel-trip-confirmation').isVisible(),false);
 await page.setViewportSize({width:320,height:844});await page.locator('.trip-actions').scrollIntoViewIfNeeded();await page.screenshot({path:'../tmp/fr4-trip-cleanup-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS trip actions share one row at 320/390/1440px; removed sections absent; step update, pause/resume and cancellation controls work; no runtime errors.');
}finally{await browser.close();}
