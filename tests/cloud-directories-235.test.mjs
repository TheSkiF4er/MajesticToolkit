import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createIdentityServer} from '../cloud-identity/server.mjs';
import {createCloudIdentityService,cloudHostPattern} from '../src/lib/cloud-identity-client.mjs';
import {CLOUD_SYNC_KEY} from '../src/lib/cloud-sync-client.mjs';
import {MARKET_PREFIX,newMarketRecord} from '../src/lib/marketplace-core.mjs';
import {newFamily,applyFamily} from '../src/lib/family-core.mjs';
import {newOrganization,applyOrganization} from '../src/lib/organization-core.mjs';

const pass='Strong-Test-Password-235!',localId='profile-directory-235',localSource={id:localId,name:'Directory RP',project:'majestic',server:'One'};
const api=async(origin,path,token=null,method='GET',body=null)=>{
 const res=await fetch(origin+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 return {status:res.status,data:await res.json()};
};
async function usingServer(fn){
 const folder=await mkdtemp(join(tmpdir(),'mt-directory-235-'));
 const dbPath=join(folder,'cloud.sqlite');let server=createIdentityServer({dbPath,port:0});
 const origin=()=>`http://127.0.0.1:${server.server.address().port}`;
 try{
   await server.listen();await fn({origin:origin(),db:()=>server.db,async restart(){await server.close();server=createIdentityServer({dbPath,port:0});await server.listen();return origin();}});
 } finally {await server.close().catch(()=>{});await rm(folder,{recursive:true,force:true});}
}
const register=async(origin,username)=>{const r=await api(origin,'/v1/auth/register',null,'POST',{username,password:pass,deviceName:'Chrome'});assert.equal(r.status,201,JSON.stringify(r.data));return r.data;};
const teamAndProfile=async(origin,user)=>{
 const t=await api(origin,'/v1/teams',user.accessToken,'POST',{name:'Directory Team'});assert.equal(t.status,201);
 const teamId=t.data.team.id,path=`/v1/teams/${teamId}/cloud/profiles`;
 const c=await api(origin,path,user.accessToken,'POST',localSource);assert.equal(c.status,201,JSON.stringify(c.data));
 return {teamId,profileId:c.data.profile.id,root:`${path}/${c.data.profile.id}`};
};
const directory=(root,kind,q='',after='')=>`${root}/directory?${new URLSearchParams({kind,q,after,limit:'30'})}`;
const family=()=>{let f=newFamily(localId,{name:'Северная семья'});return applyFamily(f,'join',{player:'Player Alpha',rankId:f.ranks[1].id,date:'2026-11-01'});};
const organization=()=>{
 let o=newOrganization(localId,{name:'Больница',type:'government'});
 o=applyOrganization(o,'member-join',{player:'Doctor Beta',positionId:o.positions[1].id,date:'2026-11-01'});
 o=applyOrganization(o,'asset-add',{name:'Медицинская машина',assetType:'vehicle',assetTag:'CAR-235',value:12000,note:'На балансе'});
 return o;
};
const product=()=>newMarketRecord('product',localId,{name:'Комплект медикаментов',category:'Предметы',variant:'',unit:'шт.',note:'Общий каталог'});

test('2.3.5 directories are real searchable indexed projections; roles, isolation and persistence',async()=>usingServer(async({origin,db,restart})=>{
 const owner=await register(origin,'directoryowner'),viewer=await register(origin,'directoryviewer'),outsider=await register(origin,'directoryoutsider');
 const {teamId,root}=await teamAndProfile(origin,owner);
 const invitation=await api(origin,`/v1/teams/${teamId}/invitations`,owner.accessToken,'POST',{role:'viewer',targetUsername:'directoryviewer'});
 assert.equal(invitation.status,201);
 assert.equal((await api(origin,'/v1/teams/invitations/accept',viewer.accessToken,'POST',{token:invitation.data.token})).status,200);
 const records=[{kind:'family',record:family()},{kind:'organization',record:organization()},{kind:'product',record:product()}];
 const imported=await api(origin,root+'/records',owner.accessToken,'POST',{records});
 assert.equal(imported.status,200,JSON.stringify(imported.data));assert.equal(imported.data.imported,3);
 const expected={family:1,organization:1,participant:2,asset:1,product:1};
 for(const [kind,n] of Object.entries(expected)){
   const page=await api(origin,directory(root,kind),viewer.accessToken);
   assert.equal(page.status,200,JSON.stringify(page.data));assert.equal(page.data.entries.length,n,kind);
   assert.equal(page.data.entries[0].kind,kind);
 }
 assert.equal((await api(origin,directory(root,'participant','Doctor'),viewer.accessToken)).data.entries.length,1);
 assert.equal((await api(origin,directory(root,'asset','CAR'),viewer.accessToken)).data.entries.length,0,'name filter does not search metadata');
 assert.equal((await api(origin,directory(root,'asset','машина'),viewer.accessToken)).data.entries.length,1);
 assert.equal((await api(origin,directory(root,'product','%'),viewer.accessToken)).data.entries.length,0,'LIKE wildcard is escaped');
 assert.equal((await api(origin,directory(root,'product','медикаментов'),viewer.accessToken)).data.entries.length,1);
 assert.equal((await api(origin,directory(root,'product'),outsider.accessToken)).status,404);
 assert.equal((await api(origin,directory(root,'product'),null)).status,401);
 assert.equal((await api(origin,directory(root,'secret'),viewer.accessToken)).status,400);
 assert.equal((await api(origin,root+'/records',viewer.accessToken,'POST',{records})).status,403);
 assert.equal((await api(origin,root+'/records',owner.accessToken,'POST',{records})).data.unchanged,3);
 const next=await restart();
 assert.equal((await api(next,directory(root,'participant'),viewer.accessToken)).data.entries.length,2);
 assert.equal((await api(next,directory(root,'asset'),viewer.accessToken)).data.entries.length,1);
 assert.equal(db().prepare('SELECT count(*) AS n FROM cloud_directory').get().n,6,'rebuild is idempotent');
}));

test('2.3.5 product sync CAS, replay and directory projections reflect updates and tombstones',async()=>usingServer(async({origin,restart})=>{
 const owner=await register(origin,'directorycas');const {root}=await teamAndProfile(origin,owner);
 const p=product(),path=root+'/sync',operationId=crypto.randomUUID();
 const initial={kind:'product',id:p.id,record:{...p,profileId:localId},baseVersion:0,operationId};
 const first=await api(origin,path,owner.accessToken,'POST',initial);assert.equal(first.status,200,JSON.stringify(first.data));
 assert.equal((await api(origin,path,owner.accessToken,'POST',initial)).data.replayed,true);
 assert.equal((await api(origin,path,owner.accessToken,'POST',{...initial,record:{...p,name:'Подмена'}})).status,409);
 const a=await api(origin,path+'/record/product/'+p.id,owner.accessToken);assert.equal(a.status,200);assert.equal(a.data.entry.version,1);
 const changed={...p,name:'Комплект 2',updatedAt:new Date(Date.now()+1000).toISOString()};
 const update=await api(origin,path,owner.accessToken,'POST',{operationId:crypto.randomUUID(),kind:'product',id:p.id,baseVersion:1,record:changed});assert.equal(update.status,200,JSON.stringify(update.data));
 assert.equal((await api(origin,directory(root,'product','Комплект 2'),owner.accessToken)).data.entries.length,1);
 assert.equal((await api(origin,path,owner.accessToken,'POST',{operationId:crypto.randomUUID(),kind:'product',id:p.id,baseVersion:1,record:changed})).status,409);
 const next=await restart();assert.equal((await api(next,directory(root,'product','Комплект 2'),owner.accessToken)).data.entries.length,1);
 const remove=await api(next,path,owner.accessToken,'POST',{operationId:crypto.randomUUID(),kind:'product',id:p.id,baseVersion:2,deleted:true});assert.equal(remove.status,200,JSON.stringify(remove.data));
 assert.equal((await api(next,directory(root,'product'),owner.accessToken)).data.entries.length,0);
 assert.equal((await api(next,path+'/record/product/'+p.id,owner.accessToken)).data.entry.deleted,true);
 assert.equal((await api(next,path+'/snapshot',owner.accessToken)).data.entries[0].deleted,true);
 assert.equal((await api(next,path,owner.accessToken,'POST',{operationId:crypto.randomUUID(),kind:'price',id:p.id,baseVersion:0,record:p})).status,400);
}));

const memory=initial=>{const data=new Map(Object.entries(initial));return {data,storage:{get:async k=>k===null?Object.fromEntries(data):{[k]:data.get(k)},set:async obj=>{for(const [k,v] of Object.entries(obj))data.set(k,structuredClone(v));},remove:async k=>{if(Array.isArray(k))k.forEach(x=>data.delete(x));else data.delete(k);}}};};
const client=(origin,storage)=>createCloudIdentityService({storage,permissions:{contains:async({origins})=>origins[0]===cloudHostPattern(origin)}});

test('2.3.5 two devices replicate actual Marketplace products and keep other market rows private',async()=>usingServer(async({origin})=>{
 const owner=await register(origin,'directorymulti'),{teamId,profileId,root}=await teamAndProfile(origin,owner);
 const p=product(),price={...newMarketRecord('price',localId,{productId:p.id,date:'2026-11-19',kind:'ask',price:500,quantity:1,source:'Ручное наблюдение',url:'',note:''})};
 const a=memory({'rpNexusStateV1':{profiles:[localSource]},[MARKET_PREFIX+p.id]:p,[MARKET_PREFIX+price.id]:price});
 const b=memory({'rpNexusStateV1':{profiles:[{...localSource,id:'profile-directory-device-b'}]}});
 const appA=client(origin,a.storage),appB=client(origin,b.storage);
 // Use explicit existing credentials for each device with the same account.
 const login=async app=>{const status=await app.handle('configure',{origin});assert(status.configured);const result=await app.handle('login',{username:'directorymulti',password:pass,deviceName:'Another browser'});assert(result.authenticated);};
 await login(appA);await login(appB);
 for(const [app,localProfileId] of [[appA,localId],[appB,'profile-directory-device-b']]){
   await app.handle('cloudBind',{teamId,localProfileId,cloudProfileId:profileId});
   const result=await app.handle('syncEnable',{teamId,localProfileId});assert.equal(result.error,null,JSON.stringify(result));
 }
 const downloaded=b.data.get(MARKET_PREFIX+p.id);
 assert.equal(downloaded.name,p.name);assert.equal(downloaded.profileId,'profile-directory-device-b');
 assert.equal(b.data.get(MARKET_PREFIX+price.id),undefined,'only products sync, not price observations');
 assert.equal((await api(origin,directory(root,'product'),owner.accessToken)).data.entries.length,1);
 assert.equal(a.data.get(MARKET_PREFIX+price.id).price,500,'price history stays local');
 assert.equal(Object.keys(a.data.get(CLOUD_SYNC_KEY)).length,1);
}));

test('2.3.5 upgrades a 2.3.4 SQLite cloud_records CHECK without losing existing records',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mt235-legacy-'));
 const dbPath=join(dir,'identity.sqlite');let app=createIdentityServer({dbPath,port:0});
 try{
   await app.listen();const origin=`http://127.0.0.1:${app.server.address().port}`;
   const owner=await register(origin,'directorylegacy');const {root}=await teamAndProfile(origin,owner);
   const f=family();assert.equal((await api(origin,root+'/records',owner.accessToken,'POST',{records:[{kind:'family',record:f}]})).status,200);
   await app.close();app=null;
   const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(dbPath);
   try{
     db.exec(`BEGIN IMMEDIATE;
       CREATE TABLE old_cloud_records(
         cloud_profile_id TEXT NOT NULL REFERENCES cloud_profiles(id) ON DELETE CASCADE,
         kind TEXT NOT NULL CHECK(kind IN ('family','organization')),
         record_id TEXT NOT NULL,payload TEXT NOT NULL,checksum TEXT NOT NULL,
         version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,
         imported_by TEXT NOT NULL REFERENCES accounts(id),deleted_at INTEGER,
         PRIMARY KEY(cloud_profile_id,kind,record_id)
       );
       INSERT INTO old_cloud_records SELECT * FROM cloud_records;
       DROP TABLE cloud_records;
       ALTER TABLE old_cloud_records RENAME TO cloud_records;
       DELETE FROM cloud_directory_meta;
       DELETE FROM cloud_directory;
       COMMIT;`);
   } finally {db.close();}
   app=createIdentityServer({dbPath,port:0});await app.listen();const upgraded=`http://127.0.0.1:${app.server.address().port}`;
   assert.equal((await api(upgraded,root+'/records',owner.accessToken)).data.records.length,1);
   assert.equal((await api(upgraded,directory(root,'family'),owner.accessToken)).data.entries.length,1);
   const p=product();const imported=await api(upgraded,root+'/records',owner.accessToken,'POST',{records:[{kind:'product',record:p}]});
   assert.equal(imported.status,200,JSON.stringify(imported.data));
   assert.equal((await api(upgraded,directory(root,'product'),owner.accessToken)).data.entries.length,1);
 } finally {if(app)await app.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

test('2.3.5 pagination, source links and directory projections update with new members',async()=>usingServer(async({origin})=>{
 const owner=await register(origin,'directorypaging'),{root}=await teamAndProfile(origin,owner);
 let f=newFamily(localId,{name:'Большая семья'});
 for(let i=0;i<35;i++)f=applyFamily(f,'join',{player:'Person '+String(i).padStart(3,'0'),rankId:f.ranks[1].id,date:'2026-11-01'});
 const r=await api(origin,root+'/records',owner.accessToken,'POST',{records:[{kind:'family',record:f}]});assert.equal(r.status,200,JSON.stringify(r.data));
 const a=await api(origin,directory(root,'participant'),owner.accessToken);assert.equal(a.data.entries.length,30);assert(a.data.nextCursor);
 const b=await api(origin,directory(root,'participant','',a.data.nextCursor),owner.accessToken);assert.equal(b.data.entries.length,5);
 assert.equal(new Set([...a.data.entries,...b.data.entries].map(x=>x.id)).size,35);
 assert(a.data.entries.every(x=>x.sourceKind==='family'&&x.sourceId===f.id));
 const withName=await api(origin,directory(root,'participant','Person 012'),owner.accessToken);assert.equal(withName.data.entries.length,1);
 const amended=applyFamily(f,'join',{player:'Person 035',rankId:f.ranks[1].id,date:'2026-11-01'});
 assert.equal((await api(origin,root+'/sync',owner.accessToken,'POST',{operationId:crypto.randomUUID(),kind:'family',id:f.id,baseVersion:1,record:amended})).status,200);
 const search=await api(origin,directory(root,'participant','Person 035'),owner.accessToken);assert.equal(search.data.entries.length,1);
 assert.equal((await api(origin,root+'/sync',owner.accessToken,'POST',{operationId:crypto.randomUUID(),kind:'family',id:f.id,baseVersion:2,deleted:true})).status,200);
 assert.equal((await api(origin,directory(root,'participant'),owner.accessToken)).data.entries.length,0);
}));
