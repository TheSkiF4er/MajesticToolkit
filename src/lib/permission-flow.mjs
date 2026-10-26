/** WebExtension optional permission operations must start during a user-activation handler. */
export function changeHostPermission(permissions, origins, granted) {
  if (!permissions?.request || !permissions?.remove || !Array.isArray(origins) ||
      origins.length === 0 || origins.some(x => typeof x !== 'string' || !/^https:\/\/[^/]+\/\*$/.test(x))) {
    throw new Error('Недопустимый запрос разрешения');
  }
  // Do not make this function async. request() MUST be called synchronously.
  return granted ? permissions.remove({origins}) : permissions.request({origins});
}
