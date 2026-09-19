import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4207',out='docs/evidence/r5';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Singapore',serviceWorkers:'block',reducedMotion:'reduce'});
await context.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:403,body:'Controlled fallback'}));
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(label,value)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label);};
try{
  await page.goto(base);await page.locator('#find-routes:not([disabled])').waitFor();
  check('coverage states all 5208 source stops',/5,208/.test(await page.locator('#coverage-copy').textContent()));
  await page.locator('#origin').fill('01349');await page.locator('#origin-suggestions .suggestion-option').first().click();
  check('previously omitted stop is selectable',/01349/.test(await page.locator('#origin').inputValue()));
  await page.locator('#origin-stop-details summary').click();
  check('selected stop retains service directions',await page.locator('#origin-stop-details li').count()>0);
  await page.locator('#destination').fill('27601');await page.locator('#destination-suggestions .suggestion-option').first().click();
  check('directory-only stop remains selectable',/27601/.test(await page.locator('#destination').inputValue()));
  const toggle=page.getByRole('button',{name:'Bus stops',exact:true});
  await toggle.waitFor();check('bus-stop map layer is enabled',await toggle.getAttribute('aria-pressed')==='true');
  const trainToggle=page.getByRole('button',{name:'Train network',exact:true});
  const railPaths=await page.locator('.leaflet-overlay-pane svg path').count();
  check('train overlay starts enabled',railPaths>0&&await trainToggle.getAttribute('aria-pressed')==='true');
  await trainToggle.click();
  check('train toggle hides the rail network independently',await page.locator('.leaflet-overlay-pane svg path').count()===0&&await toggle.getAttribute('aria-pressed')==='true');
  await trainToggle.press('Space');
  check('keyboard restores train overlay',await page.locator('.leaflet-overlay-pane svg path').count()===railPaths&&await trainToggle.getAttribute('aria-pressed')==='true');
  check('group uses distinct bus and train icons',await toggle.locator('.icon-bus').count()===1&&await trainToggle.locator('svg').count()===1);
  // Leaflet ignores a second zoom click while its first 250ms transition runs.
  for(let i=0;i<3&&/Zoom in/.test(await page.locator('.map-layer-control').textContent());i++){
    await page.locator('.leaflet-control-zoom-in').click();await page.waitForTimeout(350);
  }
  await page.waitForFunction(()=>/\d+ stops in this area|nearby/.test(document.querySelector('.map-layer-control [role=status]')?.textContent??''));
  check('map renders neighbourhood stops',! /Zoom in/.test(await page.locator('.map-layer-control').textContent()));
  const pressedStyle=await toggle.evaluate(el=>({fill:getComputedStyle(el).backgroundColor,shadow:getComputedStyle(el).boxShadow}));
  await toggle.click();check('map stop layer can be hidden',await toggle.getAttribute('aria-pressed')==='false');
  check('unpressed bus icon has no fill',await toggle.evaluate(el=>getComputedStyle(el).backgroundColor)==='rgba(0, 0, 0, 0)');
  check('pressed bus icon has colour and inset shadow',pressedStyle.fill!=='rgba(0, 0, 0, 0)'&&pressedStyle.shadow.includes('inset'));
  await toggle.click();
  const separateControls=()=>page.evaluate(()=>{const a=document.querySelector('.map-layer-control').getBoundingClientRect(),b=document.querySelector('#recenter-map').getBoundingClientRect();return a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;});
  check('desktop stop control does not overlap recenter',await separateControls());
  const atBottomLeft=()=>page.evaluate(()=>{const a=document.querySelector('.map-layer-control').getBoundingClientRect(),map=document.querySelector('#commute-map').getBoundingClientRect(),panel=document.querySelector('.app-panel').getBoundingClientRect();const left=innerWidth>680?panel.right:map.left;return a.left>=left&&a.left-left<90&&map.bottom-a.bottom>=0&&map.bottom-a.bottom<35;});
  check('desktop layer icons sit at the visible map bottom left',await atBottomLeft());
  await page.screenshot({path:out+'/island-bus-desktop.png',animations:'disabled'});
  await page.setViewportSize({width:820,height:900});await page.waitForTimeout(150);
  check('tablet layer icons sit at the visible map bottom left',await atBottomLeft());
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
  check('mobile layer icons sit at the map bottom left',await atBottomLeft());
  check('mobile layout has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('mobile stop control does not overlap recenter',await separateControls());
  await page.screenshot({path:out+'/island-bus-mobile.png',animations:'disabled'});

  // Exercise actual Canvas hit testing and popup buttons in a controlled map,
  // without changing the application's map state or accepted journey.
  const harness=await context.newPage();
  await harness.goto(base+'/data/application-build.json');
  await harness.setContent('<div id="map" style="width:400px;height:400px"></div><output id="selection"></output>');
  await harness.addStyleTag({url:base+'/vendor/leaflet.css'});await harness.addScriptTag({url:base+'/vendor/leaflet.js'});
  await harness.evaluate(async base=>{
    const {mountBusStopMap}=await import(base+'/src/bus-stop-map.js');
    const {mountMapLayerControls}=await import(base+'/src/map-layer-controls.js');
    const map=L.map('map',{zoomControl:false}).setView([1.3,103.8],15);
    const bus=mountBusStopMap(map,[{id:'00001',name:'<img src=x onerror=alert(1)>',roadName:'Test road',lat:1.3,lon:103.8}],{onChoose:(role,id)=>document.querySelector('#selection').textContent=role+':'+id});
    const train=L.layerGroup([L.polyline([[1.299,103.799],[1.301,103.801]])]).addTo(map);
    const journey=L.polyline([[1.299,103.801],[1.301,103.799]],{color:'red'}).addTo(map);
    const controls=mountMapLayerControls(map,{onBusToggle:visible=>bus.setVisible(visible),onTrainToggle:visible=>visible?train.addTo(map):map.removeLayer(train)});
    window.fixture={map,bus,train,journey,controls};
  },base);
  await harness.locator('#map').click({position:{x:206,y:200}});
  await harness.getByRole('button',{name:'Start here',exact:true}).click();
  check('Canvas stop popup selects a start',await harness.locator('#selection').textContent()==='origin:00001');
  await harness.locator('#map').click({position:{x:206,y:200}});
  check('stop names are rendered as inert text',await harness.locator('.leaflet-popup-content img').count()===0);
  await harness.getByRole('button',{name:'Go here',exact:true}).click();
  check('Canvas stop popup selects a destination',await harness.locator('#selection').textContent()==='destination:00001');
  check('bus markers use smaller circles and thinner outlines',await harness.evaluate(()=>{let options;fixture.map.eachLayer(layer=>{if(layer instanceof L.CircleMarker)options=layer.options;});return options.radius===3&&options.weight===1;}));
  await harness.getByRole('button',{name:'Bus stops',exact:true}).click();
  await harness.getByRole('button',{name:'Train network',exact:true}).click();
  await harness.evaluate(()=>fixture.map.setView([1.301,103.801],16,{animate:false}));
  check('both overlays stay hidden after moving and zooming',await harness.evaluate(()=>{let circles=0;fixture.map.eachLayer(layer=>{if(layer instanceof L.CircleMarker)circles++;});return circles===0&&!fixture.map.hasLayer(fixture.train);}));
  check('hiding overlays preserves the selected journey',await harness.evaluate(()=>fixture.map.hasLayer(fixture.journey)));
  await harness.getByRole('button',{name:'Bus stops',exact:true}).press('Space');
  check('bus markers can be restored independently',await harness.evaluate(()=>{let circles=0;fixture.map.eachLayer(layer=>{if(layer instanceof L.CircleMarker)circles++;});return circles===1&&!fixture.map.hasLayer(fixture.train)&&fixture.map.hasLayer(fixture.journey);}));
  await harness.evaluate(()=>{fixture.bus.remove();fixture.controls.remove();});
  check('removing the bus overlay cleans up its canvas',await harness.locator('.leaflet-overlay-pane canvas').count()===0);
  check('no application browser errors',errors.length===0);
}finally{
  await writeFile(out+'/island-bus-browser.json',JSON.stringify({recordedAt:new Date().toISOString(),evidenceClass:'Desktop Edge with mobile viewport; controlled map fallback and Canvas interaction; not physical-phone or live-provider evidence',checks,errors},null,2)+'\n');
  await browser.close();
}
