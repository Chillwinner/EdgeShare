import { useEffect } from 'react';

export function useVAD(stream: MediaStream | null, muted: boolean, onSpeakingChange: (speaking: boolean) => void) {
  useEffect(() => {
    if (!stream || muted) {
      onSpeakingChange(false);
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    let ctx: AudioContext | null = null;
    let rafId = 0;
    let lastSpoke = 0;
    let currentSpeaking = false;

    try {
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = Date.now();
        if (rms > 0.025) {
          lastSpoke = now;
          if (!currentSpeaking) {
            currentSpeaking = true;
            onSpeakingChange(true);
          }
        } else if (currentSpeaking && now - lastSpoke > 400) {
          currentSpeaking = false;
          onSpeakingChange(false);
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    } catch {
      // AudioContext blocked or unsupported
    }

    return () => {
      cancelAnimationFrame(rafId);
      ctx?.close().catch(() => {});
    };
  }, [stream, muted, onSpeakingChange]);
}
