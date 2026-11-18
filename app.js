import {
  DAYS,teacherDisplayName,groupName,groupSchedule,teacherSchedule,
  groupDictionary,buildWeekBoard,splitPairVariants,activeForWeek,splitRooms,iekDateParts
} from './data-model.mjs';
import {
  SCHEDULE_MODES,MODE_LABELS,THEMES,pairTime,slideGroups,initialSlide,
  weekMonday,boardParity,visibleGroups,displayDate
} from './schedule-core.mjs';

const app=document.querySelector('#app');
const overlayRoot=document.querySelector('#overlay-root');
const nav=document.querySelector('#bottom-nav');
const syncStatus=document.querySelector('#sync-status');
const toast=document.querySelector('#toast');
const STORAGE={group:'iek-rasp-group',teacher:'iek-rasp-teacher',mode:'iek-rasp-mode',theme:'iek-rasp-theme'};
const REFRESH_MS=15*60*1000;

function saved(key,fallback='') {try{return localStorage.getItem(key)??fallback}catch{return fallback}}
function save(key,value){try{localStorage.setItem(key,String(value))}catch{ /* private mode */ }}
function savedNumber(key){const value=Number(saved(key));return Number.isInteger(value)&&value>0?value:null}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

const state={
  data:null,page:'home',groupId:savedNumber(STORAGE.group),teacherId:savedNumber(STORAGE.teacher),
  mode:SCHEDULE_MODES.includes(saved(STORAGE.mode))?saved(STORAGE.mode):'three',
  theme:THEMES.some(t=>t.id===saved(STORAGE.theme))?saved(STORAGE.theme):'night',
  slides:{home:0,teachers:0},slideDirection:1,
  overlay:null,selectionQuery:'',inspected:null,details:new Map(),loading:false,installEvent:null,
  lastRequest:0,lastTodayKey:'',toastTimer:null
};
state.slides.home=state.slides.teachers=initialSlide(state.mode);
document.documentElement.dataset.theme=state.theme;

const icons={
  pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></svg>',
  chevron:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 5 7 7-7 7"/></svg>',
  left:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 5-7 7 7 7"/></svg>',
  calendar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="7.5" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>'
};

