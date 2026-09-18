import test from 'node:test';
import assert from 'node:assert/strict';
import {validCivilDate,shiftCivilDate,shiftCivilMonth,civilDateLabel} from '../src/date-picker.js';
test('calendar keeps civil dates and clamps month movement across leap days and years',()=>{
 assert.equal(validCivilDate('2026-02-29'),false);assert.equal(validCivilDate('2028-02-29'),true);
 assert.equal(shiftCivilDate('2026-12-31',1),'2027-01-01');assert.equal(shiftCivilDate('2026-01-01',-1),'2025-12-31');
 assert.equal(shiftCivilMonth('2028-01-31',1),'2028-02-29');assert.equal(shiftCivilMonth('2026-03-31',-1),'2026-02-28');
 assert.match(civilDateLabel('2026-09-19'),/19 Sept 2026/);assert.throws(()=>shiftCivilDate('2026-02-30',1));
});
