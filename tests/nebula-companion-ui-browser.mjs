import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startCompanionFixture } from './nebula-companion-ui-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.env.NEBULA_UI_SCREENSHOT_DIR || path.join(root, '../nebula-companion-ui-evidence'));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || (existsSync(edge) ? edge : undefined);
const destinationNames = {
  disruptions: 'Disruptions', facilities: 'Facilities', caregiver: 'Caregiver', spending: 'Spending', staff: 'Show to staff',
};
const results = [];
const screenshots = [];
const action = (page, name) => page.locator(`.nebula-companion [data-nebula-action="${name}"]`);
const state = page => page.evaluate(() => fixture.api.getState());
const eventually = (page, predicate, argument) => page.waitForFunction(predicate, argument, { timeout: 5000 });
const check = async (name, callback) => { await callback(); results.push(name); console.log(`PASS ${name}`); };
let browser;
let context;
let fixture;

await mkdir(output, { recursive: true });
try {
  fixture = await startCompanionFixture();
  browser = await chromium.launch({ headless: true, executablePath });
  // A disposable context cannot inherit production storage, cookies or service workers.
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const failures = [];
  const requests = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto(fixture.origin);
  await eventually(page, () => !!window.fixture);
  const capture = async name => {
    const filename = path.join(output, `${name}.png`);
    await page.screenshot({ path: filename, fullPage: false });
    screenshots.push(filename);
  };
  const open = async () => {
    if (!(await state(page)).expanded) await action(page, 'toggle').click();
    assert.equal((await state(page)).expanded, true);
  };

  await check('explicit storage key; synchronous Settings API and immediate subscription', async () => {
    assert.deepEqual(await page.evaluate(() => Object.keys(fixture.api).filter(key => ['update','destroy','getState','setEnabled','setDock','subscribe'].includes(key)).sort()), ['destroy','getState','setDock','setEnabled','subscribe','update']);
    assert.equal((await state(page)).enabled, true);
    assert.equal(await page.locator('#enabled-setting').isChecked(), true);
    assert.equal(await page.evaluate(() => fixture.snapshots.length > 0), true);
    assert.equal(await page.evaluate(() => {
      try { fixture.mountNebulaCompanion({ host: document.createElement('div'), onNavigate() {} }); return false; }
      catch { return true; }
    }), true, 'Mount must require an injected namespace instead of owning a production key');
    await page.evaluate(() => localStorage.setItem('fixture-unrelated-sentinel', 'keep'));
  });

  await check('five visible labelled icon controls invoke allowlisted destinations and collapse', async () => {
    for (const [destination, label] of Object.entries(destinationNames)) {
      await open();
      const button = action(page, destination);
      assert.equal(await button.isVisible(), true);
      assert.ok((await button.innerText()).includes(label), `Visible label missing for ${destination}`);
      assert.equal(await page.getByRole('button', { name: label, exact: true }).count(), 1, `Accessible name missing for ${destination}`);
      assert.equal(await button.getAttribute('type'), 'button');
      const size = await button.boundingBox();
      assert.ok(size.width >= 43 && size.height >= 43, `${destination} needs an approximately 44px target`);
      await button.click();
      assert.equal((await state(page)).expanded, false);
    }
    assert.deepEqual(await page.evaluate(() => fixture.navigations), Object.keys(destinationNames));
    assert.equal(await page.evaluate(() => localStorage.getItem('fixture-unrelated-sentinel')), 'keep');
  });

  await check('keyboard open, Escape collapse and focus return without consuming app inputs', async () => {
    await action(page, 'toggle').focus();
    await page.keyboard.press('Enter');
    assert.equal((await state(page)).expanded, true);
    assert.equal(await action(page, 'disruptions').evaluate(el => el === document.activeElement), true, 'Keyboard opening should focus the first action');
    await action(page, 'facilities').focus();
    await page.keyboard.press('Escape');
    assert.equal((await state(page)).expanded, false);
    assert.equal(await action(page, 'toggle').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('#app-button').evaluate(el => !el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))), false);
    assert.equal(await page.locator('#app-button').evaluate(el => !el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))), false);
  });

  await check('persistent off and discoverable re-enable synchronize Settings in both directions', async () => {
    await open();
    await action(page, 'disable').click();
    assert.equal((await state(page)).enabled, false);
    assert.equal(await page.locator('#enabled-setting').isChecked(), false);
    assert.equal(await action(page, 'enable').isVisible(), true);
    assert.match(await action(page, 'enable').innerText(), /Enable Nebula/i);
    await capture('mobile-disabled');
    await page.reload();
    await eventually(page, () => !!window.fixture);
    assert.equal((await state(page)).enabled, false);
    await action(page, 'enable').click();
    assert.equal(await page.locator('#enabled-setting').isChecked(), true);
    await page.locator('#enabled-setting').uncheck();
    assert.equal((await state(page)).enabled, false);
    await page.locator('#enabled-setting').check();
    assert.equal(await action(page, 'toggle').isVisible(), true);
    await page.evaluate(() => fixture.api.setDock('left'));
    assert.equal((await state(page)).dock, 'left');
    await page.reload();
    await eventually(page, () => !!window.fixture);
    assert.equal((await state(page)).dock, 'left');
    await page.evaluate(() => fixture.api.setDock('right'));
  });

  await check('cross-tab Settings changes preserve focus on a reachable control', async () => {
    const otherPage = await context.newPage();
    await otherPage.goto(fixture.origin);
    await eventually(otherPage, () => !!window.fixture);
    await open();
    await action(page, 'facilities').focus();
    await otherPage.evaluate(() => fixture.api.setEnabled(false));
    await eventually(page, () => fixture.api.getState().enabled === false);
    assert.equal(await action(page, 'enable').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('#enabled-setting').isChecked(), false);
    await action(page, 'enable').click();
    await eventually(otherPage, () => fixture.api.getState().enabled === true);
    await otherPage.close();
  });

  await check('notice updates distinguish demo/stale and dismissal stays local to that evidence', async () => {
    const notice = page.locator('.nebula-companion__notice');
    await page.evaluate(() => fixture.api.update({ notice: { label: 'Sample lift closure', severity: 'warning', source: 'demo' } }));
    assert.match(await notice.innerText(), /demo/i);
    assert.match(await notice.innerText(), /Sample lift closure/);
    await capture('mobile-demo-notice');
    await action(page, 'dismiss').click();
    assert.equal(await notice.isVisible(), false);
    await page.evaluate(() => fixture.api.update({ notice: { label: 'Sample lift closure', severity: 'warning', source: 'demo' } }));
    assert.equal(await notice.isVisible(), false, 'The same notice should stay dismissed');
    await page.evaluate(() => fixture.api.update({ notice: { label: 'Earlier service update', severity: 'info', source: 'stale' } }));
    assert.match(await notice.innerText(), /stale|earlier|out.of.date/i);
    assert.match(await notice.innerText(), /Earlier service update/);
    await capture('mobile-stale-notice');
    await page.evaluate(() => fixture.api.update({ notice: { label: 'Synthetic live-source test', severity: 'info', source: 'live' } }));
    assert.match(await notice.innerText(), /Synthetic live-source test/);
    await page.evaluate(() => fixture.api.update({ notice: null }));
    assert.equal(await notice.isVisible(), false);
  });

  await check('recipient suppression, keyboard and dialog exclusion preserve enabled preference', async () => {
    const rootLocator = page.locator('.nebula-companion');
    for (const flag of ['suppressed', 'keyboardOpen', 'dialogOpen']) {
      await page.evaluate(flag => fixture.api.update({ [flag]: true }), flag);
      assert.equal(await rootLocator.isVisible(), false, flag);
      assert.equal((await state(page)).enabled, true);
      await page.evaluate(flag => fixture.api.update({ [flag]: false }), flag);
      assert.equal(await action(page, 'toggle').isVisible(), true, flag);
    }
    await page.locator('#typing-input').focus();
    await eventually(page, () => !document.querySelector('.nebula-companion')?.getClientRects().length);
    await page.locator('#app-button').focus();
    await eventually(page, () => !!document.querySelector('.nebula-companion')?.getClientRects().length);
    await page.evaluate(() => document.querySelector('#fixture-dialog').showModal());
    await eventually(page, () => !document.querySelector('.nebula-companion')?.getClientRects().length);
    await page.locator('#close-dialog').click();
    await eventually(page, () => !!document.querySelector('.nebula-companion')?.getClientRects().length);
  });

  await check('small, landscape, 80% and 200% text layouts keep controls reachable above bottom navigation', async () => {
    for (const [name, width, height, scale, dock] of [
      ['mobile-expanded', 390, 844, 100, 'right'],
      ['small-left', 320, 568, 100, 'left'],
      ['landscape', 844, 390, 100, 'right'],
      ['small-text-200', 320, 568, 200, 'right'],
      ['landscape-text-200', 667, 375, 200, 'left'],
      ['mobile-text-80', 390, 844, 80, 'right'],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(({ scale, dock }) => { document.documentElement.style.fontSize = `${scale}%`; fixture.api.setDock(dock); }, { scale, dock });
      await open();
      await page.locator('.nebula-companion__shelf').evaluate(el => { el.scrollTop = 0; });
      await capture(name);
      for (const destination of [...Object.keys(destinationNames), 'dock', 'disable']) {
        const button = action(page, destination);
        await button.scrollIntoViewIfNeeded();
        const box = await button.boundingBox();
        assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1 && box.y >= -1 && box.y + box.height <= height - 63, `${name} ${destination} outside usable viewport: ${JSON.stringify(box)}`);
        assert.ok(box.width >= 43 && box.height >= 43, `${name} ${destination} touch target shrank`);
        assert.equal(await button.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1), true, `${name} ${destination} label clipped`);
      }
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(horizontalOverflow, false, `${name} created horizontal page overflow`);
      if (scale === 200) await capture(`${name}-preferences`);
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '100%'; window.scrollTo(0, 0); });
    await page.mouse.move(30, 300);
    await page.mouse.wheel(0, 300);
    await eventually(page, () => window.scrollY > 0);
  });

  await check('isolated origin makes no provider, sharing or service-worker requests', async () => {
    assert.equal(requests.every(url => url.startsWith(`${fixture.origin}/`)), true);
    assert.equal(requests.some(url => /\/api\/|service.worker|sw\.js/.test(url)), false);
    assert.equal(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(x => x.length)), 0);
    assert.deepEqual(failures, []);
  });

  await check('unsubscribe and destroy remove listeners/UI and safely stop updates', async () => {
    await page.evaluate(() => fixture.unsubscribe());
    const before = await page.evaluate(() => fixture.snapshots.length);
    await page.evaluate(() => fixture.api.setEnabled(false));
    assert.equal(await page.evaluate(() => fixture.snapshots.length), before);
    await page.evaluate(() => fixture.api.destroy());
    assert.equal(await page.locator('.nebula-companion').count(), 0);
    assert.deepEqual(await page.evaluate(() => fixture.activeListeners()), []);
    await page.evaluate(() => {
      fixture.api.destroy();
      fixture.api.update({ notice: { label: 'After destruction', source: 'demo', severity: 'info' } });
      window.dispatchEvent(new Event('resize'));
      document.querySelector('#typing-input').focus();
      document.querySelector('#typing-input').blur();
    });
    assert.equal(await page.locator('.nebula-companion').count(), 0);
    assert.deepEqual(failures, []);
  });

  await check('blocked storage reads and quota-limited writes fall back to usable session state', async () => {
    for (const failure of ['read', 'write']) {
      const fallback = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      try {
        await fallback.addInitScript(failure => {
          if (failure === 'read') Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Disabled for synthetic fixture', 'SecurityError'); } });
          else Storage.prototype.setItem = () => { throw new DOMException('Synthetic quota limit', 'QuotaExceededError'); };
        }, failure);
        const fallbackPage = await fallback.newPage();
        const fallbackErrors = [];
        fallbackPage.on('pageerror', error => fallbackErrors.push(error.message));
        await fallbackPage.goto(fixture.origin);
        await eventually(fallbackPage, () => !!window.fixture);
        if (failure === 'read') assert.equal((await state(fallbackPage)).persistent, false);
        await fallbackPage.evaluate(() => fixture.api.setEnabled(false));
        assert.equal((await state(fallbackPage)).persistent, false, `${failure} failure must be reported to Settings`);
        assert.equal(await action(fallbackPage, 'enable').isVisible(), true);
        await action(fallbackPage, 'enable').click();
        assert.equal((await state(fallbackPage)).enabled, true);
        await fallbackPage.evaluate(() => fixture.api.setDock('left'));
        assert.equal((await state(fallbackPage)).dock, 'left');
        assert.deepEqual(fallbackErrors, []);
      } finally { await fallback.close(); }
    }
  });

  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: results.length, checks: results, screenshots, origin: fixture.origin, syntheticOnly: true }, null, 2));
  console.log(`PASS ${results.length} companion UI groups. Screenshots: ${output}`);
} catch (error) {
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: results.length, checks: results, screenshots, error: error.stack }, null, 2));
  throw error;
} finally {
  await context?.close();
  await browser?.close();
  await fixture?.close();
}
