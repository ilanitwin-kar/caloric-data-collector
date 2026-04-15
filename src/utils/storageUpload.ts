import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { storage } from "../firebase";

export async function uploadCatalogImage(params: {
  uid: string;
  gtin: string;
  kind: "label" | "front" | "ingredients";
  file: File;
}): Promise<{ path: string; url: string }> {
  const safeGtin = params.gtin.replace(/\D/g, "");
  const safeKind = params.kind;
  const ext = guessExt(params.file.type) ?? "jpg";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `users/${params.uid}/catalog/products/${safeGtin}/${safeKind}-${stamp}.${ext}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, params.file, {
    contentType: params.file.type || undefined,
    cacheControl: "public,max-age=31536000",
  });
  const url = await getDownloadURL(r);
  return { path, url };
}

function guessExt(mime: string): string | undefined {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  return undefined;
}

