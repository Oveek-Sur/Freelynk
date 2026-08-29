import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db, MEDIA_BUCKET } from "@/lib/db";
import { currentAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Admin-only image upload into the public `media` bucket.
 *
 * The bucket is public for READ so the phone can load images with no key.
 * Writing goes through here, behind the admin session — the service_role
 * key never leaves the server.
 */
export async function POST(req: Request) {
  if (!(await currentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const folderRaw = String(form?.get("folder") ?? "misc");
  const folder = ["banners", "shops"].includes(folderRaw) ? folderRaw : "misc";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "কোনো ফাইল পাওয়া যায়নি।" }, { status: 400 });
  }

  const ext = EXT[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "শুধু JPG, PNG, WEBP বা GIF ছবি আপলোড করা যাবে।" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "ছবির সাইজ ৫ MB এর বেশি হতে পারবে না।" },
      { status: 400 },
    );
  }

  const path = `${folder}/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error } = await db()
    .storage.from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = db().storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path }, { status: 201 });
}
