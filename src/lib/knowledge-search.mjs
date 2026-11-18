/** Deterministic local search and revision comparison. No network requests. */
const norm=text=>String(text??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е');
export function searchKnowledgeLibrary(sources,knowledge,profileId,filters={}){
 const query=norm(filters.query||'').trim(),tokens=query.split(/\s+/).filter(Boolean),collection=knowledge.collections?.find(c=>c.id===filters.collectionId&&c.profileId===profileId);
 if(filters.collectionId&&!collection)return [];
 const result=[];
 for(const row of sources){
  if(row.profileId!==profileId||filters.kind&&filters.kind!=='all'&&row.kind!==filters.kind||filters.status&&filters.status!=='all'&&row.status!==filters.status||filters.favorites&&!row.favorite||filters.tag&&!row.tags?.includes(filters.tag))continue;
  if(collection&&!collection.members.includes(`external:${row.id}`))continue;
  const fields=norm([row.title,row.body,row.url,row.notes,...(row.tags||[])].join(' '));
  if(tokens.some(t=>!fields.includes(t)))continue;
  const first=tokens.map(t=>norm(row.body).indexOf(t)).filter(n=>n>=0).sort((a,b)=>a-b)[0]??0;
  const start=Math.max(0,first-80),snippet=(start?'…':'')+row.body.slice(start,start+240)+(start+240<row.body.length?'…':'');
  const score=(!query?0:norm(row.title).includes(query)?10:0)+tokens.filter(t=>norm(row.title).includes(t)).length*3+(row.favorite?1:0);
  result.push({...row,snippet,score});
 }
 return result.sort((a,b)=>b.score-a.score||b.capturedAt.localeCompare(a.capturedAt)||a.title.localeCompare(b.title,'ru'));
}
const tokenize=text=>String(text).match(/\s+|[^\s]+/g)||[];
/** Word-oriented LCS, bounded to keep comparison responsive for long pages. */
export function compareSourceTexts(before,after){
 const a=tokenize(before),b=tokenize(after),prefix=[];
 while(a.length&&b.length&&a[0]===b[0])prefix.push({type:'same',text:a.shift()}),b.shift();
 const suffix=[];while(a.length&&b.length&&a.at(-1)===b.at(-1))suffix.unshift({type:'same',text:a.pop()}),b.pop();
 if(!a.length)return [...prefix,...b.map(text=>({type:'added',text})),...suffix];
 if(!b.length)return [...prefix,...a.map(text=>({type:'removed',text})),...suffix];
 if(a.length*b.length>250000)return [...prefix,...a.map(text=>({type:'removed',text})),...b.map(text=>({type:'added',text})),...suffix];
 const m=a.length,n=b.length,dp=Array.from({length:m+1},()=>new Uint16Array(n+1));
 for(let i=m-1;i>=0;i--)for(let j=n-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
 const out=[...prefix];let i=0,j=0;
 while(i<m||j<n){if(i<m&&j<n&&a[i]===b[j])out.push({type:'same',text:a[i++]}),j++;else if(i<m&&(j===n||dp[i+1][j]>=dp[i][j+1]))out.push({type:'removed',text:a[i++]});else out.push({type:'added',text:b[j++]});}
 return [...out,...suffix];
}
