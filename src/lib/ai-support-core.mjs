/** Privacy-preserving AI Support diagnostics and bounded gateway payload (no storage dumps). */
export const SUPPORT_TOPICS=Object.freeze({general:'Общие настройки',forum:'Доступ к форумам',backup:'Резервные копии',evidence:'Evidence Vault',ai:'OpenAI и шлюз',integrations:'Интеграции'});
export const SUPPORT_CHECKS=Object.freeze({runtime:'Версия расширения',localStorage:'Локальное хранилище',indexedDB:'Хранилище файлов',storageQuota:'Квота браузера',forumMajestic:'Разрешение Majestic RP',forumRussia:'Разрешение Russia Online',gatewayPermission:'Разрешение локального AI-шлюза',gatewayConnection:'Соединение с AI-шлюзом'});
export const SUPPORT_STATUSES=Object.freeze(['ok','warn','fail','unknown']);
const allowedKeys=new Set(Object.keys(SUPPORT_CHECKS));
export function sanitizeSupportQuestion(value){
 if(typeof value!=='string'||!value.trim()||value.length>2000)throw Error('Опишите проблему (до 2000 символов)');
 return value.trim()
  .replace(/\bsk-(?:proj-|svcacct-)?[a-zA-Z0-9_-]{8,}\b/gi,'[СКРЫТ_API_КЛЮЧ]')
  .replace(/\bBearer\s+[a-zA-Z0-9._~+/-]{8,}/gi,'Bearer [СКРЫТО]')
  .replace(/(?:token|secret|password|api[_-]?key|пароль|токен)\s*[:=]\s*[^\s,;]+/gi,'[СКРЫТ_СЕКРЕТ]')
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[СКРЫТ_EMAIL]')
  .replace(/(?:[A-Z]:\\|\/home\/|\/Users\/)[^\s"'<>]+/gi,'[СКРЫТ_ПУТЬ]')
  .replace(/https?:\/\/[^\s"'<>]+/gi,'[СКРЫТ_URL]');
}
export function validateSupportContext(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['category','version','checks'].includes(k)))throw Error('Некорректные данные техподдержки');
 if(!Object.hasOwn(SUPPORT_TOPICS,value.category)||typeof value.version!=='string'||!/^\d{1,2}\.\d{1,2}\.\d{1,3}$/.test(value.version))throw Error('Некорректная категория или версия');
 if(!Array.isArray(value.checks)||value.checks.length>8)throw Error('Слишком много диагностических проверок');
 const ids=new Set();for(const item of value.checks){if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['id','status'].includes(k))||!allowedKeys.has(item.id)||!SUPPORT_STATUSES.includes(item.status)||ids.has(item.id))throw Error('Некорректная диагностическая запись');ids.add(item.id);}
 return {category:value.category,version:value.version,checks:value.checks.map(x=>({id:x.id,status:x.status}))};
}
export function buildSupportWire(question,context){return {mode:'support',question:sanitizeSupportQuestion(question),diagnostics:validateSupportContext(context)};}
export function localSupportSteps(category,checks=[],issue=''){
 const advice={
 general:['Проверьте версию расширения и перезагрузите его в браузере.','Откройте рабочее пространство и проверьте выбранный профиль.','Перед сбросом настроек создайте резервную копию.'],
 forum:['Откройте страницу поддерживаемого форума по HTTPS.','В разделе «Сайты и доступ» проверьте разрешение для нужного домена.','Сверьте профиль и сервер, затем перезагрузите вкладку форума.'],
 backup:['Проверьте, что выбран нужный формат: JSON v19 без бинарных файлов или Portable ZIP v19 с вложениями.','До восстановления скачайте резервную копию текущих данных.','Проверьте ошибки целостности ZIP, профиль и наличие файлов Evidence Vault.'],
 evidence:['Проверьте свободное место и поддержку IndexedDB браузером.','Для перемещения файлов используйте переносимый ZIP v19, не обычный JSON.','Если SHA-256 не совпадает, не используйте повреждённый файл.'],
 ai:['Проверьте запуск локального шлюза npm run ai:gateway и переменные OPENAI_API_KEY / MT_AI_GATEWAY_TOKEN.','Включите AI для профиля и разрешите http://127.0.0.1/* в браузере.','Проверьте соединение с токеном шлюза, а не ключом OpenAI; при HTTP 429 проверьте лимиты.'],
 integrations:['Проверьте разрешения на нужный ресурс в разделе интеграций.','Повторите подключение с актуальным профилем и разрешениями.','Проверьте состояние сети и официальные ограничения подключённого сервиса.']
 };
 const warnings=checks.filter(x=>x.status==='fail'||x.status==='warn').map(x=>`Проверка «${SUPPORT_CHECKS[x.id]}»: ${x.status==='fail'?'ошибка':'требует внимания'}.`);
 const detail=String(issue||'').slice(0,2000);
 const matched=[];
 if(/\b401\b|unauthori[sz]ed|неверн\S*\s+токен/i.test(detail))matched.push('HTTP 401: проверьте токен локального шлюза; не вводите сюда ключ OpenAI и не отправляйте его в отчёт.');
 if(/\b403\b|forbidden|нет\s+доступа/i.test(detail))matched.push('HTTP 403: проверьте разрешение браузера на нужный сайт и роль на форуме; не обходите ограничения доступа.');
 if(/\b429\b|rate.?limit|слишком\s+много\s+запрос/i.test(detail))matched.push('HTTP 429: дождитесь сброса лимита шлюза или проверьте лимиты OpenAI API.');
 if(/quotaexceeded|\bquota\b|мало\s+места|нехватк\S*\s+места/i.test(detail))matched.push('Ошибка квоты: проверьте свободное место и создайте переносимый ZIP перед очисткой данных.');
 if(/sha.?256|контрольн\S*\s+сумм|поврежденн\S*\s+файл/i.test(detail))matched.push('Ошибка целостности: не используйте повреждённый файл, восстановите его из проверенной резервной копии.');
 if(/\bzip\b|\bjson\b|резервн\S*\s+копи/i.test(detail)&&category==='backup')matched.push('Сверьте тип архива: ZIP v19 переносит файлы IndexedDB, JSON v19 — только метаданные.');
 return [...warnings,...matched,...advice[Object.hasOwn(SUPPORT_TOPICS,category)?category:'general']];
}
export function validateSupportAnswer(answer){
 if(!answer||typeof answer!=='object'||Array.isArray(answer)||Object.keys(answer).some(k=>!['summary','possibleCause','steps','additionalQuestions','severity','requiresHumanReview'].includes(k)))throw Error('Некорректный ответ AI Support');
 if(!['summary','possibleCause'].every(k=>typeof answer[k]==='string'&&answer[k].length<=3000)||!['info','warning','critical'].includes(answer.severity)||answer.requiresHumanReview!==true)throw Error('Ответ техподдержки не прошёл проверку');
 for(const k of ['steps','additionalQuestions'])if(!Array.isArray(answer[k])||answer[k].length>10||answer[k].some(s=>typeof s!=='string'||s.length>1200))throw Error('Ответ техподдержки содержит неверные шаги');
 return answer;
}
export function supportReport(context){const safe=validateSupportContext(context);return JSON.stringify({format:'MajesticToolkit Support Diagnostics',generatedAt:new Date().toISOString(),...safe,notice:'Не содержит ключи, содержимое жалоб, токены, файлы и приватные настройки. Проверяйте файл перед отправкой.'},null,2);}
