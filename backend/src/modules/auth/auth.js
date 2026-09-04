import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../../database/db.js';
import { env } from '../../config/env.js';
export const loginSchema=z.object({username:z.string().trim().min(1).max(80),password:z.string().min(1).max(128)});
export async function login(req,res,next){ try { const input=loginSchema.parse(req.body); const r=await query('SELECT id,username,password_hash,role FROM admin_users WHERE username=$1 AND active=true',[input.username]); const u=r.rows[0]; if(!u || !(await bcrypt.compare(input.password,u.password_hash))) return res.status(401).json({success:false,error:{code:'INVALID_CREDENTIALS',message:'Invalid credentials'}}); const token=jwt.sign({sub:u.id},env.JWT_SECRET,{expiresIn:env.JWT_EXPIRES_IN,algorithm:'HS256'}); res.json({success:true,data:{accessToken:token,tokenType:'Bearer',expiresIn:env.JWT_EXPIRES_IN,user:{id:u.id,username:u.username,role:u.role}}}); } catch(e){next(e);} }
