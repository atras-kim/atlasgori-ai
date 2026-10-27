import Workspace from "@/components/workspace";
export default function Page() {
  return (
    <Workspace
      configured={Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      )}
    />
  );
}