function showToast(text){
  toast.textContent=text;toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer=setTimeout(()=>toast.classList.remove('visible'),2800);
}
function currentTodayKey(){const p=iekDateParts();return `${p.year}-${p.month}-${p.day}`}
function groupById(){return state.data?.groups?.find(group=>Number(group.id)===state.groupId)}
function teacherById(){return state.data?.teachers?.find(teacher=>teacher.id===state.teacherId)}
function groupTitle(id){
  const group=groupDictionary(state.data).get(Number(id));
  const date=iekDateParts(weekMonday());
  return groupName(group,date.year,date.month);
}
function weekLabel(){const parity=boardParity(state.data);return parity===0?'Чётная неделя':parity===1?'Нечётная неделя':'Чётность не установлена'}
function weekBadge(){
  const parity=boardParity(state.data);
  return `<div class="week-mark" role="status" aria-label="${esc(weekLabel())}">
    <span class="${parity===1?'is-now':''}">Нечётная</span>
    <span class="${parity===0?'is-now':''}">Чётная</span>
  </div>`;
}
function timestamp(value){
  if(!value||!Number.isFinite(new Date(value).getTime()))return 'нет данных';
  return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Irkutsk',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
}
function updateStatus(error=''){
  if(!state.data){syncStatus.className='sync-line '+(error?'error':'');syncStatus.querySelector('span').textContent=error||'Получаем данные расписания…';return}
  const age=Date.now()-new Date(state.data.generatedAt).getTime();
  const missing=(state.data.meta?.groupErrors||0)+(state.data.meta?.teacherErrors||0);
  const stale=!Number.isFinite(age)||age>3*60*60*1000||missing>0||state.data.initialized===false;
  syncStatus.className=`sync-line ${stale?'stale':'ok'}`;
  syncStatus.querySelector('span').textContent=`${stale?'Проверьте актуальность':'Обновлено'}: ${timestamp(state.data.generatedAt)} · Иркутск${missing?' · неполные данные':''}`;
}
async function loadData(silent=false,showResult=false){
  if(state.loading)return;
  state.loading=true;state.lastRequest=Date.now();
  if(!silent)syncStatus.querySelector('span').textContent='Обновляем расписание…';
  try{
    const response=await fetch('./data/schedule.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(!data||!Array.isArray(data.groups)||!Array.isArray(data.groupLessons)||!Array.isArray(data.teachers)||!data.teacherSchedules){throw new Error('Некорректный формат расписания')}
    const previous=state.data?.generatedAt;
    state.data=data;
    if(state.groupId&&!data.groups.some(g=>Number(g.id)===state.groupId&&g.visible!==false)){
      state.groupId=null;try{localStorage.removeItem(STORAGE.group)}catch{}
    }
    if(state.teacherId&&!data.teachers.some(t=>t.id===state.teacherId))state.teacherId=null;
    updateStatus();render();
    if(showResult)showToast(previous===data.generatedAt?'Новых данных пока нет':'Расписание обновлено');
  }catch(error){
    if(!state.data){
      updateStatus(`Не удалось загрузить: ${error.message}`);
      app.innerHTML=`<section class="panel page-transition" style="margin-top:30px"><h2>Расписание недоступно</h2><p class="panel-desc">Не удалось получить данные. Проверьте интернет-соединение или повторите попытку.</p><button type="button" data-action="refresh-data" class="wide-button">Попробовать снова ${icons.chevron}</button></section>`;
    }else{
      updateStatus();
      if(showResult)showToast('Нет соединения — показано сохранённое расписание');
    }
  }finally{state.loading=false}
}

function modeControls(){return `<div class="mode-heading"><span class="section-caption">Режим отображения</span><span class="section-caption">ПН — СБ</span></div>
  <div class="mode-switch" role="group" aria-label="Вид расписания">${SCHEDULE_MODES.map(mode=>`<button type="button" class="mode-button" data-action="mode" data-mode="${mode}" aria-pressed="${state.mode===mode}">${MODE_LABELS[mode]}</button>`).join('')}</div>`}

function renderHome(){
  const group=groupById();
  const lessons=groupSchedule(state.data,state.groupId);
  return `<div class="page-transition">
    <section class="intro"><div><span class="eyebrow">Моё расписание</span><h1>${esc(groupTitle(group.id))}</h1><p class="intro-sub">Учебная группа · <button type="button" class="intro-group" data-action="group-picker">Сменить группу ${icons.chevron}</button></p></div>${weekBadge()}</section>
    ${modeControls()}
    ${renderSchedule(lessons,'group')}
  </div>`;
}

function renderTeachers(){
  const teacher=teacherById();
  const lessons=teacher?teacherSchedule(state.data,teacher.id):[];
  return `<div class="page-transition">
    <div class="page-head"><span class="eyebrow">Справочник колледжа</span><h1 class="page-title">Преподаватели</h1><p class="page-description">Выберите преподавателя, чтобы посмотреть расписание его занятий.</p></div>
    <section class="panel"><span class="field">Преподаватель</span><button type="button" class="select-button" data-action="teacher-picker"><span>${esc(teacher?teacherDisplayName(teacher.name):'Выбрать преподавателя')}</span>${icons.chevron}</button></section>
    ${teacher?`<div class="intro" style="margin:0 0 16px"><div><span class="eyebrow">Расписание преподавателя</span><h2 style="font-size:18px;letter-spacing:-.02em">${esc(teacherDisplayName(teacher.name))}</h2></div>${weekBadge()}</div>${modeControls()}${renderSchedule(lessons,'teacher')}`:`<div class="teacher-empty">${icons.user}<strong>Преподаватель не выбран</strong><p>Нажмите на поле выше, чтобы найти расписание по фамилии.</p></div>`}
  </div>`;
}

function renderSettings(){
  const group=groupById();
  return `<div class="page-transition">
    <div class="page-head"><span class="eyebrow">Персонализация</span><h1 class="page-title">Настройки</h1><p class="page-description">Настройте расписание под себя. Параметры сохраняются на этом устройстве.</p></div>
    <section class="panel"><h2>Моя группа</h2><p class="panel-desc">Выбранная группа открывается на главном экране.</p><span class="field">Учебная группа</span><button type="button" class="select-button" data-action="group-picker"><span>${esc(group?groupTitle(group.id):'Выберите группу')}</span>${icons.chevron}</button></section>
    <section class="panel"><h2>Тема приложения</h2><p class="panel-desc">Выберите оформление. Темы готовы для дальнейшего расширения.</p>
      <div class="theme-options">${THEMES.map(theme=>`<button type="button" class="theme-option" data-action="theme" data-theme="${theme.id}" aria-pressed="${state.theme===theme.id}"><span class="theme-swatch ${theme.id}"><b></b></span><strong>${esc(theme.name)}</strong><small>${state.theme===theme.id?'Выбрана':'Выбрать'}</small></button>`).join('')}</div>
    </section>
    <section class="panel"><h2>О приложении</h2><p class="panel-desc">Иркутский энергетический колледж · версия для студентов</p>
      <dl class="about-list"><dt>Версия</dt><dd>1.0</dd><dt>Источник</dt><dd>Расписание ИЭК (публичный API)</dd><dt>Обновление</dt><dd>Проверка каждые 15 минут</dd><dt>Синхронизировано</dt><dd>${esc(timestamp(state.data.generatedAt))}</dd></dl>
      <p class="about-text">Расписание регулярно обновляется через GitHub Actions. Интервалы звонков настроены в приложении отдельно от API. Возможны изменения, отмены и переносы занятий, не отражённые в регулярном расписании.</p>
      <button type="button" class="wide-button" style="margin-top:17px" data-action="refresh-data">Проверить обновления ${icons.chevron}</button>
    </section>
    <section class="panel"><h2>Установка PWA</h2><p class="panel-desc">Приложение можно добавить на главный экран смартфона. Уже загруженное расписание будет доступно и при временном отсутствии интернета.</p><button class="wide-button" type="button" data-action="install" ${state.installEvent?'':'disabled'}>Установить приложение ${icons.chevron}</button>${state.installEvent?'':'<p class="about-text">Если кнопка недоступна, откройте меню браузера и выберите «Установить приложение» или «На экран Домой».</p>'}</section>
  </div>`;
}

function slideControls(groups,index){
  const today=iekDateParts().weekday;
  const prev=(index-1+groups.length)%groups.length,next=(index+1)%groups.length;
  const dots=groups.map((days,i)=>`<button type="button" class="slide-group" data-action="slide" data-slide="${i}" aria-label="${days.map(day=>DAYS[day-1]).join(', ')}" aria-pressed="${i===index}">${days.map(day=>`<span class="slide-pip ${day===today?'is-today':''}" aria-hidden="true"></span>`).join('')}</button>`).join('');
  return `<div class="slider-head"><button type="button" class="slider-arrow" data-action="slide" data-slide="${prev}" aria-label="Предыдущие дни">${icons.left}</button><div class="slide-indicators" role="group" aria-label="Выбор дней недели">${dots}</div><button type="button" class="slider-arrow" data-action="slide" data-slide="${next}" aria-label="Следующие дни">${icons.chevron}</button></div>`;
}

function renderSchedule(lessons,context){
  const parity=boardParity(state.data);
  const board=buildWeekBoard(lessons,parity);
  const groups=slideGroups(state.mode);
  const index=Math.max(0,Math.min(groups.length-1,state.slides[state.page]||0));
  const days=state.mode==='week'?[1,4,2,5,3,6]:groups[index];
  state.details=new Map();
  let counter=0;

  const renderItem=(item,day,pair,weekSpecific=false)=>{
    const id=++counter;
    state.details.set(id,{item,context,day,pair});
    const title=item.subject||item.edit?.subject||'Занятие';
    const room=splitRooms(item.room).join(' / ')||'—';
    const teacher=(item.teacher||'Не указан').replace(/\s*\/\/\s*/g,' / ');
    const group=context==='teacher'?groupTitle(item.groupId):'';
    const subtitle=context==='teacher'?`${group} · ${teacher}`:teacher;
    const described=`${title}. ${subtitle}. Кабинет ${room}.`;
    return `<button type="button" class="lesson-variant ${weekSpecific?'has-parity':''} ${item.active?'is-active':'is-dimmed'}" data-action="lesson-detail" data-detail="${id}" aria-label="${esc(described)}" title="${esc(described)}">
      <span class="lesson-text">${context==='teacher'?`<span class="teacher-group">${esc(group)}</span>`:''}<span class="lesson-subject">${esc(title)}</span><span class="teacher-line"><span class="lesson-teacher">${esc(teacher)}</span><span class="lesson-room">${icons.pin}<span class="lesson-room-label">${esc(room)}</span></span></span></span>
    </button>`;
  };
  const renderPair=({pair,entries},day)=>{
    const times=pairTime(day,pair);
    const {common,even,odd,hasAlternatives}=splitPairVariants(entries);
    const regular=common.map(item=>renderItem(item,day,pair)).join('');
    const alternating=hasAlternatives?[
      ...even.map(item=>renderItem(item,day,pair,true)),
      ...odd.map(item=>renderItem(item,day,pair,true))
    ].join(''):'';
    return `<div class="pair-row ${entries.some(item=>item.active)?'has-now':''}">
      <div class="pair-aside"><strong>${pair}</strong><span class="pair-time">${times?`<span>${times[0]}</span><span>${times[1]}</span>`:'<span>—</span>'}</span></div>
      <div class="pair-body">${entries.length?`<div class="lesson-variants">${regular}${alternating}</div>`:'<span class="no-pair">Нет занятий</span>'}</div>
    </div>`;
  };
  const today=iekDateParts().weekday;
  const renderDay=(dayNumber)=>{
    const day=board[dayNumber-1];
    const extraPairs=[...new Set(day.extra.map(e=>e.pair))].sort((a,b)=>a-b);
    const extras=extraPairs.map(pair=>({pair,entries:day.extra.filter(item=>item.pair===pair).map(item=>({...item,active:activeForWeek(item,parity)}))}));
    return `<section class="day-card ${dayNumber===today?'is-today':''}">
      <div class="day-heading"><div class="day-title"><span class="today-dot"></span><h3>${esc(DAYS[dayNumber-1])}</h3></div><span class="day-date">${esc(displayDate(dayNumber))}</span></div>
      <div class="day-slots">${[...day.rows,...extras].map(row=>renderPair(row,dayNumber)).join('')}</div>
    </section>`;
  };
  const slideClass=state.slideDirection>0?'slide-forward':'slide-back';
  return `${state.mode==='week'?'':slideControls(groups,index)}
    <div class="${state.mode==='week'?'':'slide-stage '+slideClass}" ${state.mode==='week'?'':'tabindex="0" aria-label="Перелистывайте дни свайпом вправо или влево"'}>
      <div class="days ${state.mode==='week'?'days--week':'days--slides days--'+state.mode}">${days.map(renderDay).join('')}</div>
    </div>
    <p class="info-note"><strong>Подсказка:</strong> актуальные занятия выделены ярче. Нажмите на занятие для подробностей. ${state.mode==='week'?'':'Листайте дни горизонтальным свайпом.'}</p>`;
}

function renderGroupOptions(query=''){
  const q=query.trim().toLocaleLowerCase('ru');
  const groups=visibleGroups(state.data).filter(g=>g.label.toLocaleLowerCase('ru').includes(q));
  if(!groups.length)return `<div class="teacher-empty"><strong>${state.data.groups.length?'Ничего не найдено':'Список групп пока недоступен'}</strong><p>${state.data.groups.length?'Попробуйте другой запрос.':'Дождитесь первичной синхронизации расписания.'}</p></div>`;
  return [...new Set(groups.map(group=>group.course))].map(course=>`<section class="group-section"><h3>${course} курс</h3><div class="group-buttons">${groups.filter(g=>g.course===course).map(g=>`<button type="button" class="group-choice" data-action="choose-group" data-group="${g.id}"><span>${esc(g.label)}</span>${icons.chevron}</button>`).join('')}</div></section>`).join('');
}
function renderGroupPicker(){
  const firstTime=!groupById();
  return `<div class="onboarding" role="dialog" aria-modal="true" aria-label="Выбор учебной группы"><section class="onboard-panel">
    <div class="onboard-icon">${icons.calendar}</div>
    ${firstTime?'<span class="eyebrow">Добро пожаловать</span><h1>Расписание, которое всегда под рукой</h1><p>Для начала выберите учебную группу. Мы запомним её на этом устройстве и будем сразу открывать ваше расписание.</p>':'<span class="eyebrow">Учебная группа</span><div class="dialog-title"><h1>Выберите группу</h1><button type="button" class="icon-button" data-action="close-overlay" aria-label="Закрыть">×</button></div><p>Список отсортирован по курсам. Выбранная группа станет основной.</p>'}
    <label class="field" for="group-search">Поиск группы</label><input id="group-search" class="search-input onboard-search" type="search" autocomplete="off" placeholder="Например, ТИТО или КСК" value="${esc(state.selectionQuery)}">
    <div class="group-list" id="group-results">${renderGroupOptions(state.selectionQuery)}</div>
    <div class="onboard-footer">Выбор можно изменить в разделе «Настройки».</div>
  </section></div>`;
}
function renderTeacherOptions(query=''){
  const q=query.trim().toLocaleLowerCase('ru').replace(/[.\s]/g,'');
  const teachers=state.data.teachers.filter(t=>t.name).map(t=>({id:t.id,label:teacherDisplayName(t.name)}))
    .filter(t=>t.label.toLocaleLowerCase('ru').replace(/[.\s]/g,'').includes(q))
    .sort((a,b)=>a.label.localeCompare(b.label,'ru'));
  if(!teachers.length)return '<div class="teacher-empty"><strong>Ничего не найдено</strong><p>Попробуйте другую фамилию.</p></div>';
  return teachers.map(t=>`<button type="button" class="teacher-choice" data-action="choose-teacher" data-teacher="${t.id}">${esc(t.label)}</button>`).join('');
}
function renderTeacherPicker(){
  return `<div class="modal-backdrop" data-action="close-overlay"><section class="dialog" role="dialog" aria-modal="true" aria-label="Выбор преподавателя"><div class="dialog-title"><div><span class="eyebrow">Список преподавателей</span><h2>Кого ищем?</h2></div><button type="button" class="icon-button" data-action="close-overlay" aria-label="Закрыть">×</button></div>
    <input type="search" id="teacher-search" class="search-input dialog-search" placeholder="Введите фамилию" autocomplete="off" value="${esc(state.selectionQuery)}">
    <div class="teacher-options" id="teacher-results">${renderTeacherOptions(state.selectionQuery)}</div>
  </section></div>`;
}
function renderDetail(){
  const {item,context,day,pair}=state.inspected;
  const dateMode=item.typeWeek==null?'Каждую неделю':Number(item.typeWeek)===0?'Чётная неделя':'Нечётная неделя';
  const room=splitRooms(item.room).join(' / ')||'Не указан';
  const current=boardParity(state.data)==null?'Чётность неизвестна':item.active?'Сейчас актуально':'На другой неделе';
  const times=pairTime(day,pair);
  const values=[
    ['День',DAYS[day-1]],['Пара',String(pair)],['Время',times?times.join(' — '):'Уточняется'],
    ['Предмет',item.subject||item.edit?.subject||'Занятие'],
    ['Преподаватель',item.teacher||'Не указан'],
    ...(context==='teacher'?[['Группа',groupTitle(item.groupId)]]:[]),
    ['Аудитория',room],['Чётность',`${dateMode} · ${current}`]
  ];
  return `<div class="modal-backdrop" data-action="close-overlay"><section class="dialog" role="dialog" aria-modal="true" aria-label="Информация о занятии"><div class="dialog-title"><div><span class="eyebrow">Подробности</span><h2>Занятие</h2></div><button type="button" class="icon-button" data-action="close-overlay" aria-label="Закрыть">×</button></div>
    <div class="detail-fields">${values.map(([label,value])=>`<div class="detail-field"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('')}</div>
    ${item.edit?'<div class="detail-edit">В API есть информация об изменении занятия. Дата действия изменения не подтверждена.</div>':''}
  </section></div>`;
}
function renderOverlay(){
  const onboarding=!groupById();
  overlayRoot.innerHTML=onboarding||state.overlay==='group'?renderGroupPicker():state.overlay==='teacher'?renderTeacherPicker():state.overlay==='detail'&&state.inspected?renderDetail():'';
  document.body.style.overflow=overlayRoot.innerHTML?'hidden':'';
}
function render(){
  if(!state.data)return;
  state.lastTodayKey=currentTodayKey();
  const selectedGroup=groupById();
  nav.classList.toggle('is-hidden',!selectedGroup);
  nav.querySelectorAll('[data-page]').forEach(button=>{
    const active=button.dataset.page===state.page;
    button.classList.toggle('is-current',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  app.innerHTML=selectedGroup?(state.page==='home'?renderHome():state.page==='teachers'?renderTeachers():renderSettings()):'<div class="initial-loader"><div class="loader-ring"></div><span>Выберите свою группу</span></div>';
  renderOverlay();
}
function setPage(page){
  if(!['home','teachers','settings'].includes(page))return;
  state.page=page;state.overlay=null;state.inspected=null;
  render();window.scrollTo({top:0,behavior:'instant'});
}
function changeSlide(index){
  const groups=slideGroups(state.mode);
  if(groups.length<2)return;
  const next=(index+groups.length)%groups.length;
  state.slideDirection=next>=state.slides[state.page]?1:-1;
  state.slides[state.page]=next;
  render();
}

nav.addEventListener('click',event=>{
  const button=event.target.closest('[data-page]');
  if(button)setPage(button.dataset.page);
});
app.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action;
  if(action==='mode'){
    state.mode=button.dataset.mode;save(STORAGE.mode,state.mode);
    state.slides.home=state.slides.teachers=initialSlide(state.mode);
    state.slideDirection=1;render();
  }
  if(action==='slide')changeSlide(Number(button.dataset.slide));
  if(action==='group-picker'||action==='teacher-picker'){
    state.overlay=action==='group-picker'?'group':'teacher';state.selectionQuery='';renderOverlay();
  }
  if(action==='lesson-detail'){
    state.inspected=state.details.get(Number(button.dataset.detail))||null;
    state.overlay=state.inspected?'detail':null;renderOverlay();
  }
  if(action==='theme'){
    const theme=button.dataset.theme;
    if(THEMES.some(t=>t.id===theme)){
      state.theme=theme;save(STORAGE.theme,theme);
      document.documentElement.dataset.theme=theme;render();
    }
  }
  if(action==='install'&&state.installEvent){
    const prompt=state.installEvent;state.installEvent=null;
    prompt.prompt();render();
  }
  if(action==='refresh-data')loadData(true,true);
});
overlayRoot.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');
  if(!button)return;
  if(button.dataset.action==='close-overlay'){
    if(event.target===button||button.tagName==='BUTTON'){
      if(groupById()){state.overlay=null;state.inspected=null;state.selectionQuery='';renderOverlay()}
    }
  }
  if(button.dataset.action==='choose-group'){
    state.groupId=Number(button.dataset.group);save(STORAGE.group,state.groupId);
    state.overlay=null;state.selectionQuery='';state.page='home';render();showToast(`Ваша группа: ${groupTitle(state.groupId)}`);
  }
  if(button.dataset.action==='choose-teacher'){
    state.teacherId=Number(button.dataset.teacher);save(STORAGE.teacher,state.teacherId);
    state.overlay=null;state.selectionQuery='';state.page='teachers';state.slides.teachers=initialSlide(state.mode);render();
  }
});
overlayRoot.addEventListener('input',event=>{
  if(event.target.id==='group-search'){
    state.selectionQuery=event.target.value;
    const results=overlayRoot.querySelector('#group-results');if(results)results.innerHTML=renderGroupOptions(state.selectionQuery);
  }
  if(event.target.id==='teacher-search'){
    state.selectionQuery=event.target.value;
    const results=overlayRoot.querySelector('#teacher-results');if(results)results.innerHTML=renderTeacherOptions(state.selectionQuery);
  }
});
document.querySelector('#refresh').addEventListener('click',()=>loadData(true,true));
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&state.overlay&&groupById()){state.overlay=null;state.inspected=null;renderOverlay()}
  if(['ArrowLeft','ArrowRight'].includes(event.key)&&!state.overlay&&event.target.closest('.slide-stage')){
    event.preventDefault();changeSlide(state.slides[state.page]+(event.key==='ArrowLeft'?-1:1));
  }
});
let swipe=null;
app.addEventListener('touchstart',event=>{
  if(!event.target.closest('.slide-stage')||event.touches.length!==1)return;
  swipe={x:event.touches[0].clientX,y:event.touches[0].clientY};
},{passive:true});
app.addEventListener('touchend',event=>{
  if(!swipe||!event.changedTouches.length)return;
  const dx=event.changedTouches[0].clientX-swipe.x,dy=event.changedTouches[0].clientY-swipe.y;
  swipe=null;
  if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.3)changeSlide(state.slides[state.page]+(dx<0?1:-1));
},{passive:true});
function refreshIfDue(){
  if(document.hidden)return;
  const today=currentTodayKey();
  if(state.data&&today!==state.lastTodayKey){
    state.slides.home=state.slides.teachers=initialSlide(state.mode);render();
  }
  if(state.data&&Date.now()-state.lastRequest>=REFRESH_MS)loadData(true);
}
document.addEventListener('visibilitychange',refreshIfDue);
window.addEventListener('online',()=>{if(state.data)loadData(true)});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installEvent=event;if(state.page==='settings')render()});
window.addEventListener('appinstalled',()=>{state.installEvent=null;showToast('Приложение установлено');if(state.page==='settings')render()});
setInterval(refreshIfDue,60000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
loadData();
