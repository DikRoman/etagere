import type { BookMeta } from "@/lib/types";
import {
  downloadDriveFile,
  isDriveConnected,
  uploadDriveBook,
} from "@/lib/storage/drive";
import {
  type CloudProvider,
  connectedProviders,
  getAccessToken,
} from "./session";

export function bookFileName(book: BookMeta): string {
  const base =
    book.title
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "book";
  return `${base}.${book.format === "epub" ? "epub" : "pdf"}`;
}

export function bookMime(book: BookMeta): string {
  return book.format === "epub" ? "application/epub+zip" : "application/pdf";
}

export type CloudPick = { id: string; name: string; mimeType?: string };

export type CloudRef = {
  cloudProvider: CloudProvider;
  cloudFileId: string;
  driveFileId?: string;
  hasCloudFile: true;
};

async function yandexUpload(
  token: string,
  file: Blob,
  name: string,
): Promise<string> {
  const diskPath = encodeURIComponent(`app:/${name}`);
  const hrefRes = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources/upload?path=${diskPath}&overwrite=true`,
    { headers: { Authorization: `OAuth ${token}` } },
  );
  if (!hrefRes.ok) throw new Error(`Yandex upload URL ${hrefRes.status}`);
  const { href } = (await hrefRes.json()) as { href?: string };
  if (!href) throw new Error("Yandex upload href missing");
  const put = await fetch(href, { method: "PUT", body: file });
  if (!put.ok && put.status !== 201) throw new Error(`Yandex put ${put.status}`);
  return name;
}

async function yandexDownload(token: string, pathName: string): Promise<Blob> {
  const diskPath = pathName.startsWith("app:")
    ? pathName
    : `app:/${pathName}`;
  const res = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources/download?path=${encodeURIComponent(diskPath)}`,
    { headers: { Authorization: `OAuth ${token}` } },
  );
  if (!res.ok) throw new Error(`Yandex download ${res.status}`);
  const { href } = (await res.json()) as { href?: string };
  if (!href) throw new Error("Yandex download href missing");
  const file = await fetch(href);
  if (!file.ok) throw new Error(`Yandex file ${file.status}`);
  return file.blob();
}

export async function listYandexBooks(): Promise<CloudPick[]> {
  const token = getAccessToken("yandex");
  if (!token) throw new Error("Яндекс.Диск не подключён");
  const res = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent("app:/")}&limit=200&fields=_embedded.items.name,_embedded.items.type,_embedded.items.mime_type`,
    { headers: { Authorization: `OAuth ${token}` } },
  );
  if (!res.ok) throw new Error(`Yandex list ${res.status}`);
  const data = (await res.json()) as {
    _embedded?: {
      items?: { name?: string; type?: string; mime_type?: string }[];
    };
  };
  return (data._embedded?.items ?? [])
    .filter(
      (it) =>
        it.type === "file" &&
        /\.(pdf|epub)$/i.test(it.name || ""),
    )
    .map((it) => ({
      id: it.name!,
      name: it.name!,
      mimeType: it.mime_type,
    }));
}

async function dropboxUpload(
  token: string,
  file: Blob,
  name: string,
): Promise<string> {
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: `/${name}`,
        mode: "overwrite",
        autorename: false,
      }),
    },
    body: file,
  });
  if (!res.ok) throw new Error(`Dropbox upload ${res.status}`);
  const data = (await res.json()) as { id?: string; path_lower?: string };
  return data.id || data.path_lower || `/${name}`;
}

async function dropboxDownload(token: string, pathOrId: string): Promise<Blob> {
  const arg = pathOrId.startsWith("id:")
    ? { path: pathOrId }
    : { path: pathOrId.startsWith("/") ? pathOrId : `/${pathOrId}` };
  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify(arg),
    },
  });
  if (!res.ok) throw new Error(`Dropbox download ${res.status}`);
  return res.blob();
}

export async function listDropboxBooks(): Promise<CloudPick[]> {
  const token = getAccessToken("dropbox");
  if (!token) throw new Error("Dropbox не подключён");
  const res = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: "", recursive: false }),
  });
  if (!res.ok) throw new Error(`Dropbox list ${res.status}`);
  const data = (await res.json()) as {
    entries?: { ".tag"?: string; id?: string; name?: string }[];
  };
  return (data.entries ?? [])
    .filter(
      (it) => it[".tag"] === "file" && /\.(pdf|epub)$/i.test(it.name || ""),
    )
    .map((it) => ({
      id: it.id || `/${it.name}`,
      name: it.name || "book.pdf",
    }));
}

async function onedriveUpload(
  token: string,
  file: Blob,
  name: string,
  mimeType: string,
): Promise<string> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodeURIComponent(name)}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": mimeType,
      },
      body: file,
    },
  );
  if (!res.ok) throw new Error(`OneDrive upload ${res.status}`);
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("OneDrive upload missing id");
  return data.id;
}

async function onedriveDownload(token: string, id: string): Promise<Blob> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(id)}/content`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`OneDrive download ${res.status}`);
  return res.blob();
}

