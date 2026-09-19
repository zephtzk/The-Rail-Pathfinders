import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {makePlan,startJourney,JOURNEY_KEY} from '../src/journey-v2.js';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
const plan=makePlan({origin:{id:'test-a',label:'Test start'},destination:{id:'test-b',label:'Test end'},date:'2026-09-21',departureTime:'10:00',mode:'replay',route:{id:'test',departureSeconds:36000,arrivalSeconds:36120,walkingSeconds:120,steps:[{id:'walk',type:'walk',text:'Walk to test end',durationSeconds:120}]}});
await page.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('commute-copilot-location-v2','off');},{key:JOURNEY_KEY,state:startJourney(plan)});
try{
  await page.goto(process.env.TEST_BASE_URL??'http://127.0.0.1:4260');await page.locator('#find-routes:not([disabled])').waitFor();
  assert.equal(await page.locator('.map-view-caption').innerText(),'Map View');
  await page.locator('.app-nav [data-view="current"]').click();
  for(const id of ['journey-finish','journey-pause','journey-cancel'])assert.equal(await page.locator('#'+id+' svg').count(),1);
  assert.equal(await page.locator('.trip-actions').evaluate(el=>getComputedStyle(el).justifyContent),'center');
  await page.locator('#journey-pause').click();assert.equal(await page.locator('#journey-pause .icon-play').count(),1);
  assert.match(await page.locator('#journey-pause').innerText(),/Resume trip/);
  await page.screenshot({path:'../tmp/fr4-trip-actions.png'});
  console.log('PASS Map View caption, three action icons, centered controls, and Resume icon');
}finally{await browser.close();}
