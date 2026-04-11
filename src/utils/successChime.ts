/** צליל הצלחה קצר — ללא קבצי אודיו חיצוניים */
export function playSuccessChime(): void {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = 0.08;

    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + dur);
    };

    const t0 = ctx.currentTime;
    playTone(880, t0, 0.08);
    playTone(1174, t0 + 0.1, 0.12);

    ctx.resume().catch(() => {});
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 600);
  } catch {
    /* נשתיק כשלונות אודיו */
  }
}
