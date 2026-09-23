'use strict';
(() => {
  const $ = (selector, root=document) => root.querySelector(selector);
  const menus = window.MENUS;
  const byId = new Map(menus.map(m => [m.id,m]));
  const KEY = 'jungsik-study:v1';
  const defaults = () => ({version:1,selected:['cn-03','cn-08'],examDate:'',notes:{},reviewed:[],history:[],session:null});
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pairValid = value => Array.isArray(value)&&value.length===2&&value[0]!==value[1]&&value.every(id=>byId.has(id));
  const dateValid = value => {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const date=new Date(value+'T12:00:00');
    return Number.isFinite(date.getTime())&&date.getFullYear()===Number(value.slice(0,4))&&date.getMonth()+1===Number(value.slice(5,7))&&date.getDate()===Number(value.slice(8,10));
  };
  const shuffle = input => {const a=[...input];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const formatTime = seconds => {const n=Math.max(0,Math.ceil(seconds));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
  const practiceIngredients = m => m.separationNames ? m.separationNames.map(name=>m.ingredients.find(item=>item.name===name)) : m.ingredients;
  const mergeIngredients = ids => {
    const merged=new Map();
    ids.forEach((id,index)=>practiceIngredients(byId.get(id)).forEach(item=>{
      if(!merged.has(item.name))merged.set(item.name,{name:item.name,slots:[],amounts:[]});
      const entry=merged.get(item.name);entry.slots.push(index===0?'A':'B');entry.amounts.push(item.amount);
    }));
    return [...merged.values()].map(item=>({...item,zone:item.slots.length===2?'both':item.slots[0]}));
  };
  const quantity = amounts => {
    if(amounts.length===1)return amounts[0];
    const parts=amounts.map(x=>x.match(/^(\d+(?:\/\d+|\.\d+)?)(g|mL|개|쪽|토막|장|포기|알)$/));
    if(parts.every(Boolean)&&parts[0][2]===parts[1][2]){
      const fractions=parts.map(x=>x[1].includes('/')?x[1].split('/').map(Number):[Number(x[1]),1]);
      if(fractions.every(([n,d])=>Number.isInteger(n)&&Number.isInteger(d))){
        let numerator=fractions[0][0]*fractions[1][1]+fractions[1][0]*fractions[0][1],denominator=fractions[0][1]*fractions[1][1];
        const gcd=(a,b)=>b?gcd(b,a%b):a,divisor=gcd(numerator,denominator);numerator/=divisor;denominator/=divisor;
        const whole=Math.floor(numerator/denominator),remainder=numerator%denominator;
        return `${remainder?(whole?whole+' ':'')+remainder+'/'+denominator:whole}${parts[0][2]}`;
      }
      return amounts.join(' + ');
    }
    return amounts.join(' + ');
  };
  let storageIssue='';
  const sanitizeSession = s => {
    if(!s||!pairValid(s.pair)||!Number.isInteger(s.stage)||s.stage<0||s.stage>2||!Number.isFinite(s.duration)||s.duration<60||s.duration>10800)return null;
    if(!s.orders)return null;
    const orders={},recipeVersions={};let recipeUpdated=false;
    const permutation=(array,length)=>Array.isArray(array)&&array.length===length&&new Set(array).size===length&&array.every(n=>Number.isInteger(n)&&n>=0&&n<length);
    for(const id of s.pair){
      const m=byId.get(id),revision=m.revision||1,previousRevision=s.recipeVersions?.[id]??1;
      const legacyLesson=revision===2&&previousRevision===1&&permutation(s.orders[id],5);
      if(!legacyLesson&&!permutation(s.orders[id],m.steps.length))return null;
      orders[id]=legacyLesson?shuffle(m.steps.map((_,i)=>i)):[...s.orders[id]];
      recipeVersions[id]=revision;
      if(previousRevision!==revision)recipeUpdated=true;
    }
    if(!Number.isFinite(s.remaining)||s.remaining<0||s.remaining>s.duration)return null;
    const validNames=new Set(mergeIngredients(s.pair).map(x=>x.name));
    const assignments=Object.fromEntries(Object.entries(s.assignments||{}).filter(([name,zone])=>validNames.has(name)&&['A','B','both'].includes(zone)));
    const recall=Object.fromEntries(s.pair.map(id=>[id,typeof s.recall?.[id]==='string'?s.recall[id].slice(0,10000):'']));
    const remaining=s.running&&Number.isFinite(s.deadline)?Math.max(0,Math.min(s.duration,(s.deadline-Date.now())/1000)):s.remaining;
    if(recipeUpdated)storageIssue=(s.pair.some(id=>byId.get(id).reference)?'학습 자료':'실습 메모')+'가 갱신되어 재료 단계부터 이어집니다. 작성한 내용과 남은 시간은 보존했어요.';
    return {id:typeof s.id==='string'?s.id:crypto.randomUUID(),pair:s.pair,stage:recipeUpdated?0:s.stage,duration:s.duration,remaining,running:false,deadline:0,assignments,recall,orders,recipeVersions,sortChecked:recipeUpdated?false:!!s.sortChecked,compare:!!s.compare};
  };
  const load = () => {
    const clean=defaults();
    try{
      const raw=localStorage.getItem(KEY);if(!raw)return clean;
      const x=JSON.parse(raw);if(!x||x.version!==1)throw Error('version');
      if(pairValid(x.selected))clean.selected=x.selected;
      if(typeof x.examDate==='string'&&dateValid(x.examDate))clean.examDate=x.examDate;
      for(const [id,note] of Object.entries(x.notes||{}))if(byId.has(id)&&typeof note==='string')clean.notes[id]=note.slice(0,10000);
      clean.reviewed=Array.isArray(x.reviewed)?[...new Set(x.reviewed.filter(id=>byId.has(id)))]:[];
      clean.history=Array.isArray(x.history)?x.history.filter(h=>h&&typeof h.id==='string'&&pairValid(h.pair)&&Number.isFinite(h.when)&&Number.isFinite(h.elapsed)&&Number.isFinite(h.sortCorrect)&&Number.isFinite(h.sortTotal)&&Number.isFinite(h.orderCorrect)&&Number.isFinite(h.orderTotal)&&Array.isArray(h.errors)&&h.errors.every(e=>typeof e==='string')&&h.recall&&h.pair.every(id=>typeof h.recall[id]==='string')).slice(0,100):[];
      clean.session=sanitizeSession(x.session);
      if(x.session&&!clean.session)storageIssue='저장된 연습 형식을 읽지 못했습니다. 새 연습을 시작할 수 있어요.';
      return clean;
    }catch{storageIssue='저장된 데이터를 읽지 못했습니다. 이번 화면은 기본 상태로 열었어요.';return clean;}
  };
  let data=load(), view='practice', guideQuery='', guideCategory='전체', noteTab='history', toastTimeout, lastFocus;
  let previewMinutes=data.selected.reduce((n,id)=>n+byId.get(id).minutes,0);
  const save = () => {
    try{localStorage.setItem(KEY,JSON.stringify(data));return true;}
    catch{toast('브라우저에 저장할 수 없습니다. 현재 창에서는 계속 연습할 수 있어요.');return false;}
  };
  function toast(message){const box=$('#toast');box.textContent=message;box.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>box.classList.remove('show'),4200);}
  const action = (name,label,cls='',attrs='') => `<button type="button" class="${cls}" data-action="${name}" ${attrs}>${label}</button>`;
  const selectedMenus = () => data.selected.map(id=>byId.get(id));
  const zoneLabel = (zone,pair) => zone==='both'?'공통':zone==='A'?byId.get(pair[0]).name:zone==='B'?byId.get(pair[1]).name:'미분류';
  const list = items => `<ul class="requirements">${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
  const stepContent = (m,index) => m.stepTitles ? `<strong class="step-title">${esc(m.stepTitles[index])}</strong><span class="step-copy">${esc(m.steps[index])}</span>` : esc(m.steps[index]);
  const sequence = m => `<ol${m.stepSource?' class="lesson-sequence"':''}>${m.steps.map((_,index)=>`<li>${stepContent(m,index)}</li>`).join('')}</ol>`;
  const referenceContent = m => m.reference ? `<p class="source-note">참고: <a href="${esc(m.reference.url)}" target="_blank" rel="noopener noreferrer">${esc(m.reference.title)} ↗</a><br>${esc(m.reference.author)} · ${esc(m.reference.published)}<br>블로그의 조리 예시를 요약했습니다. 최신 공식 규격은 큐넷 기준을 확인하세요.</p>` : '';
  const requirementsContent = m => m.studyRequirements ? `<p class="small muted">${m.reference?'참고 자료의 학습 포인트':'내 실습 메모의 요구조건'}</p>${list(m.studyRequirements)}<details><summary>큐넷 핵심 규격 함께 보기</summary>${list(m.requirements)}</details>` : list(m.requirements);
  function openDialog(title,body,actions=''){
    lastFocus=document.activeElement;
    $('#dialog-content').innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${title}</h2>${action('close','×','close','aria-label="닫기"')}</div>${body}${actions?`<div class="dialog-actions">${actions}</div>`:''}`;
    if(!$('#dialog').open)$('#dialog').showModal();
  }
  function closeDialog(){$('#dialog').close();if(lastFocus?.isConnected)lastFocus.focus();}
  function render(focus=false){
    document.querySelectorAll('[data-nav]').forEach(b=>{b.classList.toggle('active',b.dataset.nav===view);if(b.dataset.nav===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    if(view==='guide')renderGuide();else if(view==='notes')renderNotes();else if(view==='session'&&data.session)renderSession();else renderHome();
    if(focus){$('#main').focus({preventScroll:true});window.scrollTo({top:0});}
  }
  function renderHome(){
    const [a,b]=selectedMenus();
    let dday='날짜 미설정',dateText='내 시험일을 정해 목표를 잡아보세요.';
    if(data.examDate){const today=new Date();today.setHours(12,0,0,0);const days=Math.round((new Date(data.examDate+'T12:00:00')-today)/86400000);dday=days===0?'D-DAY':days>0?`D-${days}`:`D+${-days}`;dateText=new Date(data.examDate+'T12:00:00').toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'});}
    const shared=mergeIngredients(data.selected).filter(i=>i.zone==='both').length;
    const pairCard=(m,index)=>`<article class="dish-card ${index?'b':''}"><span class="dish-index">MENU ${index?'02':'01'}</span><span class="dish-symbol" aria-hidden="true">${m.category==='튀김'?'炸':m.category==='냉채'?'冷':m.category==='후식'?'糖':m.category==='밥·면'?'食':'炒'}</span><h3>${m.name}</h3><div class="category">${m.category} · ${m.focus.split(' · ')[0]}</div><div class="time"><span aria-hidden="true">◷</span> <strong>${m.minutes}</strong> 분 <span class="muted">/ 과제 시간</span></div></article>`;
    $('#main').innerHTML=`<div class="page-head"><div><div class="eyebrow">PRACTICE NOTE / 中餐</div><h1>오늘의 실기 연습</h1><p>두 가지 메뉴, 한 번의 연습. 재료부터 조리 순서까지 익혀보세요.</p></div><span class="badge">중식 실기 · 20품목</span></div>
      ${data.session?`<div class="resume"><div><b>이어서 할 연습이 있어요</b><div class="small muted">${data.session.pair.map(id=>byId.get(id).name).join(' + ')} · ${['재료 분류','순서 떠올리기','조리 순서'][data.session.stage]}</div></div>${action('resume','이어서 연습','primary')}</div>`:''}
      <div class="workspace"><div><section class="panel"><div class="panel-head"><div><h2>오늘의 두 메뉴</h2><p>직접 고르거나 새로운 조합으로 연습하세요.</p></div><div class="row">${action('random','↻','', 'aria-label="두 메뉴 무작위 선택" title="무작위 선택"')}${action('choose','메뉴 변경','text-button')}</div></div><div class="pair">${pairCard(a,0)}${pairCard(b,1)}</div><div class="session-summary"><span>공통으로 쓰는 재료 <strong>${shared}종</strong></span><span>연습 타이머 <strong>${previewMinutes}분</strong> ${action('duration','설정','text-button')}</span></div>${action('start',`연습 시작하기 <span>요구사항 확인 후 시작 &nbsp; →</span>`,'primary start-button')}</section>
      <section class="panel"><div class="panel-head"><h2>이렇게 연습해요</h2><span class="small muted">3단계 학습</span></div><div class="flow"><div class="flow-item"><div class="number">01 / PREP</div><h3>재료 나누기</h3><p>메뉴별 재료와 <br>공통 재료 구분</p></div><div class="flow-item"><div class="number">02 / RECALL</div><h3>순서 떠올리기</h3><p>답을 보기 전에 <br>기억한 내용 적기</p></div><div class="flow-item"><div class="number">03 / COOK</div><h3>순서 완성하기</h3><p>조리 카드를 정리하고 <br>복습할 부분 확인</p></div></div></section><p class="source-note">2026 큐넷 공개과제의 메뉴·시간·지급재료를 반영했습니다. 조리 순서는 학습 예시와 내 실습 메모이며, 연습 결과는 실제 시험 점수가 아닙니다.</p></div>
      <aside class="sidebar"><section class="panel date-block"><div class="row between"><h2>나의 실기 시험일</h2>${action('date','설정','text-button')}</div><div class="date-number">${dday}</div><p class="small muted">${dateText}</p></section><section class="panel"><h2>조금씩 쌓이는 실력</h2><div class="stats"><div class="stat"><b>${data.reviewed.length}<span> / 20</span></b><span>도감 학습 완료</span></div><div class="stat"><b>${data.history.length}</b><span>완료한 연습</span></div></div><div class="progress" role="progressbar" aria-label="도감 학습 완료" aria-valuemin="0" aria-valuemax="20" aria-valuenow="${data.reviewed.length}"><span style="width:${data.reviewed.length*5}%"></span></div>${action('notes','내 학습 노트 보기 <span>→</span>','quick-link')}</section><section class="panel"><span class="eyebrow">기억할 한 가지</span><h2>같은 재료도, 다른 손질</h2><p class="tip">깐풍기의 닭은 사방 <b>3cm</b>, 라조기의 닭은 <b>5 × 1cm</b>.<br>비슷한 메뉴는 썰기 규격부터 비교해보세요.</p>${action('guide','20가지 메뉴 살펴보기 <span>→</span>','quick-link')}</section></aside></div>`;
  }
  function renderGuide(){
    $('#main').innerHTML=`<div class="page-head"><div><div class="eyebrow">RECIPE INDEX</div><h1>메뉴 도감</h1><p>핵심 규격과 재료를 확인하고 나만의 메모를 남기세요.</p></div><span class="badge">${data.reviewed.length} / 20 학습 완료</span></div><div class="toolbar"><label class="screen-reader" for="menu-search">메뉴 또는 재료 검색</label><input type="search" id="menu-search" placeholder="메뉴 또는 재료 검색" value="${esc(guideQuery)}" autocomplete="off"><label class="screen-reader" for="category">조리 분류</label><select id="category">${['전체','냉채','튀김','볶음·조림','밥·면','후식'].map(x=>`<option ${guideCategory===x?'selected':''}>${x}</option>`).join('')}</select></div><div id="catalog"></div>`;
    renderCatalog();
  }
  function renderCatalog(){
    const q=guideQuery.trim().toLowerCase();
    const found=menus.filter(m=>(guideCategory==='전체'||m.category===guideCategory)&&(!q||`${m.name} ${m.ingredients.map(x=>x.name).join(' ')}`.toLowerCase().includes(q)));
    $('#catalog').innerHTML=found.length?`<div class="catalog">${found.map(m=>`<button class="menu-item" data-action="detail" data-id="${m.id}"><div class="row between"><span class="small muted">${String(m.number).padStart(2,'0')} / ${m.category}</span>${data.reviewed.includes(m.id)?'<span class="tag">학습 완료</span>':''}</div><h3>${m.name}</h3><p class="small muted">${m.focus}</p><div class="item-bottom"><span>◷ ${m.minutes}분</span><span>${data.notes[m.id]?'메모 있음':'핵심 정리'} ↗</span></div></button>`).join('')}</div>`:`<div class="empty"><h2>일치하는 메뉴가 없어요</h2><p>다른 이름이나 재료로 검색해 보세요.</p>${action('clear-search','검색 초기화')}</div>`;
  }
  function detail(id){
    const m=byId.get(id);if(!m)return;
    openDialog(m.name,`<div class="detail-meta"><span class="badge">${m.category}</span><span class="badge">과제 시간 ${m.minutes}분</span><span class="badge">공개과제 ${String(m.number).padStart(2,'0')}</span>${m.stepSource?`<span class="tag warm">${esc(m.stepSource)} 반영</span>`:''}</div><div class="detail-section"><h3>기억할 핵심 규격</h3>${requirementsContent(m)}</div>${m.separationNames?`<div class="detail-section"><h3>분리재료 ${m.separationNames.length}종</h3><p class="small muted">${m.reference?'참고 자료의 분리재료 기준':'내 실습 메모 기준'} · 중복 재료는 한 번만 표시합니다.</p><div class="chips">${m.separationNames.map(name=>`<span class="chip">${esc(name)}</span>`).join('')}</div></div>`:''}<div class="detail-section"><h3>지급재료 ${m.ingredients.length}종</h3><p class="small muted">지급량이며 실제 조리 배합량과는 다릅니다.</p><div class="chips">${m.ingredients.map(i=>`<span class="chip">${i.name} <b>${i.amount}</b></span>`).join('')}</div></div><div class="detail-section"><h3>${m.stepSource?(m.reference?'참고 자료 조리 순서 · ':'내 실습 조리 순서 · ')+m.steps.length+'단계':'학습용 조리 흐름'}</h3>${m.stepSource?(m.reference?'<p class="small muted">참고 글의 핵심 과정을 요약했습니다. 상세한 설명은 원문을 확인하세요.</p>':'<p class="small muted">보내주신 순서와 분량을 기준으로 정리했습니다. t와 T는 원문 표기를 유지합니다.</p>'):''}${referenceContent(m)}${sequence(m)}<div class="notice">${m.tip}</div><p class="source-note">${m.stepSource?'순서 연습에도 이 '+m.steps.length+'단계를 사용합니다.':'전처리끼리는 순서를 바꿀 수 있습니다. 아래 연습은 이 예시 흐름을 기억하는 활동입니다.'}</p></div><div class="detail-section"><label for="dish-note"><b>나만의 메모</b></label><textarea id="dish-note" data-note="${m.id}" maxlength="10000" placeholder="수업에서 배운 배합, 헷갈리는 규격, 나만의 순서를 적어보세요.">${esc(data.notes[m.id]||'')}</textarea><div class="row between"><span id="note-status" class="saved-indicator">이 브라우저에 저장됩니다</span><label class="small"><input type="checkbox" data-reviewed="${m.id}" ${data.reviewed.includes(m.id)?'checked':''}> 학습 완료</label></div></div>`,action('close','닫기','primary'));
  }
  function renderNotes(){
    const notes=menus.filter(m=>data.notes[m.id]?.trim());
    $('#main').innerHTML=`<div class="page-head"><div><div class="eyebrow">MY STUDY LOG</div><h1>내 학습 노트</h1><p>완료한 연습과 직접 적은 메모만 차곡차곡 모아요.</p></div>${data.history.length?action('clear-history','연습 기록 비우기','text-button'):''}</div><div class="tabs-small">${action('tab-history',`연습 기록 ${data.history.length}`,`filter-button ${noteTab==='history'?'active':''}`)}${action('tab-notes',`메뉴 메모 ${notes.length}`,`filter-button ${noteTab==='notes'?'active':''}`)}</div><div id="notes-content"></div><p class="source-note">기록은 현재 브라우저에 저장됩니다. 다른 기기와 자동으로 동기화되지 않으며 브라우저 데이터 삭제 시 사라집니다.</p>`;
    if(noteTab==='notes'){
      $('#notes-content').innerHTML=notes.length?`<div class="note-list">${notes.map(m=>`<article class="panel"><div class="panel-head"><h3>${m.name}</h3>${action('detail','메모 수정','text-button',`data-id="${m.id}"`)}</div><div class="note-entry">${esc(data.notes[m.id])}</div></article>`).join('')}</div>`:`<div class="empty"><h2>나만의 레시피 노트를 시작해요</h2><p>메뉴 도감에 남긴 메모가 이곳에 모입니다.</p>${action('guide','도감에서 메모하기','primary')}</div>`;
    }else{
      $('#notes-content').innerHTML=data.history.length?data.history.map(h=>`<article class="panel record"><div class="row between wrap"><div><h3>${h.pair.map(id=>byId.get(id).name).join(' + ')}</h3><span class="small muted">${new Date(h.when).toLocaleString('ko-KR')} · ${formatTime(h.elapsed)} 연습</span></div>${action('retry','이 조합 다시 연습','',`data-record="${esc(h.id)}"`)}</div><div class="record-errors">재료 분류 ${h.sortCorrect}/${h.sortTotal} · 예시 순서 일치 ${h.orderCorrect}/${h.orderTotal}</div>${h.errors.length?`<details><summary>다시 볼 항목 ${h.errors.length}개</summary>${list(h.errors)}</details>`:'<span class="tag">분류와 예시 순서를 모두 확인했어요</span>'}<details><summary>내가 떠올린 순서</summary>${h.pair.map(id=>`<h3>${byId.get(id).name}</h3><div class="note-entry">${esc(h.recall[id]||'작성하지 않았어요.')}</div>`).join('')}</details></article>`).join(''):`<div class="empty"><h2>첫 연습을 기다리고 있어요</h2><p>연습을 마치면 결과와 다시 볼 항목이 여기에 저장됩니다.</p>${action('home','첫 연습 시작하기','primary')}</div>`;
    }
  }
  function pause(){const s=data.session;if(s?.running){s.remaining=Math.max(0,(s.deadline-Date.now())/1000);s.running=false;s.deadline=0;save();}}
  function resumeTimer(){const s=data.session;if(!s||s.remaining<=0)return;s.deadline=Date.now()+s.remaining*1000;s.running=true;save();}
  function sessionRemaining(){const s=data.session;return s.running?Math.max(0,(s.deadline-Date.now())/1000):s.remaining;}
  function startSession(){
    if(!$('#ready')?.checked){toast('핵심 규격과 준비사항을 확인해 주세요.');return;}
    const orders=Object.fromEntries(data.selected.map(id=>{let indices=shuffle(byId.get(id).steps.map((_,i)=>i));if(indices.every((n,i)=>n===i))indices=indices.slice(1).concat(indices[0]);return [id,indices];}));
    data.session={id:crypto.randomUUID(),pair:[...data.selected],stage:0,duration:previewMinutes*60,remaining:previewMinutes*60,running:true,deadline:Date.now()+previewMinutes*60000,assignments:{},recall:Object.fromEntries(data.selected.map(id=>[id,''])),orders,recipeVersions:Object.fromEntries(data.selected.map(id=>[id,byId.get(id).revision||1])),sortChecked:false,compare:false};
    save();closeDialog();view='session';render(true);
  }
  function showRequirements(){
    openDialog('시작 전, 요구사항 확인',`${data.session?'<div class="notice">새 연습을 시작하면 진행 중인 연습이 바뀝니다. 완료한 기록과 메뉴 메모는 유지됩니다.</div>':''}${selectedMenus().map(m=>`<div class="detail-section"><div class="row between"><h3>${m.name}</h3><span class="badge">${m.minutes}분</span></div>${requirementsContent(m)}</div>`).join('')}<div class="notice">위생복·위생모·앞치마·마스크를 준비하고, 화구는 1개만 사용합니다. 재료 상태는 시험 시작 전에 확인하세요.</div><label class="row small"><input id="ready" type="checkbox"> 두 메뉴의 규격과 준비사항을 확인했어요</label>`,action('close','돌아가기')+action('begin','확인하고 시작','primary'));
  }
  function renderSession(){
    const s=data.session;if(!s){view='practice';render();return;}
    const [a,b]=s.pair.map(id=>byId.get(id));
    $('#main').innerHTML=`<div class="session-top"><div>${action('leave','← 연습 홈','text-button')}<h2>${a.name} <span class="muted">+</span> ${b.name}</h2></div><div class="row wrap"><div><span class="small muted">남은 연습 시간</span> <span class="timer" id="timer">${formatTime(sessionRemaining())}</span></div>${action('pause',s.running?'일시정지':'계속','', 'id="pause-button"')}${action('session-req','규격 확인','text-button')}</div></div><ol class="stepper">${['재료 나누기','순서 떠올리기','순서 완성하기'].map((t,i)=>`<li class="${i===s.stage?'active':i<s.stage?'done':''}" ${i===s.stage?'aria-current="step"':''}>0${i+1} &nbsp; ${t}</li>`).join('')}</ol><section class="panel" id="stage"></section>`;
    if(s.stage===0)renderSorting();if(s.stage===1)renderRecall();if(s.stage===2)renderOrdering();updateTimer();
  }
  function renderSorting(){
    const s=data.session,items=mergeIngredients(s.pair),count=items.filter(i=>s.assignments[i.name]).length;
    $('#stage').innerHTML=`<div class="stage-head"><div class="eyebrow">01 / PREP</div><h1>이 재료, 어디에 쓸까요?</h1><p>각 재료 아래에서 메뉴를 선택하세요. 양쪽에 쓰면 ‘공통’입니다.</p></div><div class="notice"><b>A</b> ${byId.get(s.pair[0]).name} &nbsp; · &nbsp; <b>B</b> ${byId.get(s.pair[1]).name}<br><span class="small">${s.pair.some(id=>byId.get(id).reference)?'실습 메모·참고 자료의 지정 분리재료로 연습합니다. 전체 지급재료는 도감에서 확인하세요.':s.pair.some(id=>byId.get(id).separationNames)?'실습 메모가 있는 메뉴는 지정한 분리재료만 연습합니다. 양념을 포함한 전체 지급재료는 도감에서 확인하세요.':'지급재료의 이름·손질 상태를 기준으로 분류합니다. 정답은 분류 확인 후 표시돼요.'}</span></div><div class="ingredient-list">${items.map((item,index)=>`<div class="ingredient-row"><div class="ingredient-label"><b>${item.name}</b><span class="small muted">${quantity(item.amounts)}</span></div><div class="assign" role="group" aria-label="${item.name} 분류">${['A','both','B'].map(zone=>`<button data-action="assign" data-index="${index}" data-zone="${zone}" class="${s.assignments[item.name]===zone?'selected':''}" aria-pressed="${s.assignments[item.name]===zone}" ${s.sortChecked?'disabled':''}>${zone==='both'?'공통':zone+' 메뉴'}</button>`).join('')}</div>${s.sortChecked?`<div class="feedback ${s.assignments[item.name]===item.zone?'good':''}">${s.assignments[item.name]===item.zone?'✓ 정답':'다시 보기 → '+zoneLabel(item.zone,s.pair)}</div>`:''}</div>`).join('')}</div><div class="stage-actions"><span class="small muted" id="assign-count">${count} / ${items.length} 분류</span>${s.sortChecked?action('to-recall','순서 떠올리기 →','primary'):action('check-sort','분류 확인하기','primary')}</div>`;
  }
  function renderRecall(){
    const s=data.session;
    $('#stage').innerHTML=`<div class="stage-head"><div class="eyebrow">02 / RECALL</div><h1>보지 않고, 먼저 떠올려요</h1><p>먼저 해야 할 일부터 적어보세요. 자유 서술은 자동 채점하지 않습니다.</p></div><div class="recipe-columns">${s.pair.map(id=>{const m=byId.get(id);return `<article class="recall"><h3>${m.name}</h3><label class="screen-reader" for="recall-${id}">${m.name} 기억한 조리 순서</label><textarea id="recall-${id}" data-recall="${id}" maxlength="10000" placeholder="1. 먼저 준비할 재료는…&#10;2. 손질이 끝나면…&#10;3. 마지막에는…">${esc(s.recall[id]||'')}</textarea>${s.compare?`<details open><summary>${m.reference?'참고 자료 요약 순서':m.stepSource?'내 실습 메모 순서':'학습용 예시 순서'}</summary>${referenceContent(m)}${sequence(m)}</details>`:''}</article>`;}).join('')}</div><div class="stage-actions"><div>${action('compare',s.compare?'예시 접기':'예시와 비교하기')}</div>${action('to-order','조리 순서 완성하기 →','primary')}</div>`;
  }
  function renderOrdering(){
    const s=data.session;
    $('#stage').innerHTML=`<div class="stage-head"><div class="eyebrow">03 / COOK</div><h1>조리 흐름을 완성해요</h1><p>위·아래 버튼으로 카드를 옮겨 학습용 예시 순서를 완성하세요.</p></div><div class="notice">전처리 순서는 상황에 따라 달라질 수 있어요. 여기서는 도감의 예시와 비교하며, 실제 시험의 조리 순서를 채점하는 기능은 아닙니다.</div><div class="recipe-columns">${s.pair.map(id=>`<article><h3>${byId.get(id).name}</h3><ol class="order-list" id="order-${id}">${orderCards(id)}</ol></article>`).join('')}</div><div class="stage-actions">${action('back-recall','← 적은 내용 다시 보기','text-button')}${action('finish','연습 마치고 결과 보기 →','primary')}</div>`;
  }
  function orderCards(id){return data.session.orders[id].map((step,index)=>`<li class="order-card"><span class="step-index">${index+1}</span><span class="step-text">${stepContent(byId.get(id),step)}</span><span class="move-controls"><button data-action="move" data-id="${id}" data-step="${step}" data-direction="-1" aria-label="${byId.get(id).name} ${index+1}번째 카드 위로" ${index===0?'disabled':''}>↑</button><button data-action="move" data-id="${id}" data-step="${step}" data-direction="1" aria-label="${byId.get(id).name} ${index+1}번째 카드 아래로" ${index===data.session.orders[id].length-1?'disabled':''}>↓</button></span></li>`).join('');}
  function finish(){
    const s=data.session;if(!s||s.stage!==2)return;pause();
    const ingredients=mergeIngredients(s.pair),wrong=ingredients.filter(i=>s.assignments[i.name]!==i.zone);
    const orderErrors=s.pair.flatMap(id=>s.orders[id].map((step,index)=>step===index?null:`${byId.get(id).name} ${index+1}단계 예시: ${byId.get(id).steps[index]}`).filter(Boolean));
    const result={id:s.id,pair:[...s.pair],when:Date.now(),elapsed:Math.round(s.duration-s.remaining),sortCorrect:ingredients.length-wrong.length,sortTotal:ingredients.length,orderCorrect:s.pair.reduce((n,id)=>n+s.orders[id].filter((step,index)=>step===index).length,0),orderTotal:s.pair.reduce((n,id)=>n+byId.get(id).steps.length,0),errors:[...wrong.map(i=>`${i.name}: ${zoneLabel(s.assignments[i.name],s.pair)} → ${zoneLabel(i.zone,s.pair)}`),...orderErrors],recall:{...s.recall}};
    data.history=[result,...data.history.filter(h=>h.id!==result.id)].slice(0,100);data.session=null;const saved=save();
    $('#main').innerHTML=`<div class="page-head"><div><div class="eyebrow">PRACTICE COMPLETE</div><h1>한 번 더 익숙해졌어요</h1><p>${result.pair.map(id=>byId.get(id).name).join(' + ')} 연습을 마쳤습니다.</p></div><span class="badge">${saved?'학습 노트에 저장됨':'현재 화면에 결과 표시'}</span></div><section class="panel"><div class="result-metrics"><div><strong>${result.sortCorrect}<span class="small muted"> / ${result.sortTotal}</span></strong><span>재료 분류 정답</span></div><div><strong>${result.orderCorrect}<span class="small muted"> / ${result.orderTotal}</span></strong><span>예시 순서 일치</span></div><div><strong>${formatTime(result.elapsed)}</strong><span>연습한 시간</span></div></div>${result.errors.length?`<h2>다음 연습에서 다시 볼 부분</h2>${list(result.errors)}`:'<div class="notice success">재료 분류와 학습용 예시 순서가 모두 일치해요. 다음 조합에 도전해 보세요.</div>'}<p class="source-note">이 결과는 암기 연습용입니다. 실제 시험의 맛·위생·숙련도·완성품을 평가하지 않습니다.</p><div class="stage-actions">${action('notes','학습 노트 보기')}${action('home','다음 연습 준비하기','primary')}</div></section>`;
    $('#main').focus({preventScroll:true});window.scrollTo({top:0});
  }
  function updateTimer(){
    if(!data.session||view!=='session')return;
    const remaining=sessionRemaining(),el=$('#timer');if(!el)return;
    el.textContent=formatTime(remaining);el.classList.toggle('low',remaining<60);
    if(data.session.running&&remaining<=0){pause();toast('연습 시간이 끝났어요. 남은 단계는 계속 복습할 수 있습니다.');}
    const button=$('#pause-button');button.textContent=data.session.remaining<=0?'시간 종료':data.session.running?'일시정지':'계속';button.disabled=remaining<=0;
  }
  function navigate(next){if(view==='session')pause();view=next;render(true);}
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-nav]');if(nav){navigate(nav.dataset.nav);return;}
    if(event.target.closest('.brand')){event.preventDefault();navigate('practice');return;}
    const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
    const type=button.dataset.action;
    if(type==='close'){closeDialog();if(view==='guide'||view==='notes')render();return;}
    if(type==='home'||type==='leave'){navigate('practice');return;}
    if(type==='guide'||type==='notes'){navigate(type);return;}
    if(type==='random'){const old=data.selected.join();let pair=shuffle(menus).slice(0,2).map(m=>m.id);if(pair.join()===old)pair.reverse();data.selected=pair;previewMinutes=selectedMenus().reduce((n,m)=>n+m.minutes,0);save();render();return;}
    if(type==='choose'){
      openDialog('연습할 두 메뉴 고르기',`<p class="muted small" style="margin-top:12px">서로 다른 메뉴를 하나씩 선택하세요.</p>${['A','B'].map((slot,i)=>`<div class="field"><label for="choose-${slot}">${slot} 메뉴</label><select id="choose-${slot}">${menus.map(m=>`<option value="${m.id}" ${m.id===data.selected[i]?'selected':''}>${m.name} · ${m.minutes}분</option>`).join('')}</select></div>`).join('')}`,action('close','취소')+action('apply-pair','선택 완료','primary'));return;
    }
    if(type==='apply-pair'){const pair=[$('#choose-A').value,$('#choose-B').value];if(!pairValid(pair)){toast('서로 다른 메뉴 두 가지를 골라 주세요.');return;}data.selected=pair;previewMinutes=selectedMenus().reduce((n,m)=>n+m.minutes,0);save();closeDialog();render();return;}
    if(type==='duration'){openDialog('연습 시간 설정',`<p class="small muted" style="margin-top:14px">기본값은 두 과제 시간의 합계입니다. 실제 시험에서는 시험장 안내를 따르세요.</p><div class="field"><label for="practice-minutes">연습 시간 (1~180분)</label><input type="number" id="practice-minutes" min="1" max="180" step="1" value="${previewMinutes}"></div>`,action('apply-duration','설정 저장','primary'));return;}
    if(type==='apply-duration'){const minutes=Number($('#practice-minutes').value);if(!Number.isInteger(minutes)||minutes<1||minutes>180){toast('1~180 사이의 정수로 입력해 주세요.');return;}previewMinutes=minutes;closeDialog();render();return;}
    if(type==='date'){openDialog('나의 실기 시험일',`<p class="small muted" style="margin-top:14px">접수한 개인 시험일을 입력해 주세요.</p><div class="field"><label for="exam-date">시험일</label><input type="date" id="exam-date" min="2000-01-01" max="2100-12-31" value="${data.examDate}"></div>`,action('clear-date','날짜 지우기')+action('save-date','저장','primary'));return;}
    if(type==='save-date'){const date=$('#exam-date').value;if(!dateValid(date)||date<'2000-01-01'||date>'2100-12-31'){toast('올바른 시험 날짜를 선택해 주세요.');return;}data.examDate=date;save();closeDialog();render();return;}
    if(type==='clear-date'){data.examDate='';save();closeDialog();render();return;}
    if(type==='start'){showRequirements();return;}
    if(type==='begin'){startSession();return;}
    if(type==='resume'){view='session';resumeTimer();render(true);return;}
    if(type==='pause'){data.session.running?pause():resumeTimer();updateTimer();return;}
    if(type==='session-req'){openDialog('현재 메뉴의 핵심 규격',data.session.pair.map(id=>`<div class="detail-section"><h3>${byId.get(id).name}</h3>${requirementsContent(byId.get(id))}</div>`).join(''),action('close','계속 연습','primary'));return;}
    if(type==='detail'){detail(button.dataset.id);return;}
    if(type==='clear-search'){guideQuery='';guideCategory='전체';renderGuide();return;}
    if(type==='assign'){const s=data.session;if(!s||s.stage!==0||s.sortChecked)return;const item=mergeIngredients(s.pair)[Number(button.dataset.index)];s.assignments[item.name]=button.dataset.zone;save();button.parentElement.querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});$('#assign-count').textContent=`${Object.keys(s.assignments).length} / ${mergeIngredients(s.pair).length} 분류`;return;}
    if(type==='check-sort'){const s=data.session,items=mergeIngredients(s.pair);if(items.some(i=>!s.assignments[i.name])){toast('모든 재료를 분류한 뒤 확인해 주세요.');return;}s.sortChecked=true;save();renderSorting();toast('분류 결과를 확인하고 다음 단계로 넘어가세요.');return;}
    if(type==='to-recall'){if(!data.session.sortChecked)return;data.session.stage=1;save();render(true);return;}
    if(type==='compare'){data.session.compare=!data.session.compare;save();renderRecall();return;}
    if(type==='to-order'){data.session.stage=2;save();render(true);return;}
    if(type==='back-recall'){data.session.stage=1;save();render(true);return;}
    if(type==='move'){const id=button.dataset.id,step=Number(button.dataset.step),direction=Number(button.dataset.direction),array=data.session.orders[id],index=array.indexOf(step),target=index+direction;if(target<0||target>=array.length)return;[array[index],array[target]]=[array[target],array[index]];save();$('#order-'+id).innerHTML=orderCards(id);const same=$(`[data-id="${id}"][data-step="${step}"][data-direction="${direction}"]`);if(same&&!same.disabled)same.focus();else $(`[data-id="${id}"][data-step="${step}"][data-direction="${-direction}"]`)?.focus();return;}
    if(type==='finish'){finish();return;}
    if(type==='tab-history'||type==='tab-notes'){noteTab=type==='tab-history'?'history':'notes';renderNotes();return;}
    if(type==='retry'){const record=data.history.find(h=>h.id===button.dataset.record);if(!record)return;data.selected=[...record.pair];previewMinutes=selectedMenus().reduce((n,m)=>n+m.minutes,0);save();navigate('practice');showRequirements();return;}
    if(type==='clear-history'){openDialog('연습 기록을 비울까요?',`<p style="margin-top:18px">완료한 연습 ${data.history.length}건을 삭제합니다. 메뉴 메모와 도감 학습 표시는 유지됩니다.</p>`,action('close','취소')+action('confirm-clear','기록 비우기','primary'));return;}
    if(type==='confirm-clear'){data.history=[];save();closeDialog();renderNotes();return;}
    if(type==='sources'){openDialog('학습 자료 안내',`<div class="detail-section"><h3>메뉴·시간·지급재료</h3><p class="small" style="margin-top:10px">${window.STUDY_SOURCE.original}<br>확인일: ${window.STUDY_SOURCE.checked}</p><p style="margin-top:12px"><a href="${window.STUDY_SOURCE.url}" target="_blank" rel="noopener noreferrer">큐넷 2026년 공개문제 보기 ↗</a></p></div><div class="detail-section"><h3>참고한 조리 글</h3>${menus.filter(m=>m.reference).map(referenceContent).join('')}</div><div class="detail-section"><h3>학습용으로 정리한 내용</h3><p class="small" style="margin-top:10px">핵심 규격은 공개과제의 사실을 요약했습니다. 조리 순서와 팁은 암기 연습용 예시·참고 링크 요약 또는 직접 보내주신 실습 메모이며 공식 채점표가 아닙니다. 실제 조리의 전처리 순서는 조합에 따라 달라질 수 있습니다.</p><p class="small" style="margin-top:10px">실습 메모가 있는 메뉴는 지정한 분리재료로 분류를 연습합니다. 도감의 수량은 지급량입니다. 전량을 양념에 넣는 배합표가 아닙니다. 재료 분류에서는 이쑤시개 같은 비식품 도구를 제외하고, 다진 고기와 덩어리 고기처럼 손질 상태가 다른 재료는 구분합니다.</p><p class="small" style="margin-top:10px">시험 전에는 큐넷 원문과 변경 공지를 다시 확인하세요.</p></div>`,action('close','확인','primary'));return;}
  });
  document.addEventListener('input',event=>{
    const el=event.target;
    if(el.id==='menu-search'){guideQuery=el.value;renderCatalog();}
    if(el.dataset.note){data.notes[el.dataset.note]=el.value;const ok=save();$('#note-status').textContent=ok?'저장됨':'저장 불가 · 내용을 복사해 보관해 주세요';}
    if(el.dataset.recall&&data.session){data.session.recall[el.dataset.recall]=el.value;save();}
  });
  document.addEventListener('change',event=>{
    const el=event.target;
    if(el.id==='category'){guideCategory=el.value;renderCatalog();}
    if(el.dataset.reviewed){const set=new Set(data.reviewed);el.checked?set.add(el.dataset.reviewed):set.delete(el.dataset.reviewed);data.reviewed=[...set];save();}
  });
  $('#dialog').addEventListener('close',()=>{if(view==='guide'||view==='notes')render();});
  window.addEventListener('pagehide',()=>{if(data.session){data.session.remaining=sessionRemaining();save();}});
  setInterval(updateTimer,500);
  render();
  if(storageIssue)setTimeout(()=>toast(storageIssue),200);
})();
