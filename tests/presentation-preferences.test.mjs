import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESENTATION_KEY,TEXT_SIZE_MIN,TEXT_SIZE_MAX,TEXT_SIZE_STEP,DEFAULT_TEXT_SIZE,readPresentationPreferences,createPresentationPreferences} from '../src/presentation-preferences.js';

const defaults={schemaVersion:2,simpleGuidance:true,textSizePercent:100};
function storage(initial){
  const data=new Map(initial===undefined?[]:[[PRESENTATION_KEY,initial]]);
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
}

test('legacy presentation values migrate on read without writing or losing guidance choice',()=>{
  for(const simpleGuidance of [true,false]){
    const raw=JSON.stringify({schemaVersion:1,simpleGuidance}),store=storage(raw);
    assert.deepEqual(readPresentationPreferences(store),{...defaults,simpleGuidance});
    assert.equal(store.getItem(PRESENTATION_KEY),raw);
    assert.equal(createPresentationPreferences(store).setTextSize(140).ok,true);
    assert.deepEqual(JSON.parse(store.getItem(PRESENTATION_KEY)),{...defaults,simpleGuidance,textSizePercent:140});
  }
});

test('text-size range is discrete, inclusive and persists across store instances',()=>{
  assert.deepEqual([TEXT_SIZE_MIN,TEXT_SIZE_MAX,TEXT_SIZE_STEP,DEFAULT_TEXT_SIZE],[80,200,10,100]);
  const store=storage(),settings=createPresentationPreferences(store);
  for(let textSizePercent=TEXT_SIZE_MIN;textSizePercent<=TEXT_SIZE_MAX;textSizePercent+=TEXT_SIZE_STEP){
    assert.deepEqual(settings.setTextSize(textSizePercent),{ok:true,preferences:{...defaults,textSizePercent}});
    assert.equal(createPresentationPreferences(store).read().textSizePercent,textSizePercent);
  }
  settings.setTextSize(DEFAULT_TEXT_SIZE);
  assert.deepEqual(settings.read(),defaults);
});

test('invalid text-size updates do not alter any existing preference or write storage',()=>{
  const store=storage(),settings=createPresentationPreferences(store);
  settings.setSimple(false);settings.setTextSize(170);
  const raw=store.getItem(PRESENTATION_KEY),before=settings.read();
  for(const value of [null,undefined,true,false,'140','',NaN,Infinity,-Infinity,0,79,85,201,250,140.5,{},[]]){
    const result=settings.setTextSize(value);
    assert.equal(result.ok,false,String(value));
    assert.deepEqual(result.preferences,before);
    assert.match(result.error,/80%.*200%.*10%/);
    assert.equal(store.getItem(PRESENTATION_KEY),raw);
  }
});

test('guidance and text size change independently without modifying travel preferences',()=>{
  const store=storage(),settings=createPresentationPreferences(store);
  store.setItem('preferences','route preference snapshot');
  store.setItem('commute-copilot-journey-v2','accepted journey snapshot');
  settings.setTextSize(200);settings.setSimple(false);
  assert.deepEqual(settings.read(),{...defaults,simpleGuidance:false,textSizePercent:200});
  settings.setTextSize(80);
  assert.deepEqual(settings.read(),{...defaults,simpleGuidance:false,textSizePercent:80});
  settings.setSimple(true);
  assert.equal(settings.read().textSizePercent,80);
  assert.equal(store.getItem('preferences'),'route preference snapshot');
  assert.equal(store.getItem('commute-copilot-journey-v2'),'accepted journey snapshot');
});

test('corrupt data and unknown schemas use defaults without destructive read-time writes',()=>{
  for(const raw of [null,'','{broken','null','false','4','[]','{}',JSON.stringify({schemaVersion:3,simpleGuidance:false,textSizePercent:200})]){
    const store=storage(raw);
    assert.deepEqual(readPresentationPreferences(store),defaults,String(raw));
    assert.equal(store.getItem(PRESENTATION_KEY),raw);
  }
});

test('a damaged field does not discard the other valid presentation preference',()=>{
  for(const textSizePercent of [undefined,null,'140',79,85,201]){
    const store=storage(JSON.stringify({schemaVersion:2,simpleGuidance:false,textSizePercent}));
    assert.deepEqual(readPresentationPreferences(store),{...defaults,simpleGuidance:false});
  }
  const store=storage(JSON.stringify({schemaVersion:2,simpleGuidance:'false',textSizePercent:180}));
  assert.deepEqual(readPresentationPreferences(store),{...defaults,textSizePercent:180});
});

