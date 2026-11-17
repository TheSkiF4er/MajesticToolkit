// Profile-scoped presentation state. All underlying complaint, rule and sanction
// records remain in their existing, validated stores.
export const CENTER_TABS=Object.freeze(['overview','cases','inbox','registry','analytics']);
export const CENTER_PERIODS=Object.freeze([7,14,30,90]);
export function defaultModerationCenter(){return {tab:'overview',days:7};}
export function cleanModerationCenter(value=defaultModerationCenter()){
 if(!value||typeof value!=='object'||Array.isArray(value)||!CENTER_TABS.includes(value.tab)||!CENTER_PERIODS.includes(value.days))throw Error('Некорректные настройки центра модерации');
 return {tab:value.tab,days:value.days};
}
