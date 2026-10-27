/** Meterless H-MEM contract-based synthetic subset, implemented in this stack.
 * https://github.com/Meterless/Meterless/tree/main/engines/hmem
 * Durable working memory, provenance, hybrid ranking and append-only trust ledger.
 * No embeddings/model mining, sleep/dreaming, or full conformance claim. */
import {createHash} from 'node:crypto';
import {mkdir,open,readFile,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
export const SYNTHETIC_FACTS=Object.freeze([
 {id:'paper-packaging-001',supplier_id:'SYNTH-PAPER-001',name:'Synthetic Han River Paper',product:'paper packaging',country:'KR'},
 {id:'paper-packaging-002',supplier_id:'SYNTH-PAPER-002',name:'Synthetic Blue Box',product:'recycled paper packaging',country:'KR'},
] as const);
for(const fact of SYNTHETIC_FACTS)Object.freeze(fact);
export type SyntheticFactId=typeof SYNTHETIC_FACTS[number]['id'];
export interface HmemScope{ownerId:string;namespace:'sponsor-demo';projectId:string;runId:string}
export interface SyntheticMemory{
 id:SyntheticFactId;content:string;type:'factual';layer:'working';timestamp:string;lastAccessed:string;accessCount:number;
 tags:string[];domain:'trade/paper';namespace:'sponsor-demo';confidence:number;source:string;
 provenance:{origin:'synthetic_fixture';learnedAt:string;label:string;refs:string[]};entities:string[];relatedTo:string[];derivedFrom:string[];
}
export interface MemoryHit extends SyntheticMemory{score:number;retrievalReason:string;lineage:{source:string;origin:string;refs:string[]}}
interface LedgerEntry{sequence:number;action:'create'|'read';memoryId:string|null;actor:string;timestamp:string;runId:string;previousHash:string;hash:string;details:{queryId?:string;matches?:string[];record?:SyntheticMemory}}
interface Store{version:1;scopeHash:string;memories:SyntheticMemory[];ledger:LedgerEntry[]}
const queues=new Map<string,Promise<unknown>>();
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const exactKeys=(v:object,keys:string[])=>Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const validId=(v:string)=>typeof v==='string'&&/^synthetic-[A-Za-z0-9-]{1,80}$/.test(v);
const tokens=(s:string)=>[...new Set(s.toLowerCase().match(/[a-z0-9]+/g)||[])].slice(0,8);
const overlap=(a:string[],b:string[])=>{const u=new Set([...a,...b]);return u.size?a.filter(t=>b.includes(t)).length/u.size:0;};
const content=(f:typeof SYNTHETIC_FACTS[number])=>`${f.name} (${f.supplier_id}) offers ${f.product} in ${f.country}. Synthetic test data only.`;
export class SyntheticHmem{
 readonly directory:string;private readonly scope:HmemScope;private readonly scopeHash:string;
 constructor(root:string,scope:HmemScope,private signal?:AbortSignal){
  if(!root||!validId(scope.ownerId)||!validId(scope.projectId)||!validId(scope.runId)||scope.namespace!=='sponsor-demo')throw Error('Synthetic H-MEM scope rejected');
  this.scope={...scope};this.scopeHash=hash(JSON.stringify([scope.ownerId,scope.namespace,scope.projectId]));this.directory=join(resolve(root),hash(scope.ownerId).slice(0,24),this.scopeHash.slice(0,24));
 }
 async remember(factId:SyntheticFactId):Promise<SyntheticMemory>{
  const fact=SYNTHETIC_FACTS.find(f=>f.id===factId);if(!fact||typeof factId!=='string')throw Error('Only canonical synthetic fact IDs are accepted; source and provenance are mandatory');
  return this.transaction(store=>{
   const existing=store.memories.find(m=>m.id===factId);if(existing)return clone(existing);const now=new Date().toISOString();
   const record:SyntheticMemory={id:fact.id,content:content(fact),type:'factual',layer:'working',timestamp:now,lastAccessed:now,accessCount:0,tags:['synthetic','paper','packaging'],domain:'trade/paper',namespace:'sponsor-demo',confidence:1,source:`synthetic-catalog:${fact.id}`,provenance:{origin:'synthetic_fixture',learnedAt:now,label:'Exact allowlisted synthetic supplier fixture',refs:[fact.supplier_id]},entities:[fact.supplier_id,'paper packaging','KR'],relatedTo:[],derivedFrom:[]};
   store.memories.push(record);this.append(store,'create',record.id,{record:clone(record)});return clone(record);
  });
 }
 async recall(queryId:'paper-packaging'):Promise<MemoryHit[]>{
  if(queryId!=='paper-packaging')throw Error('Only the canonical synthetic query ID is accepted');
  return this.transaction(store=>{
   const now=new Date().toISOString();const hits=store.memories.map(memory=>{
    const keyword=overlap(tokens('paper packaging'),tokens(memory.content)),tag=overlap(['paper','packaging'],memory.tags),entity=overlap(['paper packaging','KR'],memory.entities),recency=Math.exp(-Math.max(0,Date.parse(now)-Date.parse(memory.lastAccessed))/(14*86400000));
    // Semantic term deliberately zero: do not claim embedding similarity.
    const score=(.20*keyword+.10*tag+.10+.15*entity+.05*.8+.05*recency)*memory.confidence;
    return {...clone(memory),score,retrievalReason:`keyword=${keyword.toFixed(3)};tags=${tag.toFixed(3)};domain=1;entities=${entity.toFixed(3)};layer=working;recency=${recency.toFixed(3)};confidence=${memory.confidence};semantic=disabled`,lineage:{source:memory.source,origin:memory.provenance.origin,refs:[...memory.provenance.refs]}};
   }).filter(m=>m.score>=.35).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,5);
   for(const hit of hits){const memory=store.memories.find(m=>m.id===hit.id)!;memory.lastAccessed=now;memory.accessCount++;}this.append(store,'read',null,{queryId,matches:hits.map(m=>m.id)});return hits;
  });
 }
 async audit():Promise<ReadonlyArray<LedgerEntry>>{return this.transaction(store=>clone(store.ledger),false);}
 private append(store:Store,action:LedgerEntry['action'],memoryId:string|null,details:LedgerEntry['details']){
  const entry={sequence:store.ledger.length+1,action,memoryId,actor:'synthetic-demo',timestamp:new Date().toISOString(),runId:this.scope.runId,previousHash:store.ledger.at(-1)?.hash||'genesis',details};store.ledger.push({...entry,hash:hash(JSON.stringify(entry))});
 }
 private validate(store:Store){
  if(store.version!==1||store.scopeHash!==this.scopeHash||!Array.isArray(store.memories)||!Array.isArray(store.ledger))throw Error('Corrupt H-MEM store; recovery required');
  const ids=new Set<string>();for(const m of store.memories){const f=SYNTHETIC_FACTS.find(f=>f.id===m.id);
   if(!f||!exactKeys(m,['id','content','type','layer','timestamp','lastAccessed','accessCount','tags','domain','namespace','confidence','source','provenance','entities','relatedTo','derivedFrom'])||!m.provenance||!exactKeys(m.provenance,['origin','learnedAt','label','refs'])||ids.has(m.id)||m.content!==content(f)||m.source!==`synthetic-catalog:${f.id}`||m.confidence!==1||m.provenance?.origin!=='synthetic_fixture'||m.provenance?.refs?.join()!==f.supplier_id||m.provenance?.label!=='Exact allowlisted synthetic supplier fixture'||!Number.isFinite(Date.parse(m.provenance.learnedAt))||!Number.isFinite(Date.parse(m.timestamp))||!Number.isFinite(Date.parse(m.lastAccessed))||!Number.isInteger(m.accessCount)||m.accessCount<0||m.domain!=='trade/paper'||m.namespace!=='sponsor-demo'||m.layer!=='working'||m.type!=='factual'||JSON.stringify(m.tags)!==JSON.stringify(['synthetic','paper','packaging'])||JSON.stringify(m.entities)!==JSON.stringify([f.supplier_id,'paper packaging','KR'])||m.relatedTo?.length!==0||m.derivedFrom?.length!==0)throw Error('Corrupt H-MEM record; mandatory source/provenance or canonical fixture invalid');ids.add(m.id);
  }
  let previousHash='genesis';for(const [i,entry]of store.ledger.entries()){const {hash:digest,...unsigned}=entry;if(entry.sequence!==i+1||entry.previousHash!==previousHash||!['create','read'].includes(entry.action)||!validId(entry.runId)||hash(JSON.stringify(unsigned))!==digest)throw Error('Corrupt H-MEM trust ledger; recovery required');previousHash=digest;}
  for(const m of store.memories)if(!store.ledger.some(e=>e.action==='create'&&e.memoryId===m.id))throw Error('Memory has no creation lineage');
 }
 /** Each fsynced newline is a committed journal frame. A partial final frame is
  * rejected, never silently repaired. Snapshot+ledger commit together without
  * in-place overwrite or rename. Lock ownership serializes cross-process writers. */
 private transaction<T>(fn:(store:Store)=>T,persist=true):Promise<T>{
  const previous=queues.get(this.directory)||Promise.resolve();const operation=previous.catch(()=>undefined).then(async()=>{
   if(this.signal?.aborted)throw Error('Synthetic memory cancelled');
   await mkdir(this.directory,{recursive:true,mode:0o700});
   const lockPath=join(this.directory,'store.lock');
   const lock=await open(lockPath,'wx',0o600).catch(()=>{throw Error('H-MEM store locked; fail closed, manual recovery may be required');});
   try{
    const path=join(this.directory,'journal.jsonl');let raw='';
    try{raw=await readFile(path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(raw&&!raw.endsWith('\n'))throw Error('Corrupt H-MEM journal: incomplete commit; manual recovery required');
    let store:Store={version:1,scopeHash:this.scopeHash,memories:[],ledger:[]},previousHash='genesis',sequence=0;
    for(const line of raw.split('\n').filter(Boolean)){
     let frame:{sequence:number;previousHash:string;snapshot:Store;hash:string};
     try{frame=JSON.parse(line);}catch{throw Error('Corrupt H-MEM JSON journal; recovery required');}
     this.validate(frame.snapshot);
     const {hash:digest,...unsigned}=frame;
     if(!exactKeys(frame,['sequence','previousHash','snapshot','hash'])||frame.sequence!==sequence+1||frame.previousHash!==previousHash||hash(JSON.stringify(unsigned))!==digest||JSON.stringify(frame.snapshot.ledger.slice(0,store.ledger.length))!==JSON.stringify(store.ledger))throw Error('Corrupt H-MEM journal chain; recovery required');
     store=frame.snapshot;previousHash=digest;sequence++;
    }
    const ledgerPrefix=JSON.stringify(store.ledger);const ledgerLength=store.ledger.length;
    if(this.signal?.aborted)throw Error('Synthetic memory cancelled');
    const result=fn(store);
    if(persist){
     this.validate(store);
     if(JSON.stringify(store.ledger.slice(0,ledgerLength))!==ledgerPrefix)throw Error('H-MEM ledger must remain append-only');
     const unsigned={sequence:sequence+1,previousHash,snapshot:store};
     const frame={...unsigned,hash:hash(JSON.stringify(unsigned))};
     const file=await open(path,'a',0o600);
     try{if(this.signal?.aborted)throw Error('Synthetic memory cancelled');await file.writeFile(JSON.stringify(frame)+'\n');await file.sync();}finally{await file.close();}
    }
    return result;
   }finally{await lock.close();await unlink(lockPath);}
  });queues.set(this.directory,operation);void operation.finally(()=>{if(queues.get(this.directory)===operation)queues.delete(this.directory);}).catch(()=>undefined);return operation;
 }
}