test('failed persistence applies both choices in memory for every reader of the same storage',()=>{
  const backing=storage(JSON.stringify({schemaVersion:1,simpleGuidance:false}));
  const store={...backing,setItem(){throw Error('Blocked');}},settings=createPresentationPreferences(store);
  const sized=settings.setTextSize(180);
  assert.equal(sized.ok,false);
  assert.match(sized.error,/applied for this session.*could not be saved/);
  assert.deepEqual(sized.preferences,{...defaults,simpleGuidance:false,textSizePercent:180});
  assert.deepEqual(readPresentationPreferences(store),sized.preferences);
  assert.deepEqual(createPresentationPreferences(store).read(),sized.preferences);
  assert.equal(settings.setSimple(true).ok,false);
  assert.deepEqual(readPresentationPreferences(store),{...defaults,textSizePercent:180});
  assert.deepEqual(JSON.parse(backing.getItem(PRESENTATION_KEY)),{schemaVersion:1,simpleGuidance:false});
});

test('storage read failures retain the last readable value and blocked changes remain usable',()=>{
  let blocked=false;
  const backing=storage(JSON.stringify({schemaVersion:2,simpleGuidance:false,textSizePercent:120}));
  const store={getItem(key){if(blocked)throw Error('Blocked');return backing.getItem(key);},setItem(){throw Error('Blocked');}};
  const settings=createPresentationPreferences(store);
  assert.deepEqual(settings.read(),{...defaults,simpleGuidance:false,textSizePercent:120});
  blocked=true;
  assert.deepEqual(settings.read(),{...defaults,simpleGuidance:false,textSizePercent:120});
  assert.deepEqual(settings.setTextSize(160).preferences,{...defaults,simpleGuidance:false,textSizePercent:160});
  assert.deepEqual(readPresentationPreferences(store),{...defaults,simpleGuidance:false,textSizePercent:160});
});

test('fully unavailable storage supports shared session preferences without claiming a save',()=>{
  const store={getItem(){throw Error('Blocked');},setItem(){throw Error('Blocked');}},settings=createPresentationPreferences(store);
  assert.deepEqual(settings.read(),defaults);
  assert.equal(settings.setTextSize(150).ok,false);
  assert.equal(settings.setSimple(false).ok,false);
  assert.deepEqual(readPresentationPreferences(store),{...defaults,simpleGuidance:false,textSizePercent:150});
});

test('missing storage applies preferences in the page fallback shared by standalone reads',()=>{
  const settings=createPresentationPreferences();
  assert.equal(settings.setTextSize(160).ok,false);
  assert.deepEqual(readPresentationPreferences(),{...defaults,textSizePercent:160});
  settings.setTextSize(DEFAULT_TEXT_SIZE);
});

test('silently ignored writes are reported and a later successful write saves both pending values',()=>{
  let blocked=true;
  const backing=storage(),store={...backing,setItem(key,value){if(!blocked)backing.setItem(key,value);}};
  const settings=createPresentationPreferences(store);
  assert.equal(settings.setTextSize(200).ok,false);
  assert.equal(settings.setSimple(false).ok,false);
  assert.deepEqual(settings.read(),{...defaults,simpleGuidance:false,textSizePercent:200});
  blocked=false;
  assert.equal(settings.setTextSize(190).ok,true);
  assert.deepEqual(JSON.parse(backing.getItem(PRESENTATION_KEY)),{...defaults,simpleGuidance:false,textSizePercent:190});
});

test('readers observe saved external changes and cannot mutate session preference snapshots',()=>{
  const store=storage(),settings=createPresentationPreferences(store);
  settings.setTextSize(130);
  store.setItem(PRESENTATION_KEY,JSON.stringify({...defaults,simpleGuidance:false,textSizePercent:170}));
  assert.deepEqual(settings.read(),{...defaults,simpleGuidance:false,textSizePercent:170});
  const blocked={getItem(){throw Error();},setItem(){throw Error();}},pending=createPresentationPreferences(blocked);
  const result=pending.setTextSize(150);result.preferences.textSizePercent=999;
  const read=pending.read();read.simpleGuidance=false;
  assert.deepEqual(pending.read(),{...defaults,textSizePercent:150});
});
