import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {choosePlannerDate,choosePlannerTime} from './planner-browser-helpers.mjs';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4235';
const out=process.env.CAPTURE_DIR??'test-results/pre-fr2-start-contrast';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const checks=[],samples=[],errors=[];
const check=(label,value)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label);};
function luminance(color){const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);}
try{
  for(const simple of [false,true])for(const size of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844},{name:'large-text',width:320,height:900}]){
    const context=await browser.newContext({viewport:{width:size.width,height:size.height},timezoneId:'Asia/Singapore',serviceWorkers:'block',reducedMotion:'reduce'});
    await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
    await context.addInitScript(simple=>localStorage.setItem('commute-copilot-presentation-v1',JSON.stringify({schemaVersion:1,simpleGuidance:simple})),simple);
    const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
    const label=`${simple?'simple':'full'}-${size.name}`;
    await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
    for(const [role,query]of [['origin','CC26'],['destination','EW9']]){await page.locator('#'+role).fill(query);await page.locator('#'+role).press('ArrowDown');await page.locator('#'+role).press('Enter');}
    await page.locator('[data-time=depart-later]').click();await choosePlannerDate(page,'date','2026-09-21');await choosePlannerTime(page,'departureTime','10:00');
    await page.locator('#find-routes').click();const button=page.locator('#review-route');await button.waitFor();
    if(size.name==='large-text')await page.addStyleTag({content:'html{font-size:200%}'});
    // Inspect actual pseudo-states, including pointer-down without releasing on Start.
    const sample=async state=>{
      const value=await button.evaluate(el=>{const s=getComputedStyle(el),icon=el.querySelector('svg'),r=el.getBoundingClientRect();return {color:s.color,background:s.backgroundColor,opacity:s.opacity,icon:icon?getComputedStyle(icon).stroke:null,outline:s.outlineStyle,outlineWidth:s.outlineWidth,fontSize:s.fontSize,lineHeight:s.lineHeight,width:r.width,height:r.height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};});
      value.contrast=contrast(value.color,value.background);samples.push({label,state,...value});
      check(`${label} ${state} text and icon contrast`,value.color==='rgb(255, 255, 255)'&&value.opacity==='1'&&value.contrast>=4.5&&(!value.icon||value.icon===value.color));
      check(`${label} ${state} readable target without clipping`,value.height>=(simple?56:48)&&value.scrollWidth<=value.clientWidth+1);
      if(state==='focus')check(`${label} visible keyboard focus`,value.outline!=='none'&&parseFloat(value.outlineWidth)>=3);
    };
    await button.scrollIntoViewIfNeeded();await page.mouse.move(0,0);await sample('enabled');
    await button.hover();await sample('hover');
    await page.keyboard.press('Tab');await button.focus();await sample('focus');
    check(`${label} viewport has no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`${out}/${label}.png`,animations:'disabled'});
    await button.hover();await page.mouse.down();await sample('active');await page.mouse.move(0,0);await page.mouse.up();
    // Rehearsal preparation deliberately remains a separate flow; its moved
    // companion button must have the same accessible palette.
    await page.locator('#open-demo').click();await page.locator('#demo-selected-route').click();
    const prepared=page.locator('#start-companion');await prepared.scrollIntoViewIfNeeded();
    const preparedStyle=await prepared.evaluate(el=>{const s=getComputedStyle(el);return {color:s.color,background:s.backgroundColor};});
    check(`${label} prepared Start has white text on blue`,preparedStyle.color==='rgb(255, 255, 255)'&&contrast(preparedStyle.color,preparedStyle.background)>=4.5);
    await prepared.click();await page.locator('.app-nav [data-view=plan]').click();await page.locator('#find-routes').click();await button.waitFor();
    check(`${label} existing trip disables another Start`,await button.isDisabled());
    await button.scrollIntoViewIfNeeded();await sample('disabled');await page.screenshot({path:`${out}/${label}-disabled.png`,animations:'disabled'});
    await context.close();
  }
  check('no browser runtime errors',errors.length===0);
}finally{await writeFile(`${out}/results.json`,JSON.stringify({checks,passed:checks.length,samples,errors,environment:'Installed Edge; desktop, mobile viewport and 320px / 200% text emulation. Street-map tiles blocked. No physical-device validation.'},null,2));await browser.close();}
