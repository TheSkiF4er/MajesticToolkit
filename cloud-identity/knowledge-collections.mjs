/** 2.3.6: shared Knowledge Center collections with server-authorized membership. */
import {randomUUID} from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ROLES=['viewer','editor','admin','owner'];
const one=(db,sql,...args)=>db.prepare(sql).get(...args);
const valid=(s,max,required=true)=>typeof s==='string'&&s.trim().length<=max&&(!required||s.trim().length>=1)&&!/[\x00-\x1f\x7f]/.test(s);
const tx=(db,callback)=>{db.exec('BEGIN IMMEDIATE');try{const result=callback();db.exec('COMMIT');return result;}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}};
export function installKnowledgeCollections(db){db.exec(`
  CREATE TABLE IF NOT EXISTS shared_knowledge_collections(
    id TEXT PRIMARY KEY, cloud_profile_id TEXT NOT NULL REFERENCES cloud_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL, title_key TEXT NOT NULL, notes TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL REFERENCES accounts(id),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE(cloud_profile_id,title_key)
  );
  CREATE TABLE IF NOT EXISTS shared_knowledge_collection_members(
    collection_id TEXT NOT NULL REFERENCES shared_knowledge_collections(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES shared_knowledge(id) ON DELETE CASCADE,
    PRIMARY KEY(collection_id,item_id)
  );
  CREATE INDEX IF NOT EXISTS shared_knowledge_collection_items ON shared_knowledge_collection_members(item_id,collection_id);
 `);}
