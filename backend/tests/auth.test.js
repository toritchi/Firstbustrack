import test from 'node:test';
import assert from 'node:assert/strict';
import { loginSchema } from '../src/modules/auth/auth.js';
import { createAdminSchema,updateAdminSchema } from '../src/modules/admin/admin.js';

test('login validation rejects empty credentials',()=>{ assert.throws(()=>loginSchema.parse({username:'',password:''})); });
test('admin creation requires strong password length and valid role',()=>{ assert.throws(()=>createAdminSchema.parse({username:'admin',password:'short',role:'SUPER_ADMIN'})); assert.throws(()=>createAdminSchema.parse({username:'admin',password:'a'.repeat(12),role:'BAD'})); });
test('admin update requires at least one supported field',()=>{ assert.throws(()=>updateAdminSchema.parse({})); assert.doesNotThrow(()=>updateAdminSchema.parse({active:false})); });
