import { useEffect, useRef } from "react";

type Props = {
  isActive: boolean;
  onScan: (barcodeDigits: string) => void;
  mode?: "compact" | "fullscreen";
};

export function BarcodeScanner({
  isActive,
  onScan,
  mode = "compact",
}: Props) {
  const containerId = useRef(`bc-${Math.random().toString(36).slice(2, 12)}`).current;
  const onScanRef = useRef(onScan);
  const consumedRef = useRef(false);

  onScanRef.current = onScan;

  useEffect(() => {
    if (!isActive) return;

    consumedRef.current = false;
    let cancelled = false;
    const instRef: {
      current: import("html5-qrcode").Html5Qrcode | null;
    } = { current: null };

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
          "html5-qrcode",
        );
        if (cancelled) return;

        const formats = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
        ];

        const html5 = new Html5Qrcode(containerId, {
          formatsToSupport: formats,
          verbose: false,
        });
        instRef.current = html5;

        const fullscreen = mode === "fullscreen";
        const qrboxFunc = (
          viewfinderWidth: number,
          viewfinderHeight: number,
        ) => {
          if (fullscreen) {
            const w = Math.round(viewfinderWidth * 0.9);
            const h = Math.round(
              Math.min(viewfinderHeight * 0.42, viewfinderWidth * 0.36),
            );
            return { width: w, height: Math.max(100, Math.min(240, h)) };
          }
          const w = Math.min(280, Math.round(viewfinderWidth * 0.88));
          const h = Math.min(
            120,
            Math.round(Math.min(viewfinderHeight * 0.48, viewfinderWidth * 0.32)),
          );
          return { width: w, height: Math.max(72, h) };
        };

        await html5.start(
          { facingMode: "environment" },
          {
            fps: 8,
            qrbox: qrboxFunc,
            aspectRatio: fullscreen ? 1.4 : 1.25,
          },
          (decodedText) => {
            if (consumedRef.current) return;
            const digits = decodedText.replace(/\D/g, "");
            if (digits.length < 8 || digits.length > 14) return;
            consumedRef.current = true;
            try {
              html5.pause(true);
            } catch {
              /* ignore */
            }
            onScanRef.current(digits);
          },
          () => {},
        );
      } catch {
        /* מצלמה / הרשאות */
      }
    })();

    return () => {
      cancelled = true;
      const h = instRef.current;
      instRef.current = null;
      if (h) {
        h.stop().then(() => h.clear()).catch(() => {});
      }
    };
  }, [isActive, containerId, mode]);

  const fullscreen = mode === "fullscreen";

  return (
    <div
      className={
        fullscreen
          ? "h-full min-h-0 w-full overflow-hidden bg-black"
          : "overflow-hidden rounded-2xl border border-white/15 bg-black"
      }
    >
      <div
        id={containerId}
        className="w-full [&_video]:h-full [&_video]:min-h-0 [&_video]:object-cover"
        style={
          fullscreen
            ? {
                height: "min(62dvh, 560px)",
                minHeight: "min(45dvh, 400px)",
              }
            : {
                height: "min(200px, 32dvh)",
                maxHeight: "240px",
              }
        }
      />
    </div>
  );
}
