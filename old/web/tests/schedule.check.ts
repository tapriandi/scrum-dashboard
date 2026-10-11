// Run: ../server/node_modules/.bin/tsx tests/schedule.check.ts
import assert from 'node:assert/strict';
import { capacityByWeek, earliestRelease, levelOf } from '../src/schedule';
import type { Feature, Settings, WeekInfo } from '../src/types';

const weeks: WeekInfo[] = Array.from({ length: 8 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 28 + i * 7));
  const e = new Date(Date.UTC(2026, 8, 28 + i * 7 + 6));
  return {
    code: `S${55 + Math.floor(i / 2)}W${(i % 2) + 1}`,
    sprintNumber: 55 + Math.floor(i / 2),
    weekInSprint: ((i % 2) + 1) as 1 | 2,
    startDate: d.toISOString().slice(0, 10),
    endDate: e.toISOString().slice(0, 10),
  };
});
const settings: Settings = { beTotal: 3, feTotal: 5, qaWeeks: 2, lowThreshold: 1, calendarStart: '2026-09-28', weeksVisible: 8 };

const refund: Feature = {
  id: 1, name: 'Refund Flow', release: null, priority: null, confirmed: true, parallel: false, isFiller: false,
  dependencies: null, notes: null, beNeed: 0, feNeed: 0, jira: [],
  estimates: { dev: { owner: null, startWeek: 'S56W2', durationWeeks: 4, targetDate: null, status: 'planned', source: 'Dev', lastChangedAt: '', lastChangedBy: null, reason: null } },
  resources: [{ week: 'S56W2', be: 1, fe: 2 }],
};

// Dev S56W2 + 4 weeks ends Fri 13 Nov (S58W1), +2 weeks QA = 27 Nov
assert.equal(earliestRelease(refund, weeks, 2), '2026-11-27');
// Shorter duration moves release earlier
refund.estimates.dev!.durationWeeks = 2;
assert.equal(earliestRelease(refund, weeks, 2), '2026-11-13');

const w = capacityByWeek([refund], weeks, settings).find((x) => x.week.code === 'S56W2')!;
assert.equal(w.freeBe, 2);
assert.equal(w.freeFe, 3);
// beNeed/feNeed fill dev weeks without explicit rows
refund.resources = [];
refund.beNeed = 2;
refund.feNeed = 6;
const w2 = capacityByWeek([refund], weeks, settings).find((x) => x.week.code === 'S57W1')!;
assert.equal(w2.freeBe, 1);
assert.equal(w2.freeFe, -1);
assert.equal(levelOf(-1, 1), 'over');
assert.equal(levelOf(2, 1), 'low');
assert.equal(levelOf(1, 1), 'ok');
console.log('schedule checks passed');
