// Supabase Edge Function. Configure verify_jwt=false: initialization validates the
// user's JWT and administrator role itself; dispatch requires a private server key.
import webpush from 'npm:web-push@3.6.7';
const ORIGIN='https://blaframboise.github.io';
const PROJECT=Deno.env.get('SUPABASE_URL');
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const PUBLIC_KEY=Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_h1qDQ4i4AQ2KhY3r7tMROA_3ttUMRqW';
const PUSH_HOSTS=new Set(['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com']);
function response(status,body,origin='') {
 return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(origin===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin'}:{})}});
}
async function rpc(name,args={}) {
 const result=await fetch(PROJECT+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
 if(!result.ok)throw new Error('Push database operation failed');
 const text=await result.text();return text?JSON.parse(text):null;
}
function constantTimeMatch(a,b) {
 if(typeof a!=='string'||typeof b!=='string')return false;
 let different=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)different|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return different===0;
}
function validEndpoint(value) {
 try{const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && !u.port && !u.hash && PUSH_HOSTS.has(u.hostname) && value.length<=2048;}catch{return false;}
}
function payload(job) {
 const content={new_order:['New pickup request','Open BearDash to review the new order.'],member_reply:['New member reply','A member replied to a pickup conversation.'],refund_request:['$5 refund requested','Open Refund Requests to review it.'],test:['BearDash notifications are working','You’ll get alerts here for new requests, replies, and refunds.']}[job.kind];
 if(!content)throw new Error('Unsupported notification kind');
 const url=new URL('https://blaframboise.github.io/BearDash/');url.searchParams.set('push_view',job.kind==='refund_request'?'refunds':'bear');
 if(job.request_id && /^[0-9a-f-]{36}$/i.test(job.request_id))url.searchParams.set('push_request',job.request_id);
 return {title:content[0],body:content[1],url:url.href,event_id:job.id};
}
async function sendJob(job,config) {
 let delivered=false,status=0,retry=60;
 try{
  if(!validEndpoint(job.endpoint))throw new Error('Invalid push endpoint');
  const result=await webpush.sendNotification({endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth_key}},JSON.stringify(payload(job)),{
   vapidDetails:{subject:'mailto:BearDash.support@gmail.com',publicKey:config.public_key,privateKey:config.private_key},
   TTL:3600,urgency:'high',timeout:10000
  });
  delivered=true;status=result.statusCode || 201;
 }catch(error){
  status=Number(error?.statusCode)||0;
  console.warn('BearDash push provider did not accept a notification (HTTP '+status+').');
  const retryHeader=Number(error?.headers?.['retry-after']);retry=Number.isFinite(retryHeader)&&retryHeader>0?Math.min(3600,retryHeader):Math.min(3600,60*2**Math.min(job.attempts,5));
 }
 await rpc('beardash_push_finish',{job_id:job.id,job_lease:job.lease_id,delivered,status_code:status,retry_seconds:retry});
 return delivered;
}
export async function handleRequest(request) {
 const origin=request.headers.get('Origin')||'';
 if(request.method==='OPTIONS')return origin===ORIGIN?new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'authorization,apikey,content-type','Vary':'Origin'}}):response(403,{error:'Origin not allowed'});
 if(request.method!=='POST')return response(405,{error:'POST required'},origin);
 if(!PROJECT || !SERVICE_KEY)return response(503,{error:'Server configuration unavailable'},origin);
 let body;try{const text=await request.text();if(text.length>4096)throw Error();body=JSON.parse(text);}catch{return response(400,{error:'Invalid request'},origin);}
 try{
  if(body.action==='initialize'){
   if(origin && origin!==ORIGIN)return response(403,{error:'Origin not allowed'});
   const authorization=request.headers.get('Authorization')||'';
   if(!authorization.startsWith('Bearer '))return response(401,{error:'Sign in required'},origin);
   const auth=await fetch(PROJECT+'/auth/v1/user',{headers:{apikey:PUBLIC_KEY,Authorization:authorization},signal:AbortSignal.timeout(10000)});
   if(!auth.ok)return response(401,{error:'Sign in again'},origin);
   const state=await fetch(PROJECT+'/rest/v1/rpc/beardash_approval_state',{method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:authorization,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
   const permissions=state.ok?await state.json():null;
   if(permissions?.is_admin!==true)return response(403,{error:'Only the administrator can initialize push'},origin);
   const keys=webpush.generateVAPIDKeys();
   const publicKey=await rpc('beardash_push_bootstrap',{vapid_public:keys.publicKey,vapid_private:keys.privateKey});
   return response(200,{configured:true,public_key:publicKey},origin);
  }
  if(body.action!=='dispatch')return response(400,{error:'Unknown action'},origin);
  const incoming=request.headers.get('x-beardash-push-secret')||'';
  if(incoming.length!==72)return response(401,{error:'Unauthorized'});
  const config=await rpc('beardash_push_worker_config');
  if(!config || !constantTimeMatch(incoming,config.dispatch_secret))return response(401,{error:'Unauthorized'});
  if(!config.public_key || !config.private_key)return response(409,{error:'Initialize push first'});
  const jobs=await rpc('beardash_push_claim',{batch_size:20});
  let sent=0,failed=0;
  // Bounded concurrency and a database lease protect against overlapping wakes.
  for(let i=0;i<jobs.length;i+=5){const results=await Promise.allSettled(jobs.slice(i,i+5).map(job=>sendJob(job,config)));for(const result of results){if(result.status==='fulfilled'&&result.value)sent++;else failed++;}}
  return response(200,{processed:jobs.length,sent,failed});
 }catch{
  // Never log keys, subscription URLs, JWTs, or raw provider error objects.
  console.error('BearDash push operation failed; check database setup and function configuration.');
  return response(503,{error:'Push service unavailable. Check the function setup and try again.'},origin);
 }
}
Deno.serve(handleRequest);
