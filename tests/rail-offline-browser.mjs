import {choosePlannerDate} from './planner-browser-helpers.mjs';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:4173';
const output = process.env.CAPTURE_DIR ?? 'test-results';
await mkdir(output,{recursive:true});
const browser = await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
const page = await context.newPage(), results = [], errors = [];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const buildFiles = ['dist/server/index.js','dist/client/sw.js','dist/client/src/rail-ui.js','dist/client/src/rail-engine.js','dist/client/data/rail-network.json','dist/client/data/rail-manifest.json','tests/rail-offline-browser.mjs'];
const build = {
  sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),
  workingTreeChanges:execFileSync('git',['status','--short'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean),
  files:Object.fromEntries(await Promise.all(buildFiles.map(async path => [path,sha256(await readFile(path))])))
};
const network = JSON.parse(await readFile('dist/client/data/rail-network.json','utf8'));
const manifest = JSON.parse(await readFile('dist/client/data/rail-manifest.json','utf8'));
build.railImportBuildId = manifest.buildId;
const savedGuidance = () => page.evaluate(() => JSON.parse(localStorage.getItem('commute-copilot-rail-guidance-v1')));
const offlineStates = [], offlineResponses = [];
let offlineWindow = false, offlineSearch;
page.on('response',response => { if (offlineWindow) offlineResponses.push({path:new URL(response.url()).pathname,status:response.status(),fromServiceWorker:response.fromServiceWorker()}); });
let liveRequests = 0;
// The rail planner has no live dependencies. Never contact a credentialed adapter in this check.
await context.route('**/api/**',async route => { liveRequests++; await route.fulfill({status:503,body:'Live endpoints are outside this test.'}); });
page.on('pageerror',error => errors.push(error.stack ?? error.message));
const check = (name,passed) => { assert.ok(passed,name); results.push({name,passed:true}); console.log(`PASS ${name}`); };
try {
  for (const path of ['/sw.js','/src/rail-ui.js','/src/rail-engine.js','/data/rail-network.json','/data/rail-manifest.json']) {
    const response = await context.request.get(`${base}${path}`);
    assert.equal(response.status(),200,`served ${path}`);
    assert.equal(sha256(await response.body()),build.files[`dist/client${path}`],`served ${path} matches recorded build`);
  }
  check('served rail assets match recorded tested build and data hashes',true);
  await page.goto(base+'/?legacy=1');
  await page.locator('.route-hero').waitFor({timeout:60000});
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller),{timeout:60000});
  await page.getByLabel('From station').fill('Woodlands');
  await page.getByLabel('To station').fill('Changi Airport');
  await choosePlannerDate(page,'date','2026-09-19');
  await page.locator('[name=deadlineTime]').fill('');
  await page.getByRole('button',{name:'Find rail journeys'}).click();
  await page.getByRole('button',{name:'Save this guidance'}).click();
  const before = await page.locator('.route-hero').innerText();
  const routeId = (await savedGuidance()).route.id;
  check('service worker cached the routing network and manifest',await page.evaluate(async () => Boolean(await caches.match('/data/rail-network.json')) && Boolean(await caches.match('/data/rail-manifest.json'))));
  await context.setOffline(true);
  offlineWindow = true;
  offlineStates.push({stage:'before reload',online:await page.evaluate(() => navigator.onLine)});
  await page.reload();
  await page.locator('.route-hero').waitFor({timeout:60000});
  offlineStates.push({stage:'after reload',online:await page.evaluate(() => navigator.onLine)});
  check('real offline reload preserves chosen scheduled journey',await page.locator('.route-hero').innerText() === before);
  check('offline view is explicitly labelled cached guidance',await page.locator('#connection-state').innerText().then(text => text.includes('Offline')) && await page.locator('#journey').innerText().then(text => text.includes('Saved timetable guidance')));
  check('offline restoration keeps selected journey identity',(await savedGuidance()).route.id === routeId);
  check('offline reload obtains complete network and manifest from service worker', ['/data/rail-network.json','/data/rail-manifest.json'].every(path => offlineResponses.some(response => response.path === path && response.status === 200 && response.fromServiceWorker)));

  // Exercise the real form and submit a different journey after networking has been disabled.
  // No engine import or page state injection is used to produce this result.
  await page.getByLabel('From station').fill('Tampines');
  await page.getByLabel('To station').fill('Bugis');
  await page.locator('[name=departureTime]').fill('08:10');
  await choosePlannerDate(page,'deadlineDate','2026-09-19');
  await page.locator('[name=deadlineTime]').fill('09:00');
  await page.getByRole('button',{name:'Find rail journeys'}).click();
  offlineStates.push({stage:'after new search',online:await page.evaluate(() => navigator.onLine)});
  check('new offline form submission renders the changed origin and destination',await page.locator('.route-hero h2').innerText().then(text => text.includes('Tampines') && text.includes('Bugis') && !text.includes('Woodlands') && !text.includes('Changi Airport')));
  await page.getByRole('button',{name:'Save this guidance'}).click();
  const saved = await savedGuidance(), route = saved.route;
  check('new offline search replaces the previous saved journey identity',route.id !== routeId && saved.input.originId === 'DT32' && saved.input.destinationId === 'DT14' && saved.input.departureTime === '08:10');

  // Independent fixture already checked against the pinned raw GTFS stop_times.txt:
  // EWL_Main_WB_WE_31 leaves EW2_B at 08:17:20, reaches EW12_B at 08:48:20.
  // 08:10 + access120 + wait320 + ride1860 + exit120 = 08:50:20 (2,420 seconds).
  const rawReference = {tripId:'EWL_Main_WB_WE_31',fromStopId:'EW2_B',toStopId:'EW12_B',departureSeconds:29840,arrivalSeconds:31700};
  const referenceTrip = network.trips.find(trip => trip.id === rawReference.tripId);
  assert.equal(referenceTrip.stopTimes.find(stop => stop[0] === rawReference.fromStopId)[2],rawReference.departureSeconds);
  assert.equal(referenceTrip.stopTimes.find(stop => stop[0] === rawReference.toStopId)[1],rawReference.arrivalSeconds);
  const expectedComponents = {accessSeconds:120,waitSeconds:320,rideSeconds:1860,transferSeconds:0,exitSeconds:120};
  for (const [field,value] of Object.entries(expectedComponents)) assert.equal(route[field],value,field);
  assert.equal(route.departureSeconds,29400);
  assert.equal(route.arrivalSeconds,31820);
  assert.equal(route.totalSeconds,2420);
  assert.equal(route.walkingSeconds,240);
  assert.equal(route.totalSeconds,Object.values(expectedComponents).reduce((sum,seconds) => sum + seconds,0));
  assert.equal(route.totalSeconds,route.arrivalSeconds - route.departureSeconds);
  assert.equal(route.totalSeconds,route.legs.reduce((sum,leg) => sum + leg.durationSeconds,0));
  let previous = route.departureSeconds;
  for (const leg of route.legs) {
    assert.equal(leg.startSeconds,previous,'consecutive legs have no unexplained gap or overlap');
    assert.equal(leg.endSeconds - leg.startSeconds,leg.durationSeconds,'leg duration matches its clock times');
    previous = leg.endSeconds;
  }
  assert.equal(previous,route.arrivalSeconds);
  const ride = route.legs.find(leg => leg.type === 'ride');
  assert.equal(ride.tripId,rawReference.tripId);
  assert.equal(ride.fromStopId,rawReference.fromStopId);
  assert.equal(ride.toStopId,rawReference.toStopId);
  assert.equal(ride.startSeconds,rawReference.departureSeconds);
  assert.equal(ride.endSeconds,rawReference.arrivalSeconds);
  assert.ok(route.arrivalSeconds <= 9 * 3600,'station-exit arrival meets submitted deadline');
  assert.ok(route.walkingSeconds <= saved.input.walkingLimitMinutes * 60,'total walking meets submitted limit');
  check('new offline journey arithmetic independently matches source-backed exact timing',true);
  check('offline UI exposes the independently checked arrival and total',await page.locator('.hero-arrival').innerText().then(text => text.includes('08:50:20') && text.includes('40m 20s')) && await page.locator('.arithmetic').innerText().then(text => text.includes('5m 20s') && text.includes('31 min')));
  check('browser remains offline before reload and throughout new calculation',offlineStates.every(state => state.online === false));
  offlineSearch = {input:saved.input,route,rawReference,expectedComponents,offlineStates};
  const newHero = await page.locator('.route-hero').innerText();
  const newSavedText = await page.evaluate(() => localStorage.getItem('commute-copilot-rail-guidance-v1'));
  await page.locator('.route-hero').scrollIntoViewIfNeeded();
  if(!process.env.SKIP_CAPTURES) await page.screenshot({path:`${output}/rail-real-offline.png`});
  offlineWindow = false;
  await context.setOffline(false);
  await page.waitForFunction(() => document.querySelector('#connection-state').textContent === '');
  check('reconnection preserves the new selected guidance and saved snapshot',await page.locator('.route-hero').innerText() === newHero && await page.evaluate(() => navigator.onLine) && await page.evaluate(() => localStorage.getItem('commute-copilot-rail-guidance-v1')) === newSavedText);
  await page.reload();
  await page.locator('.route-hero').waitFor({timeout:60000});
  check('online reload restores the journey selected and saved while offline',await page.locator('.route-hero').innerText() === newHero && (await savedGuidance()).route.id === route.id && await page.locator('#journey').innerText().then(text => text.includes('Saved timetable guidance')));
  check('rail planner never requests the live adapter',liveRequests === 0);
  check('no offline browser exceptions',errors.length === 0);
  await writeFile(`${output}/rail-offline-results.json`,JSON.stringify({timestamp:new Date().toISOString(),base,browser:browser.version(),platform:process.platform,emulationOnly:true,physicalDeviceTested:false,realBrowserOffline:true,build,offlineSearch,offlineResponses,liveRequests,results,errors},null,2));
  console.log(`PASS ${results.length} rail offline browser checks.`);
} catch(error) {
  await page.screenshot({path:`${output}/rail-offline-failure.png`,fullPage:true});
  await writeFile(`${output}/rail-offline-failure.json`,JSON.stringify({timestamp:new Date().toISOString(),error:error.stack,build,offlineSearch,offlineStates,offlineResponses,results,errors},null,2));
  throw error;
} finally { await browser.close(); }
