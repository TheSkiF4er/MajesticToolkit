/* MajesticToolkit 0.3 — standalone validation and deterministic case/evidence transformations. */
(function (root) {
  'use strict';
  const PREFIX = 'rpnComplaintV3:';
  const MAX_CASES = 500;
  const PRIORITIES = Object.freeze(['low','normal','high','urgent']);
  const PRIORITY_LABELS = Object.freeze({low:'Низкий',normal:'Обычный',high:'Высокий',urgent:'Срочный'});
  const QUEUE_STATES = Object.freeze(['active','waiting','recheck','referred','archived']);
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
      if(action==='next'&&index===4&&item.status==='waiting')throw Error('Сначала возобновите рассмотрение');
      if(action==='next'&&index===4&&!Object.values(w.checks).every(Boolean))throw Error('Завершите все проверки');
      if(action==='next'&&index===4&&!item.draft.trim())throw Error('Перед завершением сохраните черновик решения');
      if(action==='next'&&index===4&&payload.confirm!==true)throw Error('Завершение требует явного подтверждения');
      next=event({...w,stage:WORKFLOW_STAGES[index]},'step',`Этап: ${WORKFLOW_LABELS[WORKFLOW_STAGES[index]]}`);
      if(index===4)patch.triage={...item.triage,queue:'active'};
      if(item.status==='done'&&index<4){patch.triage={...item.triage,queue:'recheck'};next={...next,checks:{...next.checks,decision:false}};if(item.moderation)patch.moderation={...item.moderation,status:'draft',revision:uuid(),decisionSnapshotId:null,updatedAt:new Date().toISOString()};}
      patch.status=index===4?'done':(item.status==='done'?'in-progress':item.status==='new'?'in-progress':item.status);
    }else if(action==='decision'){
      if(!Object.hasOwn(DECISION_KINDS,payload.kind))throw Error('Неизвестный тип решения');
      next=event({...w,decision:payload.kind},'decision',`Шаблон: ${DECISION_KINDS[payload.kind]}`);
      if(item.moderation&&payload.kind!==w.decision){if(item.status==='done')throw Error('Сначала откройте рассмотрение заново');patch.moderation={...item.moderation,decisionSnapshotId:null,revision:uuid(),updatedAt:new Date().toISOString()};}
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
  // The moderation record is part of the case, so backup/restore and case deletion are atomic.
  function cleanModeration(value,evidence) {
    if(value==null)return undefined;
    if(value.version!==1||!['majestic','russia-online'].includes(value.project)||!['draft','calculated','reviewed'].includes(value.status))throw Error('Некорректное рассмотрение санкций');
    const identifier=v=>{if(typeof v!=='string'||!/^[-\w]{8,128}$/.test(v))throw Error('Некорректный идентификатор рассмотрения');return v;};
    if(!Array.isArray(value.players)||value.players.length>20)throw Error('До 20 участников');
    const ids=new Set();let total=0;
    const players=value.players.map(p=>{
      const id=str(p.id,'ID игрока',80,true),nickname=str(p.nickname??'','Никнейм',120,true);
      if(id&&ids.has(id.toLowerCase()))throw Error('Повторный ID участника');if(id)ids.add(id.toLowerCase());
      if(!Array.isArray(p.items)||p.items.length>40||(total+=p.items.length)>200)throw Error('Лимит нарушений');
      const keys=new Set();const items=p.items.map(i=>{
        const ruleId=identifier(i.ruleId),revisionId=identifier(i.revisionId),index=i.index;
        if(!Number.isInteger(index)||index<0||index>=20||!(i.amount===null||Number.isSafeInteger(i.amount)&&i.amount>=1&&i.amount<=1000000))throw Error('Некорректная санкция');
        const key=ruleId+':'+index;if(keys.has(key))throw Error('Повторная санкция');keys.add(key);
        const refs=i.evidenceIds??[];if(!Array.isArray(refs)||refs.length>MAX_EVIDENCE||new Set(refs).size!==refs.length||refs.some(r=>!evidence.some(e=>e.id===r)))throw Error('Доказательство не принадлежит жалобе');
        return {ruleId,revisionId,index,amount:i.amount,evidenceIds:[...refs],note:str(i.note??'','Комментарий нарушения',1000,true)};
      });return {id,nickname,allowCombined:p.allowCombined===true,items};
    });
    const policy=str(value.policy,'Политика',12000);let parsed;try{parsed=JSON.parse(policy);}catch{throw Error('Некорректная политика');}if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Некорректная политика');
    if(!Array.isArray(value.history)||value.history.length>5)throw Error('Лимит истории расчётов');
    const history=value.history.map(h=>({id:identifier(h.id),at:date(h.at,'Дата расчёта'),text:str(h.text,'Снимок расчёта',180000),status:['calculated','reviewed'].includes(h.status)?h.status:(()=>{throw Error('Некорректный статус расчёта');})()}));
    if(new Set(history.map(h=>h.id)).size!==history.length)throw Error('Повторные расчёты');
    if(value.status!=='draft'&&(!history.length||history[0].status!==value.status))throw Error('Нет актуального расчёта');
    const out={version:1,revision:identifier(value.revision),project:value.project,server:str(value.server,'Сервер',90,true),players,policy,status:value.status,history,note:str(value.note??'','Комментарий',4000,true),draftFormat:value.draftFormat==='bbcode'?'bbcode':'plain',decisionSnapshotId:value.decisionSnapshotId==null?null:identifier(value.decisionSnapshotId),updatedAt:date(value.updatedAt,'Дата рассмотрения')};
    if(JSON.stringify(out).length>300000)throw Error('Рассмотрение превышает допустимый размер');return out;
  }
  function cleanTriage(value) {
    if(value===undefined) value={};
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Некорректные настройки очереди');
    const priority=value.priority??'normal',queue=value.queue??'active';
    if(!PRIORITIES.includes(priority)||!QUEUE_STATES.includes(queue))throw Error('Неизвестный приоритет или очередь');
    const tags=value.tags??[];
    if(!Array.isArray(tags)||tags.length>20)throw Error('До 20 тегов');
    return {priority,queue,category:str(value.category??'','Категория',80,true),section:str(value.section??'','Раздел',180,true),assignee:str(value.assignee??'','Ответственный',100,true),tags:[...new Set(tags.map(t=>str(t,'Тег',40)))],reason:str(value.reason??'','Причина',500,true)};
  }
  function triageAction(old, action, payload={}) {
    const c=cleanCase(old), t=c.triage;
    if(action==='archive'&&c.status!=='done')throw Error('Архивировать можно только завершённую жалобу');
    if(action==='reopen'&&c.status!=='done')throw Error('Жалоба не завершена');
    if(action==='restore'&&t.queue!=='archived')throw Error('Жалоба не в архиве');
    if(['wait','resume','refer','recheck'].includes(action)&&c.status==='done')throw Error('Сначала откройте жалобу заново');
    const transitions={archive:['archived','done'],restore:['active',c.status],reopen:['recheck','in-progress'],wait:['waiting','waiting'],resume:['active','in-progress'],refer:['referred','waiting'],recheck:['recheck','in-progress']};
    if(!Object.hasOwn(transitions,action))throw Error('Неизвестное действие очереди');
    const [queue,status]=transitions[action], reason=str(payload.reason??'','Причина',500,true);
    if(['reopen','wait','refer','recheck'].includes(action)&&!reason)throw Error('Укажите причину');
    let w=c.workflow;
    if(action==='reopen'||action==='recheck')w={...w,stage:w.checks.intake?'facts':'intake',checks:{...w.checks,facts:false,evidence:false,decision:false}};
    w=event(w,'note',`Очередь: ${ {archive:'архив',restore:'восстановлена',reopen:'повторное открытие',wait:'ожидание',resume:'возобновлена',refer:'передача',recheck:'повторная проверка'}[action]}${reason?' — '+reason:''}`.slice(0,500));
    const moderation=(action==='reopen'||action==='recheck')&&c.moderation?{...c.moderation,status:'draft',revision:uuid(),decisionSnapshotId:null,updatedAt:new Date().toISOString()}:c.moderation;
    return cleanCase({...c,status,triage:{...t,queue,reason},moderation,workflow:w,updatedAt:new Date().toISOString()});
  }
  function cleanForumState(value){
    if(value===undefined)return {state:'unknown',observedAt:null};
    if(!value||typeof value!=='object'||!['unknown','open','closed'].includes(value.state))throw Error('Некорректное состояние темы');
    const observedAt=date(value.observedAt??null,'Дата наблюдения',true);if(value.state!=='unknown'&&!observedAt)throw Error('Нет времени наблюдения');return {state:value.state,observedAt};
  }
  function cleanCase(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Некорректная жалоба');
    if (!/^[\w-]{8,120}$/.test(data.id)) throw Error('Некорректный ID жалобы');
    const thread = canonicalThreadUrl(data.url);
    if(data.moderation&&data.moderation.project!==(new URL(thread.url).hostname==='forum.majestic-rp.ru'?'majestic':'russia-online'))throw Error('Проект рассмотрения не соответствует теме');
    if (!STATUS.includes(data.status)) throw Error('Неизвестный статус');
    if (!Array.isArray(data.evidence) || data.evidence.length > MAX_EVIDENCE) throw Error('Слишком много доказательств');
    const evidence = data.evidence.map(cleanEvidence);
    if (new Set(evidence.map(e => e.id)).size !== evidence.length) throw Error('Дублирование доказательств');
    if (typeof data.watching !== 'boolean' || typeof data.unread !== 'boolean') throw Error('Некорректные настройки жалобы');
    if (!(data.lastSeenPostId === null || (Number.isSafeInteger(data.lastSeenPostId) && data.lastSeenPostId >= 0))) throw Error('Некорректный ID сообщения');
    const triage=cleanTriage(data.triage??{queue:data.status==='waiting'?'waiting':'active'});
    if(triage.queue==='archived'&&data.status!=='done'||triage.queue==='referred'&&data.status!=='waiting'||triage.queue==='waiting'&&data.status!=='waiting'||triage.queue==='recheck'&&data.status==='done')throw Error('Очередь не соответствует локальному статусу');
    return {
      id: str(data.id, 'ID жалобы', 120), profileId: str(data.profileId, 'Профиль', 128),
      url: thread.url, threadKey: thread.key,
      title: str(data.title, 'Название жалобы', 240), status: data.status,
      note: str(data.note, 'Заметка', 12000, true), draft: str(data.draft, 'Черновик', 30000, true),
      deadline: date(data.deadline, 'Срок', true), watching: data.watching,
      lastSeenPostId: data.lastSeenPostId,
      lastCheckedAt: date(data.lastCheckedAt, 'Дата проверки', true),
      unread: data.unread, evidence, triage, forumState:cleanForumState(data.forumState), ...(data.moderation==null?{}:{moderation:cleanModeration(data.moderation,evidence)}), workflow:cleanWorkflow(data.workflow,data.status),
      createdAt: date(data.createdAt, 'Дата создания'), updatedAt: date(data.updatedAt, 'Дата изменения')
    };
  }
  function createCase(data) {
    if(data.status==='done')throw Error('Создание завершённой жалобы требует процесса рассмотрения');
    const now = new Date().toISOString();
    return cleanCase({ id: uuid(), profileId: data.profileId, title: data.title, url: data.url, status: data.status || 'new', note: data.note ?? '', draft: data.draft ?? '', deadline: data.deadline || null, watching: data.watching ?? true, lastSeenPostId: null, lastCheckedAt: null, unread: false, evidence: [], triage:cleanTriage({...cleanTriage(data.triage),queue:data.status==='waiting'?'waiting':'active',reason:''}), createdAt: now, updatedAt: now });
  }
  function updateCase(old, fields) {
    const allowed = ['title','status','note','draft','deadline','watching','unread','triage'];
    const values = Object.fromEntries(Object.entries(fields).filter(([key]) => allowed.includes(key)));
    const item=cleanCase(old);
    let flow=item.workflow;
    if(Object.hasOwn(values,'triage')){const patch=values.triage;if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Некорректные настройки очереди');values.triage=cleanTriage({...item.triage,...Object.fromEntries(Object.entries(patch).filter(([k])=>['priority','category','section','assignee','tags'].includes(k)))});if(JSON.stringify(values.triage)!==JSON.stringify(item.triage))flow=event(flow,'note','Обновлены приоритет, категория, ответственный или теги');}

    if(Object.hasOwn(values,'status')&&values.status!==item.status){
      flow=event(flow,'status',`Статус: ${values.status}`);
      if(values.status==='done' && item.workflow.stage!=='closed')throw Error('Для завершения пройдите этапы процесса и подтвердите решение');
      else if(flow.stage==='closed'){flow={...flow,stage:'decision',checks:{...flow.checks,decision:false}};if(item.moderation)values.moderation={...item.moderation,status:'draft',revision:uuid(),decisionSnapshotId:null,updatedAt:new Date().toISOString()};values.triage=cleanTriage({...item.triage,...values.triage,queue:values.status==='waiting'?'waiting':'recheck'});}else if(values.status==='waiting'||item.status==='waiting'){values.triage=cleanTriage({...item.triage,...values.triage,queue:values.status==='waiting'?'waiting':'active'});}
    }
    if(Object.hasOwn(values,'deadline')&&values.deadline!==item.deadline)flow=event(flow,'deadline',`Срок: ${values.deadline||'снят'}`);
    if(Object.hasOwn(values,'draft')&&values.draft!==item.draft){flow=event(item.moderation?{...flow,checks:{...flow.checks,decision:false}}:flow,'draft','Черновик изменён (без публикации)');}
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
    const moderation=item.moderation?{...item.moderation,revision:uuid(),status:'draft',updatedAt:new Date().toISOString(),players:item.moderation.players.map(p=>({...p,items:p.items.map(i=>({...i,evidenceIds:i.evidenceIds.filter(e=>e!==id)}))}))}:undefined;
    return cleanCase({ ...item, moderation, evidence: item.evidence.filter(e => e.id !== id),workflow:event(item.workflow,'evidence','Удалено доказательство'), updatedAt: new Date().toISOString() });
  }
  function observeCase(old, postId, checkedAt = new Date().toISOString(), forumState='unknown') {
    const item = cleanCase(old);
    if (!item.watching) return { item, changed: false };
    const n = postId === null ? null : Number(postId);
    if (n !== null && (!Number.isSafeInteger(n) || n < 0)) throw Error('Некорректный номер сообщения');
    const changed = n !== null && item.lastSeenPostId !== null && n > item.lastSeenPostId;
    const lastSeenPostId = n === null ? item.lastSeenPostId : Math.max(n, item.lastSeenPostId ?? 0);
    if(!['unknown','open','closed'].includes(forumState))throw Error('Неизвестное состояние темы');
    const observed=forumState==='unknown'?item.forumState:{state:forumState,observedAt:checkedAt};
    return { item: cleanCase({ ...item, forumState:observed,lastSeenPostId, lastCheckedAt: checkedAt, unread: item.unread || changed, updatedAt: checkedAt }), changed };
  }
  function timecode(seconds) {
    if (seconds === null || seconds === undefined) return '';
    const s = Number(seconds);
    if (!Number.isInteger(s) || s < 0) return '';
    return `${Math.floor(s/3600) ? Math.floor(s/3600) + ':' : ''}${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }
  root.RPNComplaints = Object.freeze({ PREFIX, MAX_CASES, MAX_EVIDENCE, STATUS, PRIORITIES, PRIORITY_LABELS, QUEUE_STATES, cleanTriage, triageAction, ALLOWED_HOSTS, VIDEO_HOSTS, cleanCase, cleanModeration, createCase, updateCase, addEvidence, removeEvidence, observeCase, canonicalThreadUrl, threadKey, cleanEvidence, videoLink, timecode, WORKFLOW_STAGES, WORKFLOW_LABELS, WORKFLOW_CHECKS, DECISION_KINDS, initialWorkflow, cleanWorkflow, workflowAction, draftDecision, deadlineTier });
})(globalThis);
