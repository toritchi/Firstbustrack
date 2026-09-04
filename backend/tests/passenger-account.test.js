import test from 'node:test';
import assert from 'node:assert/strict';
import { passengerPhoneSchema, passengerOtpSchema } from '../src/modules/passenger/account.js';
test('passenger phone accepts E.164',()=>{assert.equal(passengerPhoneSchema.safeParse('+213555123456').success,true);assert.equal(passengerPhoneSchema.safeParse('0555123456').success,false);});
test('passenger OTP requires six digits',()=>{assert.equal(passengerOtpSchema.safeParse('123456').success,true);assert.equal(passengerOtpSchema.safeParse('12345').success,false);});
