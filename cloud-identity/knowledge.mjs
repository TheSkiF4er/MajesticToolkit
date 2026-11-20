/** Shared Knowledge & Templates 2.3.6: transactional revisions and two-person release workflow.
 * Drafts are distinct from immutable published revisions. Authorizations are rechecked
 * in every write transaction, including after the body has been read from the socket.
 */
import {randomUUID, createHash} from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KINDS=new Set(['note','law','forum-template','government-template','document-template']);
const ROLES=['viewer','editor','admin','owner'];
const one=(db,query,...args)=>db.prepare(query).get(...args);
const time=v=>v===null?null:new Date(v).toISOString();
function transaction(db,callback){db.exec('BEGIN IMMEDIATE');try{const out=callback();db.exec('COMMIT');return out;}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}}
function text(value,max,required=true){return typeof value==='string'&&value.trim().length<=(max)&&(!required||value.trim().length>0)&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)?value.trim():null;}
function content(raw,bad){if(!raw||typeof raw!=='object'||Array.isArray(raw)||!KINDS.has(raw.kind))bad(400,'Некорректный тип материала');
  const title=text(raw.title,180),category=text(raw.category??'Общее',90),body=text(raw.body,60_000);
  if(!title||!category||!body)bad(400,'Некорректное название, категория или текст материала (максимум 60 000 символов)');
  if(Buffer.byteLength(JSON.stringify({title,category,body}),'utf8')>190_000)bad(413,'Материал превышает 190 КБ');
  return {kind:raw.kind,title,category,body};
}
function itemView(row,{publicOnly=false}={}){const isPublic=publicOnly;
  return {id:row.id,kind:row.kind,title:row.title,category:row.category,
    status:isPublic?'published':row.status,revision:isPublic?row.published_revision:row.revision,
    publishedRevision:row.published_revision,authorId:row.created_by,
    updatedAt:time(row.updated_at),publishedAt:time(row.published_at),
    sourceKind:row.source_kind||null,sourceId:row.source_id||null};
}
export function installSharedKnowledge(db){
 db.exec(`CREATE TABLE IF NOT EXISTS shared_knowledge(
    id TEXT PRIMARY KEY, cloud_profile_id TEXT NOT NULL REFERENCES cloud_profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('note','law','forum-template','government-template','document-template')),
    title TEXT NOT NULL, search_title TEXT NOT NULL, category TEXT NOT NULL, revision INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('draft','review','approved','rejected','published')),
    published_revision INTEGER, submitted_by TEXT, reviewed_by TEXT,
    created_by TEXT NOT NULL REFERENCES accounts(id), created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, published_at INTEGER,
    source_kind TEXT, source_id TEXT,
    UNIQUE(cloud_profile_id,kind,source_kind,source_id)
  );
  CREATE INDEX IF NOT EXISTS shared_knowledge_profile ON shared_knowledge(cloud_profile_id,kind,updated_at,id);
  CREATE TABLE IF NOT EXISTS shared_knowledge_revisions(
    item_id TEXT NOT NULL REFERENCES shared_knowledge(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL, title TEXT NOT NULL, search_title TEXT NOT NULL, category TEXT NOT NULL,
    body TEXT NOT NULL, sha256 TEXT NOT NULL, author_id TEXT NOT NULL REFERENCES accounts(id),
    created_at INTEGER NOT NULL, PRIMARY KEY(item_id,revision)
  );
  CREATE TABLE IF NOT EXISTS shared_knowledge_events(
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES shared_knowledge(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL, action TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES accounts(id),
    note TEXT NOT NULL, occurred_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS shared_knowledge_events_item ON shared_knowledge_events(item_id,occurred_at,id);`);
}
export async function handleSharedKnowledge({db,req,res,path,identity,now,cors,readJson,returnJson,bad,clock=Date.now}){
 const match=/^\/v1\/teams\/([0-9a-f-]{36})\/cloud\/profiles\/([0-9a-f-]{36})\/knowledge(?:\/([0-9a-f-]{36})(?:\/(revisions|events|submit|review|publish|restore|archive))?)?$/.exec(path);
 if(!match||!UUID.test(match[1])||!UUID.test(match[2])||(match[3]&&!UUID.test(match[3])))bad(404,'Материал не найден');
 const [,teamId,profileId,itemId,operation]=match,accountId=identity.account_id;
 const send=(status,data)=>returnJson(res,status,data,cors);
 const check=(min='viewer')=>{
   const t=clock();
   if(!one(db,`SELECT 1 FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=? AND s.account_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.access_expires_at>? AND a.disabled=0`,identity.id,accountId,t,t))bad(401,'Сессия завершена');
   const role=one(db,'SELECT role FROM team_members WHERE team_id=? AND account_id=?',teamId,accountId)?.role;
   if(!role)bad(404,'Команда недоступна');
   if(ROLES.indexOf(role)<ROLES.indexOf(min))bad(403,'Недостаточно прав для этой операции');
   if(!one(db,'SELECT 1 FROM cloud_profiles WHERE id=? AND team_id=?',profileId,teamId))bad(404,'Облачный профиль не найден');
   return role;
 };
 const get=()=>{const row=one(db,'SELECT * FROM shared_knowledge WHERE id=? AND cloud_profile_id=?',itemId,profileId);if(!row)bad(404,'Материал не найден');return row;};
 const event=(id,revision,action,note='')=>db.prepare('INSERT INTO shared_knowledge_events(id,item_id,revision,action,actor_id,note,occurred_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,revision,action,accountId,note,clock());
 const insertRevision=(id,revision,data)=>{
   const checksum=createHash('sha256').update(JSON.stringify([data.title,data.category,data.body])).digest('hex');
   db.prepare('INSERT INTO shared_knowledge_revisions(item_id,revision,title,search_title,category,body,sha256,author_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,revision,data.title,data.title.toLocaleLowerCase('ru-RU'),data.category,data.body,checksum,accountId,clock());
 };
 const getRevision=(id,revision)=>one(db,'SELECT * FROM shared_knowledge_revisions WHERE item_id=? AND revision=?',id,revision);
 const latest=(row,publicOnly)=>getRevision(row.id,publicOnly?row.published_revision:row.revision);
 const visible=(row,role)=>role!=='viewer'||row.published_revision!==null;
 const publicOnly=role=>role==='viewer';
 const detail=(row,role)=>{
   if(!visible(row,role))bad(404,'Материал не опубликован');
   const rev=latest(row,publicOnly(role));
   return {...itemView(row,{publicOnly:publicOnly(role)}),body:rev.body,sha256:rev.sha256,revisionAuthorId:rev.author_id,
     ...(role==='viewer'?{}:{published:row.published_revision?(()=>{const p=getRevision(row.id,row.published_revision);return {revision:p.revision,title:p.title,category:p.category,body:p.body,sha256:p.sha256};})():null})};
 };
 const role=check();
 if(!itemId){
   if(req.method==='GET'){
     const params=new URL(req.url,'https://identity.internal').searchParams;
     if([...params.keys()].some(k=>!['kind','q','after','scope'].includes(k)))bad(400,'Неизвестные параметры поиска');
     const kind=params.get('kind')||'',q=params.get('q')||'',after=params.get('after')||'',scope=params.get('scope')||'all';
     if(kind&&!KINDS.has(kind)||q.length>80||after&&!UUID.test(after)||!['all','published','review'].includes(scope))bad(400,'Некорректный фильтр');
     if(role==='viewer'&&scope==='review')bad(403,'Недостаточно прав');
     // Filter by the *published* title for a Viewer; unpublished draft metadata must not leak.
     const clauses=['i.cloud_profile_id=?'],args=[profileId];
     if(kind){clauses.push('i.kind=?');args.push(kind);}
     if(after){clauses.push('i.id>?');args.push(after);}
     if(role==='viewer'||scope==='published')clauses.push('i.published_revision IS NOT NULL');
     if(scope==='review')clauses.push("i.status='review'");
     if(q){clauses.push("CASE WHEN i.published_revision IS NOT NULL AND (?='viewer' OR ?='published') THEN pub.search_title ELSE i.search_title END LIKE ? ESCAPE '\\'");args.push(role,scope,'%'+q.toLocaleLowerCase('ru-RU').replace(/[\\%_]/g,'\\$&')+'%');}
     const rows=db.prepare(`SELECT i.*,pub.title AS public_title,pub.category AS public_category FROM shared_knowledge i LEFT JOIN shared_knowledge_revisions pub ON pub.item_id=i.id AND pub.revision=i.published_revision WHERE ${clauses.join(' AND ')} ORDER BY i.id LIMIT 31`).all(...args);
     const slice=rows.slice(0,30).map(row=>{if(role==='viewer'||scope==='published'){row={...row,title:row.public_title,category:row.public_category};}return itemView(row,{publicOnly:role==='viewer'});});
     return send(200,{items:slice,nextCursor:rows.length>30?slice.at(-1).id:null});
   }
   if(req.method!=='POST')bad(405,'Метод не поддерживается');
   check('editor');const body=await readJson(req,205*1024);const data=content(body,bad);
   const sourceKind=body.sourceKind===undefined?null:body.sourceKind,sourceId=body.sourceId===undefined?null:body.sourceId;
   if((sourceKind!==null||sourceId!==null)&&(!['law','forum-template','government-template','document-template'].includes(sourceKind)||typeof sourceId!=='string'||!/^[\w-]{8,128}$/.test(sourceId)||sourceKind!==data.kind))bad(400,'Некорректный локальный источник');
   const result=transaction(db,()=>{
     check('editor');
     if(one(db,'SELECT count(*) AS n FROM shared_knowledge WHERE cloud_profile_id=?',profileId).n>=1000)bad(409,'Лимит материалов в облачном профиле');
     if(sourceKind&&one(db,'SELECT 1 FROM shared_knowledge WHERE cloud_profile_id=? AND kind=? AND source_kind=? AND source_id=?',profileId,data.kind,sourceKind,sourceId))bad(409,'Источник уже импортирован. Измените существующий материал через редакции.');
     const id=randomUUID(),time=clock();
     db.prepare('INSERT INTO shared_knowledge(id,cloud_profile_id,kind,title,search_title,category,revision,status,created_by,created_at,updated_at,source_kind,source_id) VALUES(?,?,?,?,?,?,1,?,?,?,?,?,?)').run(id,profileId,data.kind,data.title,data.title.toLocaleLowerCase('ru-RU'),data.category,'draft',accountId,time,time,sourceKind,sourceId);
     insertRevision(id,1,data);event(id,1,'created');return getRevision(id,1)&&one(db,'SELECT * FROM shared_knowledge WHERE id=?',id);
   });return send(201,{item:detail(result,role)});
 }
 if(req.method==='GET'){
   if(operation==='revisions'){
     check('editor');const r=get();return send(200,{revisions:db.prepare('SELECT revision,title,category,body,sha256,author_id,created_at FROM shared_knowledge_revisions WHERE item_id=? ORDER BY revision DESC LIMIT 100').all(itemId).map(x=>({revision:x.revision,title:x.title,category:x.category,body:x.body,sha256:x.sha256,authorId:x.author_id,createdAt:time(x.created_at)})),currentRevision:r.revision});
   }
   if(operation==='events'){
     check('editor');get();return send(200,{events:db.prepare('SELECT revision,action,actor_id,note,occurred_at FROM shared_knowledge_events WHERE item_id=? ORDER BY occurred_at DESC,id DESC LIMIT 100').all(itemId).map(x=>({revision:x.revision,action:x.action,actorId:x.actor_id,note:x.note,at:time(x.occurred_at)}))});
   }
   if(operation)bad(405,'Метод не поддерживается');return send(200,{item:detail(get(),role)});
 }
 if(operation===undefined&&req.method==='PATCH'){
   check('editor');const body=await readJson(req,205*1024),data=content({...body,kind:get().kind},bad);
   if(!Number.isSafeInteger(body.baseRevision)||body.baseRevision<1)bad(400,'Укажите ожидаемую редакцию');
   const result=transaction(db,()=>{
     check('editor');const row=get();
     if(row.revision!==body.baseRevision)bad(409,'Конфликт редакций: обновите материал');
     if(!['draft','rejected','published'].includes(row.status))bad(409,'Сначала завершите согласование текущей редакции');
     const rev=row.revision+1;if(rev>100)bad(409,'Лимит редакций материала');
     insertRevision(itemId,rev,data);
     db.prepare("UPDATE shared_knowledge SET title=?,search_title=?,category=?,revision=?,status='draft',submitted_by=NULL,reviewed_by=NULL,updated_at=? WHERE id=?").run(data.title,data.title.toLocaleLowerCase('ru-RU'),data.category,rev,clock(),itemId);
     event(itemId,rev,'edited');return get();
   });return send(200,{item:detail(result,role)});
 }
 if(req.method!=='POST'||!operation)bad(405,'Метод не поддерживается');
 const body=await readJson(req,8192);
 if(!Number.isSafeInteger(body.baseRevision)||body.baseRevision<1)bad(400,'Укажите ожидаемую редакцию');
 if(operation==='submit'){
   const result=transaction(db,()=>{
     check('editor');const row=get();if(row.revision!==body.baseRevision||!['draft','rejected'].includes(row.status))bad(409,'Редакция изменилась или уже отправлена');
     db.prepare("UPDATE shared_knowledge SET status='review',submitted_by=?,reviewed_by=NULL,updated_at=? WHERE id=?").run(accountId,clock(),itemId);event(itemId,row.revision,'submitted');return get();
   });return send(200,{item:detail(result,role)});
 }
 if(operation==='review'){
   if(!['approve','reject'].includes(body.decision)||text(body.note??'',1000,false)===null)bad(400,'Некорректное решение или примечание');
   const result=transaction(db,()=>{
     check('admin');const row=get();if(row.revision!==body.baseRevision||row.status!=='review')bad(409,'Материал больше не находится на согласовании');
     if(row.submitted_by===accountId||getRevision(row.id,row.revision).author_id===accountId)bad(403,'Автор/отправитель не может согласовать собственную редакцию');
     db.prepare('UPDATE shared_knowledge SET status=?,reviewed_by=?,updated_at=? WHERE id=?').run(body.decision==='approve'?'approved':'rejected',accountId,clock(),itemId);
     event(itemId,row.revision,body.decision==='approve'?'approved':'rejected',text(body.note??'',1000,false));return get();
   });return send(200,{item:detail(result,role)});
 }
 if(operation==='publish'){
   const result=transaction(db,()=>{
     check('admin');const row=get();if(row.revision!==body.baseRevision||row.status!=='approved'||!row.reviewed_by)bad(409,'Публикация разрешена только после согласования');
     if(row.submitted_by===accountId||getRevision(row.id,row.revision).author_id===accountId)bad(403,'Автор не может публиковать свою редакцию');
     db.prepare("UPDATE shared_knowledge SET status='published',published_revision=revision,published_at=?,updated_at=? WHERE id=?").run(clock(),clock(),itemId);
     event(itemId,row.revision,'published');return get();
   });return send(200,{item:detail(result,role)});
 }
 if(operation==='restore'){
   if(!Number.isSafeInteger(body.targetRevision)||body.targetRevision<1)bad(400,'Некорректная историческая редакция');
   const result=transaction(db,()=>{
     check('editor');const row=get();if(row.revision!==body.baseRevision||!['draft','rejected','published'].includes(row.status))bad(409,'Невозможно восстановить редакцию в текущем состоянии');
     const src=getRevision(row.id,body.targetRevision);if(!src)bad(404,'Историческая редакция не найдена');
     if(row.revision>=100)bad(409,'Лимит редакций материала');
     const newRev=row.revision+1;insertRevision(itemId,newRev,{title:src.title,category:src.category,body:src.body});
     db.prepare("UPDATE shared_knowledge SET revision=?,title=?,search_title=?,category=?,status='draft',submitted_by=NULL,reviewed_by=NULL,updated_at=? WHERE id=?").run(newRev,src.title,src.title.toLocaleLowerCase('ru-RU'),src.category,clock(),itemId);
     event(itemId,newRev,'restored','Редакция '+body.targetRevision);return get();
   });return send(200,{item:detail(result,role)});
 }
 if(operation==='archive'){
   const result=transaction(db,()=>{
     check('admin');const row=get();if(row.revision!==body.baseRevision)bad(409,'Конфликт редакций');
     if(row.published_revision===null)bad(409,'Материал ещё не опубликован');
     db.prepare("UPDATE shared_knowledge SET published_revision=NULL,status='draft',submitted_by=NULL,reviewed_by=NULL,published_at=NULL,updated_at=? WHERE id=?").run(clock(),itemId);
     event(itemId,row.revision,'unpublished',text(body.note??'',1000,false)??'');return get();
   });return send(200,{item:detail(result,role)});
 }
 bad(404,'Операция не найдена');
}
