/** Deterministic ZIP packaging; no network and no external dependencies. */
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const release=resolve(root,'release');
const table=new Uint32Array(256);
for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[i]=c>>>0;}
function crc32(buf){let c=0xffffffff;for(const b of buf)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
async function walk(dir){return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(async n=>n.isDirectory()?walk(resolve(dir,n.name)):[resolve(dir,n.name)]))).flat();}
function zip(entries){let offset=0;const local=[],central=[];for(const [name,content] of entries){
 const data=Buffer.from(content),compressed=deflateRawSync(data,{level:9});const path=Buffer.from(name,'utf8');const flags=0x800,method=8,crc=crc32(data);
 const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(flags,6);lh.writeUInt16LE(method,8);lh.writeUInt16LE(0,10);lh.writeUInt16LE(33,12);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(compressed.length,18);lh.writeUInt32LE(data.length,22);lh.writeUInt16LE(path.length,26);
 const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(0x0314,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(flags,8);ch.writeUInt16LE(method,10);ch.writeUInt16LE(0,12);ch.writeUInt16LE(33,14);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(compressed.length,20);ch.writeUInt32LE(data.length,24);ch.writeUInt16LE(path.length,28);ch.writeUInt32LE((0o100644<<16)>>>0,38);ch.writeUInt32LE(offset,42);
 local.push(lh,path,compressed);central.push(ch,path);offset+=lh.length+path.length+compressed.length;
 }
 const dir=Buffer.concat(central);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,dir,end]);}
await mkdir(release,{recursive:true});const summary=[];
for(const browser of ['chromium','firefox','firefox-android','safari']){
 const folder=resolve(root,'dist',browser),files=(await walk(folder)).sort();const entries=await Promise.all(files.map(async path=>[relative(folder,path).split(sep).join('/'),await readFile(path)]));
 const blob=zip(entries);const filename=`MajesticToolkit-1.5.3-${browser}.zip`;await writeFile(resolve(release,filename),blob);
 summary.push({file:filename,sha256:createHash('sha256').update(blob).digest('hex'),size:blob.length,files:entries.length});
 console.log(`${filename}: ${entries.length} files, ${blob.length} bytes`);
}
await writeFile(resolve(release,'SHA256SUMS'),summary.map(r=>`${r.sha256}  ${r.file}`).join('\n')+'\n');
await writeFile(resolve(release,'release-manifest.json'),JSON.stringify({product:'MajesticToolkit',version:'1.5.3',generatedBy:'scripts/package.mjs',artifacts:summary},null,2)+'\n');
