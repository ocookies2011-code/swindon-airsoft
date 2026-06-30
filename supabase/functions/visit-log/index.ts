import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const BOT=/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|google|baidu|yandex|duckduck|semrush|ahrefs|petalbot|bytespider/i;
const GEO=(ip:string)=>`http://ip-api.com/json/${ip}?fields=status,countryCode,city,lat,lon`;
function getIp(req:Request, bodyIp?:string|null):string|null{
  // _proxyIp is set by the Vercel api/log.js proxy with the real browser IP
  if(bodyIp&&!isPriv(bodyIp))return bodyIp;
  const h=['cf-connecting-ip','x-real-ip','x-forwarded-for'];
  for(const k of h){const v=req.headers.get(k);if(v){const ip=v.split(',')[0].trim();if(!isPriv(ip))return ip;}}
  return null;
}
function isPriv(ip:string):boolean{return ip==="127.0.0.1"||ip==="::1"||ip.startsWith("10.")||ip.startsWith("192.168.")||/^172\.(1[6-9]|2\d|3[01])\./.test(ip);}

serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  try{
    const body=await req.json();
    const{page,userId,userName,sessionId,referrer,userAgent,action,_proxyIp}=body;

    // Backfill action: stamp user identity onto anonymous session rows (service role bypasses RLS)
    if(action==="backfill"){
      if(!sessionId||!userId)return new Response(JSON.stringify({ok:false,reason:"missing params"}),{headers:{...CORS,"Content-Type":"application/json"}});
      const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const{error}=await sb.from("page_visits").update({user_id:userId,user_name:userName||null}).eq("session_id",sessionId).is("user_id",null);
      if(error)console.error("backfill error:",error.message);
      return new Response(JSON.stringify({ok:!error}),{headers:{...CORS,"Content-Type":"application/json"}});
    }

    if(!sessionId)return new Response(JSON.stringify({ok:false}),{headers:{...CORS,"Content-Type":"application/json"}});
    if(userAgent&&BOT.test(userAgent))return new Response(JSON.stringify({ok:true,bot:true}),{headers:{...CORS,"Content-Type":"application/json"}});
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now=new Date().toISOString();
    const clientIp=getIp(req,_proxyIp||null);

    // Resolve userId: use provided userId, OR look up by IP if anon
    let resolvedUserId=userId||null;
    let resolvedUserName=userName||null;

    // Log IP to profile for logged-in users
    if(resolvedUserId&&clientIp&&!isPriv(clientIp)){
      await sb.from("profiles").update({last_ip:clientIp,last_seen_at:now}).eq("id",resolvedUserId).catch(()=>{});
    }

    // If anon but we have an IP, check if this IP belongs to a known logged-in user
    // This handles the "stays logged in" case where a new session starts before auth loads
    if(!resolvedUserId&&clientIp&&!isPriv(clientIp)){
      // 1. Check if this IP has a recent identified visit (within last hour)
      const{data:recentVisit}=await sb.from("page_visits")
        .select("user_id,user_name")
        .eq("client_ip",clientIp)
        .not("user_id","is",null)
        .gte("last_seen_at",new Date(Date.now()-3600000).toISOString())
        .order("last_seen_at",{ascending:false})
        .limit(1)
        .maybeSingle();
      if(recentVisit?.user_id){
        resolvedUserId=recentVisit.user_id;
        resolvedUserName=recentVisit.user_name;
      } else {
        // 2. Check profiles.last_ip for this IP
        const{data:profile}=await sb.from("profiles")
          .select("id,name")
          .eq("last_ip",clientIp)
          .limit(1)
          .maybeSingle();
        if(profile){resolvedUserId=profile.id;resolvedUserName=profile.name;}
      }
      // Update profile last_seen if we resolved the user
      if(resolvedUserId){
        await sb.from("profiles").update({last_ip:clientIp,last_seen_at:now}).eq("id",resolvedUserId).catch(()=>{});
      }
    }

    const{data:ex}=await sb.from("page_visits").select("id,user_id,visit_count").eq("session_id",sessionId).eq("page",page).maybeSingle();
    let country:string|null=null,city:string|null=null,lat:number|null=null,lon:number|null=null;
    if(!ex){
      const{data:geoRow}=await sb.from("page_visits").select("country,city,lat,lon").eq("session_id",sessionId).not("country","is",null).limit(1).maybeSingle();
      if(geoRow){country=geoRow.country;city=geoRow.city;lat=geoRow.lat;lon=geoRow.lon;}
      else if(clientIp&&!isPriv(clientIp)){
        try{const g=await(await fetch(GEO(clientIp),{signal:AbortSignal.timeout(3000)})).json();if(g.status==="success"){country=g.countryCode;city=g.city;lat=g.lat;lon=g.lon;}}catch{}
      }
    }
    if(ex){
      const u:Record<string,unknown>={last_seen_at:now,visit_count:(ex.visit_count||1)+1};
      if(resolvedUserId&&!ex.user_id){u.user_id=resolvedUserId;u.user_name=resolvedUserName||null;}
      if(clientIp&&!isPriv(clientIp))u.client_ip=clientIp;
      await sb.from("page_visits").update(u).eq("id",ex.id);
    }else{
      const{error}=await sb.from("page_visits").insert({session_id:sessionId,page:page||null,user_id:resolvedUserId||null,user_name:resolvedUserName||null,referrer:referrer||null,user_agent:userAgent||null,country,city,lat,lon,visit_count:1,last_seen_at:now,client_ip:clientIp&&!isPriv(clientIp)?clientIp:null});
      if(error&&!error.message.includes("duplicate")&&!error.message.includes("unique"))console.error("INSERT:",error.message);
    }
    return new Response(JSON.stringify({ok:true}),{headers:{...CORS,"Content-Type":"application/json"}});
  }catch(err){console.error("track-visit:",err);return new Response(JSON.stringify({ok:false}),{headers:{...CORS,"Content-Type":"application/json"}});}
});