export async function handleKnowledgeCollections({db,req,res,path,identity,cors,readJson,returnJson,bad,clock=Date.now}){
 const match=/^\/v1\/teams\/([0-9a-f-]{36})\/cloud\/profiles\/([0-9a-f-]{36})\/knowledge\/collections(?:\/([0-9a-f-]{36})(?:\/items(?:\/([0-9a-f-]{36}))?)?)?$/.exec(path);
 if(!match||!UUID.test(match[1])||!UUID.test(match[2])||(match[3]&&!UUID.test(match[3]))||(match[4]&&!UUID.test(match[4])))bad(404,'Коллекция не найдена');
 const [,teamId,profileId,collectionId,itemId]=match,accountId=identity.account_id;
 const send=(status,data)=>returnJson(res,status,data,cors);
 const check=(min='viewer')=>{
   const now=clock();
   if(!one(db,`SELECT 1 FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=? AND s.account_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.access_expires_at>? AND a.disabled=0`,identity.id,accountId,now,now))bad(401,'Сессия завершена');
   const role=one(db,'SELECT role FROM team_members WHERE team_id=? AND account_id=?',teamId,accountId)?.role;
   if(!role)bad(404,'Команда недоступна');if(ROLES.indexOf(role)<ROLES.indexOf(min))bad(403,'Недостаточно прав');
   if(!one(db,'SELECT 1 FROM cloud_profiles WHERE id=? AND team_id=?',profileId,teamId))bad(404,'Облачный профиль не найден');return role;
 };
 const get=()=>{const row=one(db,'SELECT * FROM shared_knowledge_collections WHERE id=? AND cloud_profile_id=?',collectionId,profileId);if(!row)bad(404,'Коллекция не найдена');return row;};
 const view=row=>({id:row.id,title:row.title,notes:row.notes,version:row.version,updatedAt:new Date(row.updated_at).toISOString()});
 const note=body=>{if(!valid(body.title,120)||!valid(body.notes??'',800,false))bad(400,'Некорректное название или описание');return {title:body.title.trim(),title_key:body.title.trim().toLocaleLowerCase('ru-RU'),notes:(body.notes??'').trim()};};
 const version=body=>{if(!Number.isSafeInteger(body.baseVersion)||body.baseVersion<1)bad(400,'Некорректная версия коллекции');return body.baseVersion;};
 const own=check();
 if(!collectionId){
   if(req.method==='GET'){
     return send(200,{collections:db.prepare(`SELECT c.* FROM shared_knowledge_collections c WHERE c.cloud_profile_id=? ORDER BY c.title_key,c.id LIMIT 100`).all(profileId).map(view)});
   }
   if(req.method!=='POST')bad(405,'Метод не поддерживается');check('editor');const data=note(await readJson(req));
   const result=tx(db,()=>{
     check('editor');if(one(db,'SELECT count(*) n FROM shared_knowledge_collections WHERE cloud_profile_id=?',profileId).n>=100)bad(409,'Достигнут лимит коллекций');
     if(one(db,'SELECT 1 FROM shared_knowledge_collections WHERE cloud_profile_id=? AND title_key=?',profileId,data.title_key))bad(409,'Коллекция с таким именем уже существует');
     const id=randomUUID(),t=clock();db.prepare('INSERT INTO shared_knowledge_collections(id,cloud_profile_id,title,title_key,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,profileId,data.title,data.title_key,data.notes,accountId,t,t);
     return one(db,'SELECT * FROM shared_knowledge_collections WHERE id=?',id);
   });return send(201,{collection:view(result)});
 }
 const current=get();
 if(req.method==='GET'&&!itemId){
   const rows=db.prepare(`SELECT i.id,i.title,i.category,i.status,i.revision,i.published_revision,p.title AS public_title,p.category AS public_category
     FROM shared_knowledge_collection_members m JOIN shared_knowledge i ON i.id=m.item_id
     LEFT JOIN shared_knowledge_revisions p ON p.item_id=i.id AND p.revision=i.published_revision
     WHERE m.collection_id=? AND i.cloud_profile_id=? AND (?<>'viewer' OR i.published_revision IS NOT NULL)
     ORDER BY i.id LIMIT 101`).all(collectionId,profileId,own);
   return send(200,{collection:view(current),items:rows.slice(0,100).map(x=>({id:x.id,title:own==='viewer'?x.public_title:x.title,category:own==='viewer'?x.public_category:x.category,revision:own==='viewer'?x.published_revision:x.revision,publishedRevision:x.published_revision})),truncated:rows.length>100});
 }
 if(itemId){
   if(req.method!=='DELETE')bad(405,'Метод не поддерживается');check('editor');const body=await readJson(req),baseVersion=version(body);
   const result=tx(db,()=>{check('editor');const row=get();if(row.version!==baseVersion)bad(409,'Коллекция изменена на другом устройстве');
     const removed=db.prepare('DELETE FROM shared_knowledge_collection_members WHERE collection_id=? AND item_id=?').run(collectionId,itemId).changes;
     if(!removed)bad(404,'Материал не находится в коллекции');
     db.prepare('UPDATE shared_knowledge_collections SET version=version+1,updated_at=? WHERE id=?').run(clock(),collectionId);
     return view(get());});return send(200,{collection:result});
 }
 if(req.method==='PATCH'){
   check('editor');const body=await readJson(req),baseVersion=version(body),data=note(body);
   const result=tx(db,()=>{check('editor');const row=get();if(row.version!==baseVersion)bad(409,'Коллекция изменена на другом устройстве');
     if(one(db,'SELECT 1 FROM shared_knowledge_collections WHERE cloud_profile_id=? AND title_key=? AND id<>?',profileId,data.title_key,collectionId))bad(409,'Название уже используется');
     db.prepare('UPDATE shared_knowledge_collections SET title=?,title_key=?,notes=?,version=version+1,updated_at=? WHERE id=?').run(data.title,data.title_key,data.notes,clock(),collectionId);
     return view(get());});return send(200,{collection:result});
 }
 if(req.method==='DELETE'){
   check('admin');const body=await readJson(req),baseVersion=version(body);
   tx(db,()=>{check('admin');if(get().version!==baseVersion)bad(409,'Коллекция изменена на другом устройстве');
     db.prepare('DELETE FROM shared_knowledge_collections WHERE id=? AND cloud_profile_id=?').run(collectionId,profileId);
   });return send(200,{ok:true});
 }
 if(req.method==='POST'&&path.endsWith('/items')){
   check('editor');const body=await readJson(req),baseVersion=version(body);
   if(!UUID.test(body.itemId??''))bad(400,'Некорректный материал');
   const result=tx(db,()=>{check('editor');const row=get();if(row.version!==baseVersion)bad(409,'Коллекция изменена на другом устройстве');
     if(!one(db,'SELECT 1 FROM shared_knowledge WHERE id=? AND cloud_profile_id=?',body.itemId,profileId))bad(404,'Материал отсутствует в данном RP-профиле');
     if(one(db,'SELECT 1 FROM shared_knowledge_collection_members WHERE collection_id=? AND item_id=?',collectionId,body.itemId))bad(409,'Материал уже в коллекции');
     if(one(db,'SELECT count(*) n FROM shared_knowledge_collection_members WHERE collection_id=?',collectionId).n>=100)bad(409,'Лимит материалов коллекции');
     db.prepare('INSERT INTO shared_knowledge_collection_members(collection_id,item_id) VALUES(?,?)').run(collectionId,body.itemId);
     db.prepare('UPDATE shared_knowledge_collections SET version=version+1,updated_at=? WHERE id=?').run(clock(),collectionId);
     return view(get());});return send(200,{collection:result});
 }
 bad(405,'Метод не поддерживается');
}
