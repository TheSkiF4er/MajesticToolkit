/** Team & Cloud 2.3.9: durable, transaction-bound audit and recipient notifications.
 * Triggers derive the team from persisted records, never from request JSON.
 */
import {timingSafeEqual, createHash} from 'node:crypto';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const ROLES=['viewer','editor','admin','owner'];
const one=(db,sql,...args)=>db.prepare(sql).get(...args);
const iso=value=>new Date(value).toISOString();
export function installCloudOperations(db){
 db.exec(`CREATE TABLE IF NOT EXISTS cloud_audit (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  event TEXT NOT NULL, resource TEXT NOT NULL, occurred_at INTEGER NOT NULL
 );
 CREATE INDEX IF NOT EXISTS cloud_audit_team_seq ON cloud_audit(team_id,seq DESC);
 CREATE TABLE IF NOT EXISTS cloud_notifications (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  event TEXT NOT NULL, resource TEXT NOT NULL, occurred_at INTEGER NOT NULL,
  read_at INTEGER, UNIQUE(team_id,recipient_id,event,resource,occurred_at)
 );
 CREATE INDEX IF NOT EXISTS cloud_notifications_user ON cloud_notifications(team_id,recipient_id,seq DESC);
 CREATE INDEX IF NOT EXISTS cloud_notifications_unread ON cloud_notifications(team_id,recipient_id,read_at,seq DESC);
 CREATE TRIGGER IF NOT EXISTS audit_team_activity AFTER INSERT ON team_activity BEGIN
  INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
  VALUES(NEW.team_id,NEW.actor_id,NEW.action,COALESCE(NEW.subject_id,''),NEW.occurred_at);
  INSERT OR IGNORE INTO cloud_notifications(team_id,recipient_id,actor_id,event,resource,occurred_at)
  SELECT NEW.team_id,m.account_id,NEW.actor_id,NEW.action,COALESCE(NEW.subject_id,''),NEW.occurred_at
  FROM team_members m WHERE m.team_id=NEW.team_id AND m.account_id<>NEW.actor_id;
 END;
 CREATE TRIGGER IF NOT EXISTS audit_cloud_changes AFTER INSERT ON cloud_changes BEGIN
  INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
  SELECT p.team_id,NEW.actor_id,'sync.'||CASE WHEN NEW.deleted=1 THEN 'delete' ELSE 'write' END,
   NEW.kind||':'||NEW.record_id,NEW.occurred_at FROM cloud_profiles p WHERE p.id=NEW.cloud_profile_id;
 END;
 CREATE TRIGGER IF NOT EXISTS audit_knowledge_events AFTER INSERT ON shared_knowledge_events BEGIN
  INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
  SELECT p.team_id,NEW.actor_id,'knowledge.'||NEW.action,NEW.item_id,NEW.occurred_at
  FROM shared_knowledge k JOIN cloud_profiles p ON p.id=k.cloud_profile_id WHERE k.id=NEW.item_id;
  INSERT OR IGNORE INTO cloud_notifications(team_id,recipient_id,actor_id,event,resource,occurred_at)
  SELECT p.team_id,m.account_id,NEW.actor_id,'knowledge.'||NEW.action,NEW.item_id,NEW.occurred_at
  FROM shared_knowledge k JOIN cloud_profiles p ON p.id=k.cloud_profile_id
   JOIN team_members m ON m.team_id=p.team_id
  WHERE k.id=NEW.item_id AND m.account_id<>NEW.actor_id
   AND ((NEW.action IN ('submitted','approved','rejected') AND m.role IN ('admin','owner'))
   OR (NEW.action IN ('published','unpublished') AND m.role IN ('viewer','editor','admin','owner')));
 END;
 CREATE TRIGGER IF NOT EXISTS audit_tactical_changes AFTER INSERT ON cloud_tactical_changes BEGIN
  INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
  SELECT p.team_id,NEW.actor_id,'tactical.'||NEW.action,NEW.kind||':'||NEW.record_id,NEW.occurred_at
  FROM cloud_profiles p WHERE p.id=NEW.cloud_profile_id;
  INSERT OR IGNORE INTO cloud_notifications(team_id,recipient_id,actor_id,event,resource,occurred_at)
  SELECT p.team_id,m.account_id,NEW.actor_id,'tactical.'||NEW.action,NEW.kind||':'||NEW.record_id,NEW.occurred_at
  FROM cloud_profiles p JOIN team_members m ON m.team_id=p.team_id
  WHERE p.id=NEW.cloud_profile_id AND m.account_id<>NEW.actor_id;
 END;
 CREATE TRIGGER IF NOT EXISTS audit_file_versions AFTER INSERT ON cloud_file_versions BEGIN
  INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
  SELECT p.team_id,NEW.actor_id,'file.revision',NEW.file_id,NEW.created_at
  FROM cloud_files f JOIN cloud_profiles p ON p.id=f.cloud_profile_id WHERE f.id=NEW.file_id AND NEW.visibility='team';
  INSERT OR IGNORE INTO cloud_notifications(team_id,recipient_id,actor_id,event,resource,occurred_at)
  SELECT p.team_id,m.account_id,NEW.actor_id,'file.shared_revision',NEW.file_id,NEW.created_at
  FROM cloud_files f JOIN cloud_profiles p ON p.id=f.cloud_profile_id
   JOIN team_members m ON m.team_id=p.team_id
  WHERE f.id=NEW.file_id AND NEW.visibility='team' AND m.account_id<>NEW.actor_id;
 END;
 CREATE TRIGGER IF NOT EXISTS audit_knowledge_collections_insert AFTER INSERT ON shared_knowledge_collections BEGIN
  INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
  SELECT p.team_id,NEW.created_by,'collection.created',NEW.id,NEW.created_at
  FROM cloud_profiles p WHERE p.id=NEW.cloud_profile_id;
 END;
 CREATE TRIGGER IF NOT EXISTS audit_knowledge_collections_update AFTER UPDATE ON shared_knowledge_collections BEGIN
  INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
  SELECT p.team_id,NULL,'collection.updated',NEW.id,NEW.updated_at
  FROM cloud_profiles p WHERE p.id=NEW.cloud_profile_id;
 END;
 CREATE TRIGGER IF NOT EXISTS audit_knowledge_collections_delete BEFORE DELETE ON shared_knowledge_collections BEGIN
  INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
  SELECT p.team_id,NULL,'collection.deleted',OLD.id,CAST(strftime('%s','now') AS INTEGER)*1000
  FROM cloud_profiles p WHERE p.id=OLD.cloud_profile_id;
 END;
 CREATE TRIGGER IF NOT EXISTS audit_file_deletion BEFORE DELETE ON cloud_files BEGIN
  INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
  SELECT p.team_id,OLD.author_id,'file.deleted',OLD.id,CAST(strftime('%s','now') AS INTEGER)*1000
  FROM cloud_profiles p WHERE p.id=OLD.cloud_profile_id AND OLD.visibility='team';
 END;
 `);
 // Migrate existing 2.3.8 audit sources once. Private files are deliberately excluded.
 db.exec('CREATE TABLE IF NOT EXISTS cloud_operations_migrations(key TEXT PRIMARY KEY)');
 if(!one(db,"SELECT 1 FROM cloud_operations_migrations WHERE key='audit_239'")){
  db.exec('BEGIN IMMEDIATE');
  try{
   db.exec(`INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
    SELECT team_id,actor_id,action,COALESCE(subject_id,''),occurred_at FROM team_activity;
    INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
    SELECT p.team_id,c.actor_id,'sync.'||CASE WHEN c.deleted=1 THEN 'delete' ELSE 'write' END,c.kind||':'||c.record_id,c.occurred_at
    FROM cloud_changes c JOIN cloud_profiles p ON p.id=c.cloud_profile_id;
    INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
    SELECT p.team_id,e.actor_id,'knowledge.'||e.action,e.item_id,e.occurred_at
    FROM shared_knowledge_events e JOIN shared_knowledge k ON k.id=e.item_id JOIN cloud_profiles p ON p.id=k.cloud_profile_id;
    INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
    SELECT p.team_id,c.actor_id,'tactical.'||c.action,c.kind||':'||c.record_id,c.occurred_at
    FROM cloud_tactical_changes c JOIN cloud_profiles p ON p.id=c.cloud_profile_id;
    INSERT INTO cloud_audit(team_id,actor_id,event,resource,occurred_at)
    SELECT p.team_id,v.actor_id,'file.revision',v.file_id,v.created_at
    FROM cloud_file_versions v JOIN cloud_files f ON f.id=v.file_id JOIN cloud_profiles p ON p.id=f.cloud_profile_id
    WHERE v.visibility='team';
    INSERT INTO cloud_operations_migrations(key) VALUES('audit_239');`);
   db.exec('COMMIT');
  }catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}
 }
}
export async function handleCloudOperations({db,req,res,path,identity,cors,returnJson,bad,clock=Date.now}){
 const match=/^\/v1\/teams\/([0-9a-f-]{36})\/(audit|notifications)(?:\/([1-9][0-9]{0,15})\/(read))?$/.exec(path);
 if(!match||!UUID.test(match[1]))bad(404,'Операционный ресурс не найден');
 const [,teamId,resource,recordId,readAction]=match,actor=identity.account_id;
 const now=clock();
 const live=one(db,`SELECT 1 FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=? AND s.account_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.access_expires_at>? AND a.disabled=0`,identity.id,actor,now,now);
 if(!live)bad(401,'Сессия завершена');
 const role=one(db,'SELECT role FROM team_members WHERE team_id=? AND account_id=?',teamId,actor)?.role;
 if(!role)bad(404,'Команда недоступна');
 if(resource==='audit'&&!['admin','owner'].includes(role))bad(403,'Только администратор может просматривать аудит');
 const send=(status,payload)=>returnJson(res,status,payload,cors);
 if(resource==='audit'&&req.method==='GET'){
  const params=new URL(req.url,'https://internal').searchParams;
  if([...params.keys()].some(k=>!['before','limit'].includes(k)))bad(400,'Неизвестный параметр');
  const before=params.get('before')||String(Number.MAX_SAFE_INTEGER),limit=params.get('limit')||'50';
  if(!/^([1-9][0-9]{0,15})$/.test(before)||!/^([1-9]|[1-9][0-9]|100)$/.test(limit))bad(400,'Некорректный запрос аудит-лога');
  const rows=db.prepare('SELECT seq,actor_id,event,resource,occurred_at FROM cloud_audit WHERE team_id=? AND seq<? ORDER BY seq DESC LIMIT ?').all(teamId,Number(before),Number(limit)+1);
  return send(200,{events:rows.slice(0,Number(limit)).map(r=>({seq:r.seq,actorId:r.actor_id,event:r.event,resource:r.resource,occurredAt:iso(r.occurred_at)})),nextCursor:rows.length>Number(limit)?rows[Number(limit)-1].seq:null});
 }
 if(resource==='notifications'&&req.method==='GET'&&!recordId){
  const params=new URL(req.url,'https://internal').searchParams;
  if([...params.keys()].some(k=>!['before','limit','unread'].includes(k)))bad(400,'Неизвестный параметр');
  const before=params.get('before')||String(Number.MAX_SAFE_INTEGER),limit=params.get('limit')||'50',unread=params.get('unread')||'0';
  if(!/^[1-9][0-9]{0,15}$/.test(before)||!/^([1-9]|[1-9][0-9]|100)$/.test(limit)||!['0','1'].includes(unread))bad(400,'Некорректные параметры уведомлений');
  const rows=db.prepare(`SELECT seq,actor_id,event,resource,occurred_at,read_at FROM cloud_notifications WHERE team_id=? AND recipient_id=? AND seq<? AND (?='0' OR read_at IS NULL) ORDER BY seq DESC LIMIT ?`).all(teamId,actor,Number(before),unread,Number(limit)+1);
  const unreadCount=one(db,'SELECT count(*) AS n FROM cloud_notifications WHERE team_id=? AND recipient_id=? AND read_at IS NULL',teamId,actor).n;
  return send(200,{notifications:rows.slice(0,Number(limit)).map(r=>({seq:r.seq,actorId:r.actor_id,event:r.event,resource:r.resource,occurredAt:iso(r.occurred_at),readAt:r.read_at===null?null:iso(r.read_at)})),unreadCount,nextCursor:rows.length>Number(limit)?rows[Number(limit)-1].seq:null});
 }
 if(resource==='notifications'&&readAction==='read'&&req.method==='POST'){
  const changed=db.prepare('UPDATE cloud_notifications SET read_at=? WHERE seq=? AND team_id=? AND recipient_id=? AND read_at IS NULL').run(clock(),Number(recordId),teamId,actor);
  if(!changed.changes&&!one(db,'SELECT 1 FROM cloud_notifications WHERE seq=? AND team_id=? AND recipient_id=?',Number(recordId),teamId,actor))bad(404,'Уведомление не найдено');
  return send(200,{ok:true});
 }
 bad(405,'Метод не поддерживается');
}
export function createOpsMetrics(){
 const started=Date.now(),counts={total:0,errors4xx:0,errors5xx:0},latencies=[];
 return {
  observe(status,duration){counts.total++;if(status>=500)counts.errors5xx++;else if(status>=400)counts.errors4xx++;latencies.push(duration);if(latencies.length>1024)latencies.shift();},
  snapshot(db){const samples=[...latencies].sort((a,b)=>a-b);const quantile=p=>samples.length?Math.round(samples[Math.min(samples.length-1,Math.ceil(samples.length*p)-1)]*100)/100:0;
   return {uptimeSeconds:Math.floor((Date.now()-started)/1000),requests:{...counts},latencyMs:{p50:quantile(.50),p95:quantile(.95),p99:quantile(.99)},memory:{rss:process.memoryUsage().rss},sqlite:{pageCount:one(db,'PRAGMA page_count').page_count,freelistPages:one(db,'PRAGMA freelist_count').freelist_count},auditEntries:one(db,'SELECT count(*) AS n FROM cloud_audit').n,unreadNotifications:one(db,'SELECT count(*) AS n FROM cloud_notifications WHERE read_at IS NULL').n};}
 };
}
export function operatorAuthorized(header,token){
 if(typeof token!=='string'||token.length<32||typeof header!=='string'||!header.startsWith('Bearer '))return false;
 const incoming=header.slice(7);const a=createHash('sha256').update(incoming).digest(),b=createHash('sha256').update(token).digest();
 return timingSafeEqual(a,b);
}
