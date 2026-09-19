// Navigation geometry and interaction checks; Facilities is a layout-only fixture.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4208';
const out='test-results/fr1-current-tab';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks=[],errors=[],measurements=[];
const check=(label,condition)=>{assert.ok(condition,label);checks.push(label);console.log('PASS '+label);};
try{
  for(const eighth of [false,true]){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
    await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
    if(eighth)await context.route('**/src/commute-ui.js',async route=>{
      const response=await route.fetch();
      const source=await response.text();
      const navigation=source.slice(source.indexOf('<nav class="app-nav"'),source.indexOf('</nav>'));
      const body=navigation.includes("['facilities',")?source:source.replace("['tools', [['caregiver'","['tools', [['facilities','info','Facilities'],['caregiver'");
      await route.fulfill({response,body});
    });
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
    const prefix=eighth?'eight-destination layout':'application navigation';
    const expected=['plan','current','saved','caregiver','spending','preferences','staff'];
    if(eighth||await page.locator('.app-nav [data-view=facilities]').count())expected.push('facilities');
    check(`${prefix}: all destinations are direct buttons`,JSON.stringify((await page.locator('.app-nav [data-view]').evaluateAll(buttons=>buttons.map(b=>b.dataset.view))).sort())===JSON.stringify(expected.sort()));
    for(const size of [{width:1440,height:960,name:'desktop'},{width:390,height:844,name:'390'},{width:320,height:844,name:'320'},{width:320,height:900,name:'320-large',text:'200%'},{width:390,height:844,name:'390-large',text:'200%'},{width:390,height:844,name:'390-setting',setting:true},{width:640,height:360,name:'landscape'}]){
      await page.setViewportSize({width:size.width,height:size.height});
      await page.evaluate(({text,setting})=>{document.documentElement.style.fontSize=text??'';document.body.classList.toggle('large-text',!!setting);},size);
      await page.locator('.app-nav [data-view=current]').click();
      await page.waitForFunction(()=>Math.abs(parseFloat(document.body.style.getPropertyValue('--nav-height'))-document.querySelector('.app-nav').getBoundingClientRect().height)<1);
      const geometry=await page.evaluate(()=>{
        const nav=document.querySelector('.app-nav'),n=nav.getBoundingClientRect(),current=nav.querySelector('[data-view=current]').getBoundingClientRect(),plan=nav.querySelector('[data-view=plan]').getBoundingClientRect();
        const rects=[...nav.querySelectorAll('button')].map(button=>button.getBoundingClientRect());
        const separated=rects.every((a,index)=>rects.slice(index+1).every(b=>Math.hypot(Math.max(a.left-b.right,b.left-a.right,0),Math.max(a.top-b.bottom,b.top-a.bottom,0))>=5.9));
        const buttons=[...nav.querySelectorAll('button')].map(button=>{
          const box=button.getBoundingClientRect(),label=button.querySelector('span'),range=document.createRange();range.selectNodeContents(label);
          return {id:button.dataset.view,width:box.width,height:box.height,visible:box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,labelFits:[...range.getClientRects()].every(r=>r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom)};
        });
        return {width:innerWidth,height:innerHeight,navHeight:n.height,centerDelta:Math.abs(current.x+current.width/2-(n.x+n.width/2)),widthRatio:current.width/plan.width,heightRatio:current.height/plan.height,noOverflow:nav.scrollWidth<=nav.clientWidth&&document.documentElement.scrollWidth<=innerWidth,separated,buttons};
      });
      measurements.push({case:`${prefix} ${size.name}`,...geometry});
      check(`${prefix} ${size.name}: Current trip centered and larger`,geometry.centerDelta<1&&geometry.widthRatio>1.25&&geometry.heightRatio>1.1);
      check(`${prefix} ${size.name}: every label and touch target visible without horizontal scrolling`,geometry.noOverflow&&geometry.buttons.every(b=>b.visible&&b.labelFits&&b.width>=44&&b.height>=44));
      check(`${prefix} ${size.name}: tabs occupy separate areas with at least 6px spacing`,geometry.separated);
      check(`${prefix} ${size.name}: one selected destination and focused heading`,await page.locator('.app-nav [aria-current=page]').count()===1&&await page.locator('#current-heading').evaluate(e=>e===document.activeElement));
      await page.screenshot({path:`${out}/${eighth?'eight-':'seven-'}${size.name}.png`,animations:'disabled'});
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{document.documentElement.style.fontSize='';document.body.classList.remove('large-text');});
    for(const view of ['plan','current','saved','caregiver','spending','preferences','staff']){
      const button=page.locator(`.app-nav [data-view=${view}]`);
      await button.click();
      check(`${prefix}: ${view} navigation and selection work`,await page.locator(`#view-${view}`).isVisible()&&await button.getAttribute('aria-current')==='page'&&await page.locator('.app-nav [aria-current=page]').count()===1);
    }
    await page.locator('.app-nav [data-view=plan]').focus();await page.keyboard.press('Tab');
    check(`${prefix}: keyboard order reaches Current trip with a visible focus ring`,await page.locator('.app-nav [data-view=current]').evaluate(e=>e===document.activeElement&&e.matches(':focus-visible')&&parseFloat(getComputedStyle(e).outlineWidth)>=3));
    await page.screenshot({path:`${out}/${eighth?'eight-':'seven-'}keyboard-focus.png`});
    await page.keyboard.press('Enter');
    check(`${prefix}: keyboard activation opens Current trip`,await page.locator('#current-heading').evaluate(e=>e===document.activeElement));
    await page.setViewportSize({width:1440,height:960});
    await page.locator('.app-nav [data-view=preferences]').click();
    await page.getByRole('button',{name:'Save preferences',exact:true}).click();
    await page.locator('.app-toast.is-visible').waitFor();
    check(`${prefix}: desktop toast clears the taller navigation`,await page.locator('.app-toast').evaluate(e=>e.getBoundingClientRect().bottom<document.querySelector('.app-nav').getBoundingClientRect().top));
    await page.screenshot({path:`${out}/${eighth?'eight-':'seven-'}desktop-toast.png`});
    const cdp=await context.newCDPSession(page);
    await page.setViewportSize({width:390,height:844});
    await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,left:12,right:20,bottom:34}});
    await page.locator('.app-nav [data-view=current]').click();
    const safe=await page.locator('.app-nav').evaluate(e=>{
      const s=getComputedStyle(e);return {left:parseFloat(s.paddingLeft),right:parseFloat(s.paddingRight),bottom:parseFloat(s.paddingBottom)};
    });
    check(`${prefix}: bottom and asymmetric side safe areas are retained`,safe.left>=12&&safe.right>=20&&safe.bottom>=42);
    await page.screenshot({path:`${out}/${eighth?'eight-':'seven-'}safe-area.png`});
    await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,left:0,right:0,bottom:0}});
    await context.close();
  }
  check('no browser runtime errors',errors.length===0);
}finally{
  await writeFile(`${out}/results.json`,JSON.stringify({checks,errors,measurements,environment:'Desktop Edge, touch/mobile emulation. Eighth destination is a navigation-only Facilities fixture; no Facilities content is included or tested. No physical-device claim.'},null,2)+'\n');
  await browser.close();
}
