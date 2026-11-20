import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createIdentityServer} from '../cloud-identity/server.mjs';
const content=Buffer.from('Cloud evidence 2.3.8\nA safe text attachment.\n');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const meta=(visibility='private',title='Proof')=>({name:'proof.txt',title,note:'Evidence note',visibility});
async function setup(fn){
 const dir=await mkdtemp(join(tmpdir(),'mt-files-238-'));const dbPath=join(dir,'app.sqlite');let app=createIdentityServer({dbPath,port:0});await app.listen();
 const origin=()=>`http://127.0.0.1:${app.server.address().port}`;
 const raw=async(path,token,method='GET',body=null,headers={})=>fetch(origin()+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...headers},body});
 const json=async(path,token,method='GET',body)=>{const r=await raw(path,token,method,body===undefined?null:JSON.stringify(body),body===undefined?{}:{'Content-Type':'application/json'});let data=await r.json();return {status:r.status,data};};
 const register=async name=>{const r=await json('/v1/auth/register',null,'POST',{username:name,password:'Passphrase!!123456',deviceName:name});assert.equal(r.status,201,JSON.stringify(r.data));return r.data;};
 const upload=async(path,token,{bytes=content,visibility='private',title='Proof',version,expectedHash=sha(bytes),mime='text/plain',method='POST'}={})=>{
  const headers={'Content-Type':mime,'X-MT-File-Meta':Buffer.from(JSON.stringify(meta(visibility,title))).toString('base64url'),'X-MT-Sha256':expectedHash};
  if(version!==undefined)headers['X-MT-Base-Version']=String(version);
  const r=await raw(path,token,method,bytes,headers);return {status:r.status,data:await r.json()};
 };
 try{await fn({origin,raw,json,register,upload,async restart(){await app.close();app=createIdentityServer({dbPath,port:0});await app.listen();},db:()=>app.db});}
 finally{await app.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
}
async function team(f){
 const owner=await f.register('fileowner'),editor=await f.register('fileeditor'),viewer=await f.register('fileviewer'),stranger=await f.register('fileother');
 const teamRes=await f.json('/v1/teams',owner.accessToken,'POST',{name:'Evidence Team'});assert.equal(teamRes.status,201);
 const teamId=teamRes.data.team.id;
 const p=await f.json(`/v1/teams/${teamId}/cloud/profiles`,owner.accessToken,'POST',{name:'RP Files',project:'majestic',server:'1'});assert.equal(p.status,201);
 for(const [u,role] of [[editor,'editor'],[viewer,'viewer']]){
  const invite=await f.json(`/v1/teams/${teamId}/invitations`,owner.accessToken,'POST',{role,targetUsername:u.account.username});assert.equal(invite.status,201);
  assert.equal((await f.json('/v1/teams/invitations/accept',u.accessToken,'POST',{token:invite.data.token})).status,200);
 }
 return {owner,editor,viewer,stranger,teamId,profileId:p.data.profile.id,root:`/v1/teams/${teamId}/cloud/profiles/${p.data.profile.id}/files`};
}
test('2.3.8 real binary upload and download: private visibility, explicit team sharing, SHA-256, RBAC, restart',()=>setup(async f=>{
 const t=await team(f),{root}=t,o=t.owner.accessToken,ed=t.editor.accessToken,v=t.viewer.accessToken,s=t.stranger.accessToken;
 assert.equal((await f.upload(root,v)).status,403);
 assert.equal((await f.upload(root,ed,{expectedHash:'0'.repeat(64)})).status,409);
 assert.equal((await f.upload(root,ed,{mime:'application/pdf'})).status,415);
 const created=await f.upload(root,ed);assert.equal(created.status,201,JSON.stringify(created.data));
 const id=created.data.file.id;assert.equal(created.data.file.visibility,'private');
 assert.equal((await f.json(root,v)).data.files.length,0);
 assert.equal((await f.json(root,o)).data.files.length,0,'even team owner cannot read private evidence');
 assert.equal((await f.json(root+'/'+id,v)).status,404);
 assert.equal((await f.raw(root+'/'+id+'/content',v)).status,404);
 assert.equal((await f.raw(root+'/'+id+'/content',s)).status,404);
 const privateBin=await f.raw(root+'/'+id+'/content',ed);assert.equal(privateBin.status,200);
 assert.equal(privateBin.headers.get('content-disposition').startsWith('attachment;'),true);
 assert.equal(privateBin.headers.get('x-content-type-options'),'nosniff');
 assert.equal(sha(Buffer.from(await privateBin.arrayBuffer())),sha(content));
 const shared=await f.json(root+'/'+id,ed,'PATCH',{...meta('team','Shared evidence'),baseVersion:1});assert.equal(shared.status,200);
 assert.equal(shared.data.file.version,2);
 assert.equal((await f.json(root,v)).data.files.length,1);
 assert.equal((await f.json(root+'/'+id,o)).status,200);
 assert.equal((await f.json(root+'/'+id,v,'PATCH',{...meta('private'),baseVersion:2})).status,403);
 assert.equal((await f.json(root+'/'+id,o,'PATCH',{...meta('private'),baseVersion:1})).status,409);
 const r=await f.raw(root+'/'+id+'/versions/1',v);assert.equal(r.status,200);assert.equal(sha(Buffer.from(await r.arrayBuffer())),sha(content));
 await f.restart();assert.equal((await f.json(root+'/'+id,v)).data.file.version,2);
 assert.equal((await f.json(root+'/'+id+'/versions',v)).data.versions.length,2);
 assert.equal((await f.raw(root+'/'+id+'/content',v)).status,200);
 assert.equal((await f.json('/v1/auth/logout',ed,'POST',{})).status,200);
 assert.equal((await f.raw(root+'/'+id+'/content',ed)).status,401);
}));
test('2.3.8 revision CAS, attachment links to published knowledge, shared editor and deletion GC',()=>setup(async f=>{
 const t=await team(f),{root}=t,o=t.owner.accessToken,ed=t.editor.accessToken,v=t.viewer.accessToken;
 const created=await f.upload(root,o,{visibility:'team'});assert.equal(created.status,201);
 const id=created.data.file.id,path=root+'/'+id,updated=Buffer.from('Revised proof with another set of bytes');
 const other=await f.upload(path+'/versions',ed,{method:'PUT',version:1,bytes:updated,visibility:'team',title:'Updated proof'});
 assert.equal(other.status,200,JSON.stringify(other.data));assert.equal(other.data.file.version,2);
 assert.equal((await f.upload(path+'/versions',o,{method:'PUT',version:1,bytes:content,visibility:'team'})).status,409);
 assert.equal((await f.json(path+'/versions',v)).data.versions.length,2);
 const kRoot=root.slice(0,-6)+'/knowledge';
 const note=await f.json(kRoot,o,'POST',{kind:'note',title:'Reference note',category:'General',body:'Source notes'});assert.equal(note.status,201,JSON.stringify(note.data));
 const item=note.data.item;
 assert.equal((await f.json(path+'/links',ed,'POST',{targetType:'knowledge',targetKind:'',targetId:item.id})).status,404,'draft is not shareable');
 const submitted=await f.json(kRoot+'/'+item.id+'/submit',o,'POST',{baseRevision:1});assert.equal(submitted.status,200);
 const approved=await f.json(kRoot+'/'+item.id+'/review',ed,'POST',{baseRevision:1,decision:'approve',note:'Checked'});
 assert.equal(approved.status,403,'editor cannot approve publication');
 // Promote editor to admin, approval then publish by the other reviewer.
 assert.equal((await f.json(`/v1/teams/${t.teamId}/members/${t.editor.account.id}`,o,'PATCH',{role:'admin'})).status,200);
 const reviewed=await f.json(kRoot+'/'+item.id+'/review',ed,'POST',{baseRevision:1,decision:'approve',note:'Reviewed'});assert.equal(reviewed.status,200,JSON.stringify(reviewed.data));
 const published=await f.json(kRoot+'/'+item.id+'/publish',ed,'POST',{baseRevision:1});assert.equal(published.status,200,JSON.stringify(published.data));
 const linked=await f.json(path+'/links',ed,'POST',{targetType:'knowledge',targetKind:'',targetId:item.id});assert.equal(linked.status,201,JSON.stringify(linked.data));
 assert.equal((await f.json(path+'/links',v)).data.links.length,1);
 assert.equal((await f.json(path,ed,'PATCH',{...meta('private'),baseVersion:2})).status,409,'cannot privatize a linked shared file');
 assert.equal((await f.json(path+'/links',ed,'POST',{targetType:'knowledge',targetKind:'',targetId:item.id})).status,409);
 assert.equal((await f.json(path+'/links/'+linked.data.id,ed,'DELETE',{})).status,200);
 assert.equal((await f.json(path+'/links',v)).data.links.length,0);
 assert.equal((await f.json(path,ed,'DELETE',{baseVersion:1})).status,409);
 assert.equal((await f.json(path,ed,'DELETE',{baseVersion:2})).status,200);
 assert.equal((await f.json(path,v)).status,404);
 assert.equal(f.db().prepare('SELECT count(*) n FROM cloud_file_blobs').get().n,0);
}));
test('2.3.8 rejects foreign profile, wrong upload signatures, invalid targets, privacy link attempts and team revocation',()=>setup(async f=>{
 const t=await team(f),{root}=t,o=t.owner.accessToken,ed=t.editor.accessToken,v=t.viewer.accessToken,s=t.stranger.accessToken;
 assert.equal((await f.upload(root,s)).status,404);
 const broken=Buffer.from([0,1,2,3]);assert.equal((await f.upload(root,ed,{bytes:broken})).status,415);
 const res=await f.upload(root,ed,{visibility:'private'});assert.equal(res.status,201);
 const id=res.data.file.id;
 assert.equal((await f.json(root+'/'+id+'/links',ed,'POST',{targetType:'knowledge',targetKind:'',targetId:randomUUID()})).status,409);
 assert.equal((await f.json(root+'/'+id,v,'PATCH',{...meta('team'),baseVersion:1})).status,403);
 assert.equal((await f.json(root+'/'+id,ed,'PATCH',{...meta('team'),baseVersion:1})).status,200);
 assert.equal((await f.json(root+'/'+id+'/links',ed,'POST',{targetType:'knowledge',targetKind:'',targetId:randomUUID()})).status,404);
 assert.equal((await f.json(`/v1/teams/${t.teamId}/members/${t.editor.account.id}`,o,'DELETE')).status,200);
 assert.equal((await f.json(root+'/'+id,ed)).status,404);
 assert.equal((await f.raw(root+'/'+id+'/content',ed)).status,404);
}));
