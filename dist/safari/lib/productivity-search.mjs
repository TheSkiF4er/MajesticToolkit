import './forum-core.js';
import './complaints-core.js';
import {listTemplates} from './forum-store.mjs';
import {listCases} from './complaints-store.mjs';
import {listEconomy} from './economy-store.mjs';
import {listLawRecords} from './law-store.mjs';
import {listGovernment} from './government-store.mjs';
import {listDocumentRecords} from './document-store.mjs';
import {listLinks} from './integration-store.mjs';
import {buildSearchRecords} from './productivity-core.mjs';
let index=null;let inflight=null;let epoch=0;
export function invalidateSearch(){index=null;epoch++;}
export async function getLocalIndex(){
  if(index)return index;
  if(inflight)return inflight;
  const version=epoch;
  const task=(async()=>{
    const [templates,cases,economy,laws,government,documents,links]=await Promise.all([
      listTemplates(),listCases(),listEconomy(),listLawRecords(),listGovernment(),listDocumentRecords(),listLinks()
    ]);
    return buildSearchRecords({templates,cases,economy,laws,government,documents,links});
  })();
  inflight=task;
  let rows;
  try{rows=await task;}finally{if(inflight===task)inflight=null;}
  if(version!==epoch)return getLocalIndex();
  index=rows;
  return rows;
}
