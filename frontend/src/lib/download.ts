/**
 * Trigger a browser download from raw bytes.
 */
export function downloadBlob(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Trigger a browser download from a base64-encoded string.
 */
export function downloadBase64(b64: string, filename: string): void {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  downloadBlob(arr, filename);
}
