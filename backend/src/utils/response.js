export function ok(res, data, status=200){ return res.status(status).json({success:true,data}); }
export function fail(res,status,code,message,details){ const error={code,message}; if(details!==undefined) error.details=details; return res.status(status).json({success:false,error}); }
