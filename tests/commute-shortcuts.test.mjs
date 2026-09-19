import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommuteShortcuts} from '../src/commute-shortcuts.js';
test('deleted pinned routes cannot exhaust shortcut capacity; recency never restores deleted cards',()=>{
 const values=new Map(),s={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},shortcuts=createCommuteShortcuts(s);
 for(const id of ['1','2','3','4']){shortcuts.pin(id);shortcuts.used(id);}
 assert.throws(()=>shortcuts.pin('5'),/up to four/);shortcuts.pin('5',['5']);assert.deepEqual(shortcuts.read().pinned,['5']);assert.deepEqual(shortcuts.cards([{id:'5',label:'Work'}]).map(x=>x.id),['5']);shortcuts.remove('5');assert.deepEqual(shortcuts.read().pinned,[]);assert.deepEqual(shortcuts.cards([]),[]);
});
