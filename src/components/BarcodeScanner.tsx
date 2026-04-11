import { useEffect, useRef } from "react";

type Props = {
  /** כש-false — המצלמה נעצרת */
  isActive: boolean;
  onScan: (barcodeDigits: string) => void;
};

/**
 * סורק ברקוד דרך המצלמה (EAN/UPC וכו׳).
 */
export function BarcodeScanner({ isActive, onScan }: Props) {
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

        const qrboxFunc = (
          viewfinderWidth: number,
          viewfinderHeight: number,
        ) => {
          const w = Math.min(320, viewfinderWidth * 0.92);
          const h = Math.min(150, viewfinderHeight * 0.38);
          return { width: Math.round(w), height: Math.round(h) };
        };

        await html5.start(
          { facingMode: "environment" },
          {
            fps: 8,
            qrbox: qrboxFunc,
            aspectRatio: 1.777,
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
  }, [isActive, containerId]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/15 bg-black">
      <div
        id={containerId}
        className="w-full [&_video]:object-cover"
        style={{ minHeight: "clamp(200px, 38vh, 320px)" }}
      />
    </div>
  );
}
