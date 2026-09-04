import { createClient } from 'redis';

let client=null;
export async function initLiveStore(url) {
  client=createClient({url});
  client.on('error',e=>console.error('Redis error',e.message));
  await client.connect();
}
export async function setBusPosition(position) {
  if(!client) return;
  await client.set(`bus:live:${position.busId}`,JSON.stringify(position),{EX:120});
}
export async function getBusPosition(busId) {
  if(!client) return null;
  const v=await client.get(`bus:live:${busId}`); return v?JSON.parse(v):null;
}
export async function pingLiveStore(){ if(!client) throw new Error('Redis not initialized'); return client.ping(); }
export async function closeLiveStore(){ if(client) await client.quit(); }
