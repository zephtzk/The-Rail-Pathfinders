import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4193';
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const page=await context.newPage(),errors=[],tileRequests=[];
const tile='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee8"/></svg>';
let blocked=true;
page.on('pageerror',error=>errors.push(error.message));
await page.route('https://tile.openstreetmap.org/**',async route=>{
  tileRequests.push({url:route.request().url(),headers:await route.request().allHeaders()});
  await route.fulfill({status:blocked?403:200,contentType:'image/svg+xml',headers:{'Access-Control-Allow-Origin':'*'},body:tile});
});
try{
  const response=await page.goto(base+'/?referrer-check=private-test#private-fragment');
  assert.equal(response.headers()['referrer-policy'],'strict-origin-when-cross-origin');
  await page.locator('#find-routes:not([disabled])').waitFor();
  await page.locator('#retry-street-map').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.leaflet-tile').length===0);
  assert.ok(tileRequests.length>0);
  for(const request of tileRequests)assert.equal(request.headers.referer,new URL(base).origin+'/');
  console.log('PASS real browser sends origin-only tile Referer without query or fragment');
  assert.ok(await page.locator('.leaflet-overlay-pane path').count()>0);
  assert.match(await page.locator('#map-caption').innerText(),/Street map unavailable/);
  assert.equal(await page.locator('.leaflet-tile').count(),0);
  console.log('PASS HTTP 403 removes failed base tiles and keeps station/route overlays');
  const rejectedRequests=tileRequests.length;
  await page.waitForTimeout(250);
  assert.equal(tileRequests.length,rejectedRequests);
  blocked=false;
  await page.locator('#retry-street-map').click();
  await page.locator('.leaflet-tile-loaded').first().waitFor();
  assert.equal(await page.locator('#retry-street-map').count(),0);
  assert.ok(tileRequests.length>rejectedRequests);
  console.log('PASS map recovers only after deliberate Retry street map action');
  assert.deepEqual(errors,[]);
  console.log('PASS no map lifecycle browser errors');
}finally{await browser.close();}
