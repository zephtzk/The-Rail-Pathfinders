// Real packaged directory and unconfigured local service first; explicitly
// controlled geolocation/network scenarios follow. Desktop Edge mobile emulation
// is not physical-phone or on-site accessibility verification.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import {makePlan, startJourney} from '../src/journey-v2.js';

const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4233';
const out = 'test-results/pre-fr2-facilities';
await mkdir(out, {recursive: true});
const browser = await chromium.launch({headless: true, executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks = [], errors = [], screenshots = [];
const check = (label, condition) => {assert.ok(condition, label); checks.push(label); console.log('PASS ' + label);};
const storage = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
const cards = page => page.locator('#nearby-results .nf-card');
const nav = (page, view) => page.locator(`.app-nav [data-view="${view}"]`).click();
async function settled(page) {
  await page.locator('#nearby-refresh:not([disabled])').waitFor();
}
async function manualBugis(page) {
  if (!await page.locator('#nearby-manual').evaluate(el => el.open)) await page.locator('#nearby-manual > summary').click();
  await page.locator('#nearby-query').fill('Bugis');
  await page.locator('#nearby-suggestions [role=option]').filter({has: page.locator('strong', {hasText: /^Bugis$/i})}).first().click();
  await cards(page).first().waitFor();
}
async function screenshot(page, name) {
  await page.locator('#app-message').waitFor({state: 'hidden'});
  await page.screenshot({path: `${out}/${name}.png`, animations: 'disabled'});
  screenshots.push(`${name}.png`);
}
async function installLocationHarness(context, journey = null) {
  await context.addInitScript(active => {
    if (active && !sessionStorage.getItem('fr1-facilities-seeded')) {
      localStorage.setItem('commute-copilot-journey-v2', JSON.stringify(active));
      localStorage.setItem('fr1-facilities-test-sentinel', 'Preserve this controlled browser-test record');
      sessionStorage.setItem('fr1-facilities-seeded', 'yes');
    }
    window.facilityGeoCalls = [];
    window.facilityGeoCleared = [];
    Object.defineProperty(navigator, 'geolocation', {configurable: true, value: {
      getCurrentPosition() {throw Error('Facilities must reuse the shared watch');},
      watchPosition(success, failure, options) {window.facilityGeoCalls.push({success, failure, options});return window.facilityGeoCalls.length;},
      clearWatch(id) {window.facilityGeoCleared.push(id);}
    }});
  }, journey);
}
async function pageFor(context, fixedTime = null) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  if (fixedTime) await page.clock.setFixedTime(new Date(fixedTime));
  await page.goto(base);
  await page.locator('#find-routes:not([disabled])').waitFor({timeout: 60000});
  return page;
}

try {
  const realContext = await browser.newContext({viewport: {width: 390, height: 900}, isMobile: true, hasTouch: true, serviceWorkers: 'block'});
  await installLocationHarness(realContext);
  const page = await pageFor(realContext), before = await storage(page);
  await nav(page, 'facilities'); await settled(page);
  check('Facilities is reachable through the main navigation', await page.locator('#view-facilities').isVisible());
  check('Opening Facilities reuses the single location watch started on app load', await page.evaluate(() => window.facilityGeoCalls.length) === 1);
  check('The initial state states the fixed 1 km radius and shared location wait without a redundant locate prompt', /Within 1 km/.test(await page.locator('.nf-intro').innerText()) && /Locating/.test(await page.locator('#nearby-location-message').innerText()) && await page.locator('#nearby-locate').count() === 0);
  check('Actual unconfigured maintenance service is presented honestly', /Live lift maintenance is not connected/.test(await page.locator('#nearby-feed').innerText()));
  await manualBugis(page);
  check('Manual area selection moves keyboard focus out of the collapsed search', await page.evaluate(() => document.activeElement.id === 'nearby-center'));
  const allIds = await cards(page).evaluateAll(nodes => nodes.map(node => node.dataset.facilityId));
  const distances = await page.locator('#nearby-results .nf-kind').allTextContents();
  const metres = distances.map(text => {const match = text.match(/·\s*([\d.]+)\s*(m|km)/); assert.ok(match, `Visible distance: ${text}`); return Number(match[1]) * (match[2] === 'km' ? 1000 : 1);});
  check('Manual Bugis has real listed facilities without another geolocation request', allIds.length > 0 && await page.evaluate(() => window.facilityGeoCalls.length) === 1);
  check('Cards display ascending distances limited to the fixed radius', metres.every((value, index) => value <= 1000 && (!index || value >= metres[index - 1])));
  check('Manual centre and straight-line distance limitations are explicit', /manual search area/.test(await page.locator('#nearby-center').innerText()) && /straight-line/.test(await page.locator('.nf-intro').innerText()));
  check('Real discovery cards never show station fixtures or invented open/operating claims', !/fixture|training/i.test(await page.locator('#nearby-results').innerText()) && !/Reported open|Reported operating|Reported maintenance/.test(await page.locator('#nearby-results').innerText()));
  await page.evaluate(() => document.querySelector('.panel-scroll').scrollTop = 0);
  await screenshot(page, 'real-bugis-mobile');
  await cards(page).first().scrollIntoViewIfNeeded();
  await screenshot(page, 'real-bugis-mobile-list');

  await page.locator('[data-nf-kind=lift]').click();
  check('Lifts filter shows sourced nearby lifts only', await cards(page).count() > 0 && (await page.locator('#nearby-results .nf-kind').allTextContents()).every(text => text.startsWith('Lift')));
  await page.locator('[data-nf-kind=toilet]').click();
  check('Toilets filter shows sourced nearby toilets with unknown availability', await cards(page).count() > 0 && (await page.locator('#nearby-results .nf-kind').allTextContents()).every(text => text.startsWith('Toilet')) && (await page.locator('#nearby-results .nf-status').allTextContents()).every(text => text === 'Availability unknown'));
  const first = cards(page).first();
  await first.locator('summary').click();
  check('Facility details distinguish listing and coordinate sources and dates', await first.locator('details a[href^="https://"]').count() > 1 && /Listing source date:.*Directory checked:/.test(await first.locator('details').innerText()) && /Pin coordinates:.*Coordinate source date:/.test(await first.locator('details').innerText()));
  await page.locator('.nf-coverage > summary').click();
  check('Coverage disclosure states location provenance and toilet/live-maintenance limits', /Location directory checked/.test(await page.locator('.nf-coverage').innerText()) && /has no toilet status/.test(await page.locator('.nf-coverage').innerText()) && await page.locator('.nf-coverage a[href^="https://"]').count() > 0);
  await page.locator('.nf-coverage > summary').click();
  await page.locator('[data-nf-kind=all]').click();
  check('All filter restores the nearest-first directory', JSON.stringify(await cards(page).evaluateAll(nodes => nodes.map(node => node.dataset.facilityId))) === JSON.stringify(allIds));
  check('Mobile Facilities has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  // Only this map case blocks tiles. Real list/source screenshots above did not
  // replace the location directory, maintenance response, or map provider.
  await realContext.route('https://tile.openstreetmap.org/**', route => route.fulfill({status: 403, body: 'Controlled FR1 blocked-tile scenario'}));
  const selectedId = await cards(page).first().getAttribute('data-facility-id');
  await cards(page).first().locator('[data-nf-map]').click();
  await page.waitForFunction(() => document.querySelector('#nearby-map-note')?.textContent.includes('Street map unavailable'));
  check('Map fallback keeps facility pins and warns when street tiles fail', await page.locator('#nearby-map .nf-map-pin').count() === allIds.length && await page.locator('#nearby-map-retry').isVisible());
  check('Show on map preserves selected facility details', await page.locator('#nearby-selected .nf-card').getAttribute('data-facility-id') === selectedId);
  check('Show on map transfers focus to the labelled map', await page.evaluate(() => document.activeElement.id === 'nearby-map'));
  check('Every map marker has a full facility name and distance for screen readers', (await page.locator('#nearby-map .nf-map-pin').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')))).every(label => /^(Lift|Toilet): .+, \d/.test(label)));
  await page.locator('#nearby-map .nf-map-pin').first().focus();
  await page.locator('#nearby-map .nf-map-pin').first().press('Enter');
  check('Keyboard marker selection moves focus to the facility details', await page.evaluate(() => document.querySelector('#nearby-selected').contains(document.activeElement)));
  await screenshot(page, 'controlled-blocked-map-mobile');
  await page.locator('#nearby-selected [data-nf-list]').click();
  check('Show in list returns to and focuses the selected facility', await page.locator('#nearby-results').isVisible() && await page.evaluate(id => document.activeElement?.dataset.facilityId === id, selectedId));

  const countBeforeOffline = await cards(page).count();
  await realContext.setOffline(true);
  await page.waitForFunction(() => document.querySelector('#nearby-feed')?.textContent.startsWith('Offline.'));
  await page.locator('#nearby-refresh').click();
  check('Offline refresh keeps the packaged list and labels availability uncheckable', await cards(page).count() === countBeforeOffline && /Showing packaged locations.*Current availability cannot be checked/.test(await page.locator('#nearby-feed').innerText()));
  await screenshot(page, 'controlled-offline-mobile');
  await realContext.setOffline(false);
  await page.locator('#nearby-refresh').click(); await settled(page);
  assert.deepEqual(await storage(page), before, 'Real Facilities browsing must not mutate localStorage');
  check('Directory browsing, filters, map and offline refresh leave localStorage unchanged', true);

  await page.setViewportSize({width: 1440, height: 960});
  await page.evaluate(() => document.querySelector('.panel-scroll').scrollTop = 0);
  check('Desktop Facilities has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await screenshot(page, 'real-bugis-desktop');
  await page.setViewportSize({width: 320, height: 900});
  await page.addStyleTag({content: 'html{font-size:200%}'});
  check('Narrow enlarged-text Facilities has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('Enlarged facility controls fit each complete label without clipping', await page.locator('.nf-toolbar button').evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth)));
  await page.locator('.nf-toolbar').scrollIntoViewIfNeeded();
  await screenshot(page, 'real-bugis-large-text');
  await realContext.close();

  const realMapContext = await browser.newContext({viewport: {width: 390, height: 900}, isMobile: true, hasTouch: true, serviceWorkers: 'block'});
  const realMapPage = await pageFor(realMapContext);
  await nav(realMapPage, 'facilities'); await settled(realMapPage); await manualBugis(realMapPage);
  await cards(realMapPage).first().locator('[data-nf-map]').click();
  await realMapPage.waitForFunction(() => /Street map with|Street map unavailable/.test(document.querySelector('#nearby-map-note')?.textContent ?? ''), {timeout: 20000});
  check('Unmocked street map settles with either actual tiles or an explicit provider-unavailable state', await realMapPage.locator('#nearby-map .nf-map-pin').count() > 0);
  await screenshot(realMapPage, 'real-bugis-map-mobile');
  await realMapContext.close();

  // Explicitly synthetic accepted-trip record tests isolation only; it is never
  // used for the real-directory screenshot walkthrough above.
  const trip = startJourney(makePlan({origin: {id: 'fr1-test-origin', label: 'Controlled test origin'}, destination: {id: 'fr1-test-destination', label: 'Controlled test destination'}, date: '2026-09-19', departureTime: '10:00', mode: 'replay', route: {id: 'fr1-controlled-trip', steps: [{id: 'fr1-step', text: 'Controlled test instruction', durationSeconds: 120}], departureSeconds: 36000, arrivalSeconds: 36120, walkingSeconds: 120, accessibility: 'fixture', provenance: 'Synthetic browser test fixture; not a real journey'}}));
  const controlled = await browser.newContext({viewport: {width: 390, height: 900}, isMobile: true, hasTouch: true, serviceWorkers: 'block'});
  await controlled.route('https://tile.openstreetmap.org/**', route => route.fulfill({status: 403, body: 'Controlled shared-location blocked-tile scenario'}));
  await installLocationHarness(controlled, trip);
  const testPage = await pageFor(controlled, '2026-09-19T02:00:00Z');
  const tripBefore = await storage(testPage);
  await nav(testPage, 'facilities'); await settled(testPage);
  check('App load starts one bounded fresh location watch before Facilities opens', await testPage.evaluate(() => window.facilityGeoCalls.length === 1 && window.facilityGeoCalls[0].options.maximumAge === 0 && window.facilityGeoCalls[0].options.timeout === 12000));
  await testPage.evaluate(() => window.facilityGeoCalls[0].success({coords: {latitude: 1.3004, longitude: 103.8557, accuracy: 180}, timestamp: Date.now()}));
  check('Low accuracy is labelled and does not establish a current search area', !await testPage.locator('#nearby-center').isVisible() && /low location accuracy/i.test(await testPage.locator('#nearby-location-message').innerText()));
  await testPage.evaluate(() => window.facilityGeoCalls[0].success({coords: {latitude: 1.3004, longitude: 103.8557, accuracy: 15}, timestamp: Date.now()}));
  check('A fresh accurate shared fix automatically populates nearby facilities', await cards(testPage).count() > 0 && /Your approximate device area/.test(await testPage.locator('#nearby-center').innerText()) && await testPage.locator('#nearby-locate').count() === 0);
  await testPage.locator('[data-nf-kind=toilet]').click();
  const focusedFacility = await cards(testPage).first().getAttribute('data-facility-id');
  await cards(testPage).first().locator('summary').click();
  await cards(testPage).first().locator('summary').focus();
  await testPage.evaluate(() => window.facilityGeoCalls[0].success({coords: {latitude: 1.30041, longitude: 103.85571, accuracy: 15}, timestamp: Date.now()}));
  check('Passive fixes preserve facility filters, expanded details and keyboard focus', await testPage.locator('[data-nf-kind=toilet]').getAttribute('aria-pressed') === 'true' && await testPage.evaluate(id => document.activeElement?.closest('[data-facility-id]')?.dataset.facilityId === id && document.activeElement?.closest('details')?.open, focusedFacility));
  const focusedSource = await cards(testPage).first().locator('details a').first().getAttribute('href');
  await cards(testPage).first().locator('details a').first().focus();
  await testPage.evaluate(() => window.facilityGeoCalls[0].success({coords: {latitude: 1.300415, longitude: 103.855715, accuracy: 15}, timestamp: Date.now()}));
  check('A focused facility source link and its open disclosure survive a shared GPS callback', await testPage.evaluate(({id,href}) => document.activeElement?.tagName === 'A' && document.activeElement.getAttribute('href') === href && document.activeElement.closest('[data-facility-id]')?.dataset.facilityId === id && document.activeElement.closest('details')?.open, {id:focusedFacility,href:focusedSource}));
  await testPage.locator('[data-nf-kind=all]').click();
  await cards(testPage).first().locator('[data-nf-map]').click();
  const sharedMapFacility = await testPage.locator('#nearby-selected .nf-card').getAttribute('data-facility-id');
  await testPage.locator('#nearby-map .nf-map-pin').first().focus();
  const focusedMarker = await testPage.locator('#nearby-map .nf-map-pin').first().getAttribute('data-facility-id');
  await testPage.evaluate(() => window.facilityGeoCalls[0].success({coords: {latitude: 1.30042, longitude: 103.85572, accuracy: 15}, timestamp: Date.now()}));
  check('Shared fixes preserve the chosen map facility and marker keyboard focus', await testPage.locator('#nearby-selected .nf-card').getAttribute('data-facility-id') === sharedMapFacility && await testPage.evaluate(id => document.activeElement?.dataset.facilityId === id, focusedMarker));
  await testPage.waitForFunction(() => document.querySelector('#nearby-map-note')?.textContent.includes('Street map unavailable'));
  await screenshot(testPage, 'controlled-shared-location-map-mobile');
  await testPage.locator('#nearby-selected [data-nf-list]').click();
  await testPage.locator('#nearby-manual > summary').click();
  await testPage.locator('#nearby-query').fill('Bug');
  await testPage.evaluate(() => window.facilityGeoCalls[0].success({coords: {latitude: 1.30042, longitude: 103.85572, accuracy: 15}, timestamp: Date.now()}));
  check('A live position update preserves an in-progress manual search', await testPage.locator('#nearby-query').inputValue() === 'Bug' && await testPage.evaluate(() => document.activeElement.id === 'nearby-query') && await testPage.locator('#nearby-suggestions').isVisible());
  await manualBugis(testPage);
  await testPage.evaluate(() => window.facilityGeoCalls[0].success({coords: {latitude: 0, longitude: 0, accuracy: 10}, timestamp: Date.now()}));
  check('A later shared fix cannot replace a manually selected area', (await testPage.locator('#nearby-center strong').innerText()) === 'Bugis' && /manual search area/.test(await testPage.locator('#nearby-center').innerText()));
  await testPage.locator('#nearby-manual > summary').click();
  await testPage.locator('#nearby-device-area').click();
  check('An empty controlled location shows partial-coverage guidance instead of asserting no nearby facilities exist', await cards(testPage).count() === 0 && /partial coverage.*does not mean there are no facilities nearby/.test(await testPage.locator('#nearby-results').innerText()));
  await screenshot(testPage, 'controlled-empty-area-mobile');
  await testPage.clock.setFixedTime(new Date('2026-09-19T02:06:00Z'));
  await nav(testPage, 'plan'); await nav(testPage, 'facilities');
  check('A device search that ages across tabs is labelled as a previous area rather than current position', /Last device search area.*no longer a usable current location estimate/s.test(await testPage.locator('#nearby-center').innerText()) && await testPage.locator('#nearby-locate').count() === 0);
  check('Switching app tabs does not duplicate or stop the shared foreground watch', await testPage.evaluate(() => window.facilityGeoCalls.length === 1 && window.facilityGeoCleared.length === 0));
  await testPage.evaluate(() => window.facilityGeoCalls[0].success({coords: {latitude: 1.3004, longitude: 103.8557, accuracy: 15}, timestamp: Date.now()}));
  check('A new usable shared fix restores the current area automatically', await cards(testPage).count() > 0 && /Your approximate device area/.test(await testPage.locator('#nearby-center strong').innerText()));
  await screenshot(testPage, 'controlled-shared-location-mobile');
  await testPage.evaluate(() => window.facilityGeoCalls[0].failure({code: 1}));
  await nav(testPage, 'plan'); await nav(testPage, 'facilities');
  check('Permission denial offers manual selection and Settings recovery without retrying across tabs', /Location denied.*Settings to retry/i.test(await testPage.locator('#nearby-location-message').innerText()) && await testPage.locator('#nearby-manual > summary').isVisible() && await testPage.evaluate(() => window.facilityGeoCalls.length === 1));
  await manualBugis(testPage);

  let pendingRefresh, refreshReached;
  const refreshArrival = new Promise(resolve => {refreshReached = resolve;});
  await controlled.route('**/api/facilities', route => new Promise(resolve => {pendingRefresh = async () => {await route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Controlled unavailable service'})}); resolve();}; refreshReached();}));
  await testPage.locator('#nearby-refresh').click();
  await testPage.waitForFunction(() => document.querySelector('#nearby-feed')?.textContent.includes('Checking available'));
  check('Refresh shows a disabled loading action and keeps nearby locations visible', await testPage.locator('#nearby-refresh').isDisabled() && await cards(testPage).count() > 0);
  await refreshArrival;
  assert.ok(pendingRefresh, 'Controlled status request reached its HTTP route');
  await pendingRefresh(); await settled(testPage);
  check('Failed refresh gives an attempted time and retry action without erasing the directory', /Maintenance service unavailable.*Attempted.*Try Refresh status/.test(await testPage.locator('#nearby-feed').innerText()) && await cards(testPage).count() > 0);
  await controlled.unroute('**/api/facilities');
  await controlled.route('**/api/facilities', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({schemaVersion: 1, status: 'available', fetchedAt: '2026-09-19T02:06:00Z', records: [{stationCode: 'DT14', liftId: null, status: 'reported-unavailable'}]})}));
  await testPage.locator('#nearby-refresh').click(); await settled(testPage);
  check('Controlled station-only maintenance warns without assigning a specific lift outage', await testPage.locator('#nearby-results .nf-status').filter({hasText: /^Station maintenance notice$/}).count() > 0 && !/Reported maintenance|Reported open|Reported operating/.test(await testPage.locator('#nearby-results').innerText()));
  await controlled.unroute('**/api/facilities');
  await controlled.route('**/api/facilities', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({schemaVersion: 1, status: 'available', fetchedAt: '2026-09-19T01:00:00Z', stale: true, records: []})}));
  await testPage.locator('#nearby-refresh').click(); await settled(testPage);
  check('Stale controlled maintenance responses are dated and never imply operation', /Stale lift-maintenance reports:.*SGT.*No report does not mean a lift is operating/.test(await testPage.locator('#nearby-feed').innerText()) && !/Reported open|Reported operating/.test(await testPage.locator('#nearby-results').innerText()));
  const originalTrip = JSON.parse(tripBefore['commute-copilot-journey-v2']), finalTrip = JSON.parse((await storage(testPage))['commute-copilot-journey-v2']);
  for(const key of ['id','plan','route','status','progress','stops','detour','proposal','sharing'])assert.deepEqual(finalTrip[key], originalTrip[key], `Facilities preserves accepted journey ${key}`);
  for(const key of ['progress','location','paused','revoked'])assert.equal(finalTrip.permissions[key], originalTrip.permissions[key], `Location assistance does not grant caregiver ${key} permission`);
  check('Shared location and Facilities browsing preserve accepted guidance and caregiver consent', true);
  check('All real and controlled browser scenarios have no JavaScript runtime errors', errors.length === 0);
  await controlled.close();
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify({base, checks, errors, screenshots, environment: 'Desktop Edge at 390×900 mobile/touch, 1440×960 desktop and 320 px enlarged-text emulation. No physical-phone or on-site verification.', scenarioNotes: 'Real Bugis directory screenshots use packaged sourced locations and the actual unconfigured local maintenance service. Files prefixed controlled use explicitly simulated geolocation, blocked map tiles, offline mode or unavailable/stale HTTP responses. Accepted-trip preservation uses a labelled synthetic test record.'}, null, 2));
  await browser.close();
}
