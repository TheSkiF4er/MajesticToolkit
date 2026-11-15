/* Shared, strictly data-only theme model; usable by extension modules and classic content scripts. */
(() => {
  'use strict';
  const themes=Object.freeze({
    original:null, dark:{background:'#121722',surface:'#202938',text:'#e8edf6',muted:'#aebbd0',accent:'#a6baff',border:'#46546a'},
    light:{background:'#eef2f7',surface:'#ffffff',text:'#17253a',muted:'#526078',accent:'#284da3',border:'#c5cedd'},
    midnight:{background:'#0b1530',surface:'#18294b',text:'#e8efff',muted:'#adbfdf',accent:'#a6c1ff',border:'#40577f'},
    oled:{background:'#000000',surface:'#151515',text:'#f0f0f0',muted:'#b8b8b8',accent:'#a9c6ff',border:'#555555'}
  });
  const paletteKeys=Object.keys(themes.dark);
  const defaults=Object.freeze({theme:'original',palette:Object.freeze({...themes.dark}),font:'system',fontSize:15,radius:8,width:'original',density:'comfortable',header:'original',sidebar:'original',avatar:'original',signatures:'original',quotes:'original',reading:false,outline:true,rememberReading:false});
  const enums={theme:['original','dark','light','midnight','oled','system','custom'],font:['system','sans','serif','mono'],width:['original','wide','full','narrow'],density:['comfortable','compact'],header:['original','compact','sticky'],sidebar:['original','left','right','minimal'],avatar:['original','small','round'],signatures:['original','collapse'],quotes:['original','collapse']};
  function object(v){return v&&typeof v==='object'&&!Array.isArray(v);}
  function clean(raw={}){
    if(!object(raw))throw Error('Некорректная тема форума');
    const out={...defaults,palette:{...defaults.palette}};
    for(const [key,options] of Object.entries(enums))if(Object.hasOwn(raw,key)){if(!options.includes(raw[key]))throw Error('Некорректный параметр: '+key);out[key]=raw[key];}
    for(const [key,min,max] of [['fontSize',12,22],['radius',0,20]])if(Object.hasOwn(raw,key)){if(!Number.isInteger(raw[key])||raw[key]<min||raw[key]>max)throw Error('Некорректный размер: '+key);out[key]=raw[key];}
    for(const key of ['reading','outline','rememberReading'])if(Object.hasOwn(raw,key)){if(typeof raw[key]!=='boolean')throw Error('Некорректный параметр: '+key);out[key]=raw[key];}
    if(Object.hasOwn(raw,'palette')){if(!object(raw.palette))throw Error('Некорректная палитра');for(const key of paletteKeys)if(Object.hasOwn(raw.palette,key)){const v=raw.palette[key];if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))throw Error('Некорректный цвет: '+key);out.palette[key]=v.toLowerCase();}}
    return out;
  }
  const hosts=['forum.majestic-rp.ru','forum.russia.online'];
  const scopeValid=s=>s==='global'||hosts.includes(s)||(/^profile:.{1,128}$/u.test(s)&&!/[\r\n]/.test(s));
  function config(raw,ids=null){
    if(raw===undefined)return {schemaVersion:1,global:clean(),sites:{},profiles:{},presets:[],previous:{}};
    if(!object(raw)||raw.schemaVersion!==1)throw Error('Некорректная версия оформления');
    const map=(v,accept)=>{if(v===undefined)return {};if(!object(v)||Object.keys(v).length>102)throw Error('Некорректные области оформления');return Object.fromEntries(Object.entries(v).filter(([k])=>accept(k)).map(([k,x])=>[k,clean(x)]));};
    const profileOk=k=>k.length>0&&k.length<=128&&(!ids||ids.includes(k));
    const previous=raw.previous??{};if(!object(previous)||Object.keys(previous).length>103)throw Error('Некорректная история оформления');
    const presets=raw.presets??[];if(!Array.isArray(presets)||presets.length>30)throw Error('Максимум 30 пресетов');
    const names=new Set();
    const normalized=presets.map(p=>{if(!object(p)||typeof p.name!=='string'||!p.name.trim()||p.name.trim().length>60)throw Error('Некорректное имя пресета');const name=p.name.trim();if(names.has(name))throw Error('Повторяющийся пресет');names.add(name);return {name,settings:clean(p.settings)};});
    return {schemaVersion:1,global:clean(raw.global),sites:map(raw.sites,k=>hosts.includes(k)),profiles:map(raw.profiles,profileOk),presets:normalized,previous:Object.fromEntries(Object.entries(previous).filter(([k])=>scopeValid(k)&&(!k.startsWith('profile:')||profileOk(k.slice(8)))).map(([k,v])=>[k,v===null?null:clean(v)]))};
  }
  function resolve(raw,host,id){const c=config(raw);return (id&&Object.hasOwn(c.profiles,id)?c.profiles[id]:null)||(Object.hasOwn(c.sites,host)?c.sites[host]:null)||c.global;}
  function scopeValue(c,scope){if(!scopeValid(scope))throw Error('Неизвестная область');return scope==='global'?c.global:scope.startsWith('profile:')?Object.hasOwn(c.profiles,scope.slice(8))?c.profiles[scope.slice(8)]:null:Object.hasOwn(c.sites,scope)?c.sites[scope]:null;}
  function update(raw,scope,value){const c=config(raw),old=scopeValue(c,scope);const next=value===null?(scope==='global'?clean():null):clean(value);c.previous={...c.previous,[scope]:old};if(scope==='global')c.global=next;else{const target=scope.startsWith('profile:')?'profiles':'sites',key=target==='profiles'?scope.slice(8):scope;c[target]=Object.fromEntries([...Object.entries(c[target]).filter(([k])=>k!==key),...(next===null?[]:[[key,next]])]);}return config(c);}
  function undo(raw,scope){const c=config(raw);if(!Object.hasOwn(c.previous,scope))throw Error('Нет изменений для отмены');return update(c,scope,c.previous[scope]);}
  function savePreset(raw,name,value){const c=config(raw);name=String(name).trim();c.presets=[...c.presets.filter(p=>p.name!==name),{name,settings:clean(value)}];return config(c);}
  function deletePreset(raw,name){const c=config(raw);c.presets=c.presets.filter(p=>p.name!==name);return c;}
  function exportPreset(settings){return JSON.stringify({format:'majestic-forum-theme',schemaVersion:1,settings:clean(settings)},null,2);}
  function importPreset(text){if(typeof text!=='string'||text.length>32768)throw Error('Файл темы слишком большой');const p=JSON.parse(text);if(!object(p)||p.format!=='majestic-forum-theme'||p.schemaVersion!==1||!object(p.settings))throw Error('Неподдерживаемый файл темы');return clean(p.settings);}
  function colors(settings,dark=false){const s=clean(settings);return s.theme==='custom'?s.palette:s.theme==='system'?themes[dark?'dark':'light']:themes[s.theme];}
  function contrast(a,b){const lum=x=>{const v=x.slice(1).match(/../g).map(y=>parseInt(y,16)/255).map(y=>y<=.04045?y/12.92:((y+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};const l=[lum(a),lum(b)].sort((x,y)=>y-x);return (l[0]+.05)/(l[1]+.05);}
  globalThis.MTForumCustomization=Object.freeze({defaults,themes,paletteKeys,enums,clean,config,resolve,scopeValue,update,undo,savePreset,deletePreset,exportPreset,importPreset,colors,contrast});
})();
