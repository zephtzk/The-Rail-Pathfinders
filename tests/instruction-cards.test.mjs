import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstructionSession,INSTRUCTION_SESSION_KEY} from '../src/instruction-cards.js';

function storedSession(initial){
  const values=new Map(initial===undefined?[]:[[INSTRUCTION_SESSION_KEY,initial]]);
  return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
}

test('dismissing an instruction affects only its stable key',()=>{
  const storage=storedSession(),session=createInstructionSession({getStorage:()=>storage});
  assert.equal(session.isDismissed('planner-review-route'),false);
  assert.equal(session.isDismissed('planner-alternative-departure'),false);
  session.dismiss('planner-review-route');
  session.dismiss('planner-review-route');
  assert.equal(session.isDismissed('planner-review-route'),true);
  assert.equal(session.isDismissed('planner-alternative-departure'),false);
  assert.deepEqual(JSON.parse(storage.getItem(INSTRUCTION_SESSION_KEY)),['planner-review-route']);
});

test('recreating the controller in the same stored session retains dismissed cards',()=>{
  const storage=storedSession();
  createInstructionSession({getStorage:()=>storage}).dismiss('planner-review-route');
  const reloaded=createInstructionSession({getStorage:()=>storage});
  assert.equal(reloaded.isDismissed('planner-review-route'),true);
  reloaded.dismiss('planner-alternative-departure');
  const rerendered=createInstructionSession({getStorage:()=>storage});
  assert.equal(rerendered.isDismissed('planner-review-route'),true);
  assert.equal(rerendered.isDismissed('planner-alternative-departure'),true);
});

test('a new empty browser session shows previously dismissed instructions again',()=>{
  const previous=createInstructionSession({getStorage:()=>storedSession()});
  previous.dismiss('planner-review-route');
  const fresh=createInstructionSession({getStorage:()=>storedSession()});
  assert.equal(fresh.isDismissed('planner-review-route'),false);
  assert.equal(previous.isDismissed('planner-review-route'),true);
});

test('blocked storage access retains dismissals in the supplied document memory',()=>{
  for(const getStorage of [
    ()=>{throw new Error('Session storage denied');},
    ()=>({getItem(){throw new Error('Read denied');},setItem(){throw new Error('Write denied');}}),
    ()=>undefined,
  ]){
    const memory=new Set();
    const session=createInstructionSession({getStorage,memory});
    assert.doesNotThrow(()=>session.dismiss('planner-review-route'));
    assert.equal(session.isDismissed('planner-review-route'),true);
    assert.equal(session.isDismissed('planner-alternative-departure'),false);
    const remounted=createInstructionSession({getStorage,memory});
    assert.equal(remounted.isDismissed('planner-review-route'),true);
  }
});

test('a failed write preserves both restored and newly dismissed instructions in memory',()=>{
  const storage={getItem:()=>JSON.stringify(['planner-ready']),setItem(){throw new Error('Quota exceeded');}};
  const session=createInstructionSession({getStorage:()=>storage});
  assert.doesNotThrow(()=>session.dismiss('planner-review-route'));
  assert.equal(session.isDismissed('planner-ready'),true);
  assert.equal(session.isDismissed('planner-review-route'),true);
});

test('malformed stored data cannot dismiss cards and is repaired on the next dismissal',()=>{
  for(const initial of ['{broken','null','42','"planner-review-route"','{"planner-review-route":true}']){
    const storage=storedSession(initial),session=createInstructionSession({getStorage:()=>storage});
    assert.equal(session.isDismissed('planner-review-route'),false);
    session.dismiss('planner-alternative-departure');
    assert.deepEqual(JSON.parse(storage.getItem(INSTRUCTION_SESSION_KEY)),['planner-alternative-departure']);
  }
});

test('stored arrays and new dismissals ignore invalid keys',()=>{
  const storage=storedSession(JSON.stringify(['planner-ready','',null,42,{},'planner-ready']));
  const session=createInstructionSession({getStorage:()=>storage});
  for(const key of ['',null,undefined,42,{}]){
    session.dismiss(key);
    assert.equal(session.isDismissed(key),false);
  }
  session.dismiss('planner-review-route');
  assert.deepEqual(JSON.parse(storage.getItem(INSTRUCTION_SESSION_KEY)),['planner-ready','planner-review-route']);
});
