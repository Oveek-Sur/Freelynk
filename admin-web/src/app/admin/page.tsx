import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db, type Banner, type Shop, type WifiNetwork } from "@/lib/db";
import AdminShell from "./AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const isAdmin = user.role === "admin";

  let networks: WifiNetwork[] = [];
  let banners: Banner[] = [];
  let shops: Shop[] = [];
  let loadError: string | null = null;

  try {
    // Banners are not a moderator's to see, so they are never fetched for
    // one. Leaving them out of the payload matters more than hiding the
    // tab: anything sent to the browser has effectively been handed over.
    const [networksRes, shopsRes, bannersRes] = await Promise.all([
      db()
        .from("networks")
        .select("*")
        .order("priority", { ascending: false })
        .order("name", { ascending: true }),
      db()
        .from("shops")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      isAdmin
        ? db()
            .from("banners")
            .select("*")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    const failure = networksRes.error ?? shopsRes.error ?? bannersRes.error;
    if (failure) throw new Error(failure.message);

    networks = (networksRes.data ?? []) as WifiNetwork[];
    shops = (shopsRes.data ?? []) as Shop[];
    banners = (bannersRes.data ?? []) as Banner[];
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "ডেটাবেস থেকে ডেটা আনা যায়নি।";
  }

  return (
    <AdminShell
      admin={user.username}
      role={user.role}
      networks={networks}
      banners={banners}
      shops={shops}
      loadError={loadError}
    />
  );
}
