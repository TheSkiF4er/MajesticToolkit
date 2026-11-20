/** Cloud Files & Evidence 2.3.8. Binary content is never accepted through JSON.
 * Account/session/team/profile access is checked again inside each SQLite write transaction.
 * Content-addressed blobs are profile-local; revisions are append-only with CAS.
 */
import {randomUUID,createHash} from 'node:crypto';
import {validateFileSignature,VAULT_LIMITS} from '../src/lib/evidence-vault.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ROLES=['viewer','editor','admin','owner'];
const MAX_FILE=Math.min(VAULT_LIMITS.fileBytes,32*1024*1024);
const MAX_STORAGE=256*1024*1024;
const MIME=new Set(['image/png','image/jpeg','image/gif','image/webp','application/pdf','video/mp4','video/webm','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const one=(db,q,...args)=>db.prepare(q).get(...args);
const iso=n=>new Date(n).toISOString();
const goodText=(value,max,optional=false)=>typeof value==='string'&&value.length<=max&&(optional||value.trim().length>0)&&!/[\x00-\x1f\x7f]/.test(value)?value.trim():null;
const sha=b=>createHash('sha256').update(b).digest('hex');
function tx(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}}
export function installCloudFiles(db){db.exec(`
 CREATE TABLE IF NOT EXISTS cloud_file_blobs(
  cloud_profile_id TEXT NOT NULL REFERENCES cloud_profiles(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, bytes BLOB NOT NULL,
  PRIMARY KEY(cloud_profile_id,sha256)
 );
 CREATE TABLE IF NOT EXISTS cloud_files(
  id TEXT PRIMARY KEY, cloud_profile_id TEXT NOT NULL REFERENCES cloud_profiles(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES accounts(id), version INTEGER NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('private','team')),
  name TEXT NOT NULL, title TEXT NOT NULL, note TEXT NOT NULL,
  sha256 TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
 );
 CREATE INDEX IF NOT EXISTS cloud_file_profile_list ON cloud_files(cloud_profile_id,updated_at,id);
 CREATE TABLE IF NOT EXISTS cloud_file_versions(
  file_id TEXT NOT NULL REFERENCES cloud_files(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, sha256 TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  name TEXT NOT NULL, title TEXT NOT NULL, note TEXT NOT NULL, visibility TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES accounts(id), created_at INTEGER NOT NULL,
  PRIMARY KEY(file_id,version)
 );
 CREATE TABLE IF NOT EXISTS cloud_file_links(
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL REFERENCES cloud_files(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK(target_type IN ('knowledge','tactical')),
  target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES accounts(id), created_at INTEGER NOT NULL,
  UNIQUE(file_id,target_type,target_kind,target_id)
 );
 CREATE INDEX IF NOT EXISTS cloud_file_links_lookup ON cloud_file_links(file_id);
 `);}
const view=row=>({id:row.id,version:row.version,visibility:row.visibility,name:row.name,title:row.title,note:row.note,
 sha256:row.sha256,mime:row.mime,size:row.size,authorId:row.author_id,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at)});
