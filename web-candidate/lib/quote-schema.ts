import {z} from 'zod';
const text=z.string().max(500);
export const quoteLineSchema=z.object({supplier:text,product:text,specification:text,unitPrice:z.number().finite().nonnegative().max(1e12).nullable(),priceRaw:text,currency:z.string().regex(/^(?:[A-Z]{3})?$/),unit:text,quantity:text,moq:text,leadTime:text,incoterm:text,charges:text,validUntil:text,evidenceIds:z.array(z.string().max(160)).min(1).max(10),excerpt:z.string().min(1).max(1200)});
export const quoteResultSchema=z.object({items:z.array(quoteLineSchema).max(20),warnings:z.array(z.string().max(500)).max(20)});
export type QuoteLine=z.infer<typeof quoteLineSchema>;
export type QuoteResult=z.infer<typeof quoteResultSchema>;
export function validEvidence(result:QuoteResult,sources:{id:string;text:string}[]){
 return result.items.every(item=>item.evidenceIds.every(id=>sources.some(s=>s.id===id))&&item.evidenceIds.some(id=>sources.find(s=>s.id===id)?.text.includes(item.excerpt)));
}
export function quoteWon(line:QuoteLine,rates:Record<string,number>):number|null{
 const rate=line.currency==='KRW'?1:rates[line.currency];
 if(line.unitPrice===null||!rate||!Number.isFinite(rate)||rate<=0)return null;
 const value=line.unitPrice*rate;return Number.isFinite(value)?value:null;
}
