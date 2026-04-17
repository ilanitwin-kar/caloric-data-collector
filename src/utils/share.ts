type ShareReason = "unsupported" | "cancelled" | "failed";

const navShare = () =>
  navigator as unknown as {
    share?: (data: unknown) => Promise<void>;
    canShare?: (data: unknown) => boolean;
  };

async function shareWithFile(
  file: File,
  title?: string,
  text?: string,
): Promise<{ ok: boolean; reason?: ShareReason }> {
  const nav = navShare();
  if (!nav.share) return { ok: false, reason: "unsupported" };
  if (nav.canShare && !nav.canShare({ files: [file] })) {
    try {
      await nav.share({ title: title ?? file.name, text });
      return { ok: true };
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") return { ok: false, reason: "cancelled" };
      return { ok: false, reason: "failed" };
    }
  }
  try {
    await nav.share({ title: title ?? file.name, text, files: [file] });
    return { ok: true };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "AbortError") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "failed" };
  }
}

export async function shareBlobFile(params: {
  blob: Blob;
  filename: string;
  mime: string;
  title?: string;
  text?: string;
}): Promise<{ ok: boolean; reason?: ShareReason }> {
  const file = new File([params.blob], params.filename, { type: params.mime });
  return shareWithFile(file, params.title, params.text);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareCsv(params: {
  filename: string;
  csv: string;
  title?: string;
  text?: string;
}): Promise<{ ok: boolean; reason?: ShareReason }> {
  const blob = new Blob([params.csv], { type: "text/csv;charset=utf-8" });
  return shareBlobFile({
    blob,
    filename: params.filename,
    mime: blob.type,
    title: params.title,
    text: params.text,
  });
}

