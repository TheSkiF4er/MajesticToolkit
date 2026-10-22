/** Runtime message source verification. Content pages and extension UI have distinct capabilities. */
const sites=Object.freeze({forum:new Set(['forum.majestic-rp.ru','forum.russia.online']),video:new Set(['www.youtube.com','rutube.ru','www.twitch.tv'])});
function senderURL(sender,runtimeId){
  if(!sender||sender.id!==runtimeId||!sender.url|| (sender.frameId!==undefined&&sender.frameId!==0))return null;
  try {const url=new URL(sender.url);if(url.username||url.password||url.port)return null;return url;}catch{return null;}
}
export function contentSender(sender,runtimeId,kind){
  const url=senderURL(sender,runtimeId);
  return Boolean(url&&url.protocol==='https:'&&sites[kind]?.has(url.hostname)&&!url.hostname.endsWith('.'));
}
export function extensionPageSender(sender,runtime){
  const url=senderURL(sender,runtime.id);
  if(!url)return false;
  try{const root=new URL(runtime.getURL(''));return url.protocol===root.protocol&&url.hostname===root.hostname&&url.pathname.startsWith('/ui/');}
  catch{return false;}
}
export function matchingForumProfile(state,senderUrl,xf){
  const profile=xf.matchingProfile(state?.profiles,state?.activeProfileId,senderUrl);
  if(!profile)throw Error('Нет профиля для текущего форума');
  return profile;
}
export function validatePayloadSize(message,max=65536){
  try{if(JSON.stringify(message).length>max)throw Error('Слишком большой запрос');}
  catch(error){if(error?.message==='Слишком большой запрос')throw error;throw Error('Некорректное сообщение');}
}
