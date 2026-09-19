import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.setContent('<!doctype html><html><head></head><body><div id="map" style="height:400px;width:350px"></div><input id="sample"></body></html>');
 await page.addStyleTag({path:'node_modules/leaflet/dist/leaflet.css'});
 await page.addStyleTag({path:'src/app-zoom.css'});
 await page.addScriptTag({path:'node_modules/leaflet/dist/leaflet.js'});
 await page.addScriptTag({type:'module',content:await readFile('src/app-zoom.js','utf8')});
 await page.waitForFunction(()=>document.documentElement.dataset.zoomGuard==='on');
 await page.evaluate(()=>{window.testMap=L.map('map',{zoomAnimation:false}).setView([1.3,103.8],10)});
 const before=await page.evaluate(()=>testMap.getZoom());
 const cancelled=await page.locator('#map').evaluate(el=>!el.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,ctrlKey:true,bubbles:true,cancelable:true,clientX:150,clientY:150})));
 assert.equal(cancelled,true);
 await page.waitForFunction(n=>testMap.getZoom()>n,before);
 const wheelZoom=await page.evaluate(()=>testMap.getZoom());
 await page.locator('.leaflet-control-zoom-in').click();
 assert.equal(await page.evaluate(()=>testMap.getZoom()),wheelZoom+1);
 assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).touchAction),'pan-x pan-y');
 assert.equal(await page.locator('#map').evaluate(el=>getComputedStyle(el).touchAction),'none');
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');
 assert.equal(await page.locator('#sample').evaluate(el=>getComputedStyle(el).fontSize),'32px');
 console.log('PASS real Leaflet Ctrl-wheel + button zoom, fixed page gestures, 200% text enlargement');
}finally{await browser.close()}
