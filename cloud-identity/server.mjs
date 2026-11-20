/** MajesticToolkit 2.3.7: stateful cloud identity, teams, storage and shared knowledge.
 * Production: direct TLS (CLOUD_TLS_CERT_FILE/CLOUD_TLS_KEY_FILE); no reverse-proxy trust.
 */
import {createServer as createHttpServer} from 'node:http';
import {createServer as createHttpsServer} from 'node:https';
import {readFileSync, mkdirSync, chmodSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {installTeams,handleTeams} from './teams.mjs';
import {installCloudStorage,handleCloudStorage} from './storage.mjs';
import {installCloudSync,handleCloudSync} from './sync.mjs';
import {installCloudDirectories,handleCloudDirectories} from './directories.mjs';
import {installSharedKnowledge,handleSharedKnowledge} from './knowledge.mjs';
import {installKnowledgeCollections,handleKnowledgeCollections} from './knowledge-collections.mjs';
import {installTactical,handleTactical} from './tactical.mjs';
const scrypt=promisify(scryptCallback);
const TOKEN_BYTES=32, ACCESS_MS=15*60_000, REFRESH_MS=30*24*60*60_000;
const encoder = value => createHash('sha256').update(value).digest();
const randomToken=()=>randomBytes(TOKEN_BYTES).toString('base64url');
const accountView=row=>({id:row.id,username:row.username,createdAt:new Date(row.created_at).toISOString()});
const sessionView=(row,current)=>({id:row.id,deviceName:row.device_name,createdAt:new Date(row.created_at).toISOString(),lastSeenAt:new Date(row.last_seen_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),current:row.id===current});
const validUser=value=>typeof value==='string' && /^[a-z][a-z0-9_.-]{2,31}$/.test(value);
const validPassword=value=>typeof value==='string'&&value.length>=12&&value.length<=128&&Buffer.byteLength(value,'utf8')<=512;
const validDevice=value=>typeof value==='string'&&value.trim().length>=1&&value.trim().length<=70&& !/[\x00-\x1f\x7f]/.test(value);
const tokenHash=value=>Buffer.isBuffer(value)?value:encoder(value);
const fixedToken=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{43}$/.test(value);
class HttpError extends Error {constructor(code,message){super(message);this.status=code;}}
const bad=(code,message)=>{throw new HttpError(code,message);};
function database(dbPath){
  mkdirSync(dirname(dbPath),{recursive:true,mode:0o700});
  const db=new DatabaseSync(dbPath);
  chmodSync(dbPath,0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS accounts(
      id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      salt BLOB NOT NULL, password_hash BLOB NOT NULL, created_at INTEGER NOT NULL, disabled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions(
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      device_name TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, refresh_hash BLOB NOT NULL UNIQUE, previous_hash BLOB UNIQUE,
      access_hash BLOB NOT NULL UNIQUE, access_expires_at INTEGER NOT NULL, revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id, revoked_at);
    CREATE TABLE IF NOT EXISTS auth_attempts(
      key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_at INTEGER NOT NULL, blocked_until INTEGER NOT NULL
    );
  `);
  // Expired sessions and obsolete failed-attempt counters are not needed indefinitely.
  const cutoff=Date.now()-31*24*60*60_000;
  db.prepare('DELETE FROM auth_attempts WHERE window_at<? AND blocked_until<?').run(cutoff,Date.now());
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(cutoff);
  installTeams(db);
  installCloudStorage(db);
  installCloudSync(db);
  installCloudDirectories(db);
  installSharedKnowledge(db);
  installKnowledgeCollections(db);
  installTactical(db);
  return db;
}
async function credentialHash(password,salt){return Buffer.from(await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}));}
function issueTokens(db,accountId,deviceName,now){
  const accessToken=randomToken(),refreshToken=randomToken(),sessionId=randomUUID();
  db.prepare(`INSERT INTO sessions(id,account_id,device_name,created_at,last_seen_at,expires_at,refresh_hash,access_hash,access_expires_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(sessionId,accountId,deviceName,now,now,now+REFRESH_MS,tokenHash(refreshToken),tokenHash(accessToken),now+ACCESS_MS);
  return {accessToken,refreshToken,accessExpiresAt:new Date(now+ACCESS_MS).toISOString(),refreshExpiresAt:new Date(now+REFRESH_MS).toISOString(),sessionId};
}
function loadAccount(db,id){return db.prepare('SELECT id,username,created_at,disabled FROM accounts WHERE id=?').get(id);}
function getAuthorized(db,header,now){
  const m=/^Bearer ([a-zA-Z0-9_-]{43})$/.exec(header??'');
  if(!m)bad(401,'Необходим действующий токен доступа');
  const row=db.prepare(`SELECT s.*,a.username,a.created_at AS account_created_at FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.access_hash=? AND s.revoked_at IS NULL AND s.access_expires_at>? AND s.expires_at>? AND a.disabled=0`).get(tokenHash(m[1]),now,now);
  if(!row)bad(401,'Сессия недействительна или завершена');
  return row;
}
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function returnJson(res,status,payload,extra={}){res.writeHead(status,{...JSON_HEADERS,...extra});res.end(JSON.stringify(payload));}
function readJson(req,maxBytes=8192){return new Promise((resolve,reject)=>{
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')){reject(new HttpError(415,'Требуется application/json'));return;}
  let total=0,parts=[];req.on('data',chunk=>{total+=chunk.length;if(total>maxBytes){reject(new HttpError(413,'Слишком большой запрос'));parts=[];return;}parts.push(chunk);});
  req.on('end',()=>{try{const obj=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error();resolve(obj);}catch{reject(new HttpError(400,'Некорректный JSON'));}});
  req.on('error',reject);
});}
function assertNotLocked(db,key,now){const row=db.prepare('SELECT blocked_until FROM auth_attempts WHERE key=?').get(encoder(key).toString('hex'));if(row?.blocked_until>now)bad(429,'Слишком много попыток. Попробуйте позже');}
function throttle(db,key,now,{limit=8,windowMs=15*60_000,blockMs=15*60_000}={}){
  // Persisted lockout works across process restarts. Do not disclose account existence.
  const hash=encoder(key).toString('hex');const row=db.prepare('SELECT * FROM auth_attempts WHERE key=?').get(hash);
  if(row?.blocked_until>now)bad(429,'Слишком много попыток. Попробуйте позже');
  if(!row||now-row.window_at>windowMs){db.prepare('INSERT INTO auth_attempts(key,attempts,window_at,blocked_until) VALUES(?,?,?,0) ON CONFLICT(key) DO UPDATE SET attempts=1,window_at=excluded.window_at,blocked_until=0').run(hash,1,now);return;}
  const attempts=row.attempts+1,blocked=attempts>limit?now+blockMs:0;
  db.prepare('UPDATE auth_attempts SET attempts=?,blocked_until=? WHERE key=?').run(attempts,blocked,hash);
  if(blocked)bad(429,'Слишком много попыток. Попробуйте позже');
}
export function createIdentityServer({dbPath=resolve('cloud-identity/data/identity.sqlite'),host='127.0.0.1',port=8787,certFile=null,keyFile=null,allowedOrigins=[],clock=Date.now}={}){
  const loopback=['127.0.0.1','::1','localhost'].includes(host);
  if(!loopback && (!certFile||!keyFile))throw Error('Public cloud identity server requires direct TLS certificate and private key');
  if(Boolean(certFile)!==Boolean(keyFile))throw Error('TLS certificate and key are required together');
  const allow=new Set(allowedOrigins);
  if(!Array.isArray(allowedOrigins)||[...allow].some(x=>!/^((chrome|moz|safari-web)-extension):\/\/[^/]+$/.test(x)&&!/^https:\/\/[^/]+$/.test(x)))throw Error('Invalid allowed origin');
  const db=database(resolve(dbPath));
  const defaultCors=(origin)=>origin&&(allow.has(origin)||(loopback&&/^((chrome|moz|safari-web)-extension):\/\/[^/]+$/.test(origin)))?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{};
  const handler=async(req,res)=>{
    const origin=req.headers.origin,now=clock(),cors=defaultCors(origin);
    try{
      if(origin&&!Object.keys(cors).length)bad(403,'Источник запроса не разрешён');
      if(req.method==='OPTIONS'){
        if(!origin)bad(400,'Отсутствует Origin');
        res.writeHead(204,{...cors,'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'600','Cache-Control':'no-store'});res.end();return;
      }
      const path=new URL(req.url,'https://identity.internal').pathname;
      if(path==='/v1/health'&&req.method==='GET'){returnJson(res,200,{ok:true,service:'MajesticToolkit Cloud Identity'},cors);return;}
      if(path==='/v1/auth/register'||path==='/v1/auth/login'){
        if(req.method!=='POST')bad(405,'Метод не поддерживается');
        const input=await readJson(req);const username=String(input.username??'').trim().toLowerCase(),password=input.password,deviceName=String(input.deviceName??'').trim();
        if(!validUser(username)||!validPassword(password)||!validDevice(deviceName))bad(400,'Логин: 3–32 латинских символа; пароль: 12–128 символов; укажите устройство');
        if(path.endsWith('/register')){
          throttle(db,`register-ip:${req.socket.remoteAddress}`,now,{limit:8});
          const salt=randomBytes(16),hashed=await credentialHash(password,salt),id=randomUUID();
          try{db.prepare('INSERT INTO accounts(id,username,salt,password_hash,created_at) VALUES(?,?,?,?,?)').run(id,username,salt,hashed,now);}
          catch(error){if(String(error.message).includes('UNIQUE constraint failed: accounts.username'))bad(409,'Аккаунт с таким логином уже существует');throw error;}
          returnJson(res,201,{account:accountView(loadAccount(db,id)),...issueTokens(db,id,deviceName,now)},cors);return;
        }
        const ipKey=`login-ip:${req.socket.remoteAddress}`,userKey=`login-user:${username}`;
        assertNotLocked(db,ipKey,now);assertNotLocked(db,userKey,now);
        const account=db.prepare('SELECT * FROM accounts WHERE username=?').get(username);
        // Matching KDF cost for unknown usernames avoids a fast username oracle.
        const fakeSalt=Buffer.alloc(16,0),hash=await credentialHash(password,account?.salt??fakeSalt);
        if(!account||account.disabled||!timingSafeEqual(hash,account.password_hash)){throttle(db,ipKey,now,{limit:45});throttle(db,userKey,now);bad(401,'Неверный логин или пароль');}
        db.prepare('DELETE FROM auth_attempts WHERE key=?').run(encoder(userKey).toString('hex'));
        returnJson(res,200,{account:accountView(account),...issueTokens(db,account.id,deviceName,now)},cors);return;
      }
      if(path==='/v1/auth/refresh'){
        if(req.method!=='POST')bad(405,'Метод не поддерживается');
        const {refreshToken}=await readJson(req);
        if(!fixedToken(refreshToken))bad(401,'Недействительная сессия');
        const hashed=tokenHash(refreshToken);
        db.exec('BEGIN IMMEDIATE');let result;
        try{
          const old=db.prepare(`SELECT s.*,a.disabled,a.username,a.created_at AS account_created_at FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE (s.refresh_hash=? OR s.previous_hash=?)`).get(hashed,hashed);
          if(!old||old.revoked_at||old.disabled||old.expires_at<=now)bad(401,'Недействительная сессия');
          if(timingSafeEqual(old.previous_hash??Buffer.alloc(32),hashed)){
            db.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').run(now,old.id);
            db.exec('COMMIT');bad(401,'Повторное использование старого токена: сессия отозвана');
          }
          const newAccess=randomToken(),newRefresh=randomToken();
          const updated=db.prepare(`UPDATE sessions SET previous_hash=refresh_hash,refresh_hash=?,access_hash=?,access_expires_at=?,last_seen_at=? WHERE id=? AND revoked_at IS NULL AND refresh_hash=?`).run(tokenHash(newRefresh),tokenHash(newAccess),now+ACCESS_MS,now,old.id,hashed);
          if(updated.changes!==1)bad(401,'Сессия уже изменена');
          result={account:{id:old.account_id,username:old.username,createdAt:new Date(old.account_created_at).toISOString()},sessionId:old.id,accessToken:newAccess,refreshToken:newRefresh,accessExpiresAt:new Date(now+ACCESS_MS).toISOString(),refreshExpiresAt:new Date(old.expires_at).toISOString()};
          db.exec('COMMIT');
        }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
        returnJson(res,200,result,cors);return;
      }
      if(!path.startsWith('/v1/auth/')&&!path.startsWith('/v1/teams'))bad(404,'Не найдено');
      const identity=getAuthorized(db,req.headers.authorization,now);
      if(/^\/v1\/teams\/[0-9a-f-]{36}\/cloud\/profiles\/[0-9a-f-]{36}\/tactical(?:\/|$)/.test(path)){
        await handleTactical({db,req,res,path,identity,now,cors,readJson,returnJson,bad,clock});return;
      }
      if(/^\/v1\/teams\/[0-9a-f-]{36}\/cloud\/profiles\/[0-9a-f-]{36}\/knowledge\/collections(?:\/|$)/.test(path)){
        await handleKnowledgeCollections({db,req,res,path,identity,now,cors,readJson,returnJson,bad,clock});return;
      }
      if(/^\/v1\/teams\/[0-9a-f-]{36}\/cloud\/profiles\/[0-9a-f-]{36}\/knowledge(?:\/|$)/.test(path)){
        await handleSharedKnowledge({db,req,res,path,identity,now,cors,readJson,returnJson,bad,clock});return;
      }
      if(/^\/v1\/teams\/[0-9a-f-]{36}\/cloud\/profiles\/[0-9a-f-]{36}\/directory$/.test(path)){
        await handleCloudDirectories({db,req,res,path,identity,now,cors,returnJson,bad,clock});return;
      }
      if(/^\/v1\/teams\/[0-9a-f-]{36}\/cloud\/profiles\/[0-9a-f-]{36}\/sync(?:\/|$)/.test(path)){
        await handleCloudSync({db,req,res,path,identity,now,cors,readJson,returnJson,bad,clock});return;
      }
      if(/^\/v1\/teams\/[0-9a-f-]{36}\/cloud\//.test(path)){
        await handleCloudStorage({db,req,res,path,identity,now,cors,readJson,returnJson,bad,clock});return;
      }
      if(path.startsWith('/v1/teams')){
        await handleTeams({db,req,res,path,identity,now,cors,readJson,returnJson,bad,clock});return;
      }
      if(path==='/v1/auth/me'&&req.method==='GET'){
        db.prepare('UPDATE sessions SET last_seen_at=? WHERE id=?').run(now,identity.id);
        returnJson(res,200,{account:{id:identity.account_id,username:identity.username,createdAt:new Date(identity.account_created_at).toISOString()},session:sessionView({...identity,last_seen_at:now},identity.id)},cors);return;
      }
      if(path==='/v1/auth/sessions'&&req.method==='GET'){
        const sessions=db.prepare('SELECT * FROM sessions WHERE account_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY last_seen_at DESC LIMIT 100').all(identity.account_id,now);
        returnJson(res,200,{sessions:sessions.map(row=>sessionView(row,identity.id))},cors);return;
      }
      if(path==='/v1/auth/logout'&&req.method==='POST'){
        db.prepare('UPDATE sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(now,identity.id);
        returnJson(res,200,{ok:true},cors);return;
      }
      if(path==='/v1/auth/logout-all'&&req.method==='POST'){
        const result=db.prepare('UPDATE sessions SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL').run(now,identity.account_id);
        returnJson(res,200,{ok:true,revoked:result.changes},cors);return;
      }
      const devicePath=/^\/v1\/auth\/sessions\/([0-9a-f-]{36})$/.exec(path);
      if(devicePath&&req.method==='DELETE'){
        const result=db.prepare('UPDATE sessions SET revoked_at=? WHERE id=? AND account_id=? AND revoked_at IS NULL').run(now,devicePath[1],identity.account_id);
        if(!result.changes)bad(404,'Сессия не найдена');
        returnJson(res,200,{ok:true,current:devicePath[1]===identity.id},cors);return;
      }
      bad(404,'Не найдено');
    }catch(err){
      if(res.destroyed||res.writableEnded)return;
      const status=err instanceof HttpError?err.status:500;
      if(status===500)console.error('Cloud Identity internal error:',err);
      returnJson(res,status,{error:status===500?'Внутренняя ошибка сервера':err.message},cors);
    }
  };
  const server=certFile?createHttpsServer({cert:readFileSync(certFile),key:readFileSync(keyFile)},handler):createHttpServer(handler);
  server.headersTimeout=10_000;server.requestTimeout=120_000;server.keepAliveTimeout=5_000;server.maxRequestsPerSocket=100;server.maxConnections=200;
  return {server,db,async listen(){await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,host,()=>{server.off('error',fail);ok();});});return server.address();},async close(){await new Promise((ok,fail)=>server.close(err=>err?fail(err):ok()));db.close();}};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const host=process.env.CLOUD_HOST||'127.0.0.1',port=Number(process.env.CLOUD_PORT||8787);
  const certFile=process.env.CLOUD_TLS_CERT_FILE||null,keyFile=process.env.CLOUD_TLS_KEY_FILE||null;
  const allowedOrigins=(process.env.CLOUD_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const app=createIdentityServer({host,port,certFile,keyFile,dbPath:process.env.CLOUD_DB_PATH||resolve('cloud-identity/data/identity.sqlite'),allowedOrigins});
  app.listen().then(addr=>console.log(`MajesticToolkit Cloud Identity listening on ${certFile?'https':'http'}://${host}:${addr.port}`)).catch(error=>{console.error(error);process.exitCode=1;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{app.close().then(()=>process.exit(0)).catch(()=>process.exit(1));});
}
