import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const GOOGLE_EXPORT_PDF = "application/vnd.google-apps.document";

function driveFileId(raw: string | null): string | null {
  const id = raw?.trim() ?? "";
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) return null;
  return id;
}

function bearer(req: NextRequest): string | null {
  const raw = req.headers.get("authorization") || "";
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  return token || null;
}

export async function GET(req: NextRequest) {
  const token = bearer(req);
  const fileId = driveFileId(req.nextUrl.searchParams.get("id"));
  if (!token || !fileId) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (metaRes.status === 401) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (metaRes.status === 403 || metaRes.status === 404) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (!metaRes.ok) {
    return NextResponse.json({ error: "META" }, { status: metaRes.status });
  }

  const meta = (await metaRes.json()) as {
    id?: string;
    name?: string;
    mimeType?: string;
  };
  const mimeType = meta.mimeType || "application/pdf";

  let fileUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  let outType = mimeType;
  if (mimeType === GOOGLE_EXPORT_PDF) {
    fileUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent("application/pdf")}`;
    outType = "application/pdf";
  } else if (mimeType.startsWith("application/vnd.google-apps.")) {
    return NextResponse.json({ error: "UNSUPPORTED_TYPE" }, { status: 415 });
  }

  const fileRes = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (fileRes.status === 401) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (fileRes.status === 403 || fileRes.status === 404) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (!fileRes.ok || !fileRes.body) {
    return NextResponse.json({ error: "DOWNLOAD" }, { status: fileRes.status });
  }

  const name = meta.name || "book.pdf";
  const headers = new Headers();
  headers.set("content-type", fileRes.headers.get("content-type") || outType);
  headers.set("x-file-name", encodeURIComponent(name));
  headers.set("x-mime-type", outType);
  const length = fileRes.headers.get("content-length");
  if (length) headers.set("content-length", length);

  return new NextResponse(fileRes.body, { status: 200, headers });
}
