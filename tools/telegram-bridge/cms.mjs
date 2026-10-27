import {readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {initializeCmsKey} from './cms-client.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
async function workspacePath(value,writing=false){const path=resolve(value||'');const actual=await realpath(writing?dirname(path):path);if(actual!==repo&&!actual.startsWith(repo+'/'))throw Error('Use a file inside this project.');return path;}
async function request(path,options={}){
  const base=process.env.HARBSTONE_CMS_PROXY,token=process.env.HARBSTONE_CMS_SESSION;
  if(!base||!token)throw Error('CMS commands are available only during an authorized bot task.');
  const url=new URL(base);if(url.hostname!=='127.0.0.1'||url.protocol!=='http:')throw Error('Invalid local CMS session.');
  const response=await fetch(base+path,{...options,headers:{...options.headers,Authorization:'Bearer '+token},signal:AbortSignal.timeout(50000)});const data=await response.json();if(!response.ok)throw Error(data.error||'CMS request failed');return data;
}
try{
  const [command,arg]=process.argv.slice(2);
  if(command==='--init'){console.log(await initializeCmsKey());}
  else if(command==='status'){const p=await request('/project');console.log(JSON.stringify({revision:p.revision,pages:p.pages.map(({id,title,slug,status,deletedAt})=>({id,title,slug,status,deletedAt})),media:p.media.length}));}
  else if(command==='pull'){const p=await request('/project');await writeFile(await workspacePath(arg,true),JSON.stringify(p,null,2),{mode:0o600});console.log('Project downloaded. Revision '+p.revision);}
  else if(command==='save'){const p=JSON.parse(await readFile(await workspacePath(arg),'utf8'));const saved=await request('/project',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});await writeFile(arg,JSON.stringify(saved,null,2),{mode:0o600});console.log('Draft/settings saved. Revision '+saved.revision);}
  else if(command==='publish'){const p=await request('/project');if(!p.pages.some(p=>p.id===arg&&!p.deletedAt))throw Error('Choose an active page ID.');const saved=await request('/project?publish='+encodeURIComponent(arg),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});console.log(JSON.stringify({published:saved.pages.find(p=>p.id===arg)?.published?.slug,revision:saved.revision}));}
  else if(command==='upload'){
    const path=await workspacePath(arg);let mime={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.gif':'image/gif','.svg':'image/svg+xml'}[extname(path).toLowerCase()];if(!mime)throw Error('Choose a supported image.');let bytes=await readFile(path),name=path.split('/').at(-1);if(bytes.length>10*1024*1024)throw Error('Choose an image under 10 MB.');
    // Leave room below Vercel's function request limit, including multipart headers.
    if(bytes.length>3*1024*1024&&mime!=='image/svg+xml'){const sharp=createRequire(resolve(repo,'admin/package.json'))('sharp');bytes=await sharp(bytes,{limitInputPixels:40000000}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();mime='image/webp';name=name.replace(/\.[^.]+$/,'.webp');}
    if(bytes.length>3.5*1024*1024)throw Error('Image is too large for upload. Use a smaller image.');
    const form=new FormData();form.append('file',new Blob([bytes],{type:mime}),name);const saved=await request('/media',{method:'POST',body:form});console.log(JSON.stringify(saved.asset));
  }
  else throw Error('Commands: status | pull <project.json> | save <project.json> | publish <page-id> | upload <image-file>');
}catch(error){console.error(error.message);process.exitCode=1;}
