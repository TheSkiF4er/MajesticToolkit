/** 2.3.7 collaborative tactical ledger. Every write is validated and authorized in a SQLite transaction. */
import {randomUUID,createHash} from 'node:crypto';
import {cleanMapMeta,imageSignature,MAP_LIMITS} from '../src/lib/tactical-map-core.mjs';
import {cleanPlan} from '../src/lib/tactical-planning-core.mjs';
import {cleanAirdropPoint,cleanAirdropEvent,validateAirdrops} from '../src/lib/tactical-airdrop-core.mjs';
import {cleanTerritory,cleanCrimeEvent,validateCrime} from '../src/lib/crime-core.mjs';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const ID=/^[\w-]{8,120}$/;
const ROLES=['viewer','editor','admin','owner'];
const VALIDATORS={map:cleanMapMeta,plan:cleanPlan,airdrop_point:cleanAirdropPoint,airdrop_event:cleanAirdropEvent,territory:cleanTerritory,territory_event:cleanCrimeEvent};
const hash=x=>createHash('sha256').update(x).digest('hex');
const one=(db,q,...args)=>db.prepare(q).get(...args);
const atomic=(db,fn)=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}};
const view=r=>({kind:r.kind,id:r.record_id,version:r.version,checksum:r.checksum,record:JSON.parse(r.payload),updatedBy:r.updated_by,updatedAt:new Date(r.updated_at).toISOString()});
export function installTactical(db){
 db.exec(`CREATE TABLE IF NOT EXISTS cloud_tactical_records(
  cloud_profile_id TEXT NOT NULL REFERENCES cloud_profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, record_id TEXT NOT NULL, version INTEGER NOT NULL,
  checksum TEXT NOT NULL, payload TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES accounts(id),
  updated_at INTEGER NOT NULL, deleted_at INTEGER, PRIMARY KEY(cloud_profile_id,kind,record_id)
 );
 CREATE TABLE IF NOT EXISTS cloud_tactical_changes(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  cloud_profile_id TEXT NOT NULL REFERENCES cloud_profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, record_id TEXT NOT NULL, version INTEGER NOT NULL,
  operation_id TEXT NOT NULL, request_hash TEXT NOT NULL, action TEXT NOT NULL,
  payload TEXT, checksum TEXT,
  actor_id TEXT NOT NULL REFERENCES accounts(id), occurred_at INTEGER NOT NULL,
  UNIQUE(cloud_profile_id,operation_id)
 );
 CREATE INDEX IF NOT EXISTS cloud_tactical_change_cursor ON cloud_tactical_changes(cloud_profile_id,seq);
 CREATE TABLE IF NOT EXISTS cloud_tactical_images(
  cloud_profile_id TEXT NOT NULL REFERENCES cloud_profiles(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, data BLOB NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES accounts(id), uploaded_at INTEGER NOT NULL,
  PRIMARY KEY(cloud_profile_id,sha256)
 );`);
}
function collection(db,profileId){
 const rows=db.prepare('SELECT kind,record_id,payload FROM cloud_tactical_records WHERE cloud_profile_id=? AND deleted_at IS NULL').all(profileId);
 const out={map:[],plan:[],airdrop_point:[],airdrop_event:[],territory:[],territory_event:[]};
 for(const r of rows)if(out[r.kind])out[r.kind].push(JSON.parse(r.payload));
 return out;
}
function assertRelations(db,profileId,kind,record,bad){
 const rows=collection(db,profileId);
 const map=rows.map[0];
 // Validating the complete post-write projection protects other clients from broken links.
 const byId=list=>new Set(list.map(r=>r.id));
 if(rows.map.length>1)bad(409,'У облачного RP-профиля может быть только одна карта');
 for(const p of rows.plan)if(!map||p.state.mapSha256!==map.sha256)bad(409,'План привязан к отсутствующей версии карты');
 for(const p of rows.airdrop_point)if(p.mapSha256&&(!map||p.mapSha256!==map.sha256))bad(409,'Точка привязана к отсутствующей версии карты');
 try{validateAirdrops(rows.airdrop_point,rows.airdrop_event,[profileId]);}catch(error){bad(409,error.message);}
 // Crime ownership replay is validated against all events, not isolated documents.
 try{validateCrime(rows.territory,rows.territory_event,[profileId]);}catch(error){bad(409,error.message);}
 const plans=byId(rows.plan),territories=byId(rows.territory);
 for(const p of rows.plan)if(p.state.parentPlanId&&!plans.has(p.state.parentPlanId))bad(409,'Исходный план отсутствует');
 if(map)for(const link of map.territoryLinks)if(!territories.has(link.territoryId))bad(409,'Карта содержит ссылку на отсутствующую территорию');
 if(map){
  for(const p of rows.plan)if(p.state.mapSha256!==map.sha256)bad(409,'Карта используется планом другой версии');
  for(const p of rows.airdrop_point)if(p.mapSha256&&p.mapSha256!==map.sha256)bad(409,'Карта используется точками другой версии');
 }
}
function cleanRecord(kind,raw,profileId,bad){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))bad(400,'Ожидается тактическая запись');
 let normalized;
 try{
  // A plan's create event and replayed state carry their original profile ID.
  if(kind==='plan'){
    const history=structuredClone(raw.history);
    if(!Array.isArray(history)||history[0]?.action!=='create')throw Error('Некорректная история плана');
    history[0].data.profileId=profileId;
    normalized=cleanPlan({...raw,profileId,history,state:{...raw.state,profileId}});
  }else normalized=VALIDATORS[kind]({...raw,profileId});
 }catch(error){bad(400,'Некорректная запись: '+String(error.message).slice(0,100));}
 return normalized;
}
function monotonic(previous,next,kind,bad){
 if(!previous)return;
 if(kind==='map'){
  if(next.annotationsRevision<previous.annotationsRevision)bad(409,'Версия разметки карты не может уменьшаться');
  if(JSON.stringify([next.features,next.layers,next.territoryLinks])!==JSON.stringify([previous.features,previous.layers,previous.territoryLinks])&&next.annotationsRevision<=previous.annotationsRevision)bad(409,'Для новой разметки карты требуется увеличить annotationsRevision');
  return;
 }
 const key=kind==='plan'||kind.startsWith('airdrop_')?'history':'events';
 const before=previous[key],after=next[key];
 if(!Array.isArray(before)||!Array.isArray(after)||after.length<before.length||JSON.stringify(after.slice(0,before.length))!==JSON.stringify(before))bad(409,'Журнал нельзя переписать или сократить; добавьте новую операцию');
 if(after.length===before.length)bad(409,'Изменение записи требует новой операции истории');
}
/** Parse image dimensions without external codecs, reject malformed container headers. */
function imageDimensions(buffer,mime,bad){
 let width=0,height=0;
 if(mime==='image/png'){
  if(buffer.length<33||buffer.toString('ascii',12,16)!=='IHDR'||buffer.readUInt32BE(8)!==13)bad(400,'Повреждён PNG IHDR');
  width=buffer.readUInt32BE(16);height=buffer.readUInt32BE(20);
  const bits=buffer[24],type=buffer[25],allowed={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
  if(!allowed[type]?.includes(bits))bad(400,'Некорректная глубина цвета PNG');
 }else if(mime==='image/jpeg'){
  let i=2;while(i+4<buffer.length){
   if(buffer[i]!==0xff){i++;continue;}
   while(buffer[i]===0xff)i++;
   const marker=buffer[i++];if(marker===0xd8||marker===0xd9||marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
   if(i+2>buffer.length)break;const length=buffer.readUInt16BE(i);if(length<2||i+length>buffer.length)break;
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
    if(length<7)break;height=buffer.readUInt16BE(i+3);width=buffer.readUInt16BE(i+5);break;
   }i+=length;
  }
 }else if(mime==='image/webp'){
  if(buffer.length<30||buffer.readUInt32LE(4)+8!==buffer.length)bad(400,'Повреждён контейнер WebP');
  const format=buffer.toString('ascii',12,16);
  if(format==='VP8X'&&buffer.length>=30){width=1+buffer.readUIntLE(24,3);height=1+buffer.readUIntLE(27,3);}
  else if(format==='VP8 '&&buffer.length>=30&&buffer[23]===0x9d&&buffer[24]===0x01&&buffer[25]===0x2a){width=buffer.readUInt16LE(26)&0x3fff;height=buffer.readUInt16LE(28)&0x3fff;}
  else if(format==='VP8L'&&buffer.length>=25&&buffer[20]===0x2f){width=1+(((buffer[22]&0x3f)<<8)|buffer[21]);height=1+(((buffer[24]&0x0f)<<10)|(buffer[23]<<2)|((buffer[22]&0xc0)>>6));}
 }
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>MAP_LIMITS.dimension||height>MAP_LIMITS.dimension||width*height>MAP_LIMITS.pixels)bad(400,'Повреждены размеры изображения');
 return {width,height};
}
async function receiveImage(req,bad){
 const type=req.headers['content-type'];
 if(!['image/png','image/jpeg','image/webp'].includes(type))bad(415,'Допустимы только PNG, JPEG и WebP');
 const length=Number(req.headers['content-length']);
 if(req.headers['content-length']!==undefined&&(!Number.isSafeInteger(length)||length<32||length>MAP_LIMITS.bytes))bad(413,'Неверный размер изображения');
 let total=0;const parts=[];
 for await(const part of req){total+=part.length;if(total>MAP_LIMITS.bytes)bad(413,'Изображение превышает 25 МиБ');parts.push(part);}
 if(total<32)bad(400,'Пустое изображение');
 const buffer=Buffer.concat(parts,total);
 if(!imageSignature(buffer.subarray(0,16),type))bad(400,'Содержимое не соответствует формату изображения');
 return {buffer,mime:type,sha256:hash(buffer),...imageDimensions(buffer,type,bad)};
}
export async function handleTactical({db,req,res,path,identity,now,cors,readJson,returnJson,bad,clock=Date.now}){
 const match=/^\/v1\/teams\/([0-9a-f-]{36})\/cloud\/profiles\/([0-9a-f-]{36})\/tactical(?:\/(changes|image|map-image|map|plan|airdrop_point|airdrop_event|territory|territory_event)(?:\/([\w-]{8,120}))?)?$/.exec(path);
 if(!match||!UUID.test(match[1])||!UUID.test(match[2]))bad(404,'Тактический ресурс не найден');
 const [,teamId,profileId,part,id]=match,send=(code,data)=>returnJson(res,code,data,cors);
 const authorize=min=>{
  const t=clock();
  if(!one(db,`SELECT 1 FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=? AND s.account_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.access_expires_at>? AND a.disabled=0`,identity.id,identity.account_id,t,t))bad(401,'Сессия завершена');
  const role=one(db,'SELECT role FROM team_members WHERE team_id=? AND account_id=?',teamId,identity.account_id)?.role;
  if(!role)bad(404,'Команда недоступна');
  if(ROLES.indexOf(role)<ROLES.indexOf(min))bad(403,'Недостаточно полномочий');
  if(!one(db,'SELECT 1 FROM cloud_profiles WHERE id=? AND team_id=?',profileId,teamId))bad(404,'Облачный профиль не найден');
 };
 authorize('viewer');
 if(part==='image'){
  if(!id||!/^[a-f0-9]{64}$/.test(id))bad(404,'Изображение не найдено');
  if(req.method==='GET'){
   const row=one(db,'SELECT mime,size,data FROM cloud_tactical_images WHERE cloud_profile_id=? AND sha256=?',profileId,id);
   const meta=one(db,"SELECT payload FROM cloud_tactical_records WHERE cloud_profile_id=? AND kind='map' AND deleted_at IS NULL",profileId);
   if(!row||!meta||JSON.parse(meta.payload).sha256!==id)bad(404,'Изображение не опубликовано');
   res.writeHead(200,{...cors,'Content-Type':row.mime,'Content-Length':row.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(row.data);return;
  }
  if(req.method!=='PUT')bad(405,'Метод не поддерживается');
  authorize('editor');
  const image=await receiveImage(req,bad);
  if(image.sha256!==id)bad(409,'SHA-256 изображения не совпадает');
  const result=atomic(db,()=>{
   authorize('editor');
   const existing=one(db,'SELECT size,mime,width,height FROM cloud_tactical_images WHERE cloud_profile_id=? AND sha256=?',profileId,id);
   if(existing){if(existing.size!==image.buffer.length||existing.mime!==image.mime||existing.width!==image.width||existing.height!==image.height)bad(409,'Хеш изображения уже зарегистрирован');return false;}
   const count=one(db,'SELECT count(*) AS n FROM cloud_tactical_images WHERE cloud_profile_id=?',profileId).n;
   if(count>=5){
    // Stale uploads cannot exhaust quota permanently; never prune the published map.
    const current=one(db,"SELECT payload FROM cloud_tactical_records WHERE cloud_profile_id=? AND kind='map' AND deleted_at IS NULL",profileId);
    const keep=current?JSON.parse(current.payload).sha256:'';
    db.prepare('DELETE FROM cloud_tactical_images WHERE cloud_profile_id=? AND sha256 IN (SELECT sha256 FROM cloud_tactical_images WHERE cloud_profile_id=? AND sha256<>? ORDER BY uploaded_at LIMIT 1)').run(profileId,profileId,keep);
    if(one(db,'SELECT count(*) AS n FROM cloud_tactical_images WHERE cloud_profile_id=?',profileId).n>=5)bad(409,'Превышена квота изображений');
   }
   db.prepare('INSERT INTO cloud_tactical_images(cloud_profile_id,sha256,mime,size,width,height,data,uploaded_by,uploaded_at) VALUES(?,?,?,?,?,?,?,?,?)').run(profileId,id,image.mime,image.buffer.length,image.width,image.height,image.buffer,identity.account_id,clock());return true;
  });
  return send(result?201:200,{ok:true,sha256:id,size:image.buffer.length});
 }
 if(part==='changes'){
  if(req.method!=='GET')bad(405,'Метод не поддерживается');
  const query=new URL(req.url,'https://identity.internal').searchParams;
  if([...query.keys()].some(k=>!['after','limit'].includes(k)))bad(400,'Неизвестный параметр');
  const after=query.get('after')??'0',limit=query.get('limit')??'50';
  if(!/^(0|[1-9][0-9]{0,15})$/.test(after)||!Number.isSafeInteger(Number(after))||!/^(?:[1-9]|[1-9][0-9]|100)$/.test(limit))bad(400,'Некорректный курсор');
  const rows=db.prepare(`SELECT c.* FROM cloud_tactical_changes c
    WHERE c.cloud_profile_id=? AND c.seq>? ORDER BY c.seq LIMIT ?`).all(profileId,Number(after),Number(limit)+1);
  const selected=rows.slice(0,Number(limit));
  return send(200,{changes:selected.map(r=>({seq:r.seq,kind:r.kind,id:r.record_id,version:r.version,action:r.action,actorId:r.actor_id,at:new Date(r.occurred_at).toISOString(),record:r.payload?JSON.parse(r.payload):null})),cursor:selected.at(-1)?.seq??Number(after),hasMore:rows.length>Number(limit)});
 }
 if(!part){
  if(req.method!=='GET')bad(405,'Метод не поддерживается');
  const query=new URL(req.url,'https://identity.internal').searchParams;
  const after=query.get('after')||'',kind=query.get('kind')||'';
  if([...query.keys()].some(k=>!['after','kind'].includes(k))||kind&&!Object.hasOwn(VALIDATORS,kind)||after&&!/^(?:map|plan|airdrop_point|airdrop_event|territory|territory_event):[\w-]{8,120}$/.test(after))bad(400,'Некорректный фильтр');
  const rows=kind?db.prepare('SELECT * FROM cloud_tactical_records WHERE cloud_profile_id=? AND kind=? AND record_id>? AND deleted_at IS NULL ORDER BY record_id LIMIT 51').all(profileId,kind,after?after.slice(after.indexOf(':')+1):''):db.prepare("SELECT * FROM cloud_tactical_records WHERE cloud_profile_id=? AND (kind||':'||record_id)>? AND deleted_at IS NULL ORDER BY kind,record_id LIMIT 51").all(profileId,after);
  return send(200,{records:rows.slice(0,50).map(view),nextCursor:rows.length>50?rows[49].kind+':'+rows[49].record_id:null});
 }
 if(!Object.hasOwn(VALIDATORS,part)||!id||!ID.test(id))bad(404,'Запись не найдена');
 if(part==='map'&&id!=='map-'+profileId)bad(400,'Карта должна соответствовать профилю');
 if(req.method==='GET'){
  const record=one(db,'SELECT * FROM cloud_tactical_records WHERE cloud_profile_id=? AND kind=? AND record_id=? AND deleted_at IS NULL',profileId,part,id);
  if(!record)bad(404,'Запись не найдена');return send(200,{entry:view(record)});
 }
 if(!['PUT','DELETE'].includes(req.method))bad(405,'Метод не поддерживается');
 authorize('editor');
 const body=await readJson(req,512*1024);
 if(!UUID.test(body.operationId??'')||!Number.isSafeInteger(body.baseVersion)||body.baseVersion<0||body.baseVersion>1_000_000)bad(400,'Некорректная операция или базовая версия');
 if(req.method==='PUT'&&(!body.record||part!=='map'&&body.record.id!==id))bad(400,'Неверный ID записи');
 const normalized=req.method==='PUT'?cleanRecord(part,body.record,profileId,bad):null;
 const json=normalized?JSON.stringify(normalized):null;
 if(json&&Buffer.byteLength(json)>256*1024)bad(413,'Тактическая запись превышает 256 КБ');
 const checksum=json?hash(json):null,requestHash=hash(JSON.stringify({kind:part,id,baseVersion:body.baseVersion,action:req.method,checksum}));
 const result=atomic(db,()=>{
  authorize('editor');
  const replay=one(db,'SELECT * FROM cloud_tactical_changes WHERE cloud_profile_id=? AND operation_id=?',profileId,body.operationId);
  if(replay){if(replay.request_hash!==requestHash)bad(409,'ID операции повторно использован с другой записью');return {version:replay.version,replayed:true,seq:replay.seq};}
  const old=one(db,'SELECT * FROM cloud_tactical_records WHERE cloud_profile_id=? AND kind=? AND record_id=?',profileId,part,id);
  if((old?.version??0)!==body.baseVersion)bad(409,'Запись была изменена другим участником. Обновите её и согласуйте правки');
  if(req.method==='DELETE'&&(!old||old.deleted_at!==null))bad(404,'Запись не существует');
  if(normalized){
   monotonic(old&&old.deleted_at===null?JSON.parse(old.payload):null,normalized,part,bad);
   if(part==='map'){
    const file=one(db,'SELECT size,mime,width,height FROM cloud_tactical_images WHERE cloud_profile_id=? AND sha256=?',profileId,normalized.sha256);
    if(!file||file.size!==normalized.size||file.mime!==normalized.mime||file.width!==normalized.width||file.height!==normalized.height)bad(409,'Сначала загрузите изображение карты с указанным SHA-256');
   }
   const all=one(db,'SELECT count(*) AS n FROM cloud_tactical_records WHERE cloud_profile_id=? AND deleted_at IS NULL',profileId).n;
   if((!old||old.deleted_at!==null)&&all>=2000)bad(409,'Достигнут лимит 2000 тактических записей на профиль');
   db.prepare(`INSERT INTO cloud_tactical_records(cloud_profile_id,kind,record_id,version,checksum,payload,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(cloud_profile_id,kind,record_id) DO UPDATE SET version=excluded.version,checksum=excluded.checksum,payload=excluded.payload,updated_by=excluded.updated_by,updated_at=excluded.updated_at,deleted_at=NULL`).run(profileId,part,id,body.baseVersion+1,checksum,json,identity.account_id,clock());
  }else db.prepare('UPDATE cloud_tactical_records SET payload=?,checksum=?,deleted_at=?,updated_at=?,updated_by=?,version=? WHERE cloud_profile_id=? AND kind=? AND record_id=?').run('null','',clock(),clock(),identity.account_id,body.baseVersion+1,profileId,part,id);
  assertRelations(db,profileId,part,normalized,bad);
  const seq=db.prepare(`INSERT INTO cloud_tactical_changes(cloud_profile_id,kind,record_id,version,operation_id,request_hash,action,payload,checksum,actor_id,occurred_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(profileId,part,id,body.baseVersion+1,body.operationId,requestHash,req.method==='DELETE'?'delete':old&&old.deleted_at===null?'update':'create',json,checksum,identity.account_id,clock()).lastInsertRowid;
  db.prepare('INSERT INTO team_activity(id,team_id,actor_id,action,subject_id,occurred_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),teamId,identity.account_id,req.method==='DELETE'?'tactical.deleted':old&&old.deleted_at===null?'tactical.updated':'tactical.created',id,clock());
  return {version:body.baseVersion+1,seq:Number(seq),replayed:false,created:!old||old.deleted_at!==null};
 });
 return send(result.replayed?200:req.method==='DELETE'?200:result.created?201:200,{...result,ok:true});
}
