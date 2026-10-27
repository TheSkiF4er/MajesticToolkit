// Local-only countdowns. Keep deadlines absolute to survive popup/sidebar closure.
export const TIMERS_KEY = 'majesticToolkitTimersV155';
export const ALARM_PREFIX = 'majestic-toolkit-timer:';
export const NOTIFICATION_PREFIX = 'majestic-toolkit-timer-notification:';
export const MAX_TIMERS = 60;
export const MIN_DURATION_MINUTES = 1;
export const MAX_DURATION_MINUTES = 10080; // one week
export const timerAlarm = id => ALARM_PREFIX + id;
export const timerNotification = id => NOTIFICATION_PREFIX + id;

export function validateTimer(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw Error('Некорректный таймер');
  if (typeof record.id !== 'string' || !/^[a-z0-9-]{8,100}$/i.test(record.id)) throw Error('Неверный ID таймера');
  if (typeof record.title !== 'string' || !record.title.trim() || record.title.length > 100) throw Error('Введите название (до 100 символов)');
  if (!['active','completed'].includes(record.status)) throw Error('Некорректный статус таймера');
  if (![record.createdAt,record.expiresAt].every(n => Number.isSafeInteger(n) && n > 0)) throw Error('Некорректный срок таймера');
  if (record.expiresAt <= record.createdAt || record.expiresAt - record.createdAt > MAX_DURATION_MINUTES*60000) throw Error('Некорректная длительность');
  if (record.completedAt !== null && (!Number.isSafeInteger(record.completedAt) || record.completedAt < record.createdAt)) throw Error('Некорректная дата завершения');
  return {id:record.id,title:record.title.trim(),createdAt:record.createdAt,expiresAt:record.expiresAt,status:record.status,completedAt:record.completedAt ?? null};
}
export function validateTimers(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TIMERS) throw Error('Список таймеров повреждён');
  const result = value.map(validateTimer);
  if (new Set(result.map(x=>x.id)).size !== result.length) throw Error('Обнаружены повторяющиеся таймеры');
  return result;
}
export function createTimer(input, now = Date.now(), id = globalThis.crypto.randomUUID()) {
  const minutes = Number(input?.minutes);
  if (!Number.isInteger(minutes) || minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) throw Error('Укажите время от 1 до 10080 минут');
  if (!Number.isSafeInteger(now) || now <= 0) throw Error('Некорректное время');
  return validateTimer({id,title:input?.title,createdAt:now,expiresAt:now+minutes*60000,status:'active',completedAt:null});
}
export function remainingLabel(ms) {
  if (ms <= 0) return '00:00';
  const total = Math.ceil(ms/1000);
  const hours = Math.floor(total/3600);
  const mins = Math.floor(total%3600/60);
  const secs = total%60;
  return `${hours ? String(hours).padStart(2,'0')+':' : ''}${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}
