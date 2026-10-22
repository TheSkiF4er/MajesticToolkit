/* MajesticToolkit 0.3 — standalone validation and deterministic case/evidence transformations. */
(function (root) {
  'use strict';
  const PREFIX = 'rpnComplaintV3:';
  const MAX_CASES = 500;
  const MAX_EVIDENCE = 60;
  const STATUS = Object.freeze(['new', 'in-progress', 'waiting', 'done']);
  const ALLOWED_HOSTS = Object.freeze(['forum.majestic-rp.ru', 'forum.russia.online']);
  // Explicit, local-only review steps. None of these actions send messages to a forum.
  const WORKFLOW_STAGES = Object.freeze(['intake','facts','evidence','decision','closed']);
  const WORKFLOW_LABELS = Object.freeze({intake:'Регистрация',facts:'Изучение обстоятельств',evidence:'Проверка доказательств',decision:'Подготовка решения',closed:'Завершено'});
  const WORKFLOW_CHECKS = Object.freeze({intake:'Проверены ссылка и номер темы',facts:'Изучены доводы и участники',evidence:'Доказательства проверены либо зафиксировано их отсутствие',decision:'Подготовлен и проверен черновик решения'});
  const DECISION_KINDS = Object.freeze({satisfied:'Удовлетворить',rejected:'Отклонить',partial:'Удовлетворить частично',request:'Запросить уточнения',refer:'Направить по компетенции'});
  const HISTORY_LIMIT = 120;
  function initialWorkflow(status='new') {
    const closed=status==='done';
    return {stage:closed?'closed':'intake',checks:Object.fromEntries(WORKFLOW_STAGES.slice(0,-1).map(x=>[x,closed])),decision:'request',history:[]};
  }
  function cleanWorkflow(value,status='new') {
    if(value===undefined||value===null)return initialWorkflow(status);
    if(!value||typeof value!=='object'||Array.isArray(value)||!WORKFLOW_STAGES.includes(value.stage)||!Object.hasOwn(DECISION_KINDS,value.decision))throw Error('Неверный процесс рассмотрения');
    if(!value.checks||typeof value.checks!=='object'||Array.isArray(value.checks))throw Error('Неверный чек-лист');
    const checks={};for(const stage of WORKFLOW_STAGES.slice(0,-1)){
      if(typeof value.checks[stage]!=='boolean')throw Error('Неверное состояние этапа');checks[stage]=value.checks[stage];
    }
    if(!Array.isArray(value.history)||value.history.length>HISTORY_LIMIT)throw Error('Журнал действий повреждён или переполнен');
    const history=value.history.map(row=>{
      if(!row||typeof row!=='object'||Array.isArray(row)||!['step','check','decision','note','deadline','status','draft','evidence'].includes(row.type))throw Error('Неверная запись журнала');
      const description=str(row.text,'Запись журнала',500);
      return {id:str(row.id,'ID события',120),type:row.type,text:description,at:date(row.at,'Время события')};
    });
    if(new Set(history.map(x=>x.id)).size!==history.length)throw Error('Повторные записи журнала');
    return {stage:value.stage,checks,decision:value.decision,history};
  }
  function event(workflow,type,text) {
    const history=[...workflow.history,{id:uuid(),type,text,at:new Date().toISOString()}].slice(-HISTORY_LIMIT);
    return {...workflow,history};
  }
  function workflowAction(old,action,payload={}) {
    const item=cleanCase(old),w=item.workflow;
    let next=w,patch={};
    if(action==='check'){
      if(!Object.hasOwn(WORKFLOW_CHECKS,payload.stage))throw Error('Неверный пункт чек-листа');
      if(typeof payload.done!=='boolean')throw Error('Необходимо явно указать выполнение');
      if(WORKFLOW_STAGES.indexOf(payload.stage)>WORKFLOW_STAGES.indexOf(w.stage))throw Error('Этап ещё не открыт');
      next=event({...w,checks:{...w.checks,[payload.stage]:payload.done}},'check',`${WORKFLOW_LABELS[payload.stage]}: ${payload.done?'отмечено':'отменено'}`);
    } else if(action==='next'||action==='previous'){
      const i=WORKFLOW_STAGES.indexOf(w.stage),index=i+(action==='next'?1:-1);
      if(index<0||index>=WORKFLOW_STAGES.length)throw Error('Дальнейший переход невозможен');
      if(action==='next'&&!w.checks[w.stage])throw Error('Сначала выполните и отметьте проверку текущего этапа');
      if(action==='next'&&index===4&&!item.draft.trim())throw Error('Перед завершением сохраните черновик решения');
      if(action==='next'&&index===4&&payload.confirm!==true)throw Error('Завершение требует явного подтверждения');
      next=event({...w,stage:WORKFLOW_STAGES[index]},'step',`Этап: ${WORKFLOW_LABELS[WORKFLOW_STAGES[index]]}`);
      patch.status=index===4?'done':(item.status==='done'?'in-progress':item.status==='new'?'in-progress':item.status);
    }else if(action==='decision'){
      if(!Object.hasOwn(DECISION_KINDS,payload.kind))throw Error('Неизвестный тип решения');
      next=event({...w,decision:payload.kind},'decision',`Шаблон: ${DECISION_KINDS[payload.kind]}`);
    }else if(action==='note'){
      next=event(w,'note',str(payload.text,'Запись в журнале',500));
    }else throw Error('Неизвестная операция процесса');
    return cleanCase({...item,...patch,workflow:next,updatedAt:new Date().toISOString()});
  }
  function draftDecision(item) {
    const c=cleanCase(item);const kind=c.workflow.decision;
    const intro={satisfied:'По результатам рассмотрения предлагается удовлетворить обращение.',rejected:'По результатам рассмотрения предлагается отказать в удовлетворении обращения.',partial:'По результатам рассмотрения предлагается частично удовлетворить обращение.',request:'Для продолжения рассмотрения необходимо запросить уточняющие сведения.',refer:'Обращение предлагается передать уполномоченному подразделению.'}[kind];
    return `РЕШЕНИЕ ПО ОБРАЩЕНИЮ\nТема: ${c.title}\nИсточник: ${c.url}\nДата подготовки: ${new Date().toISOString().slice(0,10)}\n\n${intro}\n\nУстановленные обстоятельства: [заполнить вручную]\nПроверенные доказательства (${c.evidence.length}): ${c.evidence.map(x=>x.title).join('; ')||'[нет прикреплённых]'}\nОснования решения: [указать нормы и факты вручную]\nИтоговое решение: [уточнить и подтвердить вручную]\n\nТекст подготовлен локально. Отправка на форум выполняется пользователем.`;
  }
  function deadlineTier(deadline,now=Date.now()){
    if(!deadline)return null;const remaining=Date.parse(deadline)-now;
    if(!Number.isFinite(remaining)||remaining>24*60*60*1000)return null;
    return remaining<=0?'overdue':remaining<=15*60000?'15m':remaining<=60*60000?'1h':'24h';
  }
  const VIDEO_HOSTS = Object.freeze(['www.youtube.com','youtube.com','youtu.be','rutube.ru','www.rutube.ru','www.twitch.tv','twitch.tv']);
  function str(value, name, max, optional = false) {
    if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) throw Error(`${name}: неверное значение`);
    return value.trim();
  }
  function date(value, name, nullable = false) {
    if (nullable && (value === null || value === '')) return null;
    if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) throw Error(`${name}: неверная дата`);
    return new Date(value).toISOString();
  }
  function uuid() { return root.crypto?.randomUUID?.() ?? `rpn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
  function httpsUrl(value, name, hostList = null) {
    if (typeof value !== 'string' || value.length > 2048) throw Error(`${name}: неверная ссылка`);
    let url;
    try { url = new URL(value); } catch { throw Error(`${name}: неверная ссылка`); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hostname.endsWith('.') || (hostList && !hostList.includes(url.hostname))) throw Error(`${name}: разрешены только подходящие HTTPS-ссылки`);
    url.hash = '';
    return url;
  }
  function canonicalThreadUrl(value) {
    const url = httpsUrl(value, 'Тема', ALLOWED_HOSTS);
    // URL may include a path before /threads/ on XenForo deployments.
    const match = url.pathname.match(/(?:^|\/)threads\/([^/]+)(?:\/|$)/i);
    if (!match) throw Error('Нужна HTTPS-ссылка на тему форума (/threads/)');
    const key = match[1].match(/\.(\d+)$/)?.[1] || (match[1].match(/^\d+$/)?.[0] ?? match[1].toLowerCase());
    if (!/^[\p{L}\p{N}_.%-]{1,180}$/u.test(key)) throw Error('Некорректный идентификатор темы');
    return { url: `${url.origin}${url.pathname.replace(/\/?$/, '/')}`, key: `${url.hostname}:${key}` };
  }
  function threadKey(value) { return canonicalThreadUrl(value).key; }
  function videoLink(value, seconds = null) {
    const url = httpsUrl(value, 'Доказательство');
    if (seconds !== null) {
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400) throw Error('Неверный таймкод');
      // Store the time independently; never destructively change the original link.
    }
    return url.href;
  }
  function cleanEvidence(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Некорректное доказательство');
    const seconds = data.seconds === null || data.seconds === undefined || data.seconds === '' ? null : Number(data.seconds);
    if (!/^[\w-]{8,120}$/.test(data.id)) throw Error('Некорректный ID доказательства');
    const result = {
      id: str(data.id, 'ID доказательства', 120),
      url: videoLink(data.url, seconds), seconds,
      title: str(data.title, 'Название доказательства', 180),
      note: str(data.note ?? '', 'Заметка к доказательству', 1000, true),
      createdAt: date(data.createdAt, 'Дата доказательства')
    };
    return result;
  }
  function cleanCase(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Некорректная жалоба');
    if (!/^[\w-]{8,120}$/.test(data.id)) throw Error('Некорректный ID жалобы');
    const thread = canonicalThreadUrl(data.url);
    if (!STATUS.includes(data.status)) throw Error('Неизвестный статус');
    if (!Array.isArray(data.evidence) || data.evidence.length > MAX_EVIDENCE) throw Error('Слишком много доказательств');
    const evidence = data.evidence.map(cleanEvidence);
    if (new Set(evidence.map(e => e.id)).size !== evidence.length) throw Error('Дублирование доказательств');
    if (typeof data.watching !== 'boolean' || typeof data.unread !== 'boolean') throw Error('Некорректные настройки жалобы');
    if (!(data.lastSeenPostId === null || (Number.isSafeInteger(data.lastSeenPostId) && data.lastSeenPostId >= 0))) throw Error('Некорректный ID сообщения');
    return {
      id: str(data.id, 'ID жалобы', 120), profileId: str(data.profileId, 'Профиль', 128),
      url: thread.url, threadKey: thread.key,
      title: str(data.title, 'Название жалобы', 240), status: data.status,
      note: str(data.note, 'Заметка', 12000, true), draft: str(data.draft, 'Черновик', 30000, true),
      deadline: date(data.deadline, 'Срок', true), watching: data.watching,
      lastSeenPostId: data.lastSeenPostId,
      lastCheckedAt: date(data.lastCheckedAt, 'Дата проверки', true),
      unread: data.unread, evidence, workflow:cleanWorkflow(data.workflow,data.status),
      createdAt: date(data.createdAt, 'Дата создания'), updatedAt: date(data.updatedAt, 'Дата изменения')
    };
  }
  function createCase(data) {
    if(data.status==='done')throw Error('Создание завершённой жалобы требует процесса рассмотрения');
    const now = new Date().toISOString();
    return cleanCase({ id: uuid(), profileId: data.profileId, title: data.title, url: data.url, status: data.status || 'new', note: data.note ?? '', draft: data.draft ?? '', deadline: data.deadline || null, watching: data.watching ?? true, lastSeenPostId: null, lastCheckedAt: null, unread: false, evidence: [], createdAt: now, updatedAt: now });
  }
  function updateCase(old, fields) {
    const allowed = ['title','status','note','draft','deadline','watching','unread'];
    const values = Object.fromEntries(Object.entries(fields).filter(([key]) => allowed.includes(key)));
    const item=cleanCase(old);
    let flow=item.workflow;
    if(Object.hasOwn(values,'status')&&values.status!==item.status){
      flow=event(flow,'status',`Статус: ${values.status}`);
      if(values.status==='done' && item.workflow.stage!=='closed')throw Error('Для завершения пройдите этапы процесса и подтвердите решение');
      else if(flow.stage==='closed')flow={...flow,stage:'decision'};
    }
    if(Object.hasOwn(values,'deadline')&&values.deadline!==item.deadline)flow=event(flow,'deadline',`Срок: ${values.deadline||'снят'}`);
    if(Object.hasOwn(values,'draft')&&values.draft!==item.draft)flow=event(flow,'draft','Черновик изменён (без публикации)');
    return cleanCase({ ...item, ...values,workflow:flow, updatedAt: new Date().toISOString() });
  }
  function addEvidence(old, input) {
    const item = cleanCase(old);
    if (item.evidence.length >= MAX_EVIDENCE) throw Error('Максимум доказательств достигнут');
    const next = { id: uuid(), url: input.url, seconds: input.seconds ?? null, title: input.title || 'Доказательство', note: input.note ?? '', createdAt: new Date().toISOString() };
    return cleanCase({ ...item, evidence: [...item.evidence, next],workflow:event(item.workflow,'evidence','Прикреплено доказательство: '+next.title.slice(0,90)), updatedAt: new Date().toISOString() });
  }
  function removeEvidence(old, id) {
    const item = cleanCase(old);
    if (!item.evidence.some(e => e.id === id)) throw Error('Доказательство не найдено');
    return cleanCase({ ...item, evidence: item.evidence.filter(e => e.id !== id),workflow:event(item.workflow,'evidence','Удалено доказательство'), updatedAt: new Date().toISOString() });
  }
  function observeCase(old, postId, checkedAt = new Date().toISOString()) {
    const item = cleanCase(old);
    if (!item.watching) return { item, changed: false };
    const n = postId === null ? null : Number(postId);
    if (n !== null && (!Number.isSafeInteger(n) || n < 0)) throw Error('Некорректный номер сообщения');
    const changed = n !== null && item.lastSeenPostId !== null && n > item.lastSeenPostId;
    const lastSeenPostId = n === null ? item.lastSeenPostId : Math.max(n, item.lastSeenPostId ?? 0);
    return { item: cleanCase({ ...item, lastSeenPostId, lastCheckedAt: checkedAt, unread: item.unread || changed, updatedAt: checkedAt }), changed };
  }
  function timecode(seconds) {
    if (seconds === null || seconds === undefined) return '';
    const s = Number(seconds);
    if (!Number.isInteger(s) || s < 0) return '';
    return `${Math.floor(s/3600) ? Math.floor(s/3600) + ':' : ''}${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }
  root.RPNComplaints = Object.freeze({ PREFIX, MAX_CASES, MAX_EVIDENCE, STATUS, ALLOWED_HOSTS, VIDEO_HOSTS, cleanCase, createCase, updateCase, addEvidence, removeEvidence, observeCase, canonicalThreadUrl, threadKey, cleanEvidence, videoLink, timecode, WORKFLOW_STAGES, WORKFLOW_LABELS, WORKFLOW_CHECKS, DECISION_KINDS, initialWorkflow, cleanWorkflow, workflowAction, draftDecision, deadlineTier });
})(globalThis);
