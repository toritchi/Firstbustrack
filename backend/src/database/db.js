import pg from 'pg';
import { env } from '../config/env.js';
const {Pool}=pg;
export const pool=new Pool({connectionString:env.DATABASE_URL,max:env.DB_POOL_MAX,idleTimeoutMillis:30000});
export const query=(text,params)=>pool.query(text,params);
export async function withTransaction(fn){ const client=await pool.connect(); try{await client.query('BEGIN'); const result=await fn(client); await client.query('COMMIT'); return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();} }
