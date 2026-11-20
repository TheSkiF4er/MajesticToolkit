/** Team Cloud Storage 2.3.3: SQLite-backed, RBAC-protected RP snapshots.
 * Initial migration is deliberately explicit and never overwrites source records.
 */
import {randomUUID,createHash} from 'node:crypto';
import {logCloudImport} from './sync.mjs';
import {projectCloudRecord} from './directories.mjs';
import {cleanMarketRecord,validateMarketplace} from '../src/lib/marketplace-core.mjs';
import {cleanFamily,validateFamilies} from '../src/lib/family-core.mjs';
import {cleanOrganization,validateOrganizations} from '../src/lib/organization-core.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ENTRY_ID=/^[\w-]{8,120}$/;
const PROJECTS=new Set(['majestic','russia-online','other']);
const ROLE_ORDER=['viewer','editor','admin','owner'];
const KINDS={family:{clean:cleanFamily,validate:validateFamilies},organization:{clean:cleanOrganization,validate:validateOrganizations},product:{clean:cleanMarketRecord,validate:validateMarketplace}};
const iso=n=>new Date(n).toISOString();
const stmt=(db,sql,...args)=>db.prepare(sql).get(...args);
function atomic(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}}
function validateProfile(body,bad){
  if(!body||typeof body!=='object'||Array.isArray(body))bad(400,'Требуется RP-профиль');
  const name=body.name,project=body.project,server=body.server;
  if(typeof name!=='string'||name.trim().length<2||name.trim().length>64||/[\x00-\x1f\x7f<>]/.test(name)||!PROJECTS.has(project)||typeof server!=='string'||server.trim().length<1||server.trim().length>70||/[\x00-\x1f\x7f<>]/.test(server))bad(400,'Некорректные название, проект или сервер RP-профиля');
  return {name:name.trim(),project,server:server.trim()};
}
export function installCloudStorage(db){
 // SQLite cannot widen CHECK constraints in-place. Rebuild the table while
 // preserving tombstones, versions and all 2.3.3/2.3.4 records.
 const schema=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cloud_records'").get()?.sql||'';
 if(schema&&!schema.includes("'product'")){
   db.exec('BEGIN IMMEDIATE');
   try{
     db.exec(`CREATE TABLE cloud_records_v235(
       cloud_profile_id TEXT NOT NULL REFERENCES cloud_profiles(id) ON DELETE CASCADE,
       kind TEXT NOT NULL CHECK(kind IN ('family','organization','product')),
       record_id TEXT NOT NULL,payload TEXT NOT NULL,checksum TEXT NOT NULL,
       version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,
       imported_by TEXT NOT NULL REFERENCES accounts(id),deleted_at INTEGER,
       PRIMARY KEY(cloud_profile_id,kind,record_id)
     );`);
     const deleted=db.prepare('PRAGMA table_info(cloud_records)').all().some(col=>col.name==='deleted_at');
     db.exec(`INSERT INTO cloud_records_v235(cloud_profile_id,kind,record_id,payload,checksum,version,created_at,imported_by,deleted_at)
       SELECT cloud_profile_id,kind,record_id,payload,checksum,version,created_at,imported_by,${deleted?'deleted_at':'NULL'} FROM cloud_records;
       DROP TABLE cloud_records;
       ALTER TABLE cloud_records_v235 RENAME TO cloud_records;`);
     db.exec('COMMIT');
   }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
 }
 db.exec(`
 CREATE TABLE IF NOT EXISTS cloud_profiles(
  id TEXT PRIMARY KEY,team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,project TEXT NOT NULL,server TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES accounts(id),created_at INTEGER NOT NULL,
  UNIQUE(team_id,name)
 );
 CREATE INDEX IF NOT EXISTS cloud_profiles_team ON cloud_profiles(team_id);
 CREATE TABLE IF NOT EXISTS cloud_records(
  cloud_profile_id TEXT NOT NULL REFERENCES cloud_profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('family','organization','product')),
  record_id TEXT NOT NULL,payload TEXT NOT NULL,checksum TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,
  imported_by TEXT NOT NULL REFERENCES accounts(id),
  PRIMARY KEY(cloud_profile_id,kind,record_id)
 );
 CREATE INDEX IF NOT EXISTS cloud_records_profile ON cloud_records(cloud_profile_id,kind,record_id);
 `);}
