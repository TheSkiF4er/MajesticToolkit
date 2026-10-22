import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
const root=resolve(import.meta.dirname,'..');
const release=resolve(root,'release');
const sha=data=>createHash('sha256').update(data).digest('hex');
const index=JSON.parse(await readFile(resolve(release,'release-manifest.json'),'utf8'));
if(index.version!=='1.3.0'||index.artifacts.length!==4)throw Error('Release manifest invalid');
const lines=(await readFile(resolve(release,'SHA256SUMS'),'utf8')).trim().split('\n');
for(const row of index.artifacts){
 if(!/^MajesticToolkit-1\.3\.0-(chromium|firefox|firefox-android|safari)\.zip$/.test(row.file))throw Error('Unexpected release filename');
 const bytes=await readFile(resolve(release,row.file));
 if(bytes.length!==row.size||sha(bytes)!==row.sha256||!lines.includes(`${row.sha256}  ${row.file}`))throw Error('SHA256 mismatch: '+row.file);
 let pos=0,count=0,manifest;
 while(pos+4<=bytes.length&&bytes.readUInt32LE(pos)===0x04034b50){
  const flags=bytes.readUInt16LE(pos+6),method=bytes.readUInt16LE(pos+8),crc=bytes.readUInt32LE(pos+14),size=bytes.readUInt32LE(pos+18),expanded=bytes.readUInt32LE(pos+22),nameLen=bytes.readUInt16LE(pos+26),extraLen=bytes.readUInt16LE(pos+28);
  const name=bytes.toString('utf8',pos+30,pos+30+nameLen);
  if(name.includes('..')||name.startsWith('/')||name.includes('\\'))throw Error('Zip-slip path: '+name);
  if(method!==8||!(flags&0x800))throw Error('Bad ZIP flags');
  const content=inflateRawSync(bytes.subarray(pos+30+nameLen+extraLen,pos+30+nameLen+extraLen+size));
  if(content.length!==expanded)throw Error('ZIP uncompressed size mismatch: '+name);
  const browser=row.file.replace('MajesticToolkit-1.3.0-','').replace('.zip','');
  if(sha(content)!==sha(await readFile(resolve(root,'dist',browser,name))))throw Error('Packaged bytes differ from build: '+name);
  if(name==='manifest.json')manifest=JSON.parse(content.toString('utf8'));
  pos+=30+nameLen+extraLen+size;count++;
 }
 if(count!==row.files||manifest?.version!=='1.3.0')throw Error('ZIP manifest/file count mismatch: '+row.file);
 if(row.file.includes('-firefox')) {
   if(manifest.browser_specific_settings?.gecko?.id!=='majestictoolkit@theskif4er.github.io' ||
      JSON.stringify(manifest.browser_specific_settings.gecko.data_collection_permissions?.required)!=='["none"]' ||
      manifest.browser_specific_settings.gecko.data_collection_permissions?.optional?.length!==4)
     throw Error('Firefox ZIP missing AMO privacy declaration / stable ID');
 }

 console.log(`${row.file}: ${count} files verified, SHA256 ${row.sha256.slice(0,12)}…`);
}
