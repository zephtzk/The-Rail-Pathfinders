import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlannerClient} from '../src/planner-client.js';
test('cancelled initialized route cannot submit to its replacement worker',async()=>{
 const original=globalThis.Worker,submitted=[];
 class FakeWorker{postMessage({id,type,data}){if(type==='route')submitted.push(data);queueMicrotask(()=>{if(!this.stopped)this.onmessage?.({data:type==='init'?{id,ready:true}:{id,result:data}});});}terminate(){this.stopped=true;}}
 globalThis.Worker=FakeWorker;
 try{const client=createPlannerClient([]);assert.equal(await client.route('warm'),'warm');const cancelled=client.route('old');client.cancel();const replacement=client.route('new');await assert.rejects(cancelled,e=>e.name==='AbortError');assert.equal(await replacement,'new');assert.deepEqual(submitted,['warm','new']);client.destroy();}
 finally{globalThis.Worker=original;}
});
