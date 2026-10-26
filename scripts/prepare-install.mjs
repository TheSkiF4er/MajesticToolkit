#!/usr/bin/env node
/** Prepare an unpacked Chromium extension or Safari web-extension resources from a release ZIP. */
import {readFile,writeFile,mkdir,mkdtemp,rename,rm,stat} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readReleaseEntries,validateExtensionEntries,verifyArchiveHash} from './install-core.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const browser=process.argv[2];
if(!['chromium','safari'].includes(browser)||process.argv.length>5){
  console.error('Usage: node scripts/prepare-install.mjs <chromium|safari> [release.zip] [destination]');process.exitCode=2;
}else{
  const archive=resolve(process.argv[3]||join(root,'release',`MajesticToolkit-${pkg.version}-${browser}.zip`));
  const dest=resolve(process.argv[4]||join(root,'install',`MajesticToolkit-${pkg.version}-${browser}`));
  let temp;
  try{
    if(dest===root||dest===resolve(root,'src')||dest===resolve(root,'dist'))throw Error('Choose a separate installation folder');
    try{await stat(dest);throw Error('Destination already exists. Choose a new folder to avoid overwriting data: '+dest);}catch(e){if(e.code!=='ENOENT')throw e;}
    const blob=await readFile(archive);
    let verified=false;
    try{const sums=await readFile(join(dirname(archive),'SHA256SUMS'),'utf8');verifyArchiveHash(blob,basename(archive),sums);verified=true;}
    catch(e){if(e.code!=='ENOENT')throw e;}
    const entries=readReleaseEntries(blob);
    validateExtensionEntries(entries,pkg.version);
    await mkdir(dirname(dest),{recursive:true});
    temp=await mkdtemp(join(dirname(dest),'.majestictoolkit-install-'));
    for(const [name,data] of entries){const path=join(temp,...name.split('/'));await mkdir(dirname(path),{recursive:true});await writeFile(path,data,{flag:'wx'});}
    await rename(temp,dest);temp=null;
    console.log(`Prepared ${browser} extension: ${dest}`);
    console.log(verified?'SHA-256 verified using SHA256SUMS.':'SHA256SUMS is not present; verify this archive against the trusted GitHub release.');
    if(browser==='chromium')console.log('Chromium desktop: chrome://extensions -> Developer mode -> Load unpacked -> select the folder above.');
    else console.log('macOS Safari: Safari -> Settings -> Developer -> Add Temporary Extension, or use xcrun safari-web-extension-packager to build an Xcode app.');
  }catch(e){console.error('Cannot prepare extension:',e.message);process.exitCode=1;}
  finally{if(temp)await rm(temp,{recursive:true,force:true});}
}
