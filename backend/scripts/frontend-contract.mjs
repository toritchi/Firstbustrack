import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const app=fs.readFileSync(path.join(root,'backend/src/app.js'),'utf8');
const spec=JSON.parse(fs.readFileSync(path.join(root,'backend/docs/openapi.json'),'utf8'));
const routeRe=/app\.(get|post|patch|put|delete)\(['"]([^'"]+)/g;
const backend=new Set(); let m; while((m=routeRe.exec(app))) backend.add(m[2]);
const frontend=new Set();
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.js')){const s=fs.readFileSync(p,'utf8');const re=/['"`]((?:\/api\/v1|\/health|\/ready|\/metrics)[^'"`?]*)/g;let x;while((x=re.exec(s)))frontend.add(x[1].replace(/\$\{[^}]+\}/g,'{id}'));}}}
walk(path.join(root,'frontend'));
const normalize=p=>p.replace(/:[^/]+/g,'{id}').replace(/\{[^}]+\}/g,'{id}');
const backendNorm=new Set([...backend].map(normalize));
const specNorm=new Set(Object.keys(spec.paths).map(normalize));
const missing=[...frontend].filter(p=>!p.endsWith('/{id}/{id}')&&!backendNorm.has(normalize(p))&&!specNorm.has(normalize(p))).sort();
const undocumented=[...backend].filter(p=>p.startsWith('/api/')&&!specNorm.has(normalize(p))).sort();
console.log(`Frontend API references: ${frontend.size}`);
console.log(`Backend Express routes: ${backend.size}`);
console.log(`OpenAPI paths: ${Object.keys(spec.paths).length}`);
if(missing.length){console.error('Frontend references not found in backend/OpenAPI:',missing);process.exitCode=1;}
if(undocumented.length){console.error('Backend routes missing from OpenAPI:',undocumented);process.exitCode=1;}
if(!missing.length&&!undocumented.length)console.log('Frontend/backend/OpenAPI contract reference check PASS.');
