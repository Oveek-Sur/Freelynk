import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { db, type Banner, type Shop, type WifiNetwork } from "@/lib/db";
import AdminShell from "./AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");

  let networks: WifiNetwork[] = [];
  let banners: Banner[] = [];
  let shops: Shop[] = [];
  let loadError: string | null = null;

  try {
    const [networksRes, bannersRes, shopsRes] = await Promise.all([
      db()
        .from("networks")
        .select("*")
        .order("priority", { ascending: false })
        .order("name", { ascending: true }),
      db()
        .from("banners")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
      db()
        .from("shops")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    const failure = networksRes.error ?? bannersRes.error ?? shopsRes.error;
    if (failure) throw new Error(failure.message);

    networks = (networksRes.data ?? []) as WifiNetwork[];
    banners = (bannersRes.data ?? []) as Banner[];
    shops = (shopsRes.data ?? []) as Shop[];
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "ডেটাবেস থেকে ডেটা আনা যায়নি।";
  }

  return (
    <AdminShell
      admin={admin}
      networks={networks}
      banners={banners}
      shops={shops}
      loadError={loadError}
    />
  );
}
