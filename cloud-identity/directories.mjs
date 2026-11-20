/** 2.3.5: indexed, transactional projections of authoritative team records.
 * Member and asset rows are derived from validated family/organization event histories;
 * they are never independently editable copies of the source journals.
 */
import {createHash} from 'node:crypto';
import {cleanFamily} from '../src/lib/family-core.mjs';
import {cleanOrganization} from '../src/lib/organization-core.mjs';
import {cleanMarketRecord} from '../src/lib/marketplace-core.mjs';

const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const KINDS=['family','organization','participant','asset','product'];
const ROLES=['viewer','editor','admin','owner'];
const key=(...parts)=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const normalizeName=name=>name.toLocaleLowerCase('ru-RU');
const entriesFor=(kind,record)=>{
  if(kind==='family'){
    const family=cleanFamily(record);
    return [
      {kind:'family',id:family.id,name:family.name,sourceKind:'family',sourceId:family.id,record:{id:family.id,name:family.name,tag:family.tag,archived:family.archived,memberCount:family.members.length}},
      ...family.members.map(m=>({kind:'participant',id:key('family',family.id,m.id),name:m.player,sourceKind:'family',sourceId:family.id,record:{...m,sourceKind:'family',sourceId:family.id,sourceName:family.name}}))
    ];
  }
  if(kind==='organization'){
    const org=cleanOrganization(record);
    return [
      {kind:'organization',id:org.id,name:org.name,sourceKind:'organization',sourceId:org.id,record:{id:org.id,name:org.name,tag:org.tag,type:org.type,archived:org.archived,memberCount:org.members.length,assetCount:org.assets.length}},
      ...org.members.map(m=>({kind:'participant',id:key('organization',org.id,m.id),name:m.player,sourceKind:'organization',sourceId:org.id,record:{...m,sourceKind:'organization',sourceId:org.id,sourceName:org.name}})),
      ...org.assets.map(a=>({kind:'asset',id:key('organization',org.id,a.id),name:a.name,sourceKind:'organization',sourceId:org.id,record:{...a,sourceKind:'organization',sourceId:org.id,sourceName:org.name}}))
    ];
  }
  if(kind==='product'){
    const product=cleanMarketRecord(record);
    if(product.type!=='product')throw Error('Только товары входят в общий справочник');
    return [{kind:'product',id:product.id,name:product.name,sourceKind:'product',sourceId:product.id,record:product}];
  }
  throw Error('Неизвестный тип справочника');
};
export function installCloudDirectories(db){
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_directory(
      cloud_profile_id TEXT NOT NULL REFERENCES cloud_profiles(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('family','organization','participant','asset','product')),
      entry_id TEXT NOT NULL,source_kind TEXT NOT NULL,source_id TEXT NOT NULL,
      display_name TEXT NOT NULL,search_name TEXT NOT NULL,payload TEXT NOT NULL,
      PRIMARY KEY(cloud_profile_id,kind,entry_id)
    );
    CREATE INDEX IF NOT EXISTS cloud_directory_lookup ON cloud_directory(cloud_profile_id,kind,search_name,entry_id);
    CREATE INDEX IF NOT EXISTS cloud_directory_source ON cloud_directory(cloud_profile_id,source_kind,source_id);
    CREATE TABLE IF NOT EXISTS cloud_directory_meta (id INTEGER PRIMARY KEY CHECK(id=1),schema_version INTEGER NOT NULL);
  `);
  // A one-time transaction backfills old 2.3.4 data. All subsequent changes
  // update the projection in the same transaction as their source records.
  if(db.prepare('SELECT schema_version FROM cloud_directory_meta WHERE id=1').get()?.schema_version===1)return;
  db.exec('BEGIN IMMEDIATE');
  try{
    db.exec('DELETE FROM cloud_directory');
    for(const row of db.prepare(`SELECT cloud_profile_id,kind,record_id,payload FROM cloud_records
      WHERE deleted_at IS NULL`).iterate()){
      projectCloudRecord(db,{profileId:row.cloud_profile_id,kind:row.kind,id:row.record_id,payload:row.payload});
    }
    db.prepare('INSERT INTO cloud_directory_meta(id,schema_version) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET schema_version=excluded.schema_version').run();
    db.exec('COMMIT');
  }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
}
export function projectCloudRecord(db,{profileId,kind,id,payload}){
  const deleteBySource=db.prepare('DELETE FROM cloud_directory WHERE cloud_profile_id=? AND source_kind=? AND source_id=?');
  deleteBySource.run(profileId,kind,id);
  if(payload===null)return;
  const insert=db.prepare(`INSERT INTO cloud_directory
    (cloud_profile_id,kind,entry_id,source_kind,source_id,display_name,search_name,payload)
    VALUES(?,?,?,?,?,?,?,?)`);
  for(const item of entriesFor(kind,JSON.parse(payload))){
    insert.run(profileId,item.kind,item.id,item.sourceKind,item.sourceId,item.name,normalizeName(item.name),JSON.stringify(item.record));
  }
}
export async function handleCloudDirectories({db,req,res,path,identity,cors,returnJson,bad,clock=Date.now}){
  const match=/^\/v1\/teams\/([0-9a-f-]{36})\/cloud\/profiles\/([0-9a-f-]{36})\/directory$/.exec(path);
  if(!match||!UUID.test(match[1])||!UUID.test(match[2]))bad(404,'Справочник не найден');
  if(req.method!=='GET')bad(405,'Справочники редактируются в исходных модулях');
  const [ ,teamId,profileId]=match,now=clock();
  const session=db.prepare(`SELECT 1 FROM sessions s JOIN accounts a ON a.id=s.account_id
    WHERE s.id=? AND s.account_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.access_expires_at>? AND a.disabled=0`)
    .get(identity.id,identity.account_id,now,now);
  if(!session)bad(401,'Сессия завершена');
  const membership=db.prepare('SELECT role FROM team_members WHERE team_id=? AND account_id=?').get(teamId,identity.account_id);
  if(!membership)bad(404,'Команда не найдена');
  if(!ROLES.includes(membership.role))bad(403,'Недостаточно полномочий');
  if(!db.prepare('SELECT 1 FROM cloud_profiles WHERE id=? AND team_id=?').get(profileId,teamId))bad(404,'Облачный профиль не найден');
  const params=new URL(req.url,'https://identity.internal').searchParams;
  if([...params.keys()].some(k=>!['kind','q','after','limit'].includes(k)))bad(400,'Неизвестный параметр справочника');
  const kind=params.get('kind')||'family',q=params.get('q')??'',after=params.get('after')??'',limit=params.get('limit')??'30';
  if(!KINDS.includes(kind)||typeof q!=='string'||q.length>80||/[\x00-\x1f\x7f]/.test(q)||after.length>128||!/^([1-9]|[1-4][0-9]|50)$/.test(limit))bad(400,'Некорректные параметры справочника');
  // Exact keyset paging, with the WHERE clause applied before LIMIT.
  const search=normalizeName(q.trim());
  const pattern='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
  const rows=db.prepare(`SELECT entry_id,source_kind,source_id,display_name,payload
    FROM cloud_directory WHERE cloud_profile_id=? AND kind=? AND entry_id>?
    AND search_name LIKE ? ESCAPE '\\'
    ORDER BY entry_id LIMIT ?`).all(profileId,kind,after,pattern,Number(limit)+1);
  const selected=rows.slice(0,Number(limit));
  return returnJson(res,200,{kind,entries:selected.map(r=>({id:r.entry_id,kind,name:r.display_name,sourceKind:r.source_kind,sourceId:r.source_id,record:JSON.parse(r.payload)})),nextCursor:rows.length>Number(limit)?selected.at(-1).entry_id:null},cors);
}
