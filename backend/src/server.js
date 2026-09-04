import http from 'node:http';
import { WebSocketServer } from 'ws';
import app from './app.js';
import { env } from './config/env.js';
import { initLiveStore, closeLiveStore } from './services/liveStore.js';
import { startMqtt } from './services/mqtt.js';
import { pool } from './database/db.js';
import { evaluateOperationalAlerts } from './modules/operationsAlerts.js';

const server=http.createServer(app);
const wss=new WebSocketServer({server,path:'/ws/live'});
const clients=new Set();
wss.on('connection',ws=>{clients.add(ws); ws.on('close',()=>clients.delete(ws)); ws.on('error',()=>clients.delete(ws));});

async function shutdown(signal){
  console.log(`${signal}: shutting down`);
  for(const ws of clients) ws.close(1001,'Server shutting down');
  wss.close();
  server.close(async()=>{
    await closeLiveStore().catch(()=>{});
    await pool.end().catch(()=>{});
    process.exit(0);
  });
  setTimeout(()=>process.exit(1),10000).unref();
}

async function main(){
  await initLiveStore(env.REDIS_URL);
  await pool.query('SELECT 1');
  startMqtt({url:env.MQTT_URL,username:env.MQTT_USERNAME,password:env.MQTT_PASSWORD,onPosition:p=>{
    const msg=JSON.stringify({type:'bus.position',data:p});
    for(const ws of clients) if(ws.readyState===1) ws.send(msg);
  }});
  server.listen(env.PORT,()=>console.log(`API listening on :${env.PORT}`));
  const alertTimer=setInterval(()=>evaluateOperationalAlerts().catch(e=>console.error('Operational alert evaluation:',e.message)),30000);
  alertTimer.unref();
}
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
main().catch(e=>{console.error(e);process.exit(1)});
