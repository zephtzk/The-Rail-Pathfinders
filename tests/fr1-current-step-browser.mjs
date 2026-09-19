// Synthetic accepted-state fixtures exercise the actual production controls.
// Desktop Edge mobile/touch emulation; no physical-phone or real-travel claim.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4206';
const out=process.env.CAPTURE_DIR??'test-results/fr1-current-step';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks=[],errors=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
let page;
try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',timezoneId:'Asia/Singapore',reducedMotion:'reduce'});
  await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
  await context.addInitScript(()=>{
    window.__fr1SyntheticGeoWatches=[];
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(success,failure){window.__fr1SyntheticGeoWatches.push({success,failure});return window.__fr1SyntheticGeoWatches.length;},clearWatch(){}}});
  });
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  const nav=key=>page.locator(`.app-nav [data-view="${key}"]`).click();
  const active=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('commute-copilot-journey-v2')));
  const snapshot=async()=>JSON.stringify(await active());
  const ready=()=>page.locator('#find-routes:not([disabled])').waitFor();
  const updateButton=()=>page.getByRole('button',{name:'Update my current step',exact:true});
  const confirmButton=()=>page.getByRole('button',{name:'Confirm my current step',exact:true});
  const refresh=kind=>page.evaluate(kind=>{
    if(kind==='offline'||kind==='online')window.dispatchEvent(new Event(kind));
    else{
      Object.defineProperty(document,'hidden',{configurable:true,value:kind==='hidden'});
      document.dispatchEvent(new Event('visibilitychange'));
      if(kind==='visible')delete document.hidden;
    }
  },kind);
  async function capture(name){
    await page.evaluate(()=>document.querySelector('#app-message').classList.remove('is-visible'));
    await page.screenshot({path:`${out}/synthetic-${name}.png`});
  }
  async function seed(kind='route',{index=0,simple=false}={}){
    await page.goto(base+'/fr1-synthetic-fixture-setup');
    await page.evaluate(async({kind,index,simple})=>{
      const m=await import('/src/journey-v2.js');
      const {acceptJourney}=await import('/src/journey-state.js');
      const now=Date.now();
      const steps=[
        {id:'access',type:'access',text:'Synthetic fixture access at Bugis',fromStopId:'DT14_A',toStopId:'DT14_A',durationSeconds:60},
        {id:'wait',type:'wait',text:'Synthetic fixture wait at Bugis',fromStopId:'DT14_A',toStopId:'DT14_A',durationSeconds:30},
        {id:'ride',type:'ride',text:'Synthetic fixture Downtown Line ride',fromStopId:'DT14_A',toStopId:'DT15_A',durationSeconds:420,source:{mode:'rail',routeId:'DTL'}},
        {id:'exit',type:'exit',text:'Synthetic fixture exit at Promenade',fromStopId:'DT15_A',toStopId:'DT15_A',durationSeconds:60},
      ];
      const plan=m.makePlan({origin:{id:'DT14_A',label:'Synthetic fixture · Bugis'},destination:{id:'DT15_A',label:'Synthetic fixture · Promenade'},date:'2026-09-21',departureTime:'10:00',mode:'replay',preferences:{stepFree:false,walkingLimitMinutes:30},route:{id:'fr1-synthetic-checkpoint-route',departureSeconds:36000,arrivalSeconds:36570,walkingSeconds:120,accessibility:'fixture',provenance:'Synthetic FR1 browser regression fixture; not a real journey',steps}},now);
      let state=m.startJourney(plan,now);
      if(index)state=m.confirmCheckpoint(state,{stepIndex:index,kind:index===2?'onboard':'checkpoint',label:'Synthetic fixture current phase'},now);
      let start=36000;
      const legs=steps.map(step=>{const leg={...step,startSeconds:start,endSeconds:start+step.durationSeconds,walkingSeconds:['access','exit'].includes(step.type)?step.durationSeconds:0};start=leg.endSeconds;return leg;});
      state.routingContext=acceptJourney({id:plan.route.id,departureSeconds:36000,arrivalSeconds:36570,deadlineSeconds:null,legs},{date:'2026-09-21',departureTime:'10:00',walkingLimitMinutes:30},'fr1-synthetic-fixture',now);
      if(kind.startsWith('detour')){
        const {FIXTURE_LAYOUT,fixtureStatuses}=await import('/src/facility-data.js');
        const {rankToilets,previewToiletDetour}=await import('/src/toilet-engine.js');
        const ranked=rankToilets(FIXTURE_LAYOUT,{from:'platform',allowFixtures:true,statuses:fixtureStatuses('none',now),now,arrivalBaseMs:now})[0];
        state=m.acceptDetour(state,previewToiletDetour(FIXTURE_LAYOUT,ranked,{now}),now);
        if(kind==='detour-blocked')state.detour.blocked=true;
        if(['detour-reached','detour-returning'].includes(kind)){
          state=m.confirmCheckpoint(state,{nodeId:'toilet-a',stationId:'fixture-interchange'},now);
          state=m.stopAction(state,'reached',now);
          if(kind==='detour-returning')state=m.stopAction(state,'resume',now);
        }
      }
      if(kind==='paused')state=m.transition(state,'pause',now);
      if(kind==='blocked')state.facilityBlocked=true;
      if(kind==='review'){
        state=m.proposeRoute(state,{...state.route,id:'fr1-synthetic-proposed-route'},'Synthetic fixture change awaiting review',now);
        state.facilityReview=true;
      }
      if(kind==='completed'||kind==='cancelled')state=m.transition(state,kind==='completed'?'finish':'cancel',now);
      localStorage.setItem('commute-copilot-presentation-v1',JSON.stringify({schemaVersion:1,simpleGuidance:simple}));
      if(!m.saveActive(localStorage,state))throw Error('Failed to save synthetic FR1 fixture');
    },{kind,index,simple});
    await page.goto(base);await ready();await nav('current');
  }

  await seed('route',{index:1});
  const initial=await active(),initialSnapshot=JSON.stringify(initial);
  check('current trip has one update action and removes both old shortcuts',await updateButton().count()===1&&await page.locator('#guidance-staff,#manual-correction').count()===0);
  check('picker begins collapsed with an explicit controlled region',!await page.locator('#trip-position').isVisible()&&await updateButton().getAttribute('aria-controls')==='trip-position'&&await updateButton().getAttribute('aria-expanded')==='false');
  await updateButton().focus();await updateButton().press('Enter');
  check('keyboard activation opens adjacent picker and focuses its labelled dropdown',await updateButton().getAttribute('aria-expanded')==='true'&&await page.getByLabel('Where are you on this journey?',{exact:true}).isVisible()&&await page.evaluate(()=>document.activeElement.id==='checkpoint-step'&&document.querySelector('.guidance-primary-actions').nextElementSibling.id==='trip-position'));
  check('collapsed access and wait group keeps exact current canonical index',await page.locator('#checkpoint-step').inputValue()==='1'&&JSON.stringify(await page.locator('#checkpoint-step option').evaluateAll(nodes=>nodes.map(node=>node.value)))===JSON.stringify(['1','2','3']));
  await confirmButton().click();
  check('confirming grouped current phase does not jump to group start or boarding',(await active()).progress.stepIndex===1&&(await active()).progress.kind==='checkpoint');
  await updateButton().click();const beforeSelection=await snapshot();await page.locator('#checkpoint-step').selectOption('2');
  check('opening and choosing a step alone never changes accepted progress',await snapshot()===beforeSelection&&initialSnapshot!==beforeSelection);
  for(const simple of [true,false]){
    await nav('preferences');await page.locator('#simple-guidance-toggle').setChecked(simple);await nav('current');
    check(`switching to ${simple?'simple':'full'} guidance preserves the open pending selection without confirming it`,await page.locator('#trip-position').isVisible()&&await page.locator('#checkpoint-step').inputValue()==='2'&&await updateButton().getAttribute('aria-expanded')==='true'&&await snapshot()===beforeSelection);
  }
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  check('foreground refresh preserves the open pending selection without confirming it',await page.locator('#trip-position').isVisible()&&await page.locator('#checkpoint-step').inputValue()==='2'&&await snapshot()===beforeSelection);
  const pendingProgress=JSON.stringify((await active()).progress);
  for(const id of ['checkpoint-step','confirm-step']){
    for(const kind of ['offline','online','hidden','visible']){
      await page.locator('#'+id).focus();await refresh(kind);
      check(`${kind} refresh preserves ${id} focus and pending selection without confirming progress`,await page.evaluate(id=>document.activeElement.id===id,id)&&await page.locator('#trip-position').isVisible()&&await page.locator('#checkpoint-step').inputValue()==='2'&&JSON.stringify((await active()).progress)===pendingProgress);
    }
  }
  for(const kind of ['offline','online','hidden','visible']){
    await page.locator('.app-nav [data-view=current]').focus();await refresh(kind);
    check(`${kind} refresh does not steal focus after the user leaves the picker`,await page.evaluate(()=>document.activeElement.matches('.app-nav [data-view=current]'))&&await page.locator('#checkpoint-step').inputValue()==='2'&&JSON.stringify((await active()).progress)===pendingProgress);
  }
  await page.locator('#checkpoint-step').focus();await page.keyboard.press('Tab');
  check('compact tick has an accessible name and follows the dropdown in keyboard order',await confirmButton().count()===1&&await page.evaluate(()=>document.activeElement.id==='confirm-step')&&(await confirmButton().innerText()).trim()==='');
  await confirmButton().press('Enter');
  await page.waitForFunction(()=>document.activeElement.id==='current-summary'&&document.querySelector('.panel-scroll').scrollTop<3);
  const boarded=await active();
  check('tick explicitly confirms canonical boarding without altering route or completing trip',boarded.progress.stepIndex===2&&boarded.progress.kind==='onboard'&&boarded.status==='started'&&JSON.stringify(boarded.route)===JSON.stringify(initial.route));
  check('generic correction invalidates timetable seed while preserving original legs',boarded.routingContext.progress.kind==='unknown'&&JSON.stringify(boarded.routingContext.route.legs)===JSON.stringify(initial.routingContext.route.legs));
  check('successful confirmation closes picker and returns focus to current guidance',!await page.locator('#trip-position').isVisible()&&await updateButton().getAttribute('aria-expanded')==='false'&&await page.evaluate(()=>document.activeElement.id==='current-summary'));

  await updateButton().click();
  for(const invalid of ['999','','02']){
    const before=await snapshot();
    await page.evaluate(value=>{const select=document.querySelector('#checkpoint-step');const option=new Option('Injected invalid regression choice',value);option.dataset.invalidFixture='true';select.append(option);select.value=value;},invalid);
    await confirmButton().click();
    check(`invalid selection ${JSON.stringify(invalid)} is rejected without state mutation`,await snapshot()===before&&await page.locator('#trip-position').isVisible()&&/Choose a current step/.test(await page.locator('#app-message').innerText()));
    await page.evaluate(()=>{document.querySelector('[data-invalid-fixture]').remove();document.querySelector('#checkpoint-step').value='2';});
  }
  await page.locator('#checkpoint-step').selectOption('0');const beforeBackward=await snapshot();
  check('selecting an earlier phase still requires explicit confirmation',await snapshot()===beforeBackward&&(await active()).progress.stepIndex===2);
  await confirmButton().click();
  check('V2 permits explicit backward position correction without reviving old timetable progress',(await active()).progress.stepIndex===0&&(await active()).progress.kind==='checkpoint'&&(await active()).routingContext.progress.kind==='unknown');
  await updateButton().click();const beforeCollapse=await snapshot();await updateButton().focus();await updateButton().press('Enter');
  check('keyboard collapse updates expanded state without changing journey',await snapshot()===beforeCollapse&&!await page.locator('#trip-position').isVisible()&&await updateButton().getAttribute('aria-expanded')==='false');
  await nav('staff');check('separate Staff navigation remains usable',await page.locator('#staff-content .staff-card-message').isVisible());await nav('current');

  await seed('route',{index:1});await updateButton().click();await page.locator('#checkpoint-step').selectOption('2');await confirmButton().focus();
  const beforeReplacement=await active();
  await page.evaluate(()=>{
    const saved=JSON.parse(localStorage.getItem('commute-copilot-journey-v2'));
    const legs=[{type:'ride',mode:'rail',routeId:'DTL',fromStopId:saved.plan.origin.id,toStopId:saved.plan.destination.id,text:'Synthetic accepted replacement ride',durationSeconds:600,startSeconds:36000,endSeconds:36600}];
    window.dispatchEvent(new CustomEvent('copilot:legacy-accepted',{detail:{action:'accept',input:{originId:saved.plan.origin.id,destinationId:saved.plan.destination.id,date:'2026-09-21',departureTime:'10:00',preferences:saved.plan.preferences},route:{id:'fr1-synthetic-accepted-replacement',legs,departureSeconds:36000,arrivalSeconds:36600,walkingSeconds:0}}}));
  });
  const replaced=await active();
  check('accepting a different route resets canonical progress and clears old pending picker',replaced.id===beforeReplacement.id&&replaced.route.id==='fr1-synthetic-accepted-replacement'&&replaced.routeRevisions.length===beforeReplacement.routeRevisions.length+1&&replaced.progress.stepIndex===0&&!await page.locator('#trip-position').isVisible()&&await updateButton().getAttribute('aria-expanded')==='false'&&await page.locator('#checkpoint-step').inputValue()==='0');
  check('accepted route replacement does not restore focus into the stale hidden picker',await page.evaluate(()=>!['checkpoint-step','confirm-step'].includes(document.activeElement.id)));
  await updateButton().click();
  check('reopened replacement picker exposes only choices from the newly accepted route',await page.locator('#checkpoint-step').inputValue()==='0'&&JSON.stringify(await page.locator('#checkpoint-step option').evaluateAll(nodes=>nodes.map(node=>node.value)))===JSON.stringify(['0']));

  await seed('route',{index:1});await page.locator('#trip-location > summary').click();await page.locator('#locate-once').click();await updateButton().click();await page.locator('#checkpoint-step').selectOption('2');
  const beforeLocationProgress=JSON.stringify((await active()).progress);
  for(const id of ['checkpoint-step','confirm-step']){
    await page.locator('#'+id).focus();
    const retained=await page.evaluate(id=>{
      const node=document.getElementById(id);
      window.__fr1SyntheticGeoWatches.at(-1).success({coords:{latitude:1.31,longitude:103.81,accuracy:250},timestamp:Date.now()});
      return document.activeElement===node&&node===document.getElementById(id);
    },id);
    check(`synthetic location-only update retains ${id} DOM focus and unconfirmed selection`,retained&&await page.locator('#checkpoint-step').inputValue()==='2'&&JSON.stringify((await active()).progress)===beforeLocationProgress&&(await active()).location.kind==='approximate');
  }

  for(const simple of [false,true]){
    for(const size of [{width:390,height:844,font:'',label:'mobile'},{width:320,height:900,font:'200%',label:'320-large-text'}]){
      await page.setViewportSize({width:size.width,height:size.height});
      await seed('route',{index:1,simple});await page.evaluate(font=>document.documentElement.style.fontSize=font,size.font);await updateButton().click();
      const geometry=await page.evaluate(()=>{
        const rect=selector=>document.querySelector(selector).getBoundingClientRect();
        const picker=rect('#trip-position'),select=rect('#checkpoint-step'),tick=rect('#confirm-step');
        return {overflow:document.documentElement.scrollWidth>innerWidth+1,contained:select.left>=picker.left&&tick.right<=picker.right+1,beside:Math.abs(select.top-tick.top)<3&&select.right<=tick.left+1,width:tick.width,height:tick.height};
      });
      check(`${simple?'simple':'full'} ${size.label} keeps dropdown and tick beside each other without overflow`,!geometry.overflow&&geometry.contained&&geometry.beside);
      check(`${simple?'simple':'full'} ${size.label} tick retains a usable touch target`,geometry.width>=44&&geometry.height>=(simple?56:48));
      await capture(`${simple?'simple':'full'}-${size.label}`);
    }
  }
  await page.setViewportSize({width:390,height:844});
  for(const [kind,label] of [['paused','Resume journey'],['blocked','Ask staff for help'],['review','Review changed directions'],['detour','Confirm a station checkpoint'],['detour-blocked','Ask staff for help'],['detour-reached','Resume from my toilet stop'],['detour-returning','Confirm a station checkpoint']]){
    await seed(kind,{simple:true});const before=await active();
    check(`${kind} retains its phase-specific primary action`,await page.locator('#guidance-primary').innerText()===label&&await page.locator('#guidance-current-step').innerText()==='Update my current step');
    await updateButton().click();
    check(`${kind} opening position picker does not execute its phase action`,await snapshot()===JSON.stringify(before)&&await page.locator('#guidance-primary').innerText()===label);
    await confirmButton().click();const confirmed=await active();
    check(`${kind} generic confirmation preserves status, review/block flags and detour phase`,confirmed.status===before.status&&confirmed.facilityBlocked===before.facilityBlocked&&confirmed.facilityReview===before.facilityReview&&JSON.stringify(confirmed.detour)===JSON.stringify(before.detour)&&JSON.stringify(confirmed.proposal)===JSON.stringify(before.proposal));
    await page.locator('#guidance-primary').click();
    if(kind==='paused')check('paused primary explicitly resumes journey',(await active()).status==='started');
    else if(kind==='review')check('review primary focuses proposed route without accepting it',await page.evaluate(()=>document.activeElement.id==='accept-proposal')&&(await active()).route.id==='fr1-synthetic-checkpoint-route');
    else if(kind==='detour-reached')check('detour reached primary explicitly starts returning without advancing canonical route',(await active()).detour.status==='returning'&&(await active()).progress.stepIndex===before.progress.stepIndex);
    else check(`${kind} primary opens station tools without changing accepted journey`,await page.locator('#companion-facilities [data-action=layout]').isVisible()&&await snapshot()===JSON.stringify(confirmed));
  }

  await seed('detour',{simple:true});await page.locator('#guidance-primary').click();
  await page.locator('[data-field=checkpoint]').selectOption('toilet-a');await page.locator('[data-action=confirm]').click();
  check('station checkpoint retains explicit reached-toilet primary action',await page.locator('#guidance-primary').innerText()==='I have reached the toilet'&&(await active()).detour.status==='accepted');
  await page.locator('#guidance-primary').click();await page.locator('#guidance-primary').click();
  check('reached and resume confirmations keep trip active on return detour',(await active()).status==='started'&&(await active()).detour.status==='returning'&&(await active()).progress.stepIndex===0);
  await page.locator('#guidance-primary').click();await page.locator('[data-field=checkpoint]').selectOption('platform');await page.locator('[data-action=confirm]').click();
  check('return station confirmation restores onward journey without auto-arrival',(await active()).detour.status==='resumed'&&(await active()).status==='started');
  for(const kind of ['completed','cancelled']){
    await seed(kind);check(`${kind} journey exposes no current-step picker or action`,await page.locator('#trip-position,#checkpoint-step,#confirm-step,#guidance-current-step').count()===0&&await updateButton().count()===0);
  }
  check('current-step flows report no browser exceptions',errors.length===0);
  await writeFile(`${out}/results.json`,JSON.stringify({checks,passed:checks.length,errors,fixture:'Synthetic accepted journey and facility rehearsal snapshots; synthetic geolocation callbacks',environment:'Desktop Edge mobile/touch emulation including 320px and 200% text; dispatched connectivity/visibility events exercise refresh handlers; no physical-phone or real-travel claim'},null,2));
}catch(error){
  if(page){console.log('APP MESSAGE',await page.locator('#app-message').innerText().catch(()=>''));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
  throw error;
}finally{await browser.close();}
