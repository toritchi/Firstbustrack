import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, requestId } from '../src/middleware/security.js';

test('rate limiter rejects requests beyond configured maximum', async () => {
  const limiter=rateLimit({windowMs:1000,max:1,keyPrefix:'test'});
  const req={ip:'127.0.0.1',get:()=>undefined};
  const headers=new Map();
  const res={setHeader:(k,v)=>headers.set(k,v),status(code){this.statusCode=code;return this;},json(v){this.body=v;}};
  let called=0;
  limiter(req,res,()=>called++);
  limiter(req,res,()=>called++);
  assert.equal(called,1);
  assert.equal(res.statusCode,429);
  assert.equal(res.body.error.code,'RATE_LIMITED');
});

test('request id is generated and returned to client', () => {
  const req={get:()=>undefined};
  const headers=new Map();
  const res={setHeader:(k,v)=>headers.set(k,v)};
  let called=0;
  requestId(req,res,()=>called++);
  assert.equal(called,1);
  assert.match(req.requestId,/^[0-9a-f-]{36}$/);
  assert.equal(headers.get('X-Request-ID'),req.requestId);
});
