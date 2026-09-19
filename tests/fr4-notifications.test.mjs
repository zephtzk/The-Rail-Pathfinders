import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {queueSharingPush} from '../server/push.js';

test('journey changes do not queue pushes even for retained subscriptions',()=>{
  const state={subscriptions:{old:{shareId:'test',role:'viewer'}},outbox:{}};
  queueSharingPush(state,{id:'test',consent:{progress:true}},'viewer','new-event',Date.now());
  assert.deepEqual(state.outbox,{});
});

test('service worker activation and late push remove subscriptions without displaying notifications',async()=>{
  const listeners={},closed=[],removed=[];let unsubscribed=0,shown=0,claimed=0;
  const self={addEventListener:(type,handler)=>listeners[type]=handler,registration:{pushManager:{getSubscription:async()=>({unsubscribe:async()=>{unsubscribed++;}})},getNotifications:async options=>{assert.equal(options.tag,'commute-journey-update');return [{close(){closed.push(true);}}];},showNotification(){shown++;}},clients:{claim:async()=>{claimed++;}},location:{origin:'https://example.test'}};
  const caches={keys:async()=>['commute-copilot-old','other-cache'],delete:async key=>{removed.push(key);},open:async()=>({match:async()=>({ok:true})})};
  vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{self,caches,URL,Promise,Date});
  async function dispatch(type,extra={}){let completion;listeners[type]({...extra,waitUntil(promise){completion=promise;}});await completion;}
  await dispatch('activate');assert.equal(unsubscribed,1);assert.equal(claimed,1);assert.deepEqual(removed,['commute-copilot-old']);assert.equal(closed.length,1);
  await dispatch('push',{data:{json:()=>({eventId:'older-queued-event'})}});assert.equal(shown,0);assert.equal(unsubscribed,2);
  let readiness;await dispatch('message',{data:{type:'check-offline-readiness'},ports:[{postMessage:value=>{readiness=value;}}]});assert.equal(readiness.ready,true);
});
