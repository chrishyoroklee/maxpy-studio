import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

/**
 * Upload .amxd bytes to Firebase Storage.
 * Path: generations/{uid}/{generationId}/device.amxd
 * Returns the storage path (not the download URL).
 */
export async function uploadAmxd(
  uid: string,
  generationId: string,
  bytes: Uint8Array,
): Promise<string> {
  const path = `generations/${uid}/${generationId}/device.amxd`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, bytes, {
    contentType: "application/octet-stream",
  });
  return path;
}

/**
 * Download .amxd bytes from Firebase Storage given a storage path.
 * Returns the raw bytes as a Uint8Array.
 */
export async function downloadAmxd(storagePath: string): Promise<Uint8Array> {
  const storageRef = ref(storage, storagePath);
  const url = await getDownloadURL(storageRef);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}
