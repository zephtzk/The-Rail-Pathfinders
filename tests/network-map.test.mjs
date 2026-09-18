import test from 'node:test';
import assert from 'node:assert/strict';
import {addStreetMap} from '../src/network-map.js';

function setup(online=true){
  const layers=[],statuses=[],removed=[],added=[];
  const map={removeLayer(layer){removed.push(layer);}};
  const leaflet={tileLayer(url,options){
    const handlers={};
    const layer={url,options,on(event,callback){handlers[event]=callback;return this;},addTo(target){assert.equal(target,map);added.push(layer);return this;},fire(event){handlers[event]?.();}};
    layers.push(layer);return layer;
  }};
  const controller=addStreetMap(map,{leaflet,isOnline:()=>online,onStatus:value=>statuses.push(value)});
  return {layers,statuses,removed,added,controller,setOnline:value=>{online=value;}};
}

test('street-map requests carry only an origin referer and visible attribution',()=>{
  const context=setup(),layer=context.layers[0];
  assert.equal(layer.options.referrerPolicy,'origin');
  assert.match(layer.url,/^https:\/\/tile\.openstreetmap\.org\//);
  assert.match(layer.options.attribution,/openstreetmap.org\/copyright/);
  layer.fire('tileload');
  assert.equal(context.statuses.at(-1).available,true);
});

test('blocked tiles are removed while unrelated route layers remain untouched',()=>{
  const context=setup(),layer=context.layers[0];
  layer.fire('tileerror');
  assert.deepEqual(context.removed,[layer]);
  assert.equal(context.controller.layer,null);
  assert.equal(context.statuses.at(-1).status,'unavailable');
  assert.match(context.statuses.at(-1).message,/route and station guidance remain available/);
  layer.fire('tileload');
  layer.fire('tileerror');
  assert.equal(context.layers.length,1,'No automatic tile retry after a provider rejection');
  assert.equal(context.statuses.at(-1).available,false,'Stale tile completion cannot clear the error');
});

test('a deliberate retry can restore the map after a temporary failure',()=>{
  const context=setup();
  context.layers[0].fire('tileerror');
  context.controller.retry();
  assert.equal(context.layers.length,2);
  context.layers[1].fire('tileload');
  assert.equal(context.statuses.at(-1).available,true);
});

test('offline startup makes no third-party tile requests and supports later retry',()=>{
  const context=setup(false);
  assert.equal(context.layers.length,0);
  assert.equal(context.statuses.at(-1).status,'offline');
  context.setOnline(true);
  context.controller.retry();
  assert.equal(context.layers.length,1);
});

test('disposing the map prevents delayed events or retry from recreating it',()=>{
  const context=setup(),layer=context.layers[0];
  context.controller.remove();
  layer.fire('tileload');
  context.controller.retry();
  assert.equal(context.layers.length,1);
  assert.equal(context.controller.layer,null);
  assert.equal(context.statuses.at(-1).status,'loading');
});
