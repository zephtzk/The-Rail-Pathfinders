import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4253';
const out='test-results/fr3-instruction-cards';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks=[],errors=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
const options={viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Singapore',serviceWorkers:'block',reducedMotion:'reduce'};
async function setup({blockedStorage=false}={}){
  const context=await browser.newContext(options);
  await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
  if(blockedStorage)await context.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Storage blocked','SecurityError');}}));
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
  return {context,page};
}
async function select(page,role,query){await page.locator('#'+role).fill(query);await page.locator(`#${role}-suggestions [data-index="0"]`).click();}
async function endpoints(page){
  await select(page,'origin','EW8');await select(page,'destination','EW12');
  await page.locator('[data-time="depart-later"]').click();
  // Fixed supported timetable date, independent of test execution time.
  await page.evaluate(()=>{const form=document.querySelector('#plan-form');form.elements.date.value='2026-09-21';form.elements.departureTime.value='10:00';form.elements.date.dispatchEvent(new Event('change',{bubbles:true}));});
}
async function plan(page){await page.locator('#find-routes').click();await page.locator('#review-route').waitFor();await page.locator('#find-routes:not([disabled])').waitFor();}
const nav=(page,key)=>page.locator(`.app-nav [data-view="${key}"]`).click();
async function capture(page,name){await page.evaluate(()=>document.querySelector('#app-message')?.classList.remove('is-visible'));await page.screenshot({path:`${out}/${name}.png`});}
try{
  const {context,page}=await setup();await endpoints(page);await plan(page);
  await nav(page,'preferences');
  const travel=page.locator('[data-instruction-card="travel-information"]');
  const travelClose=travel.getByRole('button',{name:'Dismiss travel information for this session',exact:true});
  await travelClose.waitFor();await travelClose.scrollIntoViewIfNeeded();await travelClose.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  check('static instruction has an accessible native close button',await travelClose.getAttribute('type')==='button');
  check('close target is at least 44px and fits top right without covering the heading',await travel.evaluate(card=>{const b=card.querySelector('[data-dismiss-instruction]').getBoundingClientRect(),c=card.getBoundingClientRect(),heading=card.querySelector('h3').getBoundingClientRect();return b.width>=44&&b.height>=44&&b.top>=c.top&&b.top<c.top+12&&b.right<=c.right&&c.right-b.right<12&&heading.right<=b.left-8;}));
  check('keyboard focus has a visible outline',await travelClose.evaluate(button=>getComputedStyle(button).outlineStyle!=='none'));
  await capture(page,'settings-mobile');await travelClose.press('Enter');
  check('keyboard dismissal hides the card and moves focus to its view heading',!await travel.isVisible()&&await page.locator('#preferences-heading').evaluate(heading=>heading===document.activeElement));
  check('dismissal persists under a versioned session key',await page.evaluate(()=>JSON.parse(sessionStorage.getItem('commute-copilot-instruction-dismissals-v1')).includes('travel-information')));
  await page.locator('#preferences-form').getByRole('button',{name:'Save preferences',exact:true}).click();
  check('static travel information stays dismissed after preferences rerender',!await travel.isVisible());
  await nav(page,'saved');await nav(page,'preferences');check('app tab switches retain dismissal',!await travel.isVisible());
  await page.locator('#preferences-form [name="stepFree"]').check();await page.locator('#preferences-form').getByRole('button',{name:'Save preferences',exact:true}).click();
  await nav(page,'plan');await plan(page);const status=page.locator('#planner-status');
  check('active step-free route restriction stays visible without a close button',await status.isVisible()&&/step-free coverage/.test(await status.innerText())&&await status.locator('[data-dismiss-instruction]').count()===0&&await page.locator('#review-route').isDisabled());
  await nav(page,'preferences');await page.locator('#preferences-form [name="stepFree"]').uncheck();await page.locator('#preferences-form').getByRole('button',{name:'Save preferences',exact:true}).click();await nav(page,'plan');
  await select(page,'origin','EW12');await page.locator('#find-routes').click();await page.waitForFunction(()=>document.querySelector('#planner-status').textContent.includes('Choose different'));
  check('routing errors remain visible without generic dismissal',await status.isVisible()&&await status.locator('[data-dismiss-instruction]').count()===0);
  await select(page,'origin','EW8');await plan(page);await page.locator('#review-route').click();await nav(page,'current');
  const indoor=page.locator('#current-summary [data-instruction-card="indoor-guidance"]');
  const indoorClose=indoor.getByRole('button',{name:'Dismiss indoor guidance information for this session',exact:true});await indoorClose.waitFor();
  check('each card has an independent dismissal key',await indoor.isVisible()&&!await travel.isVisible());
  await page.locator('#journey-sheet-handle').press('Home');await indoorClose.scrollIntoViewIfNeeded();await indoorClose.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await capture(page,'current-instruction-mobile');await indoorClose.press('Space');
  check('Space dismisses current-trip static indoor instruction accessibly',!await indoor.isVisible()&&await page.locator('#current-heading').evaluate(heading=>heading===document.activeElement));
  await nav(page,'saved');await nav(page,'current');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('copilot:state-changed',{detail:{active:JSON.parse(localStorage.getItem('commute-copilot-journey-v2'))}})));
  check('current-trip tab and state-refresh rerenders retain indoor dismissal',!await indoor.isVisible());
  await page.getByRole('tab',{name:'Station guide',exact:true}).click();
  check('matching static indoor information stays dismissed on Station guide',!await page.locator('#map-station-page [data-instruction-card="indoor-guidance"]').isVisible());
  check('indoor coverage remains available in the station coverage disclosure',await page.locator('.station-coverage-details > summary').isVisible()&&/awaiting permitted corridor evidence/.test(await page.locator('.station-coverage-details').textContent()));
  await page.getByRole('tab',{name:'Map',exact:true}).click();await page.locator('#journey-sheet-handle').press('Home');await page.locator('#current-summary').scrollIntoViewIfNeeded();await capture(page,'current-dismissed-mobile');
  await page.locator('#station-tools > summary').click();
  const facility=page.locator('#companion-facilities [data-instruction-card="facility-station-coverage"]');await facility.getByRole('button',{name:'Dismiss station coverage information for this session',exact:true}).click();
  await page.locator('#companion-facilities [data-field="station"]').selectOption('payalebar');
  check('static facility coverage remains dismissed after a station rerender',!await facility.isVisible());
  check('facility coverage remains in its source and assistance disclosure',/No complete, independently checked/.test(await page.locator('#companion-facilities .facility-source').textContent()));
  await page.locator('#companion-facilities [data-field="station"]').selectOption('fixture-interchange');
  check('fictional training warning stays visible and has no generic close',await page.locator('#companion-facilities .facility-notice.fixture').isVisible()&&await page.locator('#companion-facilities .facility-notice.fixture [data-dismiss-instruction]').count()===0);
  await page.reload();await page.locator('#find-routes:not([disabled])').waitFor();await nav(page,'current');
  check('current-trip indoor dismissal survives reload',!await page.locator('#current-summary [data-instruction-card="indoor-guidance"]').isVisible());await nav(page,'preferences');
  check('preferences dismissal survives reload',!await travel.isVisible());await context.close();

  const fresh=await setup();await nav(fresh.page,'preferences');
  const freshTravel=fresh.page.locator('[data-instruction-card="travel-information"]');
  const largeClose=freshTravel.getByRole('button',{name:'Dismiss travel information for this session',exact:true});
  check('new browser session shows previously dismissed instructions again',await largeClose.isVisible());
  await fresh.page.setViewportSize({width:320,height:900});await fresh.page.evaluate(()=>document.documentElement.style.fontSize='200%');await fresh.page.locator('#journey-sheet-handle').press('Home');
  await largeClose.scrollIntoViewIfNeeded();await largeClose.focus();await fresh.page.keyboard.press('Tab');await fresh.page.keyboard.press('Shift+Tab');
  check('320px enlarged-text card has no horizontal overflow or heading overlap',await freshTravel.evaluate(card=>{const b=card.querySelector('[data-dismiss-instruction]').getBoundingClientRect();return card.scrollWidth<=card.clientWidth&&document.documentElement.scrollWidth<=innerWidth+1&&(card.querySelector('h3').getBoundingClientRect().top>=b.bottom+8||card.querySelector('h3').getBoundingClientRect().right<=b.left-8);}));
  await capture(fresh.page,'settings-320-large');await largeClose.press('Enter');await fresh.page.evaluate(()=>document.documentElement.style.fontSize='');await fresh.page.setViewportSize(options.viewport);
  await nav(fresh.page,'plan');await endpoints(fresh.page);await plan(fresh.page);await fresh.page.locator('#review-route').click();await nav(fresh.page,'current');check('new session also restores static indoor guidance',await fresh.page.locator('#current-summary').getByRole('button',{name:'Dismiss indoor guidance information for this session',exact:true}).isVisible());await fresh.context.close();

  const blocked=await setup({blockedStorage:true});await nav(blocked.page,'preferences');
  await blocked.page.getByRole('button',{name:'Dismiss travel information for this session',exact:true}).click();await blocked.page.locator('#preferences-form').getByRole('button',{name:'Save preferences',exact:true}).click();await nav(blocked.page,'saved');await nav(blocked.page,'preferences');
  check('blocked sessionStorage falls back safely across tab switches and rerenders',!await blocked.page.locator('[data-instruction-card="travel-information"]').isVisible());
  await blocked.page.evaluate(()=>{const host=document.createElement('div');host.id='instruction-helper-fixture';document.querySelector('#view-preferences').append(host);host.innerHTML='<aside data-instruction-card="travel-information">Repeated static help</aside><p class="notice" role="alert">Important route state</p>';});
  const helper=blocked.page.locator('#instruction-helper-fixture');await blocked.page.waitForFunction(()=>document.querySelector('#instruction-helper-fixture aside').hidden);
  check('new card nodes restore memory dismissal without touching unmarked notices',!await helper.locator('aside').isVisible()&&await helper.locator('.notice').isVisible()&&await helper.locator('.notice button').count()===0);
  await helper.locator('aside').evaluate(card=>card.textContent='Updated static help');await blocked.page.waitForFunction(()=>document.querySelector('#instruction-helper-fixture aside [data-dismiss-instruction]'));
  check('same-node content rerender adds exactly one close button and retains dismissal',await helper.locator('aside [data-dismiss-instruction]').count()===1&&!await helper.locator('aside').isVisible());
  await helper.locator('aside').evaluate(card=>{delete card.dataset.instructionCard;card.textContent='Changed route state';});await blocked.page.waitForFunction(()=>!document.querySelector('#instruction-helper-fixture aside').hidden);
  check('removing explicit instruction classification reveals a reused state card',await helper.locator('aside').isVisible()&&await helper.locator('aside [data-dismiss-instruction]').count()===0);
  await blocked.context.close();check('instruction flows report no browser exceptions',errors.length===0);
  await writeFile(`${out}/results.json`,JSON.stringify({checks,errors,environment:'Installed Edge; mobile/touch and 320px/200% text emulation. sessionStorage tested enabled and blocked.'},null,2));
}finally{await browser.close();}
