export function getClientIp(req) {
  // Works with helmet behind proxies if trust proxy is enabled
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) {
    // x-forwarded-for can be a list: client, proxy1, proxy2
    return xff.split(',')[0].trim();
  }
  return req.ip || null;
}

export function getActor(req) {
  return req.user?.id || null;
}

