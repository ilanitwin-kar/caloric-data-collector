export async function shareCsv(params: {
  filename: string;
  csv: string;
  title?: string;
  text?: string;
}): Promise<{ ok: boolean; reason?: "unsupported" | "cancelled" | "failed" }> {
  const blob = new Blob([params.csv], { type: "text/csv;charset=utf-8" });
  const file = new File([blob], params.filename, { type: blob.type });

  const nav = navigator as unknown as {
    share?: (data: unknown) => Promise<void>;
    canShare?: (data: unknown) => boolean;
  };

  if (!nav.share) return { ok: false, reason: "unsupported" };
  if (nav.canShare && !nav.canShare({ files: [file] })) {
    // Some browsers support share() but not file sharing.
    try {
      await nav.share({
        title: params.title ?? params.filename,
        text: params.text,
      });
      return { ok: true };
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") return { ok: false, reason: "cancelled" };
      return { ok: false, reason: "failed" };
    }
  }

  try {
    await nav.share({
      title: params.title ?? params.filename,
      text: params.text,
      files: [file],
    });
    return { ok: true };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "AbortError") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "failed" };
  }
}

