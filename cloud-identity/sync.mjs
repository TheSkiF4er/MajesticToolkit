/** 2.3.4 durable versioned change stream and conditional mutations for team RP records. */
import {randomUUID,createHash} from 'node:crypto';
import {cleanFamily,validateFamilies} from '../src/lib/family-core.mjs';
import {cleanOrganization,validateOrganizations} from '../src/lib/organization-core.mjs';
import {cleanMarketRecord,validateMarketplace} from '../src/lib/marketplace-core.mjs';
import {projectCloudRecord} from './directories.mjs';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const KINDS={family:{clean:cleanFamily,validate:validateFamilies},organization:{clean:cleanOrganization,validate:validateOrganizations},product:{clean:cleanMarketRecord,validate:validateMarketplace}};
const ROLES=['viewer','editor','admin','owner'];
const sql=(db,q,...params)=>db.prepare(q).get(...params);
const digest=value=>createHash('sha256').update(value).digest('hex');
const tx=(db,fn)=>{db.exec('BEGIN IMMEDIATE');try{const x=fn();db.exec('COMMIT');return x;}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}};
export function installCloudSync(db){
  const columns=db.prepare('PRAGMA table_info(cloud_records)').all().map(c=>c.name);
  if(!columns.includes('deleted_at'))db.exec('ALTER TABLE cloud_records ADD COLUMN deleted_at INTEGER');
  db.exec(`
    CREATE TABLE IF NOT EXISTS cloud_changes (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      cloud_profile_id TEXT NOT NULL REFERENCES cloud_profiles(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,record_id TEXT NOT NULL,version INTEGER NOT NULL,
      payload TEXT,checksum TEXT,deleted INTEGER NOT NULL DEFAULT 0,
      operation_id TEXT,request_hash TEXT,actor_id TEXT NOT NULL REFERENCES accounts(id),
      occurred_at INTEGER NOT NULL,
      UNIQUE(cloud_profile_id,operation_id)
    );
    CREATE INDEX IF NOT EXISTS cloud_changes_cursor ON cloud_changes(cloud_profile_id,seq);
    CREATE INDEX IF NOT EXISTS cloud_changes_record ON cloud_changes(cloud_profile_id,kind,record_id,seq);
  `);
  // Upgrade an existing 2.3.3 database: imported records must become visible to
  // devices that have never synced. This migration is safe on repeated startups.
  db.exec(`INSERT INTO cloud_changes(cloud_profile_id,kind,record_id,version,payload,checksum,deleted,actor_id,occurred_at)
    SELECT r.cloud_profile_id,r.kind,r.record_id,r.version,r.payload,r.checksum,0,r.imported_by,r.created_at
    FROM cloud_records r WHERE NOT EXISTS (
      SELECT 1 FROM cloud_changes c WHERE c.cloud_profile_id=r.cloud_profile_id AND c.kind=r.kind AND c.record_id=r.record_id
    )`);
}
export function logCloudImport(db,{profileId,kind,id,payload,checksum,accountId,now}){
  db.prepare(`INSERT INTO cloud_changes(cloud_profile_id,kind,record_id,version,payload,checksum,deleted,actor_id,occurred_at)
     VALUES(?,?,?,?,?,?,?,?,?)`).run(profileId,kind,id,1,payload,checksum,0,accountId,now);
}
export async function handleCloudSync({db,req,res,path,identity,now,cors,readJson,returnJson,bad,clock=Date.now}){
  const match=/^\/v1\/teams\/([0-9a-f-]{36})\/cloud\/profiles\/([0-9a-f-]{36})\/sync(?:\/(snapshot|record)(?:\/(family|organization|product)\/([\w-]{8,120}))?)?$/.exec(path);
  if(!match||!UUID.test(match[1])||!UUID.test(match[2]))bad(404,'Ресурс синхронизации не найден');
  const [,teamId,profileId,resource,recordKind,recordId]=match,accountId=identity.account_id;
  const authorize=min=>{
    const t=clock();
    if(!sql(db,`SELECT 1 FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=? AND s.account_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.access_expires_at>? AND a.disabled=0`,identity.id,accountId,t,t))bad(401,'Сессия завершена');
    const role=sql(db,'SELECT role FROM team_members WHERE team_id=? AND account_id=?',teamId,accountId)?.role;
    if(!role)bad(404,'Команда не найдена или нет доступа');
    if(ROLES.indexOf(role)<ROLES.indexOf(min))bad(403,'Недостаточно прав на синхронизацию');
    if(!sql(db,'SELECT 1 FROM cloud_profiles WHERE id=? AND team_id=?',profileId,teamId))bad(404,'Облачный профиль не найден');
  };
  const send=(code,data)=>returnJson(res,code,data,cors);
  authorize('viewer');
  if(resource==='record'&&req.method==='GET'){
    if(!recordKind||!recordId)bad(404,'Запись не найдена');
    const row=sql(db,'SELECT kind,record_id,payload,version,checksum,deleted_at FROM cloud_records WHERE cloud_profile_id=? AND kind=? AND record_id=?',profileId,recordKind,recordId);
    return send(200,{entry:row?{kind:row.kind,id:row.record_id,version:row.version,record:row.deleted_at===null?JSON.parse(row.payload):null,checksum:row.deleted_at===null?row.checksum:null,deleted:row.deleted_at!==null}:null});
  }
  if(resource==='snapshot'&&req.method==='GET'){
    const params=new URL(req.url,'https://identity.internal').searchParams;
    if([...params.keys()].some(k=>!['after','watermark','limit'].includes(k)))bad(400,'Неизвестный параметр');
    const after=params.get('after')??'',mark=params.get('watermark'),limit=params.get('limit')??'50';
    if(after&&!/^(?:family|organization|product):[\w-]{8,120}$/.test(after)||mark!==null&&!/^(0|[1-9][0-9]{0,15})$/.test(mark)||!Number.isSafeInteger(Number(mark??0))||!/^([1-9]|[1-9][0-9]|100)$/.test(limit))bad(400,'Некорректные параметры снимка');
    const watermark=mark===null?sql(db,'SELECT coalesce(max(seq),0) AS n FROM cloud_changes WHERE cloud_profile_id=?',profileId).n:Number(mark);
    const rows=db.prepare(`SELECT c.seq,c.kind,c.record_id,c.version,c.payload,c.checksum,c.deleted,c.occurred_at FROM cloud_changes c
      WHERE c.cloud_profile_id=? AND c.seq<=? AND (c.kind||':'||c.record_id)>? AND c.seq=(SELECT max(c2.seq) FROM cloud_changes c2 WHERE c2.cloud_profile_id=c.cloud_profile_id AND c2.kind=c.kind AND c2.record_id=c.record_id AND c2.seq<=?)
      ORDER BY c.kind,c.record_id LIMIT ?`).all(profileId,watermark,after,watermark,Number(limit)+1);
    const selected=rows.slice(0,Number(limit));
    return send(200,{entries:selected.map(r=>({seq:r.seq,kind:r.kind,id:r.record_id,version:r.version,record:r.deleted?null:JSON.parse(r.payload),checksum:r.deleted?null:r.checksum,deleted:Boolean(r.deleted)})),watermark,nextCursor:rows.length>Number(limit)?selected.at(-1).kind+':'+selected.at(-1).record_id:null});
  }
  if(resource)bad(405,'Метод не поддерживается');
  if(req.method==='GET'){
    const params=new URL(req.url,'https://identity.internal').searchParams;
    if([...params.keys()].some(k=>!['after','limit'].includes(k)))bad(400,'Неизвестный параметр');
    const after=params.get('after')??'0',limit=params.get('limit')??'50';
    if(!/^(0|[1-9][0-9]{0,15})$/.test(after)||!/^([1-9]|[1-9][0-9]|100)$/.test(limit)||!Number.isSafeInteger(Number(after)))bad(400,'Некорректный курсор или лимит');
    const rows=db.prepare(`SELECT seq,kind,record_id,version,payload,checksum,deleted,occurred_at FROM cloud_changes
       WHERE cloud_profile_id=? AND seq>? ORDER BY seq LIMIT ?`).all(profileId,Number(after),Number(limit)+1);
    const selected=rows.slice(0,Number(limit));
    return send(200,{changes:selected.map(r=>({seq:r.seq,kind:r.kind,id:r.record_id,version:r.version,record:r.deleted?null:JSON.parse(r.payload),checksum:r.deleted?null:r.checksum,deleted:Boolean(r.deleted),at:new Date(r.occurred_at).toISOString()})),cursor:selected.at(-1)?.seq??Number(after),hasMore:rows.length>Number(limit)});
  }
  if(req.method!=='POST')bad(405,'Метод не поддерживается');
  authorize('editor');
  const body=await readJson(req,200*1024);
  const {operationId,kind,id,baseVersion,deleted=false}=body;
  if(!UUID.test(operationId??'')||!Object.hasOwn(KINDS,kind)||typeof id!=='string'||!/^[\w-]{8,120}$/.test(id)||!Number.isSafeInteger(baseVersion)||baseVersion<0||baseVersion>1_000_000||typeof deleted!=='boolean')bad(400,'Некорректная операция синхронизации');
  let payload=null,checksum=null;
  if(!deleted){
    if(!body.record||typeof body.record!=='object'||Array.isArray(body.record)||body.record.id!==id)bad(400,'Некорректная запись');
    try{const normalized=KINDS[kind].clean({...body.record,profileId});KINDS[kind].validate([normalized],[profileId]);if(kind==='product'&&normalized.type!=='product')bad(400,'Только товары каталога могут синхронизироваться');payload=JSON.stringify(normalized);}
    catch{bad(400,'Запись не прошла проверку');}
    if(Buffer.byteLength(payload)>160*1024)bad(413,'Запись превышает 160 КБ');
    checksum=digest(payload);
  }else if(body.record!==undefined&&body.record!==null)bad(400,'Удаление не должно содержать запись');
  const requestHash=digest(JSON.stringify({kind,id,baseVersion,deleted,checksum}));
  const result=tx(db,()=>{
    authorize('editor');
    const replay=sql(db,'SELECT kind,record_id,version,deleted,checksum,request_hash,seq FROM cloud_changes WHERE cloud_profile_id=? AND operation_id=?',profileId,operationId);
    if(replay){if(replay.request_hash!==requestHash)bad(409,'Идентификатор операции уже использован для другого изменения');return {version:replay.version,cursor:replay.seq,unchanged:true,replayed:true};}
    if(!deleted){
      // Domain stores disallow duplicate names within an RP profile. Enforce that
      // centrally as well so a remote update cannot corrupt another device.
      const next=JSON.parse(payload);
      const normalizedName=next.name.toLocaleLowerCase('ru-RU');
      const existing=db.prepare('SELECT record_id,payload FROM cloud_records WHERE cloud_profile_id=? AND kind=? AND record_id<>? AND deleted_at IS NULL').all(profileId,kind,id);
      if(existing.some(row=>{const old=JSON.parse(row.payload);return old.name.toLocaleLowerCase('ru-RU')===normalizedName && (kind!=='product'||old.category===next.category&&old.variant.toLocaleLowerCase('ru-RU')===next.variant.toLocaleLowerCase('ru-RU'));}))bad(409,'Другая запись этого RP-профиля уже использует такое название');
    }
    const old=sql(db,'SELECT version,checksum,deleted_at FROM cloud_records WHERE cloud_profile_id=? AND kind=? AND record_id=?',profileId,kind,id);
    const actual=old?.version??0;
    if(actual!==baseVersion)bad(409,`Конфликт версии записи ${kind}/${id}: ожидалась ${baseVersion}, сервер хранит ${actual}`);
    if(deleted&&!old)bad(409,'Невозможно удалить несуществующую запись');
    const unchanged=Boolean(old&&(deleted?old.deleted_at!==null:old.deleted_at===null&&old.checksum===checksum));
    if(!unchanged){
      if(!old){
        const count=sql(db,'SELECT count(*) AS n FROM cloud_records WHERE cloud_profile_id=? AND deleted_at IS NULL',profileId).n;
        if(count>=10_000)bad(409,'Достигнут лимит облачного профиля');
        db.prepare(`INSERT INTO cloud_records(cloud_profile_id,kind,record_id,payload,checksum,version,created_at,imported_by,deleted_at)
          VALUES(?,?,?,?,?,1,?,?,NULL)`).run(profileId,kind,id,payload,checksum,now,accountId);
      }else{
        if(!deleted&&old.deleted_at!==null){const count=sql(db,'SELECT count(*) AS n FROM cloud_records WHERE cloud_profile_id=? AND deleted_at IS NULL',profileId).n;if(count>=10_000)bad(409,'Достигнут лимит облачного профиля');}
        db.prepare(`UPDATE cloud_records SET payload=?,checksum=?,version=version+1,deleted_at=?,imported_by=? WHERE cloud_profile_id=? AND kind=? AND record_id=?`)
          .run(deleted?'null':payload,deleted?'':checksum,deleted?now:null,accountId,profileId,kind,id);
      }
    }
    const version=actual+(unchanged?0:1);
    if(!unchanged)projectCloudRecord(db,{profileId,kind,id,payload:deleted?null:payload});
    const log=db.prepare(`INSERT INTO cloud_changes(cloud_profile_id,kind,record_id,version,payload,checksum,deleted,operation_id,request_hash,actor_id,occurred_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(profileId,kind,id,version,deleted?null:payload,deleted?null:checksum,deleted?1:0,operationId,requestHash,accountId,now);
    return {version,cursor:Number(log.lastInsertRowid),unchanged,replayed:false};
  });
  return send(200,result);
}
