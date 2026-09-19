// Empty-field filtering with controlled GPS/address fixtures; no live provider claims.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4250';
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
let searches=0;const errors=[];
const check=(name,ok)=>{assert.ok(ok,name);console.log('PASS '+name);};
await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
await context.route('**/api/address/search',r=>{searches++;return r.fulfill({json:{provider:'onemap',status:'ok',results:[{id:'onemap:fr4-fixture',label:'FR4 public address',address:'FR4 public address',lat:1.31,lng:103.81}]}});});
await context.addInitScript(()=>{
  localStorage.setItem('commute-copilot-location-v2','off');window.fr4Geo=[];
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(success){window.fr4Geo.push(success);return window.fr4Geo.length;},clearWatch(){}}});
});
const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
const labels=role=>page.locator(`#${role}-suggestions [role=option] strong`).allTextContents();
try{
  await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor({state:'attached'});
  for(const role of ['origin','destination']){
    await page.locator('#'+role).click();assert.deepEqual(await labels(role),['My location']);
    await page.locator('#'+role).fill('   ');assert.deepEqual(await labels(role),['My location']);
    await page.locator('#'+role).press('Escape');
  }
  check('empty and whitespace fields offer only My location before places are saved',searches===0&&await page.evaluate(()=>window.fr4Geo.length===0));
  const saved=await page.evaluate(async()=>{
    const {createPersonalStore}=await import('/src/personal.js');const store=createPersonalStore(localStorage);
    store.addPlace({id:'fr4-home',label:'Home fixture',lat:1.3,lng:103.8,sourceId:'manual-coordinate-selection'});
    store.addPlace({id:'fr4-work',label:'Work fixture',lat:1.32,lng:103.82,sourceId:'manual-coordinate-selection'});
    store.saveRoute({label:'Route-only fixture',origin:{id:'fr4-route-origin',label:'Route-only start',lat:1.33,lng:103.83,sourceId:'manual-coordinate-selection'},destination:{id:'fr4-route-end',label:'Route-only end',lat:1.34,lng:103.84,sourceId:'manual-coordinate-selection'}});
    return localStorage.getItem('commute-copilot-personal-v2');
  });
  for(const role of ['origin','destination']){
    await page.locator('#'+role).fill('');assert.deepEqual(await labels(role),['My location','Home fixture','Work fixture']);
    await page.locator('#'+role).fill(' \t ');assert.deepEqual(await labels(role),['My location','Home fixture','Work fixture']);
    await page.locator('#'+role).press('ArrowDown');await page.locator('#'+role).press('ArrowDown');await page.locator('#'+role).press('Enter');
    check(`${role} keyboard selects the saved place below My location`,await page.locator('#'+role).inputValue()==='Home fixture');
    await page.locator('#'+role+'-clear').click();assert.deepEqual(await labels(role),['My location','Home fixture','Work fixture']);
    await page.locator('#'+role).fill('EW12');check(`${role} typed station query restores station matches`,(await labels(role)).includes('Bugis'));
    await page.locator('#'+role).fill('01012');check(`${role} typed bus query restores bus-stop matches`,await page.locator(`#${role}-suggestions`).innerText().then(t=>t.includes('01012')));
    await page.locator('#'+role).press('Escape');
  }
  await page.locator('#origin').fill('FR4 address fixture');await page.locator('#origin-address-search').click();
  await page.locator('#origin-suggestions [data-address-index="0"]').click();await page.locator('#origin-clear').click();
  assert.deepEqual(await labels('origin'),['My location','Home fixture','Work fixture']);
  check('explicit address lookup works but its unsaved result stays out of the empty menu',searches===1);
  await page.locator('#origin').press('ArrowDown');await page.locator('#origin').press('Enter');
  await page.waitForFunction(()=>window.fr4Geo.length===1);
  await page.evaluate(()=>window.fr4Geo[0]({coords:{latitude:1.3,longitude:103.8,accuracy:10},timestamp:Date.now()}));
  await page.waitForFunction(()=>document.querySelector('#origin').value==='My location');
  check('My location still requests and selects a fresh fix with keyboard input',await page.locator('#origin').getAttribute('aria-busy')===null);
  check('search choices preserve saved data and produce no runtime errors',saved===await page.evaluate(()=>localStorage.getItem('commute-copilot-personal-v2'))&&errors.length===0);
}finally{await context.close();await browser.close();}
