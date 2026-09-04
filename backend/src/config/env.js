import 'dotenv/config';
import { z } from 'zod';
const schema=z.object({NODE_ENV:z.enum(['development','test','production']).default('development'),ALLOWED_ORIGINS:z.string().default(''),PORT:z.coerce.number().int().positive().default(3000),DATABASE_URL:z.string().min(1),JWT_SECRET:z.string().min(32),JWT_EXPIRES_IN:z.string().default('8h'),DB_POOL_MAX:z.coerce.number().int().positive().max(50).default(10),REDIS_URL:z.string().default('redis://localhost:6379'),MQTT_URL:z.string().default('mqtt://localhost:1883'),MQTT_USERNAME:z.string().optional(),MQTT_PASSWORD:z.string().optional(),PAYMENT_WEBHOOK_SECRET:z.string().min(32).optional()});
const parsed=schema.safeParse(process.env);
if(!parsed.success) throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
if(parsed.data.NODE_ENV==='production' && !parsed.data.PAYMENT_WEBHOOK_SECRET) throw new Error('PAYMENT_WEBHOOK_SECRET is required in production');
export const env=parsed.data;
