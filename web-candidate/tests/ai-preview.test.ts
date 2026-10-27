import test from "node:test";
import assert from "node:assert/strict";
import { previewSelected } from "../lib/ai-preview";
import { openaiJson } from "../lib/openai";
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];
const row = { id: ids[0], owner_id: "owner", subject: "quote", sender: "sender@example.com", body: "test", attachments: "must not transfer" };
const item = { id: ids[0], product: "oil", company: "example", project: "oil", summary: "summary", risks: [], actions: [], reply: null };
test("invalid consent, empty, duplicate and oversized batches never call AI", async () => {
  for (const input of [{messageIds:[ids[0]]}, {consent:false,messageIds:[ids[0]]}, {consent:true,messageIds:[]}, {consent:true,messageIds:ids}, {consent:true,messageIds:[ids[0],ids[0]]}]) {
    await assert.rejects(previewSelected(input,"owner", async()=>{throw Error("should not query");},async()=>{assert.fail("AI called");}));
  }
});
test("missing, foreign or duplicate source rows fail before AI", async () => {
  for (const rows of [[],[{...row,owner_id:"someone-else"}],[{...row,id:ids[1]}],[row,row]]) {
    await assert.rejects(previewSelected({consent:true,messageIds:[ids[0]]},"owner",async()=>rows,async()=>assert.fail("AI called")),/접근/);
  }
});
test("only exact selected evidence is sent and responses must match", async () => {
  let calls=0;
  const result=await previewSelected({consent:true,messageIds:[ids[0]]},"owner",async selected=>{assert.deepEqual(selected,[ids[0]]);return [row];},async(_task,data,schema)=>{
    assert.equal(schema?.additionalProperties,false);assert.ok(schema?.properties);
    calls++; const payload=data as {messages:unknown;responseSchema:unknown}; assert.deepEqual(payload.messages,[{id:row.id,subject:row.subject,sender:row.sender,body:row.body}]);assert.match(_task,/Required JSON Schema/);return {items:[item]};
  });
  assert.equal(calls,1);assert.equal(result.items.length,1);
  for (const items of [[{...item,id:ids[1]}],[item,item],[]]) {
    await assert.rejects(previewSelected({consent:true,messageIds:[ids[0]]},"owner",async()=>[row],async()=>({items})));
  }
});
test("invalid model output is an upstream error, not a user input error", async()=>{
  await assert.rejects(previewSelected({consent:true,messageIds:[ids[0]]},"owner",async()=>[row],async()=>({items:[{...item,product:null}]})),(error:unknown)=>{
    const e=error as {status:number;message:string};assert.equal(e.status,502);assert.match(e.message,/items.0.product/);return true;
  });
});
test("OpenAI request uses no response storage and rejects incomplete output", async () => {
  const originalFetch=globalThis.fetch, originalKey=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY="synthetic-test-key";
  try {
    globalThis.fetch=async(url,init)=>{
      assert.equal(url,"https://api.openai.com/v1/responses");
      const body=JSON.parse(String(init?.body)); assert.equal(body.store,false);assert.equal(body.text.format.type,"json_object");assert.equal(body.tools,undefined);
      return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:'{"ok":true}'}]}]});
    };
    assert.deepEqual(await openaiJson("test",{}),{ok:true});
    globalThis.fetch=async(_url,init)=>{
      const body=JSON.parse(String(init?.body));assert.equal(body.text.format.type,"json_schema");assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.additionalProperties,false);
      return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:'{"ok":true}'}]}]});
    };
    assert.deepEqual(await openaiJson("test",{},undefined,{type:"object",properties:{ok:{type:"boolean"}},required:["ok"],additionalProperties:false}),{ok:true});
    globalThis.fetch=async()=>Response.json({status:"incomplete",output:[]});
    await assert.rejects(openaiJson("test",{}),/완료되지/);
  } finally { globalThis.fetch=originalFetch; if(originalKey===undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY=originalKey; }
});
