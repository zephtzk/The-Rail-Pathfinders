// Independent short-screen regression for the text-size extension.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4250';
const out='test-results/fr3-short-screen';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const measurements=[],errors=[];
try{
  const context=await browser.newContext({viewport:{width:320,height:568},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
  await page.locator('.app-nav [data-view=preferences]').click();
  const slider=page.locator('#view-preferences input[type=range]');
  await slider.focus();await slider.press('End');
  assert.equal(await slider.inputValue(),await slider.getAttribute('max'),'keyboard selects maximum text size');
  const views=await page.locator('.app-nav [data-view]').evaluateAll(es=>es.map(e=>e.dataset.view));
  for(const size of [{width:320,height:568},{width:568,height:320}]){
    await page.setViewportSize(size);
    for(const view of views){
      await page.locator(`.app-nav [data-view=${view}]`).click();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const data=await page.evaluate(view=>{
        const content=document.querySelector('.panel-scroll'),p=content.getBoundingClientRect();
        const header=document.querySelector('.app-topbar').getBoundingClientRect(),nav=document.querySelector('.app-nav').getBoundingClientRect();
        return {view,headerBottom:header.bottom,contentTop:p.top,contentBottom:p.bottom,contentHeight:p.height,navTop:nav.top,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,contentWidth:content.scrollWidth,clientWidth:content.clientWidth};
      },view);
      measurements.push({...size,...data});
      assert.ok(data.contentTop>=data.headerBottom-1,`${size.width} ${view}: header does not obscure content`);
      assert.ok(data.contentBottom<=data.navTop+1&&data.contentHeight>=44,`${size.width} ${view}: scrollable content remains reachable above navigation`);
      assert.ok(data.documentWidth<=data.viewportWidth+1&&data.contentWidth<=data.clientWidth+1,`${size.width} ${view}: content wraps within screen`);
      console.log(`PASS ${size.width}x${size.height} ${view}: maximum text remains reachable`);
      if(view==='preferences')await page.screenshot({path:`${out}/settings-${size.width}.png`});
    }
  }
  assert.deepEqual(errors,[],'no uncaught browser errors');
}finally{
  await writeFile(`${out}/results.json`,JSON.stringify({measurements,errors,environment:'Installed Edge, maximum actual slider setting, 320x568 and 568x320 viewports.'},null,2)+'\n');
  await browser.close();
}
