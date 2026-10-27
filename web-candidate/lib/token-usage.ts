import { z } from "zod";
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const schema=z.object({input_tokens:count,output_tokens:count,total_tokens:count,input_tokens_details:z.object({cached_tokens:count.optional()}).optional()});
export function reportedTokens(raw:unknown) {
 const parsed=schema.safeParse(raw); if(!parsed.success)return null;
 const u=parsed.data,cached=u.input_tokens_details?.cached_tokens??0;
 if(u.total_tokens!==u.input_tokens+u.output_tokens||cached>u.input_tokens)return null;
 return {input_tokens:u.input_tokens,output_tokens:u.output_tokens,total_tokens:u.total_tokens,cached_tokens:cached};
}
export type UsageReport={id?:string;model?:string;usage?:unknown};