export async function handleCloudStorage({db,req,res,path,identity,now,cors,readJson,returnJson,bad,clock=Date.now}){
  const send=(status,payload)=>returnJson(res,status,payload,cors);
  const accountId=identity.account_id;
  const pathMatch=/^\/v1\/teams\/([0-9a-f-]{36})\/cloud\/profiles(?:\/([0-9a-f-]{36})\/records)?$/.exec(path);
  if(!pathMatch||!UUID.test(pathMatch[1])||(pathMatch[2]&&!UUID.test(pathMatch[2])))bad(404,'Облачный ресурс не найден');
  const [,teamId,profileId]=pathMatch;
  const live=()=>{
    const current=clock();
    const session=stmt(db,`SELECT s.id FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=? AND s.account_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.access_expires_at>? AND a.disabled=0`,identity.id,accountId,current,current);
    if(!session)bad(401,'Сессия завершена');
  };
  const member=min=>{
    const role=stmt(db,'SELECT role FROM team_members WHERE team_id=? AND account_id=?',teamId,accountId)?.role;
    if(!role)bad(404,'Команда не найдена или нет доступа');
    if(ROLE_ORDER.indexOf(role)<ROLE_ORDER.indexOf(min))bad(403,'Недостаточно прав для работы с облачным хранилищем');
    return role;
  };
  const profile=()=>{
    const row=stmt(db,'SELECT * FROM cloud_profiles WHERE id=? AND team_id=?',profileId,teamId);
    if(!row)bad(404,'Облачный RP-профиль не найден');return row;
  };
  const view=row=>({id:row.id,name:row.name,project:row.project,server:row.server,createdAt:iso(row.created_at),createdBy:row.created_by});
  member();
  if(!profileId){
    if(req.method==='GET'){
      const rows=db.prepare(`SELECT p.*,(SELECT count(*) FROM cloud_records r WHERE r.cloud_profile_id=p.id AND r.deleted_at IS NULL) AS record_count FROM cloud_profiles p WHERE p.team_id=? ORDER BY p.name LIMIT 100`).all(teamId);
      return send(200,{profiles:rows.map(row=>({...view(row),recordCount:row.record_count}))});
    }
    if(req.method!=='POST')bad(405,'Метод не поддерживается');
    member('admin');
    const input=validateProfile(await readJson(req),bad);
    const created=atomic(db,()=>{
      live();member('admin');
      const existing=stmt(db,'SELECT * FROM cloud_profiles WHERE team_id=? AND name=?',teamId,input.name);
      if(existing){if(existing.project!==input.project||existing.server!==input.server)bad(409,'Имя уже используется другим RP-профилем');return {row:existing,status:200};}
      if(stmt(db,'SELECT count(*) AS n FROM cloud_profiles WHERE team_id=?',teamId).n>=100)bad(409,'В команде допускается не более 100 облачных профилей');
      const row={...input,id:randomUUID(),team_id:teamId,created_at:now,created_by:accountId};
      db.prepare('INSERT INTO cloud_profiles(id,team_id,name,project,server,created_by,created_at) VALUES(?,?,?,?,?,?,?)').run(row.id,teamId,row.name,row.project,row.server,row.created_by,row.created_at);
      db.prepare('INSERT INTO team_activity(id,team_id,actor_id,action,subject_id,occurred_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),teamId,accountId,'cloud.profile_created',row.id,now);
      return {row,status:201};
    });
    return send(created.status,{profile:view(created.row)});
  }
  profile();
  if(req.method==='GET'){
    const url=new URL(req.url,'https://identity.internal');
    const kind=url.searchParams.get('kind');if(kind!==null&&!Object.hasOwn(KINDS,kind))bad(400,'Неизвестный тип данных');
    const after=url.searchParams.get('after')||'';if(after&&!(kind?ENTRY_ID.test(after):/^(?:family|organization|product):[\w-]{8,120}$/.test(after)))bad(400,'Некорректный курсор');
    if([...url.searchParams.keys()].some(x=>!['kind','after'].includes(x)))bad(400,'Неизвестный параметр');
    const rows=kind?db.prepare('SELECT kind,record_id,payload,checksum,version,created_at FROM cloud_records WHERE cloud_profile_id=? AND deleted_at IS NULL AND kind=? AND record_id>? ORDER BY record_id LIMIT 21').all(profileId,kind,after):db.prepare(`SELECT kind,record_id,payload,checksum,version,created_at FROM cloud_records WHERE cloud_profile_id=? AND deleted_at IS NULL AND (kind||':'||record_id)>? ORDER BY kind,record_id LIMIT 21`).all(profileId,after);
    const result=rows.slice(0,20);
    return send(200,{records:result.map(r=>({kind:r.kind,id:r.record_id,record:JSON.parse(r.payload),checksum:r.checksum,version:r.version,importedAt:iso(r.created_at)})),nextCursor:rows.length>20?(kind?result.at(-1).record_id:result.at(-1).kind+':'+result.at(-1).record_id):null});
  }
  if(req.method!=='POST')bad(405,'Метод не поддерживается');
  member('editor');
  const body=await readJson(req,512*1024);
  if(!Array.isArray(body.records)||!body.records.length||body.records.length>20)bad(400,'Отправьте от 1 до 20 записей');
  // Canonical domain validators are identical to local stores. The server owns profileId;
  // clients cannot publish records into another team's namespace.
  const parsed=[],seen=new Set();
  for(const item of body.records){
    if(!item||!Object.hasOwn(KINDS,item.kind)||!item.record||typeof item.record!=='object'||Array.isArray(item.record))bad(400,'Недопустимый тип записи');
    if(typeof item.record.profileId!=='string'||!ENTRY_ID.test(item.record.profileId))bad(400,'Некорректный исходный RP-профиль');
    const key=item.kind+':'+item.record.id;if(seen.has(key))bad(400,'Повтор записи в одном запросе');seen.add(key);
    let normalized;
    try{normalized=KINDS[item.kind].clean({...item.record,profileId});KINDS[item.kind].validate([normalized],[profileId]);}
    catch{bad(400,'Некорректная запись '+item.kind+' / '+String(item.record.id).slice(0,60));}
    const payload=JSON.stringify(normalized);
    if(Buffer.byteLength(payload,'utf8')>160*1024)bad(413,'Запись превышает 160 КБ');
    if(item.kind==='product'&&normalized.type!=='product')bad(400,'Импортируются только товары каталога');
    parsed.push({kind:item.kind,id:normalized.id,payload,checksum:createHash('sha256').update(payload).digest('hex')});
  }
  const result=atomic(db,()=>{
    live();member('editor');profile();
    const size=stmt(db,'SELECT count(*) AS n FROM cloud_records WHERE cloud_profile_id=?',profileId).n;
    let imported=0,unchanged=0;
    for(const item of parsed){
      const old=stmt(db,'SELECT checksum,deleted_at FROM cloud_records WHERE cloud_profile_id=? AND kind=? AND record_id=?',profileId,item.kind,item.id);
      if(old){if(old.deleted_at!==null||old.checksum!==item.checksum)bad(409,`Конфликт существующей облачной записи: ${item.kind} / ${item.id}`);unchanged++;continue;}
      if(item.kind==='product'){
        const current=JSON.parse(item.payload);
        const others=db.prepare(`SELECT payload FROM cloud_records WHERE cloud_profile_id=? AND kind='product' AND deleted_at IS NULL`).all(profileId);
        const newProducts=parsed.filter(r=>r.kind==='product'&&r.id!==item.id).map(r=>JSON.parse(r.payload));
        const collides=p=>p.id!==current.id&&p.category===current.category&&p.name.toLocaleLowerCase('ru-RU')===current.name.toLocaleLowerCase('ru-RU')&&p.variant.toLocaleLowerCase('ru-RU')===current.variant.toLocaleLowerCase('ru-RU');
        if([...others.map(r=>JSON.parse(r.payload)),...newProducts].some(collides))bad(409,'Товар с таким названием, категорией и вариантом уже существует');
      }
      if(size+imported>=10_000)bad(409,'Достигнут лимит облачного RP-профиля');
      db.prepare('INSERT INTO cloud_records(cloud_profile_id,kind,record_id,payload,checksum,created_at,imported_by) VALUES(?,?,?,?,?,?,?)').run(profileId,item.kind,item.id,item.payload,item.checksum,now,accountId);
      logCloudImport(db,{profileId,kind:item.kind,id:item.id,payload:item.payload,checksum:item.checksum,accountId,now});
      projectCloudRecord(db,{profileId,kind:item.kind,id:item.id,payload:item.payload});imported++;
    }
    if(imported)db.prepare('INSERT INTO team_activity(id,team_id,actor_id,action,subject_id,occurred_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),teamId,accountId,'cloud.records_imported',profileId,now);
    return {imported,unchanged,total:parsed.length};
  });
  return send(200,result);
}
