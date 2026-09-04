import { ZodError } from 'zod';
export function notFound(req,res){ return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Resource not found'},requestId:req.requestId}); }
export function errorHandler(err,req,res,_next){
  if (res.headersSent) return;
  const requestId=req.requestId;
  if (err instanceof ZodError) return res.status(400).json({success:false,error:{code:'VALIDATION_ERROR',message:'Request validation failed',details:err.issues},requestId});
  const codeStatuses={PAYMENT_NOT_FOUND:404,REFUND_NOT_PENDING:409,INVALID_REFUND_AMOUNT:400,REFUND_NOT_APPROVED:409,AMOUNT_MISMATCH:400,NOT_FOUND:404};
  if (!err.status && err.code && codeStatuses[err.code]) err.status=codeStatuses[err.code];
  if (err.status) return res.status(err.status).json({success:false,error:{code:err.code||'REQUEST_ERROR',message:err.message},requestId});
  if (err.code === '23505') return res.status(409).json({success:false,error:{code:'CONFLICT',message:'A record with the same unique value already exists'},requestId});
  if (err.code === '23503') return res.status(409).json({success:false,error:{code:'REFERENCE_CONFLICT',message:'Referenced record does not exist or cannot be removed'},requestId});
  if (err.code === '23514' || err.code === '22P02' || err.code === '22007' || err.code === '22003') return res.status(400).json({success:false,error:{code:'INVALID_DATA',message:'Request contains invalid data'},requestId});
  console.error({requestId,error:err.message,stack:err.stack});
  return res.status(500).json({success:false,error:{code:'INTERNAL_ERROR',message:'Internal server error'},requestId});
}
