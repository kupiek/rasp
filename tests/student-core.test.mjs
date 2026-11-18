import test from 'node:test';
import assert from 'node:assert/strict';
import {PAIR_TIMES,pairTime,slideGroups,initialSlide,weekMonday,dayDate,boardParity,visibleGroups} from '../schedule-core.mjs';

test('three-day and two-day slider groups cover Monday–Saturday once', () => {
  assert.deepEqual(slideGroups('three'),[[1,2,3],[4,5,6]]);
  assert.deepEqual(slideGroups('two'),[[1,2],[3,4],[5,6]]);
  assert.deepEqual(slideGroups('week'),[[1,2,3,4,5,6]]);
});

test('first visible slide includes today, or next Monday on Sunday', () => {
  assert.equal(initialSlide('three',new Date('2026-11-18T04:00:00Z')),0);
  assert.equal(initialSlide('three',new Date('2026-11-20T04:00:00Z')),1);
  assert.equal(initialSlide('two',new Date('2026-11-18T04:00:00Z')),1);
  assert.equal(initialSlide('two',new Date('2026-11-21T04:00:00Z')),2);
  assert.equal(initialSlide('two',new Date('2026-11-22T04:00:00Z')),0);
});

test('Sunday starts following week and parity matches that week', () => {
  assert.equal(weekMonday(new Date('2026-11-22T04:00:00Z')).toISOString().slice(0,10),'2026-11-23');
  assert.equal(dayDate(6,new Date('2026-11-22T04:00:00Z')).toISOString().slice(0,10),'2026-11-28');
  const data={parityWeek:'четная',generatedAt:'2026-11-18T03:00:00Z'};
  assert.equal(boardParity(data,new Date('2026-11-18T04:00:00Z')),0);
  assert.equal(boardParity(data,new Date('2026-11-22T04:00:00Z')),1);
});

test('group selection is ordered by course then name', () => {
  const data={groups:[
    {id:15,course:3,shortName:'ИТ',visible:true},
    {id:12,course:1,shortName:'КСК',visible:true},
    {id:13,course:2,shortName:'ТИТО',visible:false},
    {id:14,course:1,shortName:'ИС',visible:true}
  ]};
  const groups=visibleGroups(data,new Date('2026-11-18T04:00:00Z'));
  assert.deepEqual(groups.map(group=>group.id),[14,12,15]);
  assert.equal(groups[0].label,'1ИС-26');
});

test('bell times are provided locally, including Saturday variation', () => {
  assert.deepEqual(pairTime(1,1),['08:30','10:00']);
  assert.deepEqual(pairTime(5,4),['14:10','15:40']);
  assert.deepEqual(pairTime(6,2),['10:20','11:40']);
  assert.equal(pairTime(2,5),null);
  assert.equal(PAIR_TIMES.regular.length,4);
});
