import test from 'node:test';
import assert from 'node:assert/strict';
import {STAFF_REQUESTS,STAFF_CUSTOM_MAX_LENGTH,createStaffSelection,staffCardForExecution,staffCardHTML} from '../src/staff-card.js';
const execution={phase:'none',accepted:false,contextKey:'none',current:'Wait',fixture:false};
test('custom request keeps presets and escapes literal user text in the card',()=>{
  assert.equal(STAFF_REQUESTS.length,7);
  const literal='<img src=x onerror=alert(1)> & "Help"\nPlease call staff';
  const card=staffCardForExecution(execution,'custom',literal);
  assert.equal(card.message,literal);
  assert.match(staffCardHTML(card),/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(staffCardHTML(card),/<img/);
  assert.match(staffCardForExecution(execution,'lift').message,/check which lift/);
});
test('custom text is bounded, blank handled, and memory-only selection resets on context change',()=>{
  const selection=createStaffSelection();selection.resolve(execution);selection.select('custom');selection.setCustom('x'.repeat(700));
  assert.equal(selection.resolve(execution).message.length,STAFF_CUSTOM_MAX_LENGTH);
  selection.setCustom('  ');assert.equal(selection.resolve(execution).message,'Type your message below.');
  selection.setCustom('Please help me');selection.select('lift');selection.resolve(execution);selection.select('custom');
  assert.equal(selection.resolve(execution).message,'Please help me');
  const changed=selection.resolve({...execution,contextKey:'new-trip'});assert.equal(changed.request,'automatic');assert.equal(changed.customMessage,'');
  assert.equal(createStaffSelection().resolve(execution).customMessage,'');
});
