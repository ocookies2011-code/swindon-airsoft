import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  try{
    const{imageBase64,mediaType="image/jpeg"}=await req.json();
    if(!imageBase64)return new Response(JSON.stringify({error:"imageBase64 required"}),{status:400,headers:{...CORS,"Content-Type":"application/json"}});
    const apiKey=Deno.env.get("ANTHROPIC_API_KEY");
    if(!apiKey)return new Response(JSON.stringify({error:"ANTHROPIC_API_KEY not set"}),{status:500,headers:{...CORS,"Content-Type":"application/json"}});
    const res=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({
        model:"claude-haiku-4-5-20251001",
        max_tokens:1000,
        messages:[{role:"user",content:[
          {type:"image",source:{type:"base64",media_type:mediaType,data:imageBase64}},
          {type:"text",text:"This is a scanned airsoft waiver form. Extract all the fields and return ONLY a JSON object with these exact keys (use empty string if unreadable):\n{\"name\":\"\",\"dob\":\"\",\"addr1\":\"\",\"addr2\":\"\",\"city\":\"\",\"county\":\"\",\"postcode\":\"\",\"country\":\"United Kingdom\",\"emergencyName\":\"\",\"emergencyPhone\":\"\",\"medical\":\"\",\"isChild\":false,\"guardian\":\"\"}\nReturn ONLY the JSON object, no markdown, no explanation."}
        ]}]
      })
    });
    if(!res.ok){const e=await res.text();return new Response(JSON.stringify({error:`API error ${res.status}`,detail:e}),{status:502,headers:{...CORS,"Content-Type":"application/json"}});}
    const d=await res.json();
    const text=(d.content?.[0]?.text||"").replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
    try{return new Response(JSON.stringify({ok:true,data:JSON.parse(text)}),{status:200,headers:{...CORS,"Content-Type":"application/json"}});}
    catch{return new Response(JSON.stringify({error:"Could not parse response",raw:text}),{status:422,headers:{...CORS,"Content-Type":"application/json"}});}
  }catch(err){
    return new Response(JSON.stringify({error:err.message||"Unexpected error"}),{status:500,headers:{...CORS,"Content-Type":"application/json"}});
  }
});
