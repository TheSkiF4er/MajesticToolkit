/** Strict profile-local import settings. Numeric fields are preserved, not executed. */
export function validateImportSettings(value){
 if(!value||!Array.isArray(value.folders)||value.folders.length>500)throw Error('Некорректные папки импорта');
 const seen=new Set();const folders=value.folders.map(f=>{if(!f||typeof f.id!=='string'||!/^[-\w]{1,90}$/.test(f.id)||seen.has(f.id)||typeof f.name!=='string'||!f.name.trim()||f.name.length>60||typeof f.color!=='string'||f.color.length>40)throw Error('Некорректная папка импорта');seen.add(f.id);return {id:f.id,name:f.name,color:f.color};});
 const s=value.calcSettings;if(s==null)return {folders,calcSettings:null};
 if(typeof s!=='object'||Array.isArray(s)||typeof s.idColor!=='string'||!/^#[0-9a-f]{6}$/i.test(s.idColor)||typeof s.idColorOn!=='boolean')throw Error('Некорректные настройки калькулятора');
 const calcSettings={idColor:s.idColor,idColorOn:s.idColorOn};for(const key of ['banDays','limit','stepEvery','stepFrom','warnBanDays']){if(!Number.isSafeInteger(s[key])||s[key]<0||s[key]>1000000)throw Error('Некорректный параметр: '+key);calcSettings[key]=s[key];}
 return {folders,calcSettings};
}
