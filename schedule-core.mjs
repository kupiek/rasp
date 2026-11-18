import {currentParity, groupName, iekDateParts} from './data-model.mjs';

export const SCHEDULE_MODES = Object.freeze(['week', 'three', 'two']);
export const MODE_LABELS = Object.freeze({week:'Вся неделя',three:'3 дня',two:'2 дня'});
export const THEMES = Object.freeze([
  {id:'night',name:'Полярная ночь',description:'Тёмно-синяя с бирюзовыми акцентами'},
  {id:'light',name:'Светлая',description:'Светлый фон и тёмный текст'},
  {id:'graphite',name:'Графит',description:'Строгая монохромная палитра'}
]);

// The source API has no bell times. These local values are intentionally
// editable independently of the snapshot and may differ at the college.
export const PAIR_TIMES = Object.freeze({
  regular:[['08:30','10:00'],['10:20','11:50'],['12:30','14:00'],['14:10','15:40']],
  saturday:[['08:30','10:00'],['10:20','11:40'],['12:10','13:40'],['13:50','15:20']]
});

export function pairTime(day, pair) {
  return (day === 6 ? PAIR_TIMES.saturday : PAIR_TIMES.regular)[pair-1] || null;
}

export function slideGroups(mode) {
  if (mode === 'three') return [[1,2,3],[4,5,6]];
  if (mode === 'two') return [[1,2],[3,4],[5,6]];
  return [[1,2,3,4,5,6]];
}

export function initialSlide(mode, date = new Date()) {
  const today = iekDateParts(date).weekday;
  if (today === 7) return 0;
  return Math.max(0,slideGroups(mode).findIndex(days => days.includes(today)));
}

export function weekMonday(date = new Date()) {
  const p = iekDateParts(date);
  const offset = p.weekday === 7 ? 1 : 1 - p.weekday;
  return new Date(Date.UTC(p.year,p.month-1,p.day+offset));
}

export function dayDate(day, date = new Date()) {
  return new Date(weekMonday(date).getTime() + (day-1)*86400000);
}

export function boardParity(data, date = new Date()) {
  return currentParity(data,weekMonday(date));
}

export function visibleGroups(data, date = new Date()) {
  const p = iekDateParts(weekMonday(date));
  return (data?.groups || [])
    .filter(group => group && group.visible !== false && Number.isInteger(Number(group.id)))
    .map(group => ({...group,id:Number(group.id),course:Number(group.course),label:groupName(group,p.year,p.month)}))
    .sort((a,b) => (a.course || 99) - (b.course || 99) || a.label.localeCompare(b.label,'ru',{numeric:true}));
}

export function displayDate(day, date = new Date()) {
  return new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',day:'numeric',month:'short'}).format(dayDate(day,date));
}
