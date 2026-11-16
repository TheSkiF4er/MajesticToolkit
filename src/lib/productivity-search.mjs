import {listRules} from './rules-store.mjs';
import {listXenForoLinks} from './xenforo-store.mjs';
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
import {listSources} from './source-library.mjs';
let index=null;let inflight=null;let epoch=0;
export function invalidateSearch(){index=null;epoch++;}
export async function getLocalIndex(){
  if(index)return index;
  if(inflight){await inflight;return getLocalIndex();}
  const version=epoch;
  const task=(async()=>{
    const [templates,cases,economy,laws,government,documents,links,sources,navigation,rules]=await Promise.all([
      listTemplates(),listCases(),listEconomy(),listLawRecords(),listGovernment(),listDocumentRecords(),listLinks(),listSources(),listXenForoLinks(),listRules()
    ]);
    return buildSearchRecords({templates,cases,economy,laws,government,documents,links,sources,navigation,rules});
  })();
  inflight=task;
  let rows;
  try{rows=await task;}finally{if(inflight===task)inflight=null;}
  if(version!==epoch)return getLocalIndex();
  index=rows;
  return rows;
}
