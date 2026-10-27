// Explicit owner-run integration check. Creates and removes only its own temporary page.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createCmsSession,ADMIN_SITE} from './cms-client.mjs';
const exec=promisify(execFile),repo=resolve(import.meta.dirname,'../..');
await mkdir(resolve(repo,'.telegram-media'),{recursive:true,mode:0o700});
const dir=await mkdtemp(resolve(repo,'.telegram-media/cms-check-')),file=resolve(dir,'project.json');
const session=await createCmsSession();const env={...process.env,HARBSTONE_CMS_PROXY:session.url,HARBSTONE_CMS_SESSION:session.token};
const command=(...args)=>exec(process.execPath,['tools/telegram-bridge/cms.mjs',...args],{cwd:repo,env,timeout:60000,maxBuffer:1000000});
const pull=async()=>{await command('pull',file);return JSON.parse(await readFile(file,'utf8'));};
const save=async project=>{await writeFile(file,JSON.stringify(project),{mode:0o600});await command('save',file);};
const id=randomUUID(),slug='bot-verification-'+id.slice(0,8);let created=false;
try{
  let p=await pull();const source=p.pages.find(p=>!p.deletedAt&&p.sections.some(s=>s.variant.startsWith('hero-')));assert(source);
  const block=structuredClone(source.sections.find(s=>s.variant.startsWith('hero-')));block.id=randomUUID();
  const defs=JSON.parse(await readFile(resolve(repo,'admin/src/lib/builder/catalog.json'),'utf8'));const heading=defs.find(d=>d.id===block.variant).fields.find(f=>f.role==='Main heading'||f.type==='heading');block.values[heading.key]='Bot connection verified';
  const page={id,title:'Bot integration verification',slug,locale:'en',status:'Draft',updatedAt:'',sections:[block],seo:{title:'Bot integration verification',description:'Temporary deployment check',keywords:'',image:'',noindex:true}};
  p.pages.push(page);await save(p);created=true;assert.equal((await fetch(ADMIN_SITE+'/site/'+slug)).status,404);
  await command('publish',id);let html=await(await fetch(ADMIN_SITE+'/site/'+slug)).text();assert(html.includes('Bot connection verified'));
  p=await pull();p.pages.find(p=>p.id===id).sections[0].values[heading.key]='Private draft verification';await save(p);html=await(await fetch(ADMIN_SITE+'/site/'+slug)).text();assert(!html.includes('Private draft verification'));
  await command('publish',id);html=await(await fetch(ADMIN_SITE+'/site/'+slug)).text();assert(html.includes('Private draft verification'));
  assert(session.activity.saved&&session.activity.published.length===2);
  console.log('Live bot CLI verified: signed access, page creation, draft isolation, publishing and updated public block content.');
}finally{
  try{if(created){const current=await pull();current.pages=current.pages.filter(p=>p.id!==id);await save(current);console.log('Temporary test page removed; client pages preserved.');}}
  finally{await session.close();await rm(dir,{recursive:true,force:true});}
}
