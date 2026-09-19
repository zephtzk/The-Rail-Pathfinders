import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4207',out='docs/evidence/r5';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Singapore',serviceWorkers:'block',reducedMotion:'reduce'});
await context.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:403,body:'Controlled fallback'}));
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(label,value)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label);};
try{
  await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
  check('coverage states all 5208 source stops',/5,208/.test(await page.locator('#coverage-copy').textContent()));
  await page.locator('#origin').fill('01349');await page.locator('#origin-suggestions .suggestion-option').first().click();
  check('previously omitted stop is selectable',/01349/.test(await page.locator('#origin').inputValue()));
  await page.locator('#origin-stop-details summary').click();
  check('selected stop retains service directions',await page.locator('#origin-stop-details li').count()>0);
  await page.locator('#destination').fill('27601');await page.locator('#destination-suggestions .suggestion-option').first().click();
  check('directory-only stop remains selectable',/27601/.test(await page.locator('#destination').inputValue()));
  const toggle=page.getByRole('button',{name:'Bus stops',exact:true});
  await toggle.waitFor();check('bus-stop map layer is enabled',await toggle.getAttribute('aria-pressed')==='true');
  // Leaflet ignores a second zoom click while its first 250ms transition runs.
  for(let i=0;i<3&&/Zoom in/.test(await page.locator('.bus-stop-map-control').textContent());i++){
    await page.locator('.leaflet-control-zoom-in').click();await page.waitForTimeout(350);
  }
  await page.waitForFunction(()=>/\d+ stops in this area|nearby/.test(document.querySelector('.bus-stop-map-control [role=status]')?.textContent??''));
  check('map renders neighbourhood stops',! /Zoom in/.test(await page.locator('.bus-stop-map-control').textContent()));
  await toggle.click();check('map stop layer can be hidden',await toggle.getAttribute('aria-pressed')==='false');await toggle.click();
  const separateControls=()=>page.evaluate(()=>{const a=document.querySelector('.bus-stop-map-control').getBoundingClientRect(),b=document.querySelector('#recenter-map').getBoundingClientRect();return a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;});
  check('desktop stop control does not overlap recenter',await separateControls());
  await page.screenshot({path:out+'/island-bus-desktop.png',animations:'disabled'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
  check('mobile layout has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('mobile stop control does not overlap recenter',await separateControls());
  await page.screenshot({path:out+'/island-bus-mobile.png',animations:'disabled'});

  // Exercise actual Canvas hit testing and popup buttons in a controlled map,
  // without changing the application's map state or accepted journey.
  const harness=await context.newPage();
  await harness.goto(base+'/data/application-build.json');
  await harness.setContent('<div id="map" style="width:400px;height:400px"></div><output id="selection"></output>');
  await harness.addStyleTag({url:base+'/vendor/leaflet.css'});await harness.addScriptTag({url:base+'/vendor/leaflet.js'});
  await harness.evaluate(async base=>{
    const {mountBusStopMap}=await import(base+'/src/bus-stop-map.js');
    const map=L.map('map',{zoomControl:false}).setView([1.3,103.8],15);
    mountBusStopMap(map,[{id:'00001',name:'<img src=x onerror=alert(1)>',roadName:'Test road',lat:1.3,lon:103.8}],{onChoose:(role,id)=>document.querySelector('#selection').textContent=role+':'+id});
  },base);
  await harness.locator('#map').click({position:{x:200,y:200}});
  await harness.getByRole('button',{name:'Start here',exact:true}).click();
  check('Canvas stop popup selects a start',await harness.locator('#selection').textContent()==='origin:00001');
  await harness.locator('#map').click({position:{x:200,y:200}});
  check('stop names are rendered as inert text',await harness.locator('.leaflet-popup-content img').count()===0);
  await harness.getByRole('button',{name:'Go here',exact:true}).click();
  check('Canvas stop popup selects a destination',await harness.locator('#selection').textContent()==='destination:00001');
  check('no application browser errors',errors.length===0);
}finally{
  await writeFile(out+'/island-bus-browser.json',JSON.stringify({recordedAt:new Date().toISOString(),evidenceClass:'Desktop Edge with mobile viewport; controlled map fallback and Canvas interaction; not physical-phone or live-provider evidence',checks,errors},null,2)+'\n');
  await browser.close();
}
