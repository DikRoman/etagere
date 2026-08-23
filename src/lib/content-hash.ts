/** SHA-256 hex digest of a File/Blob (for cross-device book matching). */
export async function sha256Hex(data: ArrayBuffer | Blob): Promise<string> {
  const buffer =
    data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
