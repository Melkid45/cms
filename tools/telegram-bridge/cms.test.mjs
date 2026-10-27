import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createCmsSession,signedHeaders} from './cms-client.mjs';
const require=createRequire(new URL('../../admin/package.json',import.meta.url));
const ts=require('typescript');const exports={};new Function('require','exports',ts.transpileModule(readFileSync(new URL('../../admin/src/lib/builder/bot-signature.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,exports);
const {validBotSignature}=exports;
const {privateKey,publicKey}=generateKeyPairSync('ed25519');const encoded=publicKey.export({type:'spki',format:'der'}).toString('base64');
test('signatures bind method, URL, body and expiry; invalid keys cannot authorize',()=>{
  const body=Buffer.from('{"revision":1}');const headers=signedHeaders(privateKey,'PUT','/api/builder/bot?publish=home',body);const input={method:'PUT',path:'/api/builder/bot?publish=home',timestamp:headers['x-harbstone-time'],nonce:headers['x-harbstone-nonce'],signature:headers['x-harbstone-signature'],publicKey:encoded,body};
  assert(validBotSignature(input));for(const change of [{body:Buffer.from('{}')},{method:'GET'},{path:'/api/builder/bot'},{publicKey:'forged'},{signature:'bad'},{nonce:'short'}])assert(!validBotSignature({...input,...change}));assert(!validBotSignature(input,Date.now()+120000));
});
test('temporary local session rejects unauthenticated calls, signs remote writes and records successful publication',async()=>{
  let calls=0;
  const session=await createCmsSession({privateKey,fetchImpl:async(url,options)=>{
    calls++;const parsed=new URL(url),h=options.headers;assert(validBotSignature({method:options.method,path:parsed.pathname+parsed.search,timestamp:h['x-harbstone-time'],nonce:h['x-harbstone-nonce'],signature:h['x-harbstone-signature'],publicKey:encoded,body:options.body||Buffer.alloc(0)}));assert(!h.Authorization);return Response.json({revision:2,pages:[{id:'home',published:{slug:'home'}}]});
  }});
  try{
    assert.equal((await fetch(session.url+'/project')).status,401);assert.equal(calls,0);
    const headers={Authorization:'Bearer '+session.token,'Content-Type':'application/json'};
    assert.equal((await fetch(session.url+'/project?publish=home',{method:'PUT',headers,body:'{"revision":1}'})).status,200);
    assert.deepEqual(session.activity.published,['https://harbstone-admin.vercel.app/site/home']);assert(session.activity.saved);
    assert.equal((await fetch(session.url+'/unknown',{headers})).status,404);
    assert.equal((await fetch(session.url+'/project?redirect=bad',{headers})).status,400);
  }finally{await session.close();}
  await assert.rejects(fetch(session.url+'/project',{headers:{Authorization:'Bearer '+session.token}}));
});
