// Controlled accepted-journey fixtures exercise the production staff controls.
// Desktop Edge emulation only; this is pre-FR2 implementation verification.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4232';
const out=process.env.CAPTURE_DIR??'docs/evidence/pre-fr2-staff-tick';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks=[],errors=[],sharingRequests=[],mutations=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
let page;
try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',timezoneId:'Asia/Singapore',reducedMotion:'reduce'});
  await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
  page=await context.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{
    if(new URL(request.url()).pathname.startsWith('/api/shares'))sharingRequests.push(`${request.method()} ${request.url()}`);
    if(!['GET','HEAD','OPTIONS'].includes(request.method()))mutations.push(`${request.method()} ${request.url()}`);
  });
  const nav=key=>page.locator(`.app-nav [data-view="${key}"]`).click();
  const ready=()=>page.locator('#find-routes:not([disabled])').waitFor();
  const request=()=>page.getByLabel('Message to show',{exact:true});
  const tick=()=>page.getByRole('button',{name:'Use my current instruction',exact:true});
  const staffText=()=>page.locator('#staff-content .staff-card-message').innerText();
  const active=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')));
  const snapshot=async()=>JSON.stringify(await active());
  // The existing hidden-document handler legitimately stops local geolocation.
  const refreshSnapshot=async()=>{const state=await active();return JSON.stringify({...state,permissions:{...state.permissions,geolocation:'stopped'}});};
  const capture=async name=>{
    await tick().scrollIntoViewIfNeeded();
    await page.evaluate(()=>document.querySelector('#app-message').classList.remove('is-visible'));
    await page.screenshot({path:`${out}/${name}.png`});
  };
  const refresh=kind=>page.evaluate(kind=>{
    if(kind==='online'||kind==='offline')window.dispatchEvent(new Event(kind));
    else{
      Object.defineProperty(document,'hidden',{configurable:true,value:kind==='hidden'});
      document.dispatchEvent(new Event('visibilitychange'));
      if(kind==='visible')delete document.hidden;
    }
  },kind);
  async function seed(simple){
    await page.goto(base+'/pre-fr2-staff-synthetic-setup');
    await page.evaluate(async simple=>{
      const m=await import('/src/journey-v2.js');
      const steps=[
        {id:'access',type:'access',text:'Synthetic access at Bugis',fromStopId:'DT14_A',toStopId:'DT14_A',durationSeconds:60},
        {id:'wait',type:'wait',text:'Synthetic wait at Bugis',fromStopId:'DT14_A',toStopId:'DT14_A',durationSeconds:30},
        {id:'ride',type:'ride',text:'Synthetic Downtown Line ride',fromStopId:'DT14_A',toStopId:'DT15_A',durationSeconds:420,source:{mode:'rail',routeId:'DTL'}},
        {id:'exit',type:'exit',text:'Synthetic exit at Promenade',fromStopId:'DT15_A',toStopId:'DT15_A',durationSeconds:60},
      ];
      const plan=m.makePlan({origin:{id:'DT14_A',label:'Synthetic fixture · Bugis'},destination:{id:'DT15_A',label:'Synthetic fixture · Promenade'},date:'2026-09-21',departureTime:'10:00',mode:'replay',preferences:{stepFree:false,walkingLimitMinutes:30},route:{id:'pre-fr2-staff-synthetic-route',departureSeconds:36000,arrivalSeconds:36570,walkingSeconds:120,accessibility:'fixture',provenance:'Synthetic staff-card browser fixture; not a real journey',steps}});
      if(simple===null)localStorage.removeItem('commute-copilot-presentation-v1');
      else localStorage.setItem('commute-copilot-presentation-v1',JSON.stringify({schemaVersion:1,simpleGuidance:simple}));
      if(!m.saveActive(localStorage,m.startJourney(plan)))throw Error('Failed to save synthetic staff-card fixture');
    },simple??null);
    await page.goto(base);await ready();await nav('staff');
    await page.evaluate(()=>{window.__staffTickJourneyEvents=0;window.addEventListener('copilot:state-changed',()=>window.__staffTickJourneyEvents++);});
  }
  const tickStyle=selector=>page.locator(selector).evaluate(node=>{
    const css=getComputedStyle(node),svg=node.querySelector('svg'),icon=getComputedStyle(svg);
    return Object.fromEntries([...['backgroundColor','color','borderTopWidth','borderTopColor','borderRadius','width','height'].map(key=>[key,css[key]]),['iconWidth',icon.width],['iconHeight',icon.height],['iconMarkup',svg.innerHTML]]);
  });

  await page.goto(base);await ready();await nav('staff');
  check('staff without an accepted trip retains its no-dispatch explanation and has no reset tick',/not started an accepted trip/.test(await staffText())&&/does not contact anyone or share your trip/.test(await page.locator('#staff-content').innerText())&&await tick().count()===0);

  await seed();
  const initial=await snapshot(),automatic=await staffText();
  check('fresh default is simple guidance without saving an explicit preference',await page.locator('body').evaluate(node=>node.classList.contains('simple-guidance'))&&await page.evaluate(()=>localStorage.getItem('commute-copilot-presentation-v1')===null));
  check('automatic current instruction has no reset button',await request().inputValue()==='automatic'&&await tick().count()===0);
  for(const [value,text] of [['platform','correct stop or platform'],['transfer','next connection'],['exit','appropriate station exit'],['lift','check which lift'],['alert','where to get off']]){
    await request().selectOption(value);
    check(`${value} message applies immediately and exposes the reset tick`,(await staffText()).includes(text)&&await tick().count()===1&&await snapshot()===initial);
  }
  check('compact tick has a meaningful accessible name and tooltip with no visible text',await tick().getAttribute('title')==='Use my current instruction'&&(await tick().innerText()).trim()===''&&await tick().getAttribute('data-staff-action')==='automatic'&&await tick().locator('svg[aria-hidden="true"]').count()===1);
  await capture('default-simple-mobile');
  await tick().click();
  check('click resets to the actual current instruction, hides the tick and focuses the dropdown',await request().inputValue()==='automatic'&&await staffText()===automatic&&await tick().count()===0&&await request().evaluate(node=>node===document.activeElement)&&await snapshot()===initial);

  for(const key of ['Enter','Space']){
    await request().selectOption('lift');await request().focus();await page.keyboard.press('Tab');
    check(`${key} reset tick directly follows the dropdown in keyboard order`,await tick().evaluate(node=>node===document.activeElement));
    const focus=await tick().evaluate(node=>{const css=getComputedStyle(node);return node.matches(':focus-visible')&&css.outlineStyle!=='none'&&parseFloat(css.outlineWidth)>=3&&parseFloat(css.outlineOffset)>=2;});
    check(`${key} keyboard focus is visibly outlined`,focus);
    if(key==='Enter')await capture('keyboard-focus-mobile');
    await page.keyboard.press(key);
    check(`${key} resets the message without changing journey state`,await staffText()===automatic&&await request().inputValue()==='automatic'&&await tick().count()===0&&await request().evaluate(node=>node===document.activeElement)&&await snapshot()===initial);
  }
  check('staff message choices and tick activation dispatch no journey state changes',await page.evaluate(()=>window.__staffTickJourneyEvents===0));

  await request().selectOption('lift');const manual=await staffText(),beforeRefresh=await refreshSnapshot();
  for(const action of ['request','automatic']){
    for(const kind of ['offline','online','hidden','visible']){
      await page.locator(`[data-staff-action="${action}"]`).focus();await refresh(kind);
      check(`${kind} refresh preserves manual message and ${action} focus`,await request().inputValue()==='lift'&&await staffText()===manual&&await page.locator(`[data-staff-action="${action}"]`).evaluate(node=>node===document.activeElement)&&await refreshSnapshot()===beforeRefresh);
    }
  }
  await nav('current');await nav('staff');
  check('leaving and returning to staff preserves a manual selection',await request().inputValue()==='lift'&&await staffText()===manual&&await refreshSnapshot()===beforeRefresh);
  await request().selectOption('automatic');
  check('selecting automatic in the dropdown itself restores the current instruction',await request().inputValue()==='automatic'&&await tick().count()===0&&await staffText()===automatic&&await refreshSnapshot()===beforeRefresh);

  await request().selectOption('lift');await nav('current');
  await page.getByRole('button',{name:'Update my current step',exact:true}).click();
  await page.locator('#checkpoint-step').selectOption('2');
  await nav('staff');
  check('an unconfirmed journey picker selection preserves the manual staff message',await request().inputValue()==='lift'&&await staffText()===manual&&(await active()).progress.stepIndex===0);
  await nav('current');await page.getByRole('button',{name:'Confirm my current step',exact:true}).click();await nav('staff');
  check('a confirmed current-step change automatically refreshes the card and removes the reset tick',(await active()).progress.stepIndex===2&&await request().inputValue()==='automatic'&&await tick().count()===0&&await staffText()!==automatic&&(await staffText()).includes(await page.locator('#current-summary h2').innerText()));

  await request().selectOption('alert');
  await page.evaluate(()=>{
    const saved=JSON.parse(localStorage.getItem('commute-copilot-journey-v2'));
    const legs=[{type:'ride',mode:'rail',routeId:'DTL',fromStopId:saved.plan.origin.id,toStopId:saved.plan.destination.id,text:'Synthetic replacement ride',durationSeconds:600,startSeconds:36000,endSeconds:36600}];
    window.dispatchEvent(new CustomEvent('copilot:legacy-accepted',{detail:{action:'accept',input:{originId:saved.plan.origin.id,destinationId:saved.plan.destination.id,date:'2026-09-21',departureTime:'10:00',preferences:saved.plan.preferences},route:{id:'pre-fr2-staff-synthetic-replacement',legs,departureSeconds:36000,arrivalSeconds:36600,walkingSeconds:0}}}));
  });
  check('accepted route replacement resets manual staff text while staff remains open',(await active()).route.id==='pre-fr2-staff-synthetic-replacement'&&await request().inputValue()==='automatic'&&await tick().count()===0&&(await staffText()).includes(await page.locator('#current-summary h2').innerText())&&await page.locator('#staff-content').isVisible());

  for(const simple of [false,true]){
    await page.setViewportSize({width:390,height:844});await seed(simple);
    await nav('current');await page.getByRole('button',{name:'Update my current step',exact:true}).click();
    await page.mouse.move(0,0);const journeyStyle=await tickStyle('#confirm-step');
    await nav('staff');await request().selectOption('lift');await page.mouse.move(0,0);
    check(`${simple?'simple':'full'} staff tick matches current-step tick colour, border, size and glyph`,JSON.stringify(await tickStyle('.staff-current-instruction-tick'))===JSON.stringify(journeyStyle));
    for(const size of [{width:390,height:844,font:'',label:'mobile'},{width:320,height:900,font:'200%',label:'320-large-text'}]){
      await page.setViewportSize({width:size.width,height:size.height});await page.evaluate(font=>document.documentElement.style.fontSize=font,size.font);
      await tick().scrollIntoViewIfNeeded();
      const geometry=await page.evaluate(()=>{
        const rect=selector=>document.querySelector(selector).getBoundingClientRect(),picker=rect('.staff-request-picker'),select=rect('[data-staff-action=request]'),tick=rect('[data-staff-action=automatic]');
        return {overflow:document.documentElement.scrollWidth>innerWidth+1,contained:select.left>=picker.left&&tick.right<=picker.right+1,beside:select.right<=tick.left+1&&Math.abs((select.top+select.height/2)-(tick.top+tick.height/2))<2,width:tick.width,height:tick.height,selectHeight:select.height,selectFontSize:parseFloat(getComputedStyle(document.querySelector('[data-staff-action=request]')).fontSize)};
      });
      check(`${simple?'simple':'full'} ${size.label} keeps dropdown and tick adjacent without horizontal overflow`,!geometry.overflow&&geometry.contained&&geometry.beside);
      check(`${simple?'simple':'full'} ${size.label} retains ${simple?56:48}px touch targets`,geometry.width>=(simple?56:48)&&geometry.height>=(simple?56:48)&&geometry.selectHeight>=(simple?56:48));
      check(`${simple?'simple':'full'} ${size.label} dropdown text respects the root text size`,geometry.selectFontSize>=(size.font==='200%'?32:16));
      await capture(`${simple?'simple':'full'}-${size.label}`);
      const before=await snapshot();await tick().click();
      check(`${simple?'simple':'full'} ${size.label} reset remains reachable and leaves journey unchanged`,await request().inputValue()==='automatic'&&await tick().count()===0&&await snapshot()===before);
      await request().selectOption('lift');
    }
    await page.evaluate(()=>document.documentElement.style.fontSize='');
  }
  check('staff controls make no sharing requests or network mutations',sharingRequests.length===0&&mutations.length===0);
  check('staff tick flows report no browser exceptions',errors.length===0);
  await writeFile(`${out}/results.json`,JSON.stringify({checks,passed:checks.length,errors,sharingRequests,mutations,fixture:'Synthetic accepted journey; actual UI step confirmation and synthetic accepted-route replacement event',environment:'Desktop Edge mobile/touch emulation, keyboard, 320px and 200% text; map tiles blocked; no physical-phone, provider-status or FR2 tester-session claim'},null,2));
}catch(error){
  if(page){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});console.log('APP MESSAGE',await page.locator('#app-message').innerText().catch(()=>''));}
  throw error;
}finally{await browser.close();}
