#!/usr/bin/env node
/** Production offline recovery utilities. No network access; backups include every SQLite table and binary blob.
 * backup uses SQLite's online backup API (WAL-consistent), never raw file copy.
 */
import {DatabaseSync,backup as sqliteBackup} from 'node:sqlite';
import {readFile,writeFile,mkdir,rename,rm,stat,copyFile,chmod,open,access} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const FILE_PATTERN=/^[a-zA-Z0-9_.-]+\.sqlite$/;
const CORE=['accounts','sessions','teams','team_members','cloud_profiles','cloud_records','cloud_files','cloud_file_blobs','cloud_audit','cloud_notifications'];
async function digestFile(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
async function integrity(path){
 const db=new DatabaseSync(path,{readOnly:true});
 try{
  const result=db.prepare('PRAGMA integrity_check').all();
  if(result.length!==1||result[0].integrity_check!=='ok')throw Error('SQLite integrity_check failed');
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('SQLite foreign_key_check failed');
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
  if(CORE.some(x=>!tables.has(x)))throw Error('Backup lacks 2.3.9 schema');
  return {tables:tables.size,accounts:db.prepare('SELECT count(*) AS n FROM accounts').get().n,teams:db.prepare('SELECT count(*) AS n FROM teams').get().n,files:db.prepare('SELECT count(*) AS n FROM cloud_files').get().n};
 }finally{db.close();}
}
function locations(snapshot){
 const location=resolve(snapshot);
 if(!FILE_PATTERN.test(basename(location)))throw Error('Backup must be a .sqlite file with a simple name');
 return {location,manifest:location+'.sha256.json'};
}
export async function createBackup(source,destination){
 const dbPath=resolve(source),{location,manifest}=locations(destination);
 if(dbPath===location||dirname(location)===dirname(dbPath)&&basename(location)===basename(dbPath))throw Error('Source and backup must differ');
 await mkdir(dirname(location),{recursive:true,mode:0o700});
 // No accidental overwrite: an operator must pick a new timestamped snapshot name.
 const temp=location+'.'+randomUUID()+'.tmp';
 const src=new DatabaseSync(dbPath,{readOnly:true});
 try{
  await sqliteBackup(src,temp);
  await chmod(temp,0o600);
  const checks=await integrity(temp),size=(await stat(temp)).size;
  const meta={format:'majestic-cloud-sqlite-v1',createdAt:new Date().toISOString(),filename:basename(location),sha256:await digestFile(temp),bytes:size,checks};
  // Both files are exclusive. A leftover incomplete pair is rejected by verify.
  const flag='wx';let fd,claimed=false;
  try{fd=await open(location,flag,0o600);claimed=true;await fd.close();fd=null;await rename(temp,location);
   await writeFile(manifest,JSON.stringify(meta,null,2)+'\n',{flag,mode:0o600});
  }catch(error){if(fd)await fd.close();if(claimed)await rm(location,{force:true});throw error;}
  return meta;
 }finally{src.close();await rm(temp,{force:true});}
}
export async function verifyBackup(snapshot){
 const {location,manifest}=locations(snapshot),meta=JSON.parse(await readFile(manifest,'utf8'));
 if(meta.format!=='majestic-cloud-sqlite-v1'||meta.filename!==basename(location)||!Number.isSafeInteger(meta.bytes)||!/^[a-f0-9]{64}$/.test(meta.sha256))throw Error('Invalid backup manifest');
 const size=(await stat(location)).size;
 if(size!==meta.bytes||await digestFile(location)!==meta.sha256)throw Error('Backup SHA-256 mismatch');
 const check=await integrity(location);
 if(JSON.stringify(check)!==JSON.stringify(meta.checks))throw Error('Backup contents differ from manifest');
 return {sha256:meta.sha256,bytes:size,checks:check};
}
export async function restoreBackup(snapshot,destination,{confirmed=false}={}){
 if(!confirmed)throw Error('Restore requires explicit --yes and a stopped server');
 const source=resolve(snapshot),target=resolve(destination);
 if(source===target)throw Error('Backup and target must differ');
 const checks=await verifyBackup(source);
 await mkdir(dirname(target),{recursive:true,mode:0o700});
 // Acquire the same exclusive lock the production server uses, closing the
 // check/swap TOCTOU window. Never remove somebody else's running-server lock.
 const lockPath=target+'.run.lock';let lock;
 try{lock=await open(lockPath,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw Error('Cloud server lock exists; stop the server before restore');throw e;}
 try{
  await lock.writeFile(JSON.stringify({pid:process.pid,mode:'restore'}));
  await lock.close();lock=null;
  // A running SQLite WAL database must NEVER be replaced beneath connections.
  for(const suffix of ['-wal','-shm']){
   try{await stat(target+suffix);throw Error('Target has '+suffix+': stop server and checkpoint before recovery');}
   catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const temp=target+'.restore-'+randomUUID();
  try{
   await copyFile(source,temp);await chmod(temp,0o600);await integrity(temp);
   try{
    await stat(target);
    const previous=target+'.pre-restore-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite';
    // Preserve previous DB for operator rollback; swap is atomic on one filesystem.
    await copyFile(target,previous);await chmod(previous,0o600);
   }catch(e){if(e.code!=='ENOENT')throw e;}
   await rename(temp,target);
   return {restored:true,checks};
  }finally{await rm(temp,{force:true});}
 }finally{if(lock)await lock.close();await rm(lockPath,{force:true});}
}

async function main(){
 const [command,a,b,confirmation]=process.argv.slice(2);
 if(command==='backup'&&a&&b)console.log(JSON.stringify(await createBackup(a,b)));
 else if(command==='verify'&&a&&!b)console.log(JSON.stringify(await verifyBackup(a)));
 else if(command==='restore'&&a&&b&&confirmation==='--yes')console.log(JSON.stringify(await restoreBackup(a,b,{confirmed:true})));
 else throw Error('Usage: backup <database.sqlite> <snapshot.sqlite> | verify <snapshot.sqlite> | restore <snapshot.sqlite> <database.sqlite> --yes');
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname)main().catch(err=>{console.error(err.message);process.exitCode=1;});
