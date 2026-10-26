/** Validate and unpack the deterministic MajesticToolkit release ZIP without dependencies. */
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';

const MAX_ZIP_SIZE=32*1024*1024;
const MAX_EXPANDED_SIZE=64*1024*1024;
const MAX_ENTRIES=1500;
const crcTable=Uint32Array.from({length:256},(_,i)=>{
  let c=i;for(let j=0;j<8;j++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
  return c>>>0;
});
export function crc32(data){let n=0xffffffff;for(const byte of data)n=crcTable[(n^byte)&255]^(n>>>8);return (n^0xffffffff)>>>0;}

export function readReleaseEntries(buffer){
  if(!Buffer.isBuffer(buffer)) throw Error('Expected a ZIP buffer');
  if(buffer.length<22||buffer.length>MAX_ZIP_SIZE)throw Error('Invalid release archive size');
  const entries=new Map();let pos=0,total=0,centralFound=false;
  while(pos+4<=buffer.length){
    const sig=buffer.readUInt32LE(pos);
    if(sig===0x02014b50){centralFound=true;break;}
    if(sig!==0x04034b50 || pos+30>buffer.length)throw Error('Invalid ZIP local header');
    const flags=buffer.readUInt16LE(pos+6),method=buffer.readUInt16LE(pos+8);
    const crc=buffer.readUInt32LE(pos+14),compressed=buffer.readUInt32LE(pos+18),expanded=buffer.readUInt32LE(pos+22);
    const nameLen=buffer.readUInt16LE(pos+26),extraLen=buffer.readUInt16LE(pos+28);
    if(flags&0x0009)throw Error('Encrypted or streaming ZIP entries are not supported');
    if(!(flags&0x0800)||method!==8)throw Error('Unsupported ZIP entry encoding or compression');
    const start=pos+30+nameLen+extraLen,end=start+compressed;
    if(nameLen===0||end>buffer.length)throw Error('Truncated ZIP entry');
    const name=buffer.toString('utf8',pos+30,pos+30+nameLen);
    const parts=name.split('/');
    if(name.includes('\\')||name.includes('\0')||name.startsWith('/')||name.endsWith('/')||parts.some(p=>p===''||p==='.'||p==='..')||!/^[\p{L}\p{N}_./@+() -]+$/u.test(name))throw Error('Unsafe ZIP path: '+name);
    if(entries.has(name))throw Error('Duplicate ZIP file: '+name);
    if(entries.size>=MAX_ENTRIES||expanded>MAX_EXPANDED_SIZE||total+expanded>MAX_EXPANDED_SIZE)throw Error('Release archive is too large');
    let content;
    try{content=inflateRawSync(buffer.subarray(start,end),{maxOutputLength:Math.min(MAX_EXPANDED_SIZE-total,expanded)+1});}
    catch{throw Error('Cannot inflate ZIP entry: '+name);}
    if(content.length!==expanded||crc32(content)!==crc)throw Error('Corrupted ZIP entry: '+name);
    entries.set(name,content);total+=expanded;pos=end;
  }
  if(!centralFound||entries.size===0)throw Error('ZIP central directory not found');
  const endPos=buffer.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if(endPos<pos||endPos+22>buffer.length)throw Error('ZIP end record not found');
  const expectedCount=buffer.readUInt16LE(endPos+10);
  if(expectedCount!==entries.size)throw Error('ZIP file count mismatch');
  return entries;
}

export function validateExtensionEntries(entries,version){
  if(!entries.has('manifest.json'))throw Error('manifest.json must be in the archive root');
  let manifest;try{manifest=JSON.parse(entries.get('manifest.json').toString('utf8'));}catch{throw Error('Invalid manifest.json');}
  if(manifest.name!=='MajesticToolkit'||manifest.version!==version||manifest.manifest_version!==3)throw Error('This is not MajesticToolkit '+version+' (Manifest V3)');
  if(!entries.has('ui/popup.html')||!entries.has('background/background.js'))throw Error('Required extension files are missing');
  return manifest;
}

export function verifyArchiveHash(buffer,filename,sumsText){
  const match=String(sumsText).split(/\r?\n/).map(s=>/^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(s)).find(m=>m?.[2]===filename);
  if(!match)throw Error('SHA256SUMS does not contain '+filename);
  const actual=createHash('sha256').update(buffer).digest('hex');
  if(actual.toLowerCase()!==match[1].toLowerCase())throw Error('SHA-256 mismatch for '+filename);
  return actual;
}
