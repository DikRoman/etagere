/** loaded and total in bytes; total is 0 when the size is unknown. */
export type DownloadProgress = (loaded: number, total: number) => void;

/**
 * Read a response body while reporting progress, for the book download
 * screen. Content-Length is only trusted for an uncompressed body: with a
 * Content-Encoding it is the compressed size, and progress would run past
 * 100%. X-File-Size, set by our own Drive proxy, is the real size.
 */
export async function readWithProgress(
  res: Response,
  onProgress?: DownloadProgress,
): Promise<Blob> {
  const type = res.headers.get("content-type") || "";
  if (!onProgress || !res.body) return res.blob();
  const declared = Number(res.headers.get("x-file-size")) || 0;
  const length = res.headers.get("content-encoding")
    ? 0
    : Number(res.headers.get("content-length")) || 0;
  const total = declared || length;
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  onProgress(0, total);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  return new Blob(chunks, { type });
}
