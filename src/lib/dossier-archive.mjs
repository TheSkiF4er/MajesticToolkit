/** Portable, uncompressed ZIP (STORE). Both writer and reader verify CRC-32;
 * dossiers additionally verify SHA-256 against a signed-by-nobody manifest.
 * No remote services, executable content, path traversal or ZIP64. */
const MAX_ARCHIVE = 300 * 1024 * 1024;
const te = new TextEncoder(), td = new TextDecoder('utf-8', {fatal:true});
const table = new Uint32Array(256);
for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[i]=c>>>0;}
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
const nameOk = s => typeof s==='string' && /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(s) && s.length<=200 && !s.split('/').some(x=>x==='.'||x==='..') && !s.startsWith('/') && !s.includes('\\');
const u16=(v,o,n)=>v.setUint16(o,n,true),u32=(v,o,n)=>v.setUint32(o,n>>>0,true);
const bytesOf=async content=>content instanceof Uint8Array?content:content instanceof Blob?new Uint8Array(await content.arrayBuffer()):te.encode(String(content));
const fail=message=>{throw Error('Архив: '+message);};
export async function makeZip(entries){
 if(!Array.isArray(entries)||entries.length===0||entries.length>1000)fail('неверное число файлов');
 const seen=new Set(), parts=[],directory=[];let offset=0,centralBytes=0;
 for(const [name,content] of entries){
  if(!nameOk(name)||seen.has(name))fail('небезопасное или повторяющееся имя файла');seen.add(name);
  const data=await bytesOf(content),filename=te.encode(name);
  if(data.byteLength>MAX_ARCHIVE||offset+30+filename.length+data.length+centralBytes+46+filename.length+22>MAX_ARCHIVE)fail('объём файлов превышает лимит');
  const crc=crc32(data),header=new Uint8Array(30),h=new DataView(header.buffer);
  u32(h,0,0x04034b50);u16(h,4,20);u16(h,6,0x800);u16(h,8,0);u16(h,12,33);u32(h,14,crc);u32(h,18,data.length);u32(h,22,data.length);u16(h,26,filename.length);
  const central=new Uint8Array(46),v=new DataView(central.buffer);
  u32(v,0,0x02014b50);u16(v,4,20);u16(v,6,20);u16(v,8,0x800);u16(v,10,0);u16(v,14,33);u32(v,16,crc);u32(v,20,data.length);u32(v,24,data.length);u16(v,28,filename.length);u32(v,42,offset);
  directory.push(central,filename);centralBytes+=46+filename.length;
  parts.push(header,filename,data);offset+=header.length+filename.length+data.length;
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);u32(e,0,0x06054b50);u16(e,8,seen.size);u16(e,10,seen.size);u32(e,12,centralBytes);u32(e,16,offset);
 return new Blob([...parts,...directory,end],{type:'application/zip'});
}
export async function readZip(input){
 const buffer=input instanceof Blob?await input.arrayBuffer():input instanceof ArrayBuffer?input:input?.buffer;
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<22||buffer.byteLength>MAX_ARCHIVE)fail('повреждённый или слишком большой ZIP');
 const v=new DataView(buffer),b=new Uint8Array(buffer),end=b.length-22,read16=o=>v.getUint16(o,true),read32=o=>v.getUint32(o,true);
 if(read32(end)!==0x06054b50||read16(end+20)!==0||read16(end+4)!==0||read16(end+6)!==0)fail('ZIP должен содержать один архив без комментария');
 const count=read16(end+10),length=read32(end+12),start=read32(end+16);
 if(count<1||count>1000||read16(end+8)!==count||start+length!==end)fail('некорректный каталог ZIP');
 const result=new Map();let p=start,lastLocalEnd=0;
 for(let i=0;i<count;i++){
  if(p+46>end||read32(p)!==0x02014b50)fail('повреждён каталог');
  const flags=read16(p+8),method=read16(p+10),crc=read32(p+16),compressed=read32(p+20),size=read32(p+24),len=read16(p+28),extras=read16(p+30),comment=read16(p+32),offset=read32(p+42);
  if(flags!==0x800||method!==0||compressed!==size||extras||comment||p+46+len>end||offset<lastLocalEnd||offset+30>start)fail('неподдерживаемый ZIP');
  const name=td.decode(b.subarray(p+46,p+46+len));if(!nameOk(name)||result.has(name))fail('небезопасное имя ZIP');
  if(read32(offset)!==0x04034b50||read16(offset+6)!==flags||read16(offset+8)!==method||read32(offset+14)!==crc||read32(offset+18)!==size||read32(offset+22)!==size||read16(offset+26)!==len||read16(offset+28)!==0)fail('повреждён локальный заголовок');
  const dataStart=offset+30+len,dataEnd=dataStart+size;
  if(td.decode(b.subarray(offset+30,dataStart))!==name||dataEnd>start||crc32(b.subarray(dataStart,dataEnd))!==crc)fail('CRC-32 или размер не совпадает');
  result.set(name,b.slice(dataStart,dataEnd));lastLocalEnd=dataEnd;p+=46+len;
 }
 if(p!==end||lastLocalEnd!==start)fail('лишние или повреждённые данные ZIP');
 return result;
}
export const encodeJson = value => te.encode(JSON.stringify(value,null,2));
export const decodeJson = value => JSON.parse(td.decode(value));
export async function digest(bytes){const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
