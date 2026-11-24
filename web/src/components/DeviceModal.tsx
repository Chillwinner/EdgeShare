import { AnimatePresence, motion } from 'framer-motion';
import { Mic, Video, Volume2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

interface DeviceModalProps {
  open: boolean;
  localMicStream: MediaStream | null;
  onClose: () => void;
  onSelectMic: (deviceId: string) => void;
  onSelectCam: (deviceId: string) => void;
  onSelectSpeaker: (deviceId: string) => void;
}

export function DeviceModal({
  open,
  localMicStream,
  onClose,
  onSelectMic,
  onSelectCam,
  onSelectSpeaker,
}: DeviceModalProps) {
  const { t } = useI18n();
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [micLevel, setMicLevel] = useState(0);

  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((list) => {
        setMics(list.filter((d) => d.kind === 'audioinput'));
        setCams(list.filter((d) => d.kind === 'videoinput'));
        setSpeakers(list.filter((d) => d.kind === 'audiooutput'));
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || !localMicStream || localMicStream.getAudioTracks().length === 0) {
      setMicLevel(0);
      return;
    }
    let ctx: AudioContext | null = null;
    let raf = 0;
    try {
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(localMicStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
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
        setMicLevel(Math.min(100, Math.round(rms * 400)));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch {
      // ignore
    }
    return () => {
      cancelAnimationFrame(raf);
      ctx?.close().catch(() => {});
    };
  }, [open, localMicStream]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/95 shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">{t('devModalTitle')}</h3>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                <Mic className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('mic')}</span>
              </label>
              <select
                onChange={(e) => onSelectMic(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-zinc-100 focus:outline-none focus:border-orange-500/60"
              >
                {mics.map((m, idx) => (
                  <option key={m.deviceId || idx} value={m.deviceId}>
                    {m.label || `麦克风 ${idx + 1}`}
                  </option>
                ))}
              </select>
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-75"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                <Video className="w-3.5 h-3.5 text-orange-400" />
                <span>{t('camera')}</span>
              </label>
              <select
                onChange={(e) => onSelectCam(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-zinc-100 focus:outline-none focus:border-orange-500/60"
              >
                {cams.map((c, idx) => (
                  <option key={c.deviceId || idx} value={c.deviceId}>
                    {c.label || `摄像头 ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t('speaker')}</span>
              </label>
              <select
                onChange={(e) => onSelectSpeaker(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-zinc-100 focus:outline-none focus:border-orange-500/60"
              >
                {speakers.length === 0 ? (
                  <option value="">{t('defaultOutput')}</option>
                ) : (
                  speakers.map((s, idx) => (
                    <option key={s.deviceId || idx} value={s.deviceId}>
                      {s.label || `${t('speaker')} ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="text-[11px] text-zinc-400 pt-1 space-y-1">
              <div>{t('pttTip')}</div>
              <div>{t('shortcutMuteTip')}</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
