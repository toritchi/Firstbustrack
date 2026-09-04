import {wsBase,authToken} from './api';

export function subscribeLiveBuses(onMessage,{onStatus,onError,reconnectMs=2500}={}){
  let socket=null,closed=false,timer=null;
  const connect=()=>{
    if(closed)return;
    const q=authToken()?`?token=${encodeURIComponent(authToken())}`:'';
    try{socket=new WebSocket(`${wsBase()}/ws/live${q}`)}catch(e){onError?.(e);timer=setTimeout(connect,reconnectMs);return}
    onStatus?.('connecting');
    socket.onopen=()=>onStatus?.('connected');
    socket.onmessage=e=>{try{onMessage?.(JSON.parse(e.data))}catch(err){onError?.(err)}};
    socket.onerror=e=>onError?.(e);
    socket.onclose=()=>{onStatus?.('disconnected');if(!closed)timer=setTimeout(connect,reconnectMs)};
  };
  connect();
  return ()=>{closed=true;clearTimeout(timer);socket?.close()};
}
