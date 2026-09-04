import mqtt from 'mqtt';
import { validateTelemetry,resolveDevice,persistTelemetry } from '../modules/tracking/tracking.js';
import { setBusPosition } from './liveStore.js';

let client;
export function startMqtt({url,username,password,onPosition}) {
  client=mqtt.connect(url,{username:username||undefined,password:password||undefined,reconnectPeriod:2000,clean:true});
  client.on('connect',()=>client.subscribe('fleet/+/telemetry',{qos:1}));
  client.on('error',e=>console.error('MQTT error',e.message));
  client.on('message',async(topic,buf)=>{
    try {
      const parts=topic.split('/'); if(parts.length!==3 || parts[0]!=='fleet' || parts[2]!=='telemetry') return;
      const device=await resolveDevice(parts[1]);
      const raw=JSON.parse(buf.toString());
      const data=validateTelemetry(raw);
      const position=await persistTelemetry(device,data);
      await setBusPosition(position);
      onPosition?.(position);
    } catch(e) { console.error('Telemetry rejected:',e.code||e.message); }
  });
  return client;
}
export function stopMqtt(){client?.end(true);}
