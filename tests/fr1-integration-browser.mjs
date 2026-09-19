// Combined FR1 walkthrough using a real packaged timetable route.
// No live-provider success or physical-device behaviour is simulated as evidence.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {choosePlannerDate,choosePlannerTime} from './planner-browser-helpers.mjs';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4227';
const out='test-results/fr1-integration';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,timezoneId:'Asia/Singapore',serviceWorkers:'block',reducedMotion:'reduce'});
await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
const page=await context.newPage(),checks=[],errors=[];
page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
const check=(label,pass)=>{assert.ok(pass,label);checks.push(label);console.log('PASS '+label);};
const nav=view=>page.locator(`.app-nav [data-view=${view}]`).click();
const active=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')));
const accepted=journey=>JSON.stringify({id:journey.id,route:journey.route,progress:journey.progress,preferences:journey.plan.preferences});
const capture=async name=>{await page.locator('#app-message.is-visible').waitFor({state:'hidden'});await page.screenshot({path:`${out}/${name}.png`,animations:'disabled'});};
async function endpoint(role,query){await page.locator('#'+role).fill(query);await page.locator('#'+role).press('ArrowDown');await page.locator('#'+role).press('Enter');}
try{
  await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
  await nav('preferences');
  check('clean browser uses simple guidance',await page.locator('#simple-guidance-toggle').isChecked());
  check('all three style descriptions begin hidden',await page.locator('.style-description').count()===3&&await page.locator('.style-description:visible').count()===0);
  const settings=await page.evaluate(()=>localStorage.getItem('commute-copilot-preferences-v1'));
  await page.locator('[data-style-details]').first().click();
  check('one description opens without selecting a travel style',await page.locator('.style-description:visible').count()===1&&await page.evaluate(()=>localStorage.getItem('commute-copilot-preferences-v1'))===settings);
  await page.locator('[data-style-details]').first().click();await capture('settings-mobile');

  await nav('plan');await endpoint('origin','CC26');await endpoint('destination','EW9');
  await page.locator('[data-time=depart-later]').click();await choosePlannerDate(page,'date','2026-09-21');await choosePlannerTime(page,'departureTime','10:00');
  await page.locator('#find-routes').click();await page.locator('#review-route').click();
  const initial=await active();
  check('actual packaged route starts with simple guidance and an Update action',initial.status==='started'&&await page.getByRole('button',{name:'Update my current step',exact:true}).isVisible());
  await page.getByRole('button',{name:'Update my current step',exact:true}).click();
  const choice=await page.locator('#checkpoint-step option').evaluateAll(options=>options.find(option=>Number(option.value)>0)?.value);
  assert.ok(choice,'the real route has a later checkpoint');
  await page.locator('#checkpoint-step').selectOption(choice);
  check('choosing a later real step requires the tick',accepted(await active())===accepted(initial));
  await page.getByRole('button',{name:'Confirm my current step',exact:true}).click();
  const confirmed=await active();
  check('tick commits the selected canonical step only',confirmed.progress.stepIndex===Number(choice)&&JSON.stringify(confirmed.route)===JSON.stringify(initial.route));
  check('finish wording is exact and staff shortcut was removed from current actions',(await page.locator('#journey-finish').textContent()).trim()==='Finish journey'&&await page.locator('#guidance-staff').count()===0);
  check('route legend is collapsed in the panel instead of overlaying the map',await page.locator('#map-caption .map-route-legend').count()===0&&await page.locator('#route-map-details').isVisible()&&!await page.locator('#route-map-details').evaluate(element=>element.open));
  await page.locator('#journey-sheet-handle').press('Home');await page.getByRole('button',{name:'Update my current step',exact:true}).click();
  await capture('current-trip-mobile');

  await nav('facilities');await page.locator('#nearby-refresh:not([disabled])').waitFor();
  await page.locator('#nearby-manual > summary').click();await page.locator('#nearby-query').fill('Bugis');
  await page.locator('#nearby-suggestions [role=option]').filter({has:page.locator('strong',{hasText:/^Bugis$/i})}).first().click();
  await page.locator('#nearby-results .nf-card').first().waitFor();
  check('Facilities shows real nearby lifts and toilets within the stated radius',await page.locator('#nearby-center').innerText().then(text=>text.includes('1 km'))&&await page.locator('#nearby-results .nf-lift').count()>0&&await page.locator('#nearby-results .nf-toilet').count()>0);
  check('unconfigured maintenance stays explicitly unknown',await page.locator('#nearby-feed').innerText().then(text=>text.includes('not connected'))&&await page.locator('.nf-status-available').count()===0);
  check('facility discovery preserves the accepted route and checkpoint',accepted(await active())===accepted(confirmed));
  await page.locator('#nearby-results .nf-card').first().scrollIntoViewIfNeeded();await capture('facilities-list-mobile');
  await page.locator('#nearby-results [data-nf-map]').first().click();
  check('dedicated facility map is available without replacing journey progress',await page.locator('#nearby-map').isVisible()&&accepted(await active())===accepted(confirmed));
  await capture('facilities-map-mobile');

  for(const size of [{width:390,height:844,name:'mobile'},{width:320,height:900,name:'large-text',text:'200%'},{width:1440,height:960,name:'desktop'}]){
    await page.setViewportSize({width:size.width,height:size.height});await page.evaluate(text=>document.documentElement.style.fontSize=text??'',size.text);
    await nav('current');
    await page.waitForFunction(()=>Math.abs(parseFloat(document.body.style.getPropertyValue('--nav-height'))-document.querySelector('.app-nav').getBoundingClientRect().height)<1);
    const geometry=await page.evaluate(()=>{
      const nav=document.querySelector('.app-nav'),box=nav.getBoundingClientRect(),current=nav.querySelector('[data-view=current]').getBoundingClientRect(),plan=nav.querySelector('[data-view=plan]').getBoundingClientRect();
      return {count:nav.querySelectorAll('[data-view]').length,center:Math.abs(current.x+current.width/2-(box.x+box.width/2)),bigger:current.width>plan.width&&current.height>plan.height,fits:document.documentElement.scrollWidth<=innerWidth+1&&[...nav.querySelectorAll('button')].every(button=>{const r=button.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})};
    });
    check(`all eight destinations fit with Current trip larger and centered: ${size.name}`,geometry.count===8&&geometry.center<1&&geometry.bigger&&geometry.fits);
    if(size.width<=680){await page.locator('#journey-sheet-handle').press('Home');await page.locator('#guidance-primary').scrollIntoViewIfNeeded();}
    await capture(`combined-${size.name}`);
  }
  await page.evaluate(()=>document.documentElement.style.fontSize='');await page.setViewportSize({width:390,height:844});await nav('current');
  await page.locator('#trip-more-actions > summary').click();await page.getByRole('button',{name:'Finish journey',exact:true}).click();
  check('Finish journey still completes the accepted trip',(await active()).status==='completed');
  await nav('staff');check('Staff page remains available after the new current action',await page.locator('#staff-content').isVisible());
  check('combined walkthrough has no browser runtime errors',errors.length===0);
}catch(error){await capture('failure');throw error;}
finally{await writeFile(`${out}/results.json`,JSON.stringify({checks,errors,environment:'Desktop Edge mobile/touch and enlarged-text emulation; actual packaged CC26 to EW9 route on 21 September 2026, 10:00 SGT; blocked street tiles; unconfigured real local maintenance endpoint; no physical-phone verification'},null,2)+'\n');await browser.close();}