export async function listOnedriveBooks(): Promise<CloudPick[]> {
  const token = getAccessToken("onedrive");
  if (!token) throw new Error("OneDrive не подключён");
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/drive/special/approot/children?$select=id,name,file",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`OneDrive list ${res.status}`);
  const data = (await res.json()) as {
    value?: { id?: string; name?: string; file?: unknown }[];
  };
  return (data.value ?? [])
    .filter((it) => it.file && /\.(pdf|epub)$/i.test(it.name || ""))
    .map((it) => ({
      id: it.id!,
      name: it.name || "book.pdf",
    }));
}

export async function listCloudBooks(
  provider: CloudProvider,
): Promise<CloudPick[]> {
  if (provider === "yandex") return listYandexBooks();
  if (provider === "dropbox") return listDropboxBooks();
  if (provider === "onedrive") return listOnedriveBooks();
  return [];
}

export async function downloadFromCloudDisks(
  book: BookMeta,
): Promise<{ blob: Blob; provider: CloudProvider; fileId: string } | null> {
  const tries: { provider: CloudProvider; fileId: string }[] = [];
  if (book.cloudProvider && book.cloudFileId) {
    tries.push({ provider: book.cloudProvider, fileId: book.cloudFileId });
  }
  if (book.driveFileId) {
    tries.push({ provider: "gdrive", fileId: book.driveFileId });
  }

  for (const tryOne of tries) {
    try {
      if (tryOne.provider === "gdrive") {
        const { blob } = await downloadDriveFile(tryOne.fileId);
        if (blob.size > 0)
          return { blob, provider: "gdrive", fileId: tryOne.fileId };
        continue;
      }
      const token = getAccessToken(tryOne.provider);
      if (!token) continue;
      let blob: Blob | null = null;
      if (tryOne.provider === "yandex")
        blob = await yandexDownload(token, tryOne.fileId);
      else if (tryOne.provider === "dropbox")
        blob = await dropboxDownload(token, tryOne.fileId);
      else if (tryOne.provider === "onedrive")
        blob = await onedriveDownload(token, tryOne.fileId);
      if (blob && blob.size > 0)
        return { blob, provider: tryOne.provider, fileId: tryOne.fileId };
    } catch (e) {
      console.warn("[etagere] disk restore", tryOne.provider, e);
    }
  }
  return null;
}

export async function backupToCloudDisks(
  book: BookMeta,
  blob: Blob,
): Promise<CloudRef | null> {
  if (book.driveFileId || (book.cloudProvider && book.cloudFileId)) {
    return {
      cloudProvider: book.cloudProvider || "gdrive",
      cloudFileId: book.cloudFileId || book.driveFileId!,
      driveFileId: book.driveFileId,
      hasCloudFile: true,
    };
  }

  const name = bookFileName(book);
  const mime = bookMime(book);
  const providers = connectedProviders();
  if (isDriveConnected() && !providers.includes("gdrive")) {
    providers.unshift("gdrive");
  }
  if (!providers.length) return null;

  const provider = providers[0]!;
  try {
    if (provider === "gdrive") {
      const id = await uploadDriveBook(blob, name, mime);
      return {
        cloudProvider: "gdrive",
        cloudFileId: id,
        driveFileId: id,
        hasCloudFile: true,
      };
    }
    const token = getAccessToken(provider);
    if (!token) return null;
    let id: string;
    if (provider === "yandex") id = await yandexUpload(token, blob, name);
    else if (provider === "dropbox") id = await dropboxUpload(token, blob, name);
    else id = await onedriveUpload(token, blob, name, mime);
    return { cloudProvider: provider, cloudFileId: id, hasCloudFile: true };
  } catch (e) {
    console.error("[etagere] disk backup", provider, e);
    return null;
  }
}

export async function downloadCloudPick(
  provider: CloudProvider,
  pick: CloudPick,
): Promise<File> {
  if (provider === "gdrive") {
    const { blob, name, mimeType } = await downloadDriveFile(pick.id);
    return new File([blob], name, { type: mimeType });
  }
  const token = getAccessToken(provider);
  if (!token) throw new Error("Диск не подключён");
  let blob: Blob;
  if (provider === "yandex") blob = await yandexDownload(token, pick.id);
  else if (provider === "dropbox") blob = await dropboxDownload(token, pick.id);
  else blob = await onedriveDownload(token, pick.id);
  const mime = pick.name.toLowerCase().endsWith(".epub")
    ? "application/epub+zip"
    : "application/pdf";
  return new File([blob], pick.name, { type: mime });
}
