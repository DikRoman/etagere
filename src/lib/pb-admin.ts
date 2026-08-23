import PocketBase from "pocketbase";

/** Server-side PocketBase URL (use localhost on VPS; public URL may hairpin-fail). */
export function pbBaseUrl(): string {
  return (
    process.env.POCKETBASE_INTERNAL_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_POCKETBASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8090"
  );
}

export async function authAsAdmin(pb: PocketBase): Promise<void> {
  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const pass = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!email || !pass) {
    throw new Error(
      "Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD",
    );
  }
  try {
    await pb.collection("_superusers").authWithPassword(email, pass);
  } catch {
    await pb.admins.authWithPassword(email, pass);
  }
}

export async function getAdminPb(): Promise<PocketBase> {
  const pb = new PocketBase(pbBaseUrl());
  await authAsAdmin(pb);
  return pb;
}
