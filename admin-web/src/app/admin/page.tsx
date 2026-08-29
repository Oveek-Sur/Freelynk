import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { db, type WifiNetwork } from "@/lib/db";
import NetworkManager from "./NetworkManager";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");

  let initial: WifiNetwork[] = [];
  let loadError: string | null = null;

  try {
    const { data, error } = await db()
      .from("networks")
      .select("*")
      .order("priority", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    initial = (data ?? []) as WifiNetwork[];
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "ডেটাবেস থেকে ডেটা আনা যায়নি।";
  }

  return (
    <NetworkManager admin={admin} initial={initial} loadError={loadError} />
  );
}
