import Workspace from "@/components/workspace";
import Landing from "@/components/landing";
export default async function Page({searchParams}: {searchParams: Promise<Record<string,string|string[]|undefined>>}) {
  const params = await searchParams;
  if (!params.connected && !params.confirmation && !params.code) return <Landing />;
  return (
    <Workspace
      configured={Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      )}
    />
  );
}
