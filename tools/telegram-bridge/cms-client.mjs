import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {createHash,createPrivateKey,createPublicKey,generateKeyPairSync,randomBytes,sign,timingSafeEqual} from 'node:crypto';
export const ADMIN_SITE='https://harbstone-admin.vercel.app';
export const keyPath=resolve(homedir(),'Library/Application Support/Harbstone/telegram/cms-private.pem');
export async function initializeCmsKey(){
  await mkdir(dirname(keyPath),{recursive:true,mode:0o700});
  try{await readFile(keyPath);}catch(error){if(error.code!=='ENOENT')throw error;const {privateKey}=generateKeyPairSync('ed25519');await writeFile(keyPath,privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});}
  return createPublicKey(createPrivateKey(await readFile(keyPath))).export({type:'spki',format:'der'}).toString('base64');
}
export function signedHeaders(privateKey,method,path,body=Buffer.alloc(0),time=Date.now(),nonce=randomBytes(18).toString('base64url')){
  const timestamp=String(time);const message=`${timestamp}\n${nonce}\n${method}\n${path}\n${createHash('sha256').update(body).digest('hex')}`;
  return {'x-harbstone-time':timestamp,'x-harbstone-nonce':nonce,'x-harbstone-signature':sign(null,Buffer.from(message),privateKey).toString('base64')};
}
export async function cmsRequest(method,{query='',body=Buffer.alloc(0),contentType='application/json',privateKey,fetchImpl=fetch,site=ADMIN_SITE}={}){
  const key=privateKey||createPrivateKey(await readFile(keyPath));const path='/api/builder/bot'+query;
  return fetchImpl(site+path,{method,redirect:'error',headers:{...signedHeaders(key,method,path,body),'Content-Type':contentType},body:method==='GET'?undefined:body,signal:AbortSignal.timeout(45000)});
}
export async function createCmsSession({privateKey,fetchImpl=fetch,site=ADMIN_SITE,role='client'}={}){
  const key=privateKey||createPrivateKey(await readFile(keyPath));const token=randomBytes(32).toString('hex');const activity={saved:false,published:[],uploads:0};
  const server=createServer(async(request,response)=>{
    const auth=request.headers.authorization||'';const expected='Bearer '+token;
    if(auth.length!==expected.length||!timingSafeEqual(Buffer.from(auth),Buffer.from(expected))){response.writeHead(401);response.end();return;}
    const url=new URL(request.url,'http://localhost');const method=request.method;
    if(!(['GET','PUT'].includes(method)&&url.pathname==='/project')&&!(method==='POST'&&url.pathname==='/media')){response.writeHead(404);response.end();return;}
    if([...url.searchParams.keys()].some(key=>key!=='publish')){response.writeHead(400);response.end();return;}
    try{
      const chunks=[];let size=0;for await(const part of request){size+=part.length;if(size>12*1024*1024)throw Error('Request too large');chunks.push(part);}
      const query=new URLSearchParams(url.searchParams);query.set('actor',role==='super-admin'?'super-admin':'client');
      const remote=await cmsRequest(method,{privateKey:key,site,fetchImpl,body:Buffer.concat(chunks),contentType:request.headers['content-type']||'application/json',query:'?'+query.toString()});
      const data=await remote.json();
      if(remote.ok&&method==='PUT'){activity.saved=true;const id=url.searchParams.get('publish');const page=data.pages?.find(p=>p.id===id);if(page?.published)activity.published.push(`${site}/site/${page.published.slug}`);}
      if(remote.ok&&method==='POST')activity.uploads++;
      response.writeHead(remote.status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(data));
    }catch{response.writeHead(502,{'Content-Type':'application/json'});response.end(JSON.stringify({error:'CMS operation failed. Read the latest project before retrying a save; an interrupted request may have completed.'}));}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}`,token,activity,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
