import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, withTransaction } from '../../database/db.js';
import { ok } from '../../utils/response.js';

const roles=['SUPER_ADMIN','OPERATIONS_ADMIN','TICKETING_ADMIN','CUSTOMER_SERVICE_ADMIN','DATA_REPORTING_ADMIN','NOTIFICATION_ADMIN','MARKETING_ADMIN'];
const username=z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._-]+$/);
const password=z.string().min(12).max(128);
export const createAdminSchema=z.object({username,password,role:z.enum(roles),active:z.boolean().optional().default(true)});
export const updateAdminSchema=z.object({role:z.enum(roles).optional(),active:z.boolean().optional(),password:password.optional()}).refine(v=>Object.keys(v).length>0,{message:'At least one field is required'});

function requireSuper(req,res){ if(req.auth.role!=='SUPER_ADMIN'){ res.status(403).json({success:false,error:{code:'FORBIDDEN',message:'Only Super Admin can manage administrators'}}); return false;} return true; }
function safe(row){ return {id:row.id,username:row.username,role:row.role,active:row.active,createdAt:row.created_at}; }

export async function listAdmins(req,res,next){ try { if(!requireSuper(req,res)) return; const r=await query('SELECT id,username,role,active,created_at FROM admin_users ORDER BY created_at ASC'); return ok(res,r.rows.map(safe)); } catch(e){next(e);} }
export async function createAdmin(req,res,next){
  try { if(!requireSuper(req,res)) return; const input=createAdminSchema.parse(req.body); const hash=await bcrypt.hash(input.password,12);
    const row=await withTransaction(async client=>{ const r=await client.query('INSERT INTO admin_users(username,password_hash,role,active) VALUES($1,$2,$3,$4) RETURNING id,username,role,active,created_at',[input.username,hash,input.role,input.active]); const u=r.rows[0]; await client.query('INSERT INTO audit_log(actor_admin_id,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,$4,$5)',[req.auth.id,'CREATE','ADMIN_USER',u.id,JSON.stringify(safe(u))]); return u; });
    return ok(res,safe(row),201);
  } catch(e){next(e);} }
export async function updateAdmin(req,res,next){
  try { if(!requireSuper(req,res)) return; const id=z.string().uuid().parse(req.params.id); const input=updateAdminSchema.parse(req.body); const row=await withTransaction(async client=>{
    const old=await client.query('SELECT id,username,role,active,created_at FROM admin_users WHERE id=$1 FOR UPDATE',[id]); if(!old.rowCount){ const e=new Error('not found'); e.status=404; e.code='ADMIN_NOT_FOUND'; throw e; }
    if(id===req.auth.id && input.active===false) { const e=new Error('cannot deactivate self'); e.status=400; e.code='SELF_DEACTIVATION'; throw e; }
    const fields=[],values=[]; if(input.role!==undefined){fields.push(`role=$${values.length+1}`);values.push(input.role);} if(input.active!==undefined){fields.push(`active=$${values.length+1}`);values.push(input.active);} if(input.password!==undefined){fields.push(`password_hash=$${values.length+1}`);values.push(await bcrypt.hash(input.password,12));}
    values.push(id); const r=await client.query(`UPDATE admin_users SET ${fields.join(', ')} WHERE id=$${values.length} RETURNING id,username,role,active,created_at`,values); const u=r.rows[0];
    await client.query('INSERT INTO audit_log(actor_admin_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)',[req.auth.id,'UPDATE','ADMIN_USER',id,JSON.stringify(safe(old.rows[0])),JSON.stringify(safe(u))]); return u;
  }); return ok(res,safe(row));
  } catch(e){ if(e.status) return res.status(e.status).json({success:false,error:{code:e.code,message:e.message}}); next(e); }
}
export async function getAuditLog(req,res,next){ try { if(!requireSuper(req,res)) return; const r=await query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.before_data,a.after_data,a.created_at,u.username AS actor_username FROM audit_log a LEFT JOIN admin_users u ON u.id=a.actor_admin_id ORDER BY a.created_at DESC LIMIT 500`); return ok(res,r.rows); } catch(e){next(e);} }
