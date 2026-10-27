import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { AppError, env } from "./security";
export async function db() {
  const jar = await cookies();
  return createServerClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          for (const { name, value, options } of values)
            jar.set(name, value, {
              ...options,
              sameSite: "lax",
              secure: process.env.ATLAS_APP_URL?.startsWith("https:"),
            });
        },
      },
    },
  );
}
export function admin() {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function authenticated() {
  const client = await db();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new AppError("로그인이 필요합니다.", 401);
  const member=checked(await admin().from('app_members').select('state').eq('id',user.id).maybeSingle()).data;
  if(!member||member.state!=='active')throw new AppError('이용이 중지되었거나 가입 승인이 필요합니다. 관리자에게 문의해 주세요.',403);
  return { client, user };
}
export async function ownedAccount(id: string, userId: string) {
  const { data, error } = await admin()
    .from("mail_accounts")
    .select("*")
    .eq("id", id)
    .eq("owner_id", userId)
    .single();
  if (error || !data) throw new AppError("계정에 접근할 수 없습니다.", 404);
  return data;
}
export async function ownedProject(id: string, userId: string) {
  const { data, error } = await admin()
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("owner_id", userId)
    .single();
  if (error || !data)
    throw new AppError("프로젝트 소유자만 변경할 수 있습니다.", 403);
  return data;
}
export function checked<T extends { error: unknown }>(result: T): T {
  if (result.error)
    throw new AppError(
      "데이터 저장 또는 조회에 실패했습니다. 설정과 접근 권한을 확인해 주세요.",
      500,
    );
  return result;
}
export async function limit(userId: string, bucket: string, max = 20) {
  const result = await admin().rpc("take_rate_slot", {
    p_user: userId,
    p_bucket: bucket,
    p_max: max,
  });
  if (result.error) throw new AppError("요청 제한 설정을 확인해 주세요.", 503);
  if (!result.data)
    throw new AppError("요청이 많습니다. 잠시 후 다시 시도해 주세요.", 429);
}