function cleanMeta(meta,bad){
 if(!meta||typeof meta!=='object'||Array.isArray(meta))bad(400,'Некорректные метаданные файла');
 const name=goodText(meta.name,180),title=goodText(meta.title,180),note=goodText(meta.note??'',1000,true);
 if(!name||!title||note===null||!['private','team'].includes(meta.visibility))bad(400,'Неверное название, описание или уровень доступа');
 return {name,title,note,visibility:meta.visibility};
}
function binaryMeta(req,bad){
 const raw=req.headers['x-mt-file-meta'];
 if(typeof raw!=='string'||raw.length>3000||!/^[A-Za-z0-9_-]+$/.test(raw))bad(400,'Отсутствуют метаданные файла');
 let data;try{data=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));}catch{bad(400,'Некорректные метаданные файла');}
 return cleanMeta(data,bad);
}
async function receive(req,bad){
 const mime=req.headers['content-type'];
 if(!MIME.has(mime))bad(415,'Формат вложения не поддерживается');
 if(req.headers['content-encoding'])bad(415,'Сжатые запросы не поддерживаются');
 const advertised=req.headers['content-length'];
 if(advertised!==undefined&&(!/^\d+$/.test(advertised)||Number(advertised)<1||Number(advertised)>MAX_FILE))bad(413,'Неверный размер вложения');
 let size=0;const parts=[];
 for await(const part of req){size+=part.length;if(size>MAX_FILE)bad(413,'Файл превышает 32 МиБ');parts.push(part);}
 if(size<1||advertised!==undefined&&size!==Number(advertised))bad(400,'Пустой или неполный файл');
 const bytes=Buffer.concat(parts,size);
 try{validateFileSignature(new Uint8Array(bytes.subarray(0,64)),mime);}catch{bad(415,'Содержимое файла не соответствует разрешённому формату');}
 const checksum=sha(bytes),expected=req.headers['x-mt-sha256'];
 if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||expected!==checksum)bad(409,'SHA-256 файла не совпадает');
 return {bytes,size,mime,sha256:checksum};
}
function fileRow(db,profileId,id,accountId,bad){
 const r=one(db,'SELECT * FROM cloud_files WHERE id=? AND cloud_profile_id=?',id,profileId);
 if(!r||r.visibility==='private'&&r.author_id!==accountId)bad(404,'Файл не найден');
 return r;
}
function canEdit(row,account,role){return row.author_id===account||row.visibility==='team'&&ROLES.indexOf(role)>=ROLES.indexOf('editor');}
function storeBlob(db,profileId,b,bad){
 const old=one(db,'SELECT mime,size FROM cloud_file_blobs WHERE cloud_profile_id=? AND sha256=?',profileId,b.sha256);
 if(old){if(old.mime!==b.mime||old.size!==b.size)bad(409,'Хеш уже связан с другим форматом');return;}
 const used=one(db,'SELECT COALESCE(SUM(size),0) AS total FROM cloud_file_blobs WHERE cloud_profile_id=?',profileId).total;
 if(used+b.size>MAX_STORAGE)bad(413,'Квота облачного профиля: 256 МиБ включая историю версий');
 db.prepare('INSERT INTO cloud_file_blobs(cloud_profile_id,sha256,mime,size,bytes) VALUES(?,?,?,?,?)').run(profileId,b.sha256,b.mime,b.size,b.bytes);
}
function saveRevision(db,row,actor,at){db.prepare(`INSERT INTO cloud_file_versions(file_id,version,sha256,mime,size,name,title,note,visibility,actor_id,created_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(row.id,row.version,row.sha256,row.mime,row.size,row.name,row.title,row.note,row.visibility,actor,at);}
export async function handleCloudFiles({db,req,res,path,identity,cors,readJson,returnJson,bad,clock=Date.now}){
 const match=/^\/v1\/teams\/([0-9a-f-]{36})\/cloud\/profiles\/([0-9a-f-]{36})\/files(?:\/([0-9a-f-]{36})(?:\/(content|versions|links)(?:\/([0-9a-f-]{36}|[1-9][0-9]*))?)?)?$/.exec(path);
 if(!match||!UUID.test(match[1])||!UUID.test(match[2])||(match[3]&&!UUID.test(match[3])))bad(404,'Файловый ресурс не найден');
 const [,teamId,profileId,id,segment,segmentId]=match,actor=identity.account_id;
 const send=(status,data)=>returnJson(res,status,data,cors);
 const authorize=(min='viewer')=>{
  const n=clock();
  if(!one(db,`SELECT 1 FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=? AND s.account_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.access_expires_at>? AND a.disabled=0`,identity.id,actor,n,n))bad(401,'Сессия завершена');
  const role=one(db,'SELECT role FROM team_members WHERE team_id=? AND account_id=?',teamId,actor)?.role;
  if(!role)bad(404,'Команда недоступна');
  if(ROLES.indexOf(role)<ROLES.indexOf(min))bad(403,'Недостаточно полномочий');
  if(!one(db,'SELECT 1 FROM cloud_profiles WHERE id=? AND team_id=?',profileId,teamId))bad(404,'Облачный профиль не найден');
  return role;
 };
 authorize();
 const get=()=>fileRow(db,profileId,id,actor,bad);
 const fileEdit=()=>{const role=authorize('editor'),row=get();if(!canEdit(row,actor,role))bad(403,'Нет прав на изменение чужого частного файла');return row;};
 const query=new URL(req.url,'https://internal').searchParams;
 if(!id){
  if(req.method==='GET'){
   const after=query.get('after')||'';
   if(after&&!UUID.test(after))bad(400,'Неверный курсор');
   const rows=db.prepare(`SELECT * FROM cloud_files WHERE cloud_profile_id=? AND (visibility='team' OR author_id=?) AND (?='' OR id>?) ORDER BY id LIMIT 51`).all(profileId,actor,after,after);
   return send(200,{files:rows.slice(0,50).map(view),nextCursor:rows.length>50?rows[49].id:null});
  }
  if(req.method!=='POST')bad(405,'Метод не поддерживается');
  authorize('editor');const meta=binaryMeta(req,bad),bytes=await receive(req,bad);
  const created=tx(db,()=>{
   authorize('editor');
   if(one(db,'SELECT count(*) AS n FROM cloud_files WHERE cloud_profile_id=?',profileId).n>=500)bad(409,'Лимит 500 файлов на RP-профиль');
   storeBlob(db,profileId,bytes,bad);
   const time=clock(),id=randomUUID(),row={id,cloud_profile_id:profileId,author_id:actor,version:1,...meta,sha256:bytes.sha256,mime:bytes.mime,size:bytes.size,created_at:time,updated_at:time};
   db.prepare(`INSERT INTO cloud_files(id,cloud_profile_id,author_id,version,visibility,name,title,note,sha256,mime,size,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,profileId,actor,1,meta.visibility,meta.name,meta.title,meta.note,bytes.sha256,bytes.mime,bytes.size,time,time);
   saveRevision(db,row,actor,time);return row;
  });return send(201,{file:view(created)});
 }
 if(segment==='content'&&req.method==='GET'||segment==='versions'&&segmentId&&req.method==='GET'){
  const row=get();let item=row;
  if(segment==='versions'){
   if(!/^\d+$/.test(segmentId)||Number(segmentId)>1000)bad(400,'Некорректная версия');
   item=one(db,'SELECT * FROM cloud_file_versions WHERE file_id=? AND version=?',id,Number(segmentId));
   if(!item||item.visibility==='private'&&row.author_id!==actor)bad(404,'Версия не найдена');
  }
  const blob=one(db,'SELECT bytes,size,mime FROM cloud_file_blobs WHERE cloud_profile_id=? AND sha256=?',profileId,item.sha256);
  if(!blob||blob.size!==item.size||sha(blob.bytes)!==item.sha256)bad(500,'Нарушена целостность хранилища');
  // Never render untrusted PDFs, HTML or images inline in extension/server origins.
  const safeName=encodeURIComponent(item.name).replace(/[!'()*]/g,ch=>'%'+ch.charCodeAt(0).toString(16).toUpperCase());
  res.writeHead(200,{...cors,'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${safeName}`,
   'X-MT-Mime':item.mime,'X-MT-Sha256':item.sha256,'Access-Control-Expose-Headers':'X-MT-Mime,X-MT-Sha256,Content-Disposition','Content-Length':blob.size,
   'Content-Security-Policy':'sandbox','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(blob.bytes);return;
 }
 if(segment==='versions'&&req.method==='GET'&&!segmentId){const row=get();const versions=db.prepare("SELECT version,sha256,mime,size,name,title,note,visibility,actor_id,created_at FROM cloud_file_versions WHERE file_id=? AND (?=? OR visibility='team') ORDER BY version DESC LIMIT 100").all(id,actor,row.author_id);
  return send(200,{versions:versions.map(({actor_id,created_at,...r})=>({...r,actorId:actor_id,createdAt:iso(created_at)}))});}
 if(segment==='links'){
  if(req.method==='GET'&&!segmentId){get();return send(200,{links:db.prepare('SELECT id,target_type AS targetType,target_kind AS targetKind,target_id AS targetId,created_by AS createdBy,created_at AS createdAt FROM cloud_file_links WHERE file_id=? ORDER BY created_at,id LIMIT 100').all(id)});}
  if(req.method==='POST'&&!segmentId){fileEdit();const b=await readJson(req,2048);
   if(!['knowledge','tactical'].includes(b.targetType)||typeof b.targetId!=='string'||(b.targetType==='knowledge'&&!UUID.test(b.targetId))||(b.targetType==='tactical'&&!/^[\w-]{8,120}$/.test(b.targetId))||!['','map','plan','airdrop_point','airdrop_event','territory','territory_event'].includes(b.targetKind)||b.targetType==='knowledge'&&b.targetKind!=='')bad(400,'Неверная ссылка вложения');
   const link=tx(db,()=>{const row=fileEdit();if(row.visibility!=='team')bad(409,'Сначала откройте командный доступ к файлу');
    const exists=b.targetType==='knowledge'?one(db,'SELECT 1 FROM shared_knowledge WHERE id=? AND cloud_profile_id=? AND published_revision IS NOT NULL',b.targetId,profileId):one(db,'SELECT 1 FROM cloud_tactical_records WHERE cloud_profile_id=? AND kind=? AND record_id=? AND deleted_at IS NULL',profileId,b.targetKind,b.targetId);
    if(!exists)bad(404,'Опубликованный командный материал не найден');
    if(one(db,'SELECT count(*) AS n FROM cloud_file_links WHERE file_id=?',id).n>=25)bad(409,'Лимит 25 привязок');
    const linkId=randomUUID();
    try{db.prepare('INSERT INTO cloud_file_links(id,file_id,target_type,target_kind,target_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)').run(linkId,id,b.targetType,b.targetKind,b.targetId,actor,clock());}catch(error){if(String(error).includes('UNIQUE'))bad(409,'Вложение уже прикреплено к записи');throw error;}
    return linkId;});return send(201,{id:link});
  }
  if(req.method==='DELETE'&&segmentId&&UUID.test(segmentId)){return send(200,tx(db,()=>{fileEdit();const result=db.prepare('DELETE FROM cloud_file_links WHERE file_id=? AND id=?').run(id,segmentId);if(!result.changes)bad(404,'Вложение не найдено');return {ok:true};}));}
  bad(405,'Метод не поддерживается');
 }
 if(segment==='versions'&&!segmentId&&req.method==='PUT'){
  fileEdit();const meta=binaryMeta(req,bad),bytes=await receive(req,bad);
  const version=Number(req.headers['x-mt-base-version']);if(!Number.isSafeInteger(version)||version<1||version>99)bad(400,'Неверная версия');
  const updated=tx(db,()=>{
   const current=fileEdit();if(current.version!==version)bad(409,'Конфликт версии файла');if(meta.visibility==='private'&&current.visibility==='team'&&one(db,'SELECT 1 FROM cloud_file_links WHERE file_id=? LIMIT 1',id))bad(409,'Сначала открепите файл от командных материалов');
   storeBlob(db,profileId,bytes,bad);const t=clock();
   db.prepare('UPDATE cloud_files SET version=?,visibility=?,name=?,title=?,note=?,sha256=?,mime=?,size=?,updated_at=? WHERE id=?').run(version+1,meta.visibility,meta.name,meta.title,meta.note,bytes.sha256,bytes.mime,bytes.size,t,id);
   const row={...current,...meta,...bytes,version:version+1,updated_at:t};saveRevision(db,row,actor,t);return view(row);
  });return send(200,{file:updated});
 }
 if(!segment&&req.method==='GET')return send(200,{file:view(get())});
 if(!segment&&req.method==='PATCH'){
  fileEdit();const b=await readJson(req,4096),meta=cleanMeta(b,bad);
  if(!Number.isSafeInteger(b.baseVersion)||b.baseVersion<1)bad(400,'Неверная версия файла');
  const updated=tx(db,()=>{const row=fileEdit();if(row.version!==b.baseVersion)bad(409,'Конфликт версии файла');if(meta.visibility==='private'&&row.visibility==='team'&&one(db,'SELECT 1 FROM cloud_file_links WHERE file_id=? LIMIT 1',id))bad(409,'Сначала открепите файл от командных материалов');if(row.version>=100)bad(409,'Превышено число редакций');
   const t=clock(),next={...row,...meta,version:row.version+1,updated_at:t};
   db.prepare('UPDATE cloud_files SET version=?,visibility=?,name=?,title=?,note=?,updated_at=? WHERE id=?').run(next.version,next.visibility,next.name,next.title,next.note,t,id);
   saveRevision(db,next,actor,t);return view(next);
  });return send(200,{file:updated});
 }
 if(!segment&&req.method==='DELETE'){
  fileEdit();const b=await readJson(req,2048);if(!Number.isSafeInteger(b.baseVersion)||b.baseVersion<1)bad(400,'Неверная версия файла');
  return send(200,tx(db,()=>{const row=fileEdit();if(row.version!==b.baseVersion)bad(409,'Конфликт версии файла');
   db.prepare('DELETE FROM cloud_files WHERE id=?').run(id);
   db.prepare(`DELETE FROM cloud_file_blobs WHERE cloud_profile_id=? AND NOT EXISTS (
    SELECT 1 FROM cloud_file_versions v JOIN cloud_files f ON f.id=v.file_id WHERE f.cloud_profile_id=? AND v.sha256=cloud_file_blobs.sha256)`).run(profileId,profileId);
   return {ok:true};}));
 }
 bad(405,'Метод не поддерживается');
}
