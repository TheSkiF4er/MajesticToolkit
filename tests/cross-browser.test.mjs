import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async path=>readFile(new URL(path,import.meta.url),'utf8');
test('content scripts no longer read the extension local database',async()=>{
 for(const path of ['../src/content/forum.js','../src/content/evidence.js']){
   const body=await read(path);
   assert.doesNotMatch(body,/api\.storage\.local\.(get|set|remove)/);
   assert.match(body,/RP_NEXUS_(?:FORUM_DATA|VIDEO_CASES)/);
   assert.match(body,/RP_NEXUS_(?:REFRESH_FORUM_DATA|VIDEO_ADD)/);
 }
});
test('background restricts storage in browsers offering trusted-context access level',async()=>{
 const background=await read('../src/background/background.js');
 assert.match(background,/setAccessLevel\?\.\(\{accessLevel:'TRUSTED_CONTEXTS'\}\)/);
 assert.match(background,/contentSender\(sender,api\.runtime\.id/);
 assert.match(background,/if \(message\.type === 'RP_NEXUS_FORUM_DATA'\)/);
 assert.match(background,/if \(message\.type === 'RP_NEXUS_VIDEO_CASES'\)/);
});
test('all four MV3 manifests have the same version and optional sites',async()=>{
 const manifests=await Promise.all(['chromium','firefox','firefox-android','safari'].map(async n=>JSON.parse(await read(`../manifests/${n}.json`))));
 assert.deepEqual([...new Set(manifests.map(m=>m.version))],['1.5.1']);
 for(const manifest of manifests){
   assert.equal(manifest.manifest_version,3);
   assert.deepEqual(manifest.optional_host_permissions,manifests[0].optional_host_permissions);
 }
 assert.ok(manifests[0].background.service_worker);
 assert.ok(manifests[1].background.scripts);
 assert.ok(manifests[1].sidebar_action);
 assert.ok(!manifests[2].sidebar_action);
 assert.ok(manifests[3].background.service_worker);
});
test('Safari resources have no privileged nonportable sidebar and Google Identity requirement',async()=>{
 const safari=JSON.parse(await read('../manifests/safari.json'));
 assert.ok(!('side_panel' in safari));
 assert.ok(!safari.permissions.includes('identity'));
 assert.ok(safari.options_page);
});
