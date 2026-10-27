import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  authenticated,
  admin,
  checked,
  ownedAccount,
  ownedProject,
  limit,
} from "@/lib/db";
import {
  assertOrigin,
  jsonBody,
  errorResponse,
  AppError,
  address,
} from "@/lib/security";
import {
  imapClient,
  smtpClient,
  saveCredential,
  preset,
} from "@/lib/providers";
import { syncAccount } from "@/lib/mail-sync";
import { prepareSend, confirmSend } from "@/lib/send";
import { classify, generateBrief } from "@/lib/ai";
import {refreshAutomaticBrief} from '@/lib/auto-brief';
import { originalCc } from "@/lib/reply-cc";
import { replyDraft } from "@/lib/reply-policy";
import { suggestedReply } from "@/lib/reply";
import { source } from "@/lib/sourcing";
import { safeUrl } from "@/lib/security";
import { mailConnectionError } from "@/lib/mail-connection-error";
import { aiReady } from "@/lib/openai";
import { exportDesktop } from '@/lib/desktop-export';
import { customMailSchema } from '@/lib/custom-mail';
export const runtime = "nodejs";
export const maxDuration = 180;
const uuid = z.uuid(),
  visibility = z.enum(["Private", "Project Shared", "Company", "Restricted"]);
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const { user, client } = await authenticated();
    await limit(user.id, "action", 60);
    const body = await jsonBody(req),
      db = admin();
    let result: unknown = { ok: true };
    switch (body.action) {
      case "connectImap": {
        await limit(user.id, "connect", 5);
        const p = z
          .object({
            provider: z.enum(["naver", "daum", "yahoo", "custom"]),
            custom: customMailSchema.optional(),
            email: address,
            password: z.string().min(1).max(500),
          })
          .parse(body);
        p.email = p.email.toLowerCase();
        if (p.provider === 'custom') {
          const existing = checked(await db.from('mail_accounts').select('id').eq('owner_id', user.id).eq('email',p.email).maybeSingle());
          if (existing.data) throw new AppError('이미 연결된 메일입니다. 서버를 변경하려면 기존 연결을 먼저 해제해 주세요.');
        }
        if (p.provider === 'custom') customMailSchema.parse(p.custom);
        else preset(p.provider, p.email);
        const a = {
          id: randomUUID(),
          owner_id: user.id,
          email: p.email,
          provider: p.provider,
          ai_enabled: false,
          backfill_cursor: null,
        };
        const imap = await imapClient(a, p.password, p.custom);
        try {
          await imap.connect();
        } catch (error) {
          imap.close();
          throw mailConnectionError(error, "IMAP");
        } finally {
          imap.close();
        }
        const smtp = await smtpClient(a, p.password, p.custom);
        try {
          await smtp.verify();
        } catch (error) {
          throw mailConnectionError(error, "SMTP");
        } finally {
          smtp.close();
        }
        const accountRow = { owner_id: user.id, email: p.email, provider: p.provider };
        const write = p.provider === 'custom'
          ? db.from('mail_accounts').insert(accountRow)
          : db.from('mail_accounts').upsert(accountRow, {onConflict:'owner_id,email'});
        const saved = await write.select('*').single();
        if (saved.error?.code === '23505') throw new AppError('이미 연결된 메일입니다. 목록을 새로고침해 주세요.',409);
        const { data } = checked(saved);
        await saveCredential(data, { password: p.password, ...(p.provider === 'custom' ? { custom: p.custom } : {}) });
        break;
      }
      case "sync": {
        const account = await ownedAccount(uuid.parse(body.accountId), user.id);
        await limit(user.id, "sync", 10);
        const previous=new Map<string,unknown>();
        if(account.ai_enabled&&account.automation_enabled){
          const snapshots=checked(await db.from('projects').select('id,brief').eq('owner_id',user.id).eq('visibility','Private')).data||[];
          snapshots.forEach(p=>{if(p.brief)previous.set(p.id,p.brief);});
        }
        result = await syncAccount(account, body.backfill === true);
        if (
          account.ai_enabled &&
          account.automation_enabled && aiReady()
        ) {
          try {
            await classify(account, true);
            try{
              const brief=await refreshAutomaticBrief(user.id,account.id,previous);
              result={...(result as object),automaticBrief:brief};
            }catch{
              result={...(result as object),aiWarning:'메일 분류는 완료했지만 프로젝트 자동 요약은 대기 중입니다. AI 사용량·계정 설정을 확인해 주세요.'};
            }
          } catch {
            result = {
              ...(result as object),
              aiWarning: "메일은 가져왔지만 AI 분류는 완료하지 못했습니다.",
            };
          }
        }
        break;
      }
      case "classify": {
        result = await classify(
          await ownedAccount(uuid.parse(body.accountId), user.id),
        );
        break;
      }
      case "disconnect": {
        const a = await ownedAccount(uuid.parse(body.accountId), user.id);
        const refs =
          checked(
            await db
              .from("messages")
              .select("project_id")
              .eq("account_id", a.id),
          ).data || [];
        const ids = [...new Set(refs.map((r) => r.project_id).filter(Boolean))];
        if (ids.length)
          checked(
            await db.from("projects").update({ brief: null }).in("id", ids),
          );
        checked(
          await db
            .from("mail_accounts")
            .delete()
            .eq("id", a.id)
            .eq("owner_id", user.id),
        );
        break;
      }
      case "replyDraft": {
        const message = checked(await db.from("messages").select("*").eq("id", uuid.parse(body.messageId)).eq("owner_id", user.id).maybeSingle()).data;
        if (!message) throw new AppError("본인 메일만 답장할 수 있습니다.", 403);
        const account = await ownedAccount(message.account_id, user.id);
        const own = checked(await db.from("mail_accounts").select("email").eq("owner_id", user.id)).data || [];
        const cc = await originalCc(account, message.provider_id, message.sender, own.map(a=>a.email));
        result = { draft: { ...replyDraft(message, ""), cc } };
        break;
      }
      case "replySuggestion": {
        result = await suggestedReply(user.id, uuid.parse(body.messageId), body.accept === true, body.accept === true ? z.string().max(6000).parse(body.expectedBody) : undefined, body.accept === true ? z.number().int().nonnegative().parse(body.expectedVersion) : undefined, body.cachedOnly === true, body.accept === true ? z.string().trim().min(1).max(20000).parse(body.editedBody) : undefined);
        break;
      }
      case "accountAutomation": {
        const a = await ownedAccount(uuid.parse(body.accountId), user.id);
        if (!a.ai_enabled) throw new AppError("외부 AI 처리를 먼저 허용해 주세요.", 403);
        checked(await db.from("mail_accounts").update({ automation_enabled: z.boolean().parse(body.enabled) }).eq("id", a.id));
        break;
      }
      case "accountAi": {
        const a = await ownedAccount(uuid.parse(body.accountId), user.id);
        checked(
          await db
            .from("mail_accounts")
            .update({ ai_enabled: z.boolean().parse(body.enabled), ...(body.enabled ? {} : { automation_enabled: false }) })
            .eq("id", a.id),
        );
        break;
      }
      case "assign": {
        const id = uuid.parse(body.messageId),
          pid = body.projectId === null ? null : uuid.parse(body.projectId);
        const m = checked(
          await db
            .from("messages")
            .select("id,project_id")
            .eq("id", id)
            .eq("owner_id", user.id)
            .single(),
        ).data;
        if (!m) throw new AppError("메일 소유자만 분류할 수 있습니다.", 403);
        if (pid) await ownedProject(pid, user.id);
        if (m.project_id)
          checked(
            await db
              .from("projects")
              .update({ brief: null })
              .eq("id", m.project_id),
          );
        checked(
          await db
            .from("messages")
            .update({ project_id: pid })
            .eq("id", id)
            .eq("owner_id", user.id),
        );
        break;
      }
      case "createProject": {
        const p = z
          .object({
            name: z.string().trim().min(1).max(120),
            product: z.string().max(200),
            visibility,
          })
          .parse(body);
        let companyId = null;
        if (p.visibility === "Company") {
          const membership = checked(
            await client
              .from("company_members")
              .select("company_id")
              .limit(1)
              .maybeSingle(),
          ).data;
          if (!membership)
            throw new AppError(
              "회사 소속 등록 후 Company 범위를 사용할 수 있습니다.",
            );
          companyId = membership.company_id;
        }
        const { data } = checked(
          await db
            .from("projects")
            .insert({ ...p, owner_id: user.id, company_id: companyId })
            .select("id")
            .single(),
        );
        result = data;
        break;
      }
      case "updateProject": {
        const p = await ownedProject(uuid.parse(body.projectId), user.id),
          v = visibility.parse(body.visibility);
        let companyId = p.company_id;
        if (v === "Company" && !companyId) {
          const membership = checked(
            await client
              .from("company_members")
              .select("company_id")
              .limit(1)
              .maybeSingle(),
          ).data;
          if (!membership) throw new AppError("회사 소속 등록이 필요합니다.");
          companyId = membership.company_id;
        }
        checked(
          await db
            .from("projects")
            .update({
              visibility: v,
              company_id: companyId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", p.id),
        );
        break;
      }
      case "projectMember": {
        const p = await ownedProject(uuid.parse(body.projectId), user.id),
          email = address.parse(body.email).toLowerCase();
        const profile = checked(
          await db
            .from("profiles")
            .select("id")
            .eq("email", email)
            .maybeSingle(),
        ).data;
        if (!profile) throw new AppError("등록된 사용자를 찾을 수 없습니다.");
        if (body.remove === true)
          checked(
            await db
              .from("project_members")
              .delete()
              .eq("project_id", p.id)
              .eq("user_id", profile.id),
          );
        else
          checked(
            await db
              .from("project_members")
              .upsert({ project_id: p.id, user_id: profile.id }),
          );
        break;
      }
      case "brief": {
        result = await generateBrief(user.id, uuid.parse(body.projectId));
        break;
      }
      case "source": {
        await limit(user.id, "source", 3);
        result = await source(z.string().trim().min(3).max(500).parse(body.query), user.id);
        break;
      }
      case "saveCandidate": {
        const p = await ownedProject(uuid.parse(body.projectId), user.id),
          c = z
            .object({
              name: z.string().min(1).max(300),
              url: z.string().max(2048),
              description: z.string().max(1500),
            })
            .parse(body.candidate);
        checked(
          await db
            .from("source_candidates")
            .upsert(
              { ...c, url: safeUrl(c.url), project_id: p.id },
              { onConflict: "project_id,url" },
            ),
        );
        break;
      }
      case "prepareSend": {
        result = await prepareSend(user.id, body.draft);
        break;
      }
      case "confirmSend": {
        if (body.approved !== true)
          throw new AppError("이번 발송에 대한 승인이 필요합니다.", 403);
        result = await confirmSend(user.id, uuid.parse(body.intentId));
        break;
      }
      default:
        throw new AppError("지원하지 않는 요청입니다.", 404);
    }
    if(['sync','classify','assign'].includes(String(body.action))) {
      result={...(result as object),desktopExport:await exportDesktop(user.id)};
    }
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
