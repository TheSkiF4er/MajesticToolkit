import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readReleaseEntries,validateExtensionEntries,verifyArchiveHash,crc32} from '../scripts/install-core.mjs';

function zip(entries){
  const locals=[],centrals=[];let offset=0;
  for(const [name,content] of entries){
    const raw=Buffer.from(content),data=deflateRawSync(raw),path=Buffer.from(name,'utf8');
    const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0x800,6);lh.writeUInt16LE(8,8);
    lh.writeUInt32LE(crc32(raw),14);lh.writeUInt32LE(data.length,18);lh.writeUInt32LE(raw.length,22);lh.writeUInt16LE(path.length,26);
    const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(0x0314,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0x800,8);ch.writeUInt16LE(8,10);ch.writeUInt32LE(crc32(raw),16);ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(raw.length,24);ch.writeUInt16LE(path.length,28);ch.writeUInt32LE(offset,42);
    locals.push(lh,path,data);centrals.push(ch,path);offset+=lh.length+path.length+data.length;
  }
  const dir=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,dir,end]);
}
const files=[['manifest.json',JSON.stringify({name:'MajesticToolkit',version:'1.5.3',manifest_version:3})],['ui/popup.html','<html></html>'],['background/background.js','console.log(1)']];
test('release ZIP extracts the actual manifest and required files',()=>{
  const entries=readReleaseEntries(zip(files));assert.equal(entries.size,3);assert.equal(validateExtensionEntries(entries,'1.5.3').name,'MajesticToolkit');
});
test('rejects unsafe paths, duplicate files, and incorrect manifest version',()=>{
  for(const bad of ['../escape.js','ui/../../escape.js','/tmp/out','ui\\escape.js'])assert.throws(()=>readReleaseEntries(zip([...files,[bad,'evil']])),/Unsafe ZIP path/);
  assert.throws(()=>readReleaseEntries(zip([...files,files[0]])),/Duplicate ZIP file/);
  assert.throws(()=>validateExtensionEntries(readReleaseEntries(zip(files)),'1.5.2'),/not MajesticToolkit/);
});
test('rejects modified compressed data and truncated archives',()=>{
  const content=zip(files),modified=Buffer.from(content);modified[50]^=1;
  assert.throws(()=>readReleaseEntries(modified),/Corrupted ZIP entry|Cannot inflate ZIP entry/);
  assert.throws(()=>readReleaseEntries(content.subarray(0,60)),/Truncated|central directory|Invalid/);
});
test('SHA256SUMS verification rejects tampered and missing files',()=>{
  const content=zip(files),sha=createHash('sha256').update(content).digest('hex');
  assert.equal(verifyArchiveHash(content,'release.zip',`${sha}  release.zip\n`),sha);
  assert.throws(()=>verifyArchiveHash(content,'release.zip',`${'f'.repeat(64)}  release.zip\n`),/SHA-256 mismatch/);
  assert.throws(()=>verifyArchiveHash(content,'release.zip',''),/does not contain/);
});
