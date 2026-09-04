import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

const ticketType=z.enum(['SINGLE','RETURN','DAILY','WEEKLY','MONTHLY','STUDENT','EMPLOYEE']);
const offer=z.object({name:z.string().min(1),ticketType,priceDzd:z.number().nonnegative(),validFrom:z.string().datetime({offset:true})}).strict();
const validate=z.object({qrToken:z.string().min(16),validationType:z.enum(['BOARD','EXIT'])}).strict();

test('ticket offer schema accepts approved ticket types',()=>{
  for(const ticketTypeValue of ['SINGLE','RETURN','DAILY','WEEKLY','MONTHLY','STUDENT','EMPLOYEE']) assert.doesNotThrow(()=>offer.parse({name:'Test',ticketType:ticketTypeValue,priceDzd:50,validFrom:new Date().toISOString()}));
});
test('ticket validation requires QR token and BOARD/EXIT type',()=>{
  assert.doesNotThrow(()=>validate.parse({qrToken:'1234567890123456',validationType:'BOARD'}));
  assert.throws(()=>validate.parse({qrToken:'short',validationType:'BOARD'}));
});
