const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),webpush=require('web-push');
(async()=>{
 const originalFetch=global.fetch,originalDeno=global.Deno;let config={dispatch_secret:'s'.repeat(72),public_key:null,private_key:null};let jobs=[],acks=[],details=[],sends=0;const ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();
 const device={p256dh:ecdh.getPublicKey().toString('base64url'),auth_key:crypto.randomBytes(16).toString('base64url')};
 global.Deno={env:{get:name=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only-key',SUPABASE_ANON_KEY:'public-key'})[name]},serve(){}};
 global.__pushWebPush={generateVAPIDKeys:()=>webpush.generateVAPIDKeys(),sendNotification:async(subscription,payload,options)=>{sends++;details.push(webpush.generateRequestDetails(subscription,payload,options));return {statusCode:201};}};
 global.fetch=async(url,options={})=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'user'},{status:options.headers.Authorization?.startsWith('Bearer ')?200:401});
  if(url.endsWith('beardash_approval_state'))return Response.json({is_admin:options.headers.Authorization==='Bearer admin-token'});
  assert.equal(options.headers.Authorization,'Bearer server-only-key');const args=JSON.parse(options.body||'{}');
  if(url.endsWith('beardash_push_bootstrap')){if(!config.public_key){config.public_key=args.vapid_public;config.private_key=args.vapid_private;}return Response.json(config.public_key);}
  if(url.endsWith('beardash_push_worker_config'))return Response.json(config);
  if(url.endsWith('beardash_push_claim')){const result=jobs;jobs=[];return Response.json(result);}
  if(url.endsWith('beardash_push_finish')){acks.push(args);return Response.json(null);}
  throw Error('Unexpected server request');
 };
 try{
  const code=fs.readFileSync(path.join(__dirname,'../supabase/functions/beardash-push/index.ts'),'utf8').replace("import webpush from 'npm:web-push@3.6.7';","const webpush=globalThis.__pushWebPush;");
  const {handleRequest}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  const request=(body,headers={})=>new Request('https://project.supabase.co/functions/v1/beardash-push',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await handleRequest(request({action:'initialize'}))).status,401);
  assert.equal((await handleRequest(request({action:'initialize'},{Authorization:'Bearer bear-token'}))).status,403);
  const initialized=await handleRequest(request({action:'initialize'},{Authorization:'Bearer admin-token',Origin:'https://blaframboise.github.io'}));assert.equal(initialized.status,200);const body=await initialized.json();assert.equal(body.public_key,config.public_key);assert.equal('private_key' in body,false);const oldKey=config.public_key;await handleRequest(request({action:'initialize'},{Authorization:'Bearer admin-token'}));assert.equal(config.public_key,oldKey);
  assert.equal((await handleRequest(request({action:'dispatch'}))).status,401);assert.equal((await handleRequest(request({action:'dispatch'},{'x-beardash-push-secret':'x'.repeat(72)}))).status,401);
  jobs=[{id:crypto.randomUUID(),lease_id:crypto.randomUUID(),kind:'member_reply',request_id:crypto.randomUUID(),endpoint:'https://web.push.apple.com/device',...device,attempts:1}];
  const sent=await handleRequest(request({action:'dispatch'},{'x-beardash-push-secret':config.dispatch_secret}));assert.equal(sent.status,200);assert.equal((await sent.json()).sent,1);assert.equal(acks[0].delivered,true);assert.equal(details.length,1);assert.ok(details[0].body.length>40);assert.equal(details[0].headers['Content-Encoding'],'aes128gcm');
  const authorization=details[0].headers.Authorization || details[0].headers.authorization;assert.match(authorization,/^vapid /);const jwt=authorization.match(/t=([^,]+)/)[1];const [header,payload,signature]=jwt.split('.');const claims=JSON.parse(Buffer.from(payload,'base64url'));assert.equal(claims.aud,'https://web.push.apple.com');assert.equal(claims.sub,'mailto:BearDash.support@gmail.com');const point=Buffer.from(config.public_key,'base64url');const key=crypto.createPublicKey({key:{kty:'EC',crv:'P-256',x:point.subarray(1,33).toString('base64url'),y:point.subarray(33).toString('base64url')},format:'jwk'});assert.equal(crypto.verify('sha256',Buffer.from(header+'.'+payload),{key,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')),true);
  const before=sends;jobs=[{id:crypto.randomUUID(),lease_id:crypto.randomUUID(),kind:'new_order',endpoint:'https://127.0.0.1/internal',...device,attempts:1}];await handleRequest(request({action:'dispatch'},{'x-beardash-push-secret':config.dispatch_secret}));assert.equal(sends,before);assert.equal(acks.at(-1).delivered,false);
  const preflight=await handleRequest(new Request('https://project.supabase.co/functions/v1/beardash-push',{method:'OPTIONS',headers:{Origin:'https://blaframboise.github.io'}}));assert.equal(preflight.status,204);assert.equal((await handleRequest(request({action:'initialize'},{Authorization:'Bearer admin-token',Origin:'https://evil.example'}))).status,403);
  console.log('PASS Edge worker: administrator-only initialization, private keys kept server-side, secret-authenticated dispatch, endpoint/SSRF restriction, actual aes128gcm encryption and valid VAPID signature, safe failures, production CORS. No real provider delivery attempted.');
 }finally{global.fetch=originalFetch;global.Deno=originalDeno;delete global.__pushWebPush;}
})().catch(e=>{console.error(e);process.exit(1)});
