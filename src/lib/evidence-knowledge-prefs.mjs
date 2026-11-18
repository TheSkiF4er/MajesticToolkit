/** Per-profile UI state for Evidence & Knowledge 1.9.0, no duplicated evidence. */
export const EVIDENCE_TABS=Object.freeze(['overview','vault','timeline','library','graph','dossier']);
export const EVIDENCE_PERIODS=Object.freeze([7,14,30,90]);
export const defaultEvidenceKnowledge=()=>({tab:'overview',days:30,caseId:''});
export function cleanEvidenceKnowledge(input=defaultEvidenceKnowledge()){
 if(!input||typeof input!=='object'||Array.isArray(input)||!EVIDENCE_TABS.includes(input.tab)||!EVIDENCE_PERIODS.includes(input.days)||typeof input.caseId!=='string'||(input.caseId!==''&&!/^[\w-]{8,128}$/.test(input.caseId)))throw Error('Некорректные настройки Evidence & Knowledge');
 return {tab:input.tab,days:input.days,caseId:input.caseId};
}
