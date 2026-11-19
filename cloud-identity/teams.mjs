/** MajesticToolkit 2.3.2 — transactional, server-authorized teams and invitations.
 * All permission decisions use persisted memberships, never client-provided roles.
 */
import {randomBytes,randomUUID,createHash} from 'node:crypto';

const ROLES=['viewer','editor','admin','owner'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INVITATION=/^[A-Za-z0-9_-]{43}$/;
const DAY=24*60*60_000;
const nameOK=value=>typeof value==='string'&&value.trim().length>=2&&value.trim().length<=80&& !/[\x00-\x1f\x7f<>]/.test(value);
const roleOK=value=>ROLES.includes(value);
const hash=value=>createHash('sha256').update(value).digest();
const iso=value=>value==null?null:new Date(value).toISOString();
const teamView=row=>({id:row.id,name:row.name,role:row.role,createdAt:iso(row.created_at),memberCount:row.member_count});
const memberView=row=>({id:row.account_id,username:row.username,role:row.role,joinedAt:iso(row.joined_at)});
const inviteView=(row,now)=>({id:row.id,role:row.role,createdBy:row.creator_name,targetUsername:row.target_username??null,createdAt:iso(row.created_at),expiresAt:iso(row.expires_at),status:row.claimed_at?'accepted':row.revoked_at?'revoked':row.expires_at<=now?'expired':'active'});
const stmt=(db,sql,...args)=>db.prepare(sql).get(...args);
function atomic(db,fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}}
export function installTeams(db){db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES accounts(id), created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS team_members (
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('viewer','editor','admin','owner')),
    joined_at INTEGER NOT NULL, PRIMARY KEY(team_id, account_id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS team_one_owner ON team_members(team_id) WHERE role='owner';
  CREATE INDEX IF NOT EXISTS team_members_by_account ON team_members(account_id,team_id);
  CREATE TABLE IF NOT EXISTS team_invitations (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    token_hash BLOB NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
    created_by TEXT NOT NULL REFERENCES accounts(id), target_account_id TEXT REFERENCES accounts(id),
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    claimed_by TEXT REFERENCES accounts(id), claimed_at INTEGER, revoked_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS team_invites_by_team ON team_invitations(team_id,created_at);
  CREATE TABLE IF NOT EXISTS team_activity (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL REFERENCES accounts(id), action TEXT NOT NULL, subject_id TEXT,
    occurred_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS team_activity_recent ON team_activity(team_id,occurred_at DESC);
`);}

export async function handleTeams({db,req,res,path,identity,now,cors,readJson,returnJson,bad}){
  const method=req.method,accountId=identity.account_id;
  const send=(status,payload)=>returnJson(res,status,payload,cors);
  // Re-check live sessions after async body reads. A previously authorized request
  // must not keep write privileges after logout, account disable or role revocation.
  const liveSession=()=>{
    const live=stmt(db,`SELECT s.id FROM sessions s JOIN accounts a ON a.id=s.account_id
      WHERE s.id=? AND s.account_id=? AND s.revoked_at IS NULL
      AND s.access_expires_at>? AND s.expires_at>? AND a.disabled=0`,identity.id,accountId,now,now);
    if(!live)bad(401,'Сессия завершена');
  };
  const checkId=id=>{if(!UUID.test(id))bad(404,'Команда не найдена');};
  const membership=(teamId,min='viewer')=>{
    checkId(teamId);
    const row=stmt(db,'SELECT m.role,t.name FROM team_members m JOIN teams t ON t.id=m.team_id WHERE m.team_id=? AND m.account_id=?',teamId,accountId);
    // Do not disclose that a team exists to a nonmember.
    if(!row)bad(404,'Команда не найдена или нет доступа');
    if(ROLES.indexOf(row.role)<ROLES.indexOf(min))bad(403,'Недостаточно прав в команде');
    return row;
  };
  const roleForTarget=(teamId,targetId)=>stmt(db,'SELECT role FROM team_members WHERE team_id=? AND account_id=?',teamId,targetId)?.role;
  const event=(teamId,action,subject=null)=>db.prepare('INSERT INTO team_activity(id,team_id,actor_id,action,subject_id,occurred_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),teamId,accountId,action,subject,now);
  const canManage=(actorRole,targetRole)=>actorRole==='owner'||(actorRole==='admin'&&['editor','viewer'].includes(targetRole));
  if(path==='/v1/teams'){
    if(method==='GET'){
      const rows=db.prepare(`SELECT t.*,m.role,(SELECT count(*) FROM team_members WHERE team_id=t.id) AS member_count
        FROM teams t JOIN team_members m ON m.team_id=t.id WHERE m.account_id=? ORDER BY t.created_at DESC LIMIT 100`).all(accountId);
      return send(200,{teams:rows.map(teamView)});
    }
    if(method==='POST'){
      const body=await readJson(req);if(!nameOK(body.name))bad(400,'Название команды: 2–80 символов без управляющих символов и HTML');
      const name=body.name.trim();const id=randomUUID();
      atomic(db,()=>{
        liveSession();
        const number=stmt(db,'SELECT count(*) AS n FROM teams WHERE created_by=?',accountId).n;
        if(number>=20)bad(409,'Достигнут лимит созданных команд (20)');
        db.prepare('INSERT INTO teams(id,name,created_by,created_at) VALUES(?,?,?,?)').run(id,name,accountId,now);
        db.prepare("INSERT INTO team_members(team_id,account_id,role,joined_at) VALUES(?,?,'owner',?)").run(id,accountId,now);
        event(id,'team.created',id);
      });
      return send(201,{team:{id,name,role:'owner',createdAt:iso(now),memberCount:1}});
    }
    bad(405,'Метод не поддерживается');
  }
  if(path==='/v1/teams/invitations/accept'){
    if(method!=='POST')bad(405,'Метод не поддерживается');
    const body=await readJson(req);
    if(!INVITATION.test(body.token))bad(400,'Некорректный код приглашения');
    const team=atomic(db,()=>{
      liveSession();
      const invitation=stmt(db,'SELECT * FROM team_invitations WHERE token_hash=?',hash(body.token));
      if(!invitation||invitation.revoked_at||invitation.claimed_at||invitation.expires_at<=now)bad(410,'Приглашение не найдено, отозвано, использовано или истекло');
      if(invitation.target_account_id&&invitation.target_account_id!==accountId)bad(403,'Приглашение адресовано другому аккаунту');
      if(roleForTarget(invitation.team_id,accountId))bad(409,'Вы уже участник этой команды');
      const count=stmt(db,'SELECT count(*) AS n FROM team_members WHERE team_id=?',invitation.team_id).n;
      if(count>=250)bad(409,'Лимит команды: 250 участников');
      db.prepare('INSERT INTO team_members(team_id,account_id,role,joined_at) VALUES(?,?,?,?)').run(invitation.team_id,accountId,invitation.role,now);
      const used=db.prepare('UPDATE team_invitations SET claimed_at=?,claimed_by=? WHERE id=? AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at>?').run(now,accountId,invitation.id,now);
      if(used.changes!==1)bad(410,'Приглашение уже использовано');
      event(invitation.team_id,'invitation.accepted',invitation.id);
      const name=stmt(db,'SELECT name,created_at FROM teams WHERE id=?',invitation.team_id);
      return {id:invitation.team_id,name:name.name,createdAt:iso(name.created_at),role:invitation.role,memberCount:count+1};
    });
    return send(200,{team});
  }
  const m=/^\/v1\/teams\/([0-9a-f-]{36})(?:\/(members|invitations|activity|leave|transfer)(?:\/([0-9a-f-]{36}))?)?$/.exec(path);
  if(!m)bad(404,'Маршрут команды не найден');
  const [,teamId,resource,resourceId]=m;const actor=membership(teamId);
  if(!resource){
    if(method==='GET'){
      const row=stmt(db,'SELECT name,created_at FROM teams WHERE id=?',teamId);
      const count=stmt(db,'SELECT count(*) AS n FROM team_members WHERE team_id=?',teamId).n;
      return send(200,{team:{id:teamId,name:row.name,role:actor.role,createdAt:iso(row.created_at),memberCount:count}});
    }
    if(method==='DELETE'){
      if(actor.role!=='owner')bad(403,'Только владелец может удалить команду');
      atomic(db,()=>db.prepare('DELETE FROM teams WHERE id=?').run(teamId));
      return send(200,{ok:true});
    }
    bad(405,'Метод не поддерживается');
  }
  if(resource==='members'){
    if(!resourceId){
      if(method!=='GET')bad(405,'Метод не поддерживается');
      const rows=db.prepare(`SELECT m.account_id,m.role,m.joined_at,a.username FROM team_members m
        JOIN accounts a ON a.id=m.account_id WHERE m.team_id=? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END,a.username LIMIT 250`).all(teamId);
      return send(200,{members:rows.map(memberView)});
    }
    checkId(resourceId);
    if(method==='PATCH'){
      const body=await readJson(req);
      if(!roleOK(body.role)||body.role==='owner')bad(400,'Допустимые роли: admin, editor, viewer');
      atomic(db,()=>{
        liveSession();
        const active=membership(teamId);
        const target=roleForTarget(teamId,resourceId);
        if(!target)bad(404,'Участник не найден');
        if(target==='owner'||!canManage(active.role,target)||body.role==='admin'&&active.role!=='owner')bad(403,'Недостаточно прав для назначения роли');
        if(resourceId===accountId&&target==='admin')bad(403,'Используйте выход из команды вместо изменения своей административной роли');
        db.prepare('UPDATE team_members SET role=? WHERE team_id=? AND account_id=?').run(body.role,teamId,resourceId);
        event(teamId,'member.role_changed',resourceId);
      });
      return send(200,{ok:true,role:body.role});
    }
    if(method==='DELETE'){
      atomic(db,()=>{
        liveSession();
        const active=membership(teamId);
        const target=roleForTarget(teamId,resourceId);
        if(!target)bad(404,'Участник не найден');
        if(resourceId===accountId){if(target==='owner')bad(403,'Перед выходом передайте владение командой');}
        else if(!canManage(active.role,target))bad(403,'Недостаточно прав для удаления участника');
        db.prepare('DELETE FROM team_members WHERE team_id=? AND account_id=?').run(teamId,resourceId);
        event(teamId,'member.removed',resourceId);
      });
      return send(200,{ok:true});
    }
    bad(405,'Метод не поддерживается');
  }
  if(resource==='leave'){
    if(resourceId||method!=='POST')bad(405,'Метод не поддерживается');
    if(actor.role==='owner')bad(403,'Перед выходом передайте владение командой');
    atomic(db,()=>{liveSession();membership(teamId);db.prepare('DELETE FROM team_members WHERE team_id=? AND account_id=?').run(teamId,accountId);event(teamId,'member.left',accountId);});
    return send(200,{ok:true});
  }
  if(resource==='transfer'){
    if(resourceId||method!=='POST')bad(405,'Метод не поддерживается');
    if(actor.role!=='owner')bad(403,'Только владелец может передать команду');
    const body=await readJson(req);if(!UUID.test(body.accountId)||body.accountId===accountId)bad(400,'Выберите другого участника команды');
    atomic(db,()=>{
      liveSession();membership(teamId,'owner');
      if(!roleForTarget(teamId,body.accountId))bad(404,'Участник не найден');
      db.prepare("UPDATE team_members SET role='admin' WHERE team_id=? AND account_id=? AND role='owner'").run(teamId,accountId);
      db.prepare("UPDATE team_members SET role='owner' WHERE team_id=? AND account_id=?").run(teamId,body.accountId);
      event(teamId,'owner.transferred',body.accountId);
    });
    return send(200,{ok:true,newOwner:body.accountId});
  }
  if(resource==='activity'){
    if(resourceId||method!=='GET')bad(405,'Метод не поддерживается');
    membership(teamId,'admin');
    const entries=db.prepare(`SELECT e.id,e.action,e.subject_id,e.occurred_at,a.username AS actor_username
      FROM team_activity e JOIN accounts a ON a.id=e.actor_id WHERE e.team_id=? ORDER BY e.occurred_at DESC,e.rowid DESC LIMIT 100`).all(teamId);
    return send(200,{events:entries.map(row=>({id:row.id,action:row.action,subjectId:row.subject_id,actorUsername:row.actor_username,at:iso(row.occurred_at)}))});
  }
  if(resource==='invitations'){
    membership(teamId,'admin');
    if(resourceId){
      checkId(resourceId);if(method!=='DELETE')bad(405,'Метод не поддерживается');
      atomic(db,()=>{
        liveSession();const liveRole=membership(teamId,'admin').role;
        const invitation=stmt(db,'SELECT role,claimed_at,revoked_at FROM team_invitations WHERE id=? AND team_id=?',resourceId,teamId);
        if(!invitation)bad(404,'Приглашение не найдено');
        if(invitation.role==='admin'&&liveRole!=='owner')bad(403,'Приглашения администраторов доступны только владельцу');
        if(invitation.revoked_at||invitation.claimed_at)bad(409,'Приглашение уже закрыто');
        db.prepare('UPDATE team_invitations SET revoked_at=? WHERE id=?').run(now,resourceId);
        event(teamId,'invitation.revoked',resourceId);
      });
      return send(200,{ok:true});
    }
    if(method==='GET'){
      const rows=db.prepare(`SELECT i.*,a.username AS creator_name,t.username AS target_username
        FROM team_invitations i JOIN accounts a ON a.id=i.created_by LEFT JOIN accounts t ON t.id=i.target_account_id
        WHERE i.team_id=? AND (?='owner' OR i.role!='admin') ORDER BY i.created_at DESC,i.rowid DESC LIMIT 100`).all(teamId,actor.role);
      return send(200,{invitations:rows.map(row=>inviteView(row,now))});
    }
    if(method==='POST'){
      const body=await readJson(req);
      if(!['viewer','editor','admin'].includes(body.role))bad(400,'Допустимые роли: admin, editor, viewer');
      if(body.role==='admin'&&actor.role!=='owner')bad(403,'Приглашать администраторов может только владелец');
      const recipient=body.targetUsername==null||body.targetUsername===''?null:String(body.targetUsername).trim().toLowerCase();
      if(recipient!==null&&!/^[a-z][a-z0-9_.-]{2,31}$/.test(recipient))bad(400,'Некорректный логин приглашённого');
      const token=randomBytes(32).toString('base64url'),id=randomUUID();
      const row=atomic(db,()=>{
        liveSession();const liveRole=membership(teamId,'admin').role;
        if(body.role==='admin'&&liveRole!=='owner')bad(403,'Приглашать администраторов может только владелец');
        const count=stmt(db,'SELECT count(*) AS n FROM team_invitations WHERE team_id=? AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at>?',teamId,now).n;
        if(count>=100)bad(409,'Лимит активных приглашений (100)');
        const target=recipient?stmt(db,'SELECT id,username FROM accounts WHERE username=? AND disabled=0',recipient):null;
        if(recipient&&!target)bad(404,'Аккаунт для адресного приглашения не найден');
        if(target&&roleForTarget(teamId,target.id))bad(409,'Аккаунт уже состоит в команде');
        db.prepare('INSERT INTO team_invitations(id,team_id,token_hash,role,created_by,target_account_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)')
          .run(id,teamId,hash(token),body.role,accountId,target?.id??null,now,now+7*DAY);
        event(teamId,'invitation.created',id);
        return {id,role:body.role,targetUsername:target?.username??null,createdAt:iso(now),expiresAt:iso(now+7*DAY),status:'active'};
      });
      return send(201,{invitation:row,token}); // secret exposed exactly once, never persisted in plaintext
    }
    bad(405,'Метод не поддерживается');
  }
  bad(404,'Маршрут команды не найден');
}
