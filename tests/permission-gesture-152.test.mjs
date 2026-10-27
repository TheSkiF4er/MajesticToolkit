import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {changeHostPermission} from '../src/lib/permission-flow.mjs';

const MAJESTIC='https://forum.majestic-rp.ru/*';
const RUSSIA='https://forum.russia.online/*';
const VIDEOS=['https://www.youtube.com/*','https://rutube.ru/*','https://www.twitch.tv/*'];

function firefoxGestureFixture(initiallyGranted = []) {
  let gesture=true;
  const granted=new Set(initiallyGranted);
  const events=[];
  const permissions={
    async contains({origins}) {
      events.push('contains');
      // Simulates Firefox Android dropping transient user activation after an async API boundary.
      gesture=false;
      return origins.every(x=>granted.has(x));
    },
    request({origins}) {
      events.push('request');
      if(!gesture)return Promise.reject(new Error('permissions.request may only be called from a user input handler'));
      for(const x of origins)granted.add(x);
      return Promise.resolve(true);
    },
    remove({origins}){
      events.push('remove');
      for(const x of origins)granted.delete(x);
      return Promise.resolve(true);
    }
  };
  return {permissions,events,granted,deactivate:()=>{gesture=false;}};
}

test('Firefox Android: both XenForo sites request permission synchronously inside the click handler',async()=>{
 for(const origin of [MAJESTIC,RUSSIA]) {
   const fx=firefoxGestureFixture();
   const operation=changeHostPermission(fx.permissions,[origin],false);
   assert.deepEqual(fx.events,['request'],'request() must run before any asynchronous boundary');
   fx.deactivate(); // browser event handler returned: activation no longer available
   assert.equal(await operation,true);
   assert.equal(await fx.permissions.contains({origins:[origin]}),true);
   assert.equal(fx.granted.has(origin),true);
 }
});

test('Firefox Android: checking contains before requesting demonstrably fails',async()=>{
 const fx=firefoxGestureFixture();
 await fx.permissions.contains({origins:[MAJESTIC]});
 await assert.rejects(()=>changeHostPermission(fx.permissions,[MAJESTIC],false),/user input handler/);
});

test('Video overlay permission uses the same gesture-safe operation and revocation',async()=>{
 const fx=firefoxGestureFixture();
 assert.equal(await changeHostPermission(fx.permissions,VIDEOS,false),true);
 assert.deepEqual(fx.events,['request']);
 assert.equal(await changeHostPermission(fx.permissions,VIDEOS,true),true);
 assert.deepEqual(fx.events,['request','remove']);
 for(const origin of VIDEOS)assert.equal(fx.granted.has(origin),false);
});

test('Optional permissions never attempt arbitrary origins or async permission lookup',()=>{
 const fx=firefoxGestureFixture();
 for(const origin of ['javascript:evil','https://evil.example/path','http://forum.majestic-rp.ru/*'])
   assert.throws(()=>changeHostPermission(fx.permissions,[origin],false),/Недопустимый/);
 assert.deepEqual(fx.events,[]);
});

test('Workspace invokes the gesture-safe permission flow for forums and videos',async()=>{
 const source=await readFile(new URL('../src/ui/main.mjs',import.meta.url),'utf8');
 const handler=source.split('async function changePermission(',2)[1].split('\nasync function executeAction(',1)[0];
 assert.doesNotMatch(handler,/await\s+api\.permissions\.contains/);
 assert.match(handler,/changeHostPermission\(api\.permissions, \[site\], granted\)/);
 assert.match(source,/changeHostPermission\(api\.permissions, VIDEO_ORIGINS, granted\)/);
 assert.match(source,/if \(action === 'permission'\) \{ await changePermission\(/);
});

test('Workspace isolates independent module startup failures, shows retry and keeps core recovery',async()=>{
 const source=await readFile(new URL('../src/ui/main.mjs',import.meta.url),'utf8');
 assert.match(source,/Promise\.allSettled\(tasks\.map/);
 assert.match(source,/moduleWarning\(\)/);
 assert.match(source,/action === 'retry-modules'/);
 assert.match(source,/state = await loadState\(\)/);
 assert.match(source,/examineRestorePoint\(api\.storage\.local\)/);
 assert.doesNotMatch(source,/await Promise\.all\(\[refreshForum\(\),refreshComplaints\(\),refreshEconomy\(\),refreshLaw\(\),refreshGovernment\(\),refreshDocuments\(\),refreshIntegrations\(\),refreshMonitor\(\)/);
});

test('Google OAuth UI checks Client ID before requesting permission, backup uses current version',async()=>{
 const page=await readFile(new URL('../src/ui/integrations-page.mjs',import.meta.url),'utf8');
 const google=await readFile(new URL('../src/lib/google-client.mjs',import.meta.url),'utf8');
 assert.match(page,/if\(!clientId\)throw Error\('Сначала сохраните Google OAuth Client ID'\)/);
 assert.match(page,/await connectGoogle\(clientId\)/);
 assert.match(google,/const clientId = configuredClientId === undefined \? undefined : normalizeClientId\(configuredClientId\)/);
 assert.match(page,/majestictoolkit-backup-1\.5\.5-/);
 assert.doesNotMatch(page,/majestictoolkit-backup-0\.9\.0-/);
});
