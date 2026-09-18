import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:4173';
const output = process.env.CAPTURE_DIR ?? 'test-results';
await mkdir(output,{recursive:true});
const browser = await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
const page = await context.newPage(), results = [], errors = [];
let liveRequests = 0;
// The rail planner has no live dependencies. Never contact a credentialed adapter in this check.
await context.route('**/api/**',async route => { liveRequests++; await route.fulfill({status:503,body:'Live endpoints are outside this test.'}); });
page.on('pageerror',error => errors.push(error.stack ?? error.message));
const check = (name,passed) => { assert.ok(passed,name); results.push({name,passed:true}); console.log(`PASS ${name}`); };
try {
  await page.goto(base);
  await page.locator('.route-hero').waitFor({timeout:60000});
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller),{timeout:60000});
  await page.getByLabel('From station').fill('Woodlands');
  await page.getByLabel('To station').fill('Changi Airport');
  await page.locator('[name=date]').fill('2026-09-19');
  await page.locator('[name=deadlineTime]').fill('');
  await page.getByRole('button',{name:'Find rail journeys'}).click();
  await page.getByRole('button',{name:'Save this guidance'}).click();
  const before = await page.locator('.route-hero').innerText();
  const routeId = await page.evaluate(() => JSON.parse(localStorage.getItem('commute-copilot-rail-guidance-v1')).route.id);
  check('service worker cached the routing network and manifest',await page.evaluate(async () => Boolean(await caches.match('/data/rail-network.json')) && Boolean(await caches.match('/data/rail-manifest.json'))));
  await context.setOffline(true);
  await page.reload();
  await page.locator('.route-hero').waitFor({timeout:60000});
  check('real offline reload preserves chosen scheduled journey',await page.locator('.route-hero').innerText() === before);
  check('offline view is explicitly labelled cached guidance',await page.locator('#connection-state').innerText().then(text => text.includes('Offline')) && await page.locator('#journey').innerText().then(text => text.includes('Saved timetable guidance')));
  check('full cached validated network supports offline station search',await page.getByRole('button',{name:'Find rail journeys'}).isEnabled());
  check('offline restoration keeps selected journey identity',await page.evaluate(() => JSON.parse(localStorage.getItem('commute-copilot-rail-guidance-v1')).route.id) === routeId);
  await page.locator('.route-hero').scrollIntoViewIfNeeded();
  if(!process.env.SKIP_CAPTURES) await page.screenshot({path:`${output}/rail-real-offline.png`});
  await context.setOffline(false);
  await page.waitForFunction(() => document.querySelector('#connection-state').textContent === '');
  check('reconnection preserves selected journey',await page.locator('.route-hero').innerText() === before);
  check('rail planner never requests the live adapter',liveRequests === 0);
  check('no offline browser exceptions',errors.length === 0);
  await writeFile(`${output}/rail-offline-results.json`,JSON.stringify({timestamp:new Date().toISOString(),browser:browser.version(),emulationOnly:true,realBrowserOffline:true,results,errors},null,2));
  console.log(`PASS ${results.length} rail offline browser checks.`);
} catch(error) {
  await page.screenshot({path:`${output}/rail-offline-failure.png`,fullPage:true});
  throw error;
} finally { await browser.close(); }
