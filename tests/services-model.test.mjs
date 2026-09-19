import test from 'node:test';
import assert from 'node:assert/strict';
import {demoIncidentState,demoIncidentAlertable,serviceDemoIncidents,officialServiceState,serviceNoticeKey} from '../src/services-model.js';

const now=Date.parse('2026-09-19T02:00:00Z');
const incident={id:'demo-1',demo:true,source:'demo',status:'active',title:'Simulated closure',revision:1,startsAt:'2026-09-19T09:00:00+08:00',endsAt:'2026-09-19T12:00:00+08:00'};
const snapshot=(patch={})=>({notices:{status:'available',retrievedAt:new Date(now).toISOString(),items:[{text:'Operator advisory'}],...patch}});

test('demo records remain separate and resolved or ended incidents do not alert',()=>{
  assert.deepEqual(serviceDemoIncidents([incident,{...incident,demo:false,source:'official'},null]),[incident]);
  assert.equal(demoIncidentState(incident,now),'active');
  assert.equal(demoIncidentAlertable(incident,{},now),true);
  assert.equal(demoIncidentState({...incident,status:'resolved'},now),'resolved');
  assert.equal(demoIncidentAlertable({...incident,status:'resolved'}, {},now),false);
  assert.equal(demoIncidentAlertable({...incident,endsAt:new Date(now).toISOString()}, {},now),false);
});

test('future demo warnings only apply to a selected route date and stay labelled scheduled',()=>{
  const future={...incident,startsAt:'2026-09-20T09:00:00+08:00',endsAt:'2026-09-20T11:00:00+08:00'};
  assert.equal(demoIncidentState(future,now),'scheduled');
  assert.equal(demoIncidentAlertable(future,{},now),false);
  assert.equal(demoIncidentAlertable(future,{input:{date:'2026-09-20'}},now),true);
  assert.equal(demoIncidentAlertable(future,{input:{date:'2026-09-21'}},now),false);
});

test('only actual fresh official text alerts; unavailable, stale, expired and offline are not current failures',()=>{
  assert.equal(officialServiceState(snapshot(),{now}).alertable,true);
  for(const patch of [{status:'unavailable'},{items:[]},{retrievedAt:null},{retrievedAt:new Date(now+1).toISOString()},{retrievedAt:new Date(now-120001).toISOString()},{expiresAt:new Date(now).toISOString()}])assert.equal(officialServiceState(snapshot(patch),{now}).alertable,false);
  assert.equal(officialServiceState(snapshot(),{now,online:false}).alertable,false);
  assert.equal(officialServiceState(snapshot({status:'partial'}),{now}).partial,true);
  assert.equal(officialServiceState(snapshot({status:'missing',items:[]}),{now}).alertable,false);
});

test('dismissal identities follow changed incidents and notice text, not fresh retrieval timestamps',()=>{
  assert.notEqual(serviceNoticeKey('demo',incident),serviceNoticeKey('demo',{...incident,revision:2}));
  assert.notEqual(serviceNoticeKey('demo',incident),serviceNoticeKey('demo',{...incident,title:'Different event'}));
  assert.equal(serviceNoticeKey('official',{text:'Advisory',retrievedAt:'first'}),serviceNoticeKey('official',{text:'Advisory',retrievedAt:'second'}));
  assert.notEqual(serviceNoticeKey('official',{text:'Advisory'}),serviceNoticeKey('official',{text:'Updated advisory'}));
});
