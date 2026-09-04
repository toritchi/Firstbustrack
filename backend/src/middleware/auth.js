import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../database/db.js';

export async function authenticate(req,res,next){
  try {
    const header=req.get('authorization') || '';
    const [scheme,token]=header.split(' ');
    if(scheme !== 'Bearer' || !token) return res.status(401).json({success:false,error:{code:'UNAUTHENTICATED',message:'Bearer token required'}});
    const payload=jwt.verify(token,env.JWT_SECRET,{algorithms:['HS256']});
    const r=await query('SELECT id, username, role, active FROM admin_users WHERE id=$1',[payload.sub]);
    const user=r.rows[0];
    if(!user || !user.active) return res.status(401).json({success:false,error:{code:'UNAUTHENTICATED',message:'Administrator account is inactive or unavailable'}});
    req.auth={id:user.id,username:user.username,role:user.role};
    next();
  } catch(e){ return res.status(401).json({success:false,error:{code:'INVALID_TOKEN',message:'Invalid or expired token'}}); }
}
export function authorize(...roles){ return (req,res,next)=> roles.includes(req.auth?.role) ? next() : res.status(403).json({success:false,error:{code:'FORBIDDEN',message:'Insufficient permissions'}}); }
