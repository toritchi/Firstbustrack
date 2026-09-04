import jwt from 'jsonwebtoken';
import { query } from '../database/db.js';
import { env } from '../config/env.js';
export async function authenticatePassenger(req,res,next){
  try {
    const h=req.headers.authorization||''; if(!h.startsWith('Bearer ')) return res.status(401).json({success:false,error:{code:'AUTH_REQUIRED',message:'Passenger authentication required'}});
    const payload=jwt.verify(h.slice(7),env.JWT_SECRET,{algorithms:['HS256']});
    if(payload.typ!=='PASSENGER' || !payload.sub) return res.status(401).json({success:false,error:{code:'INVALID_TOKEN',message:'Invalid passenger token'}});
    const r=await query('SELECT id,first_name,last_name FROM users WHERE id=$1',[payload.sub]); if(!r.rowCount) return res.status(401).json({success:false,error:{code:'INVALID_TOKEN',message:'Passenger account not found'}});
    req.passenger=r.rows[0]; next();
  } catch { return res.status(401).json({success:false,error:{code:'INVALID_TOKEN',message:'Invalid or expired token'}}); }
}
