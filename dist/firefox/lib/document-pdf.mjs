// Offline raster PDF export: Unicode is drawn by the browser canvas (no external fonts or API).
// Produces valid multi-page A4 PDFs with JPEG XObjects, xref and page tree.
const PAGE_W=595.28,PAGE_H=841.89,SCALE=2,MARGIN=48;
const enc=new TextEncoder();
const ascii=s=>enc.encode(s);
const concat=parts=>{const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}return bytes;};
function imageBytes(uri){const match=/^data:image\/jpeg;base64,([\w+/=]+)$/.exec(uri);if(!match)throw Error('Браузер не смог сформировать JPEG');const raw=atob(match[1]),result=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)result[i]=raw.charCodeAt(i);return result;}
function pdfPages(images){const objects=[];const add=content=>{objects.push(content);return objects.length;};
 const catalog=add(''),pagesId=add('');const pageIds=[];
 for(const image of images){const imgId=add(concat([ascii(`<< /Type /XObject /Subtype /Image /Width ${Math.round(PAGE_W*SCALE)} /Height ${Math.round(PAGE_H*SCALE)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`),image,ascii('\nendstream')]));
 const stream=ascii(`q\n${PAGE_W} 0 0 ${PAGE_H} 0 0 cm\n/Im1 Do\nQ\n`),streamId=add(concat([ascii(`<< /Length ${stream.length} >>\nstream\n`),stream,ascii('endstream')]));
 pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im1 ${imgId} 0 R >> >> /Contents ${streamId} 0 R >>`));}
 objects[catalog-1]=`<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
 objects[pagesId-1]=`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(x=>`${x} 0 R`).join(' ')}] >>`;
 const chunks=[ascii('%PDF-1.4\n%\xD2\xD3\xCF\xD3\n')],positions=[0];let size=chunks[0].length;
 objects.forEach((entry,i)=>{positions.push(size);const value=typeof entry==='string'?ascii(entry):entry;const row=concat([ascii(`${i+1} 0 obj\n`),value,ascii('\nendobj\n')]);chunks.push(row);size+=row.length;});
 const start=size;const xref=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${positions.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;chunks.push(ascii(xref));return concat(chunks);
}
export function makeDocumentPdf(title,text,{canvasFactory=()=>document.createElement('canvas')}={}){
 if(typeof title!=='string'||typeof text!=='string'||title.length>180||text.length>60000)throw Error('Некорректный документ для PDF');
 const width=Math.round(PAGE_W*SCALE),height=Math.round(PAGE_H*SCALE);let canvas,ctx,y,pageNumber=0;const images=[];
 const startPage=()=>{canvas=canvasFactory();canvas.width=width;canvas.height=height;ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas недоступен');ctx.scale(SCALE,SCALE);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,PAGE_W,PAGE_H);ctx.textBaseline='top';ctx.fillStyle='#202938';y=53;pageNumber++;};
 const finishPage=()=>{ctx.font='9px Arial, sans-serif';ctx.fillStyle='#6b7280';ctx.textAlign='center';ctx.fillText(`MajesticToolkit · ${pageNumber}`,PAGE_W/2,PAGE_H-34);ctx.textAlign='left';images.push(imageBytes(canvas.toDataURL('image/jpeg',0.88)));if(images.length>100)throw Error('Слишком большой документ: более 100 страниц');};
 const style=(heading=false)=>{ctx.font=heading?'bold 18px Arial, sans-serif':'12px Arial, sans-serif';ctx.fillStyle='#202938';};
 const newLine=(heightNeeded)=>{if(y+heightNeeded>PAGE_H-MARGIN-10){finishPage();startPage();}};
 const draw=(line,heading=false)=>{const lh=heading?26:18;newLine(lh);style(heading);ctx.fillText(line,MARGIN,y);y+=lh;};
 const wrap=(text,heading=false)=>{style(heading);const max=PAGE_W-2*MARGIN;const tokens=text.split(/(\s+)/).filter(Boolean);let line='';for(const token of tokens){if(ctx.measureText(line+token).width<=max){line+=token;continue;}
 if(line.trim()){draw(line.trimEnd(),heading);line='';}
 if(ctx.measureText(token).width>max){let frag='';for(const ch of token){if(ctx.measureText(frag+ch).width>max){draw(frag,heading);frag='';}frag+=ch;}line=frag;}else{line=token.trimStart();}}
 if(line.trim())draw(line.trimEnd(),heading);};
 startPage();wrap(title||'Документ',true);y+=18;const lines=text.replace(/\r\n?/g,'\n').split('\n');for(const line of lines){if(!line.trim()){y+=10;newLine(18);continue;}wrap(line,false);}finishPage();return pdfPages(images);
}
export function savePdf(bytes,filename){const blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,130)||'document.pdf';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
