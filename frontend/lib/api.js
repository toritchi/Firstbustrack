const BASE=process.env.NEXT_PUBLIC_API_BASE_URL||'http://localhost:3000';
const DEFAULT_TIMEOUT=Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS||10000);

export class ApiError extends Error{
  constructor(message,status=0,code='REQUEST_FAILED',details=null){super(message);this.name='ApiError';this.status=status;this.code=code;this.details=details;}
}
function token(){if(typeof window==='undefined')return null;return localStorage.getItem('passenger_token')||localStorage.getItem('admin_token')||null;}
export function clearAuth(){if(typeof window!=='undefined'){localStorage.removeItem('passenger_token');localStorage.removeItem('admin_token');}}
export async function api(path,options={}){
  const controller=new AbortController();
  const timeout=options.timeoutMs??DEFAULT_TIMEOUT;
  const timer=setTimeout(()=>controller.abort(),timeout);
  const t=token();
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(t)headers.Authorization=`Bearer ${t}`;
  try{
    const res=await fetch(`${BASE}${path}`,{...options,headers,signal:options.signal||controller.signal});
    let body=null; try{body=await res.json()}catch{}
    if(!res.ok){
      if(res.status===401 && typeof window!=='undefined') window.dispatchEvent(new CustomEvent('bus-auth-expired'));
      throw new ApiError(body?.error?.message||body?.message||`Request failed (${res.status})`,res.status,body?.error?.code||'REQUEST_FAILED',body?.error?.details||null);
    }
    return body?.data??body;
  }catch(e){
    if(e.name==='AbortError') throw new ApiError('Request timed out. Please check your connection and try again.',408,'REQUEST_TIMEOUT');
    if(e instanceof ApiError)throw e;
    throw new ApiError(e.message||'Network request failed',0,'NETWORK_ERROR');
  }finally{clearTimeout(timer)}
}
export function apiBase(){return BASE}
export function wsBase(){return BASE.replace(/^http/,'ws')}
export function authToken(){return token()}
