import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createIdentityServer} from '../cloud-identity/server.mjs';
import {sharedSourceSnapshot} from '../src/lib/shared-knowledge-source.mjs';
import {createMemo} from '../src/lib/law-core.mjs';
import {createDocumentTemplate} from '../src/lib/document-core.mjs';
import {createCloudIdentityService,cloudHostPattern} from '../src/lib/cloud-identity-client.mjs';
const pass='Valid-Cloud-Password-236!';
const localId='profile-knowledge-236',rp={id:localId,name:'Knowledge RP',project:'majestic',server:'One'};
const api=async(origin,path,token,method='GET',body)=>{const r=await fetch(origin+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
async function fixture(fn){const folder=await mkdtemp(join(tmpdir(),'mt-knowledge-236-')),dbPath=join(folder,'db.sqlite');let app=createIdentityServer({dbPath,port:0});await app.listen();
 const origin=()=>`http://127.0.0.1:${app.server.address().port}`;
 const register=async(name)=>{const r=await api(origin(),'/v1/auth/register',null,'POST',{username:name,password:pass,deviceName:name});assert.equal(r.status,201,JSON.stringify(r.data));return r.data;};
 const joinTeam=async(user,teamId,role)=>{const invite=await api(origin(),`/v1/teams/${teamId}/invitations`,user.ownerToken,'POST',{role,targetUsername:user.username});assert.equal(invite.status,201,JSON.stringify(invite.data));assert.equal((await api(origin(),'/v1/teams/invitations/accept',user.accessToken,'POST',{token:invite.data.token})).status,200);};
 try{await fn({origin,register,db:()=>app.db,async restart(){await app.close();app=createIdentityServer({dbPath,port:0});await app.listen();},joinTeam});}
 finally{await app.close().catch(()=>{});await rm(folder,{recursive:true,force:true});}
}
const note={kind:'note',title:'Сводка подразделения',category:'Инструкции',body:'Документ v1'};
test('2.3.6 multi-account moderation, immutable publication, authorization and conflicts',()=>fixture(async({origin,register,restart,db})=>{
 const owner=await register('knowowner'),admin=await register('knowadmin'),editor=await register('knoweditor'),viewer=await register('knowviewer'),outsider=await register('knowoutsider');
 const t=await api(origin(),'/v1/teams',owner.accessToken,'POST',{name:'Knowledge Team'});assert.equal(t.status,201);const team=t.data.team.id;
 const p=await api(origin(),`/v1/teams/${team}/cloud/profiles`,owner.accessToken,'POST',rp);assert.equal(p.status,201);const profile=p.data.profile.id;
 for(const [user,role] of [[admin,'admin'],[editor,'editor'],[viewer,'viewer']]){
   const invite=await api(origin(),`/v1/teams/${team}/invitations`,owner.accessToken,'POST',{role,targetUsername:user.account.username});assert.equal(invite.status,201);
   assert.equal((await api(origin(),'/v1/teams/invitations/accept',user.accessToken,'POST',{token:invite.data.token})).status,200);
 }
 const root=`/v1/teams/${team}/cloud/profiles/${profile}/knowledge`;
 assert.equal((await api(origin(),root,outsider.accessToken)).status,404);
 assert.equal((await api(origin(),root,viewer.accessToken,'POST',note)).status,403);
 assert.equal((await api(origin(),root,null)).status,401);
 const created=await api(origin(),root,editor.accessToken,'POST',note);assert.equal(created.status,201,JSON.stringify(created.data));const id=created.data.item.id,resource=root+'/'+id;
 assert.equal(created.data.item.status,'draft');assert.equal(created.data.item.revision,1);
 assert.equal((await api(origin(),root,viewer.accessToken)).data.items.length,0,'draft is private');
 assert.equal((await api(origin(),resource,viewer.accessToken)).status,404);
 assert.equal((await api(origin(),resource,outsider.accessToken)).status,404);
 assert.equal((await api(origin(),resource,viewer.accessToken,'PATCH',{...note,baseRevision:1})).status,403);
 assert.equal((await api(origin(),resource+'/publish',owner.accessToken,'POST',{baseRevision:1})).status,409);
 assert.equal((await api(origin(),resource+'/submit',editor.accessToken,'POST',{baseRevision:1})).status,200);
 assert.equal((await api(origin(),resource+'/review',editor.accessToken,'POST',{baseRevision:1,decision:'approve'})).status,403);
 assert.equal((await api(origin(),resource+'/review',admin.accessToken,'POST',{baseRevision:1,decision:'approve',note:'Checked'})).status,200);
 assert.equal((await api(origin(),resource+'/publish',editor.accessToken,'POST',{baseRevision:1})).status,403);
 const published=await api(origin(),resource+'/publish',admin.accessToken,'POST',{baseRevision:1});assert.equal(published.status,200,JSON.stringify(published.data));
 assert.equal((await api(origin(),resource,viewer.accessToken)).data.item.body,'Документ v1');
 assert.equal((await api(origin(),root+'?scope=published',viewer.accessToken)).data.items.length,1);
 const edit=await api(origin(),resource,editor.accessToken,'PATCH',{baseRevision:1,...note,title:'Новая версия названия',body:'Документ v2'});
 assert.equal(edit.status,200);assert.equal(edit.data.item.revision,2);assert.equal(edit.data.item.published.body,'Документ v1');
 assert.equal((await api(origin(),resource,viewer.accessToken)).data.item.body,'Документ v1','draft cannot leak to viewer');
 assert.equal((await api(origin(),root+'?q=%D0%9D%D0%BE%D0%B2%D0%B0%D1%8F',viewer.accessToken)).data.items.length,0,'draft title must not leak to viewer');
 assert.equal((await api(origin(),root+'?q=%D0%A1%D0%B2%D0%BE%D0%B4%D0%BA%D0%B0',viewer.accessToken)).data.items.length,1);
 assert.equal((await api(origin(),resource,editor.accessToken,'PATCH',{baseRevision:1,...note,body:'OVERWRITE'})).status,409);
 assert.equal((await api(origin(),resource+'/submit',editor.accessToken,'POST',{baseRevision:2})).status,200);
 assert.equal((await api(origin(),resource+'/review',admin.accessToken,'POST',{baseRevision:2,decision:'reject',note:'Revise'})).status,200);
 const changes=await api(origin(),resource,editor.accessToken,'PATCH',{baseRevision:2,...note,body:'Документ v3'});assert.equal(changes.status,200);assert.equal(changes.data.item.revision,3);
 assert.equal((await api(origin(),resource+'/submit',editor.accessToken,'POST',{baseRevision:3})).status,200);
 assert.equal((await api(origin(),resource+'/review',owner.accessToken,'POST',{baseRevision:3,decision:'approve'})).status,200);
 assert.equal((await api(origin(),resource+'/publish',owner.accessToken,'POST',{baseRevision:3})).status,200);
 assert.equal((await api(origin(),resource,viewer.accessToken)).data.item.body,'Документ v3');
 const history=await api(origin(),resource+'/revisions',editor.accessToken);assert.deepEqual(history.data.revisions.map(x=>x.revision),[3,2,1]);
 assert.equal(history.data.revisions[2].body,'Документ v1');assert.equal((await api(origin(),resource+'/events',editor.accessToken)).data.events.some(x=>x.action==='rejected'),true);
 assert.equal((await api(origin(),resource+'/revisions',viewer.accessToken)).status,403);
 const restored=await api(origin(),resource+'/restore',editor.accessToken,'POST',{baseRevision:3,targetRevision:1});assert.equal(restored.status,200);assert.equal(restored.data.item.revision,4);assert.equal(restored.data.item.body,'Документ v1');
 assert.equal((await api(origin(),resource,viewer.accessToken)).data.item.body,'Документ v3');
 await restart();assert.equal((await api(origin(),resource,viewer.accessToken)).data.item.body,'Документ v3','published survives restart');
 assert.equal((await api(origin(),resource+'/archive',editor.accessToken,'POST',{baseRevision:4})).status,403);
 assert.equal((await api(origin(),resource+'/archive',owner.accessToken,'POST',{baseRevision:4,note:'obsolete'})).status,200);
 assert.equal((await api(origin(),resource,viewer.accessToken)).status,404);
 assert.equal(db().prepare('SELECT count(*) n FROM shared_knowledge_revisions').get().n,4);
}));

test('2.3.6 author cannot approve or publish own material; unknown session and revoked membership',()=>fixture(async({origin,register})=>{
 const owner=await register('selfowner');const team=(await api(origin(),'/v1/teams',owner.accessToken,'POST',{name:'Self Team'})).data.team.id;
 const profile=(await api(origin(),`/v1/teams/${team}/cloud/profiles`,owner.accessToken,'POST',rp)).data.profile.id;
 const root=`/v1/teams/${team}/cloud/profiles/${profile}/knowledge`;
 const item=(await api(origin(),root,owner.accessToken,'POST',note)).data.item;
 assert.equal((await api(origin(),root+'/'+item.id+'/submit',owner.accessToken,'POST',{baseRevision:1})).status,200);
 assert.equal((await api(origin(),root+'/'+item.id+'/review',owner.accessToken,'POST',{baseRevision:1,decision:'approve'})).status,403);
 assert.equal((await api(origin(),root+'/'+item.id+'/review',owner.accessToken,'POST',{baseRevision:1,decision:'reject'})).status,403);
 assert.equal((await api(origin(),root,owner.accessToken,'POST',{...note,kind:'unknown'})).status,400);
 assert.equal((await api(origin(),root,owner.accessToken,'POST',{...note,body:'\u0000'})).status,400);
 assert.equal((await api(origin(),root+'?q=%25',owner.accessToken)).data.items.length,0,'escaped LIKE wildcard');
 assert.equal((await api(origin(),root+'?after=x',owner.accessToken)).status,400);
 assert.equal((await api(origin(),'/v1/auth/logout',owner.accessToken,'POST',{})).status,200);
 assert.equal((await api(origin(),root,owner.accessToken)).status,401);
}));

test('2.3.6 background client imports trusted local law/template sources only from bound profile',()=>fixture(async({origin,register})=>{
 const owner=await register('sourceowner'),team=(await api(origin(),'/v1/teams',owner.accessToken,'POST',{name:'Local Source Team'})).data.team.id;
 const profile=(await api(origin(),`/v1/teams/${team}/cloud/profiles`,owner.accessToken,'POST',rp)).data.profile.id;
 const law=createMemo(localId,{title:'Правила доступа',body:'Закон о доступе',category:'Право'});
 const doc=createDocumentTemplate(localId,{title:'Акт передачи',body:'Передал: {{name}}',category:'Бланки',fields:[{key:'name',type:'text',label:'Имя',required:true}]});
 const data=new Map([['rpNexusStateV1',{profiles:[rp]}],['majesticLawV5:'+law.id,law],['majesticDocumentV7:'+doc.id,doc]]);
 const storage={get:async key=>({[key]:structuredClone(data.get(key))}),set:async rows=>{for(const [k,v] of Object.entries(rows))data.set(k,structuredClone(v));},remove:async key=>data.delete(key)};
 const client=createCloudIdentityService({storage,permissions:{contains:async({origins})=>origins[0]===cloudHostPattern(origin())}});
 await client.handle('configure',{origin:origin()});await client.handle('login',{username:'sourceowner',password:pass,deviceName:'Chrome extension'});
 await client.handle('cloudBind',{teamId:team,localProfileId:localId,cloudProfileId:profile});
 for(const [kind,source] of [['law',law],['document-template',doc]]){
   const result=await client.handle('knowledgeImport',{teamId:team,cloudProfileId:profile,localProfileId:localId,sourceKind:kind,sourceId:source.id});
   assert.equal(result.item.kind,kind);assert.equal(result.item.status,'draft');
   assert.equal((await client.handle('knowledgeGet',{teamId:team,cloudProfileId:profile,itemId:result.item.id})).item.sourceId,source.id);
   await assert.rejects(client.handle('knowledgeImport',{teamId:team,cloudProfileId:profile,localProfileId:localId,sourceKind:kind,sourceId:source.id}),/Источник уже импортирован/);
 }
 assert.equal(sharedSourceSnapshot('law',law,localId).body,'Закон о доступе');
 assert.throws(()=>sharedSourceSnapshot('law',law,'another-profile'));
}));

test('2.3.6 collections: real membership, CAS, role isolation and persistence',()=>fixture(async({origin,register,restart})=>{
 const owner=await register('collectionowner'),editor=await register('collectioneditor'),viewer=await register('collectionviewer'),stranger=await register('collectionstranger');
 const team=(await api(origin(),'/v1/teams',owner.accessToken,'POST',{name:'Collection Team'})).data.team.id;
 const profile=(await api(origin(),`/v1/teams/${team}/cloud/profiles`,owner.accessToken,'POST',rp)).data.profile.id;
 const otherProfile=(await api(origin(),`/v1/teams/${team}/cloud/profiles`,owner.accessToken,'POST',{...rp,name:'Another RP'})).data.profile.id;
 for(const [u,role] of [[editor,'editor'],[viewer,'viewer']]){
   const inv=await api(origin(),`/v1/teams/${team}/invitations`,owner.accessToken,'POST',{role,targetUsername:u.account.username});
   assert.equal((await api(origin(),'/v1/teams/invitations/accept',u.accessToken,'POST',{token:inv.data.token})).status,200);
 }
 const root=`/v1/teams/${team}/cloud/profiles/${profile}/knowledge`,collections=root+'/collections';
 const item=(await api(origin(),root,editor.accessToken,'POST',note)).data.item;
 const secret=(await api(origin(),`/v1/teams/${team}/cloud/profiles/${otherProfile}/knowledge`,owner.accessToken,'POST',note)).data.item;
 assert.equal((await api(origin(),collections,viewer.accessToken,'POST',{title:'Escalate'})).status,403);
 assert.equal((await api(origin(),collections,stranger.accessToken)).status,404);
 let created=await api(origin(),collections,editor.accessToken,'POST',{title:'Инструкции',notes:'Общие материалы'});
 assert.equal(created.status,201,JSON.stringify(created.data));let col=created.data.collection;
 const collection=collections+'/'+col.id;
 assert.equal((await api(origin(),collections,editor.accessToken,'POST',{title:'инструкции'})).status,409);
 assert.equal((await api(origin(),collection+'/items',viewer.accessToken,'POST',{itemId:item.id,baseVersion:1})).status,403);
 assert.equal((await api(origin(),collection+'/items',editor.accessToken,'POST',{itemId:secret.id,baseVersion:1})).status,404,'cross profile material refused');
 const add=await api(origin(),collection+'/items',editor.accessToken,'POST',{itemId:item.id,baseVersion:1});assert.equal(add.status,200,JSON.stringify(add.data));assert.equal(add.data.collection.version,2);
 assert.equal((await api(origin(),collection+'/items',editor.accessToken,'POST',{itemId:item.id,baseVersion:1})).status,409,'stale CAS');
 assert.equal((await api(origin(),collection,viewer.accessToken)).data.items.length,0,'draft is invisible in collection');
 const ownRead=await api(origin(),collection,editor.accessToken);assert.equal(ownRead.data.items[0].id,item.id);
 assert.equal((await api(origin(),collection,editor.accessToken,'PATCH',{title:'Переименовано',notes:'Действует',baseVersion:2})).status,200);
 assert.equal((await api(origin(),collection,editor.accessToken,'PATCH',{title:'Stale',baseVersion:2})).status,409);
 assert.equal((await api(origin(),collection,editor.accessToken,'DELETE',{baseVersion:3})).status,403,'only admin may delete');
 await restart();assert.equal((await api(origin(),collection,editor.accessToken)).data.items.length,1);
 const removed=await api(origin(),collection+'/items/'+item.id,editor.accessToken,'DELETE',{baseVersion:3});assert.equal(removed.status,200);assert.equal(removed.data.collection.version,4);
 assert.equal((await api(origin(),collection,editor.accessToken)).data.items.length,0);
 assert.equal((await api(origin(),collection,owner.accessToken,'DELETE',{baseVersion:4})).status,200);
 assert.equal((await api(origin(),collection,editor.accessToken)).status,404);
 assert.equal((await api(origin(),root+'/'+item.id,editor.accessToken)).status,200,'deleting collection preserves material');
}));
