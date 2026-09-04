import crypto from 'node:crypto';

function clientKey(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function requestId(req, res, next) {
  const supplied = req.get('x-request-id');
  const id = supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

export function corsFromConfig(allowedOrigins = []) {
  const allowed = new Set(allowedOrigins.filter(Boolean));
  return (req, res, next) => {
    const origin = req.get('origin');
    if (!origin) return next();
    if (allowed.has('*')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      return res.status(403).json({success:false,error:{code:'CORS_FORBIDDEN',message:'Origin is not allowed'}});
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Validator-Key,X-Payment-Signature,X-Request-ID');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
}

export function rateLimit({windowMs=60_000,max=120,keyPrefix='api'} = {}) {
  const buckets = new Map();
  return (req,res,next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${clientKey(req)}`;
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) b = {count:0,resetAt:now + windowMs};
    b.count += 1;
    buckets.set(key,b);
    if (buckets.size > 10000) {
      for (const [k,v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0,max-b.count)));
    if (b.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((b.resetAt-now)/1000)));
      return res.status(429).json({success:false,error:{code:'RATE_LIMITED',message:'Too many requests'}});
    }
    next();
  };
}

export const authRateLimit = rateLimit({windowMs:60_000,max:20,keyPrefix:'auth'});
export const apiRateLimit = rateLimit({windowMs:60_000,max:300,keyPrefix:'api'});
