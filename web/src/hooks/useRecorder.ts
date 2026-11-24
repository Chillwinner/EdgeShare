import { useCallback, useEffect, useRef, useState } from 'react';

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!recording) {
      setElapsedSec(0);
      return;
    }
    const timer = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  const startRecording = useCallback(
    (videoStream: MediaStream | null, localMic: MediaStream | null, remoteAudios: MediaStream[]) => {
      if (!videoStream || videoStream.getVideoTracks().length === 0) {
        return false;
      }

      const combined = new MediaStream();
      videoStream.getVideoTracks().forEach((t) => combined.addTrack(t));

      // Mix all audio streams into one track
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const dest = ctx.createMediaStreamDestination();
        const addAudio = (s: MediaStream | null) => {
          if (!s || s.getAudioTracks().length === 0) return;
          ctx.createMediaStreamSource(s).connect(dest);
        };
        addAudio(localMic);
        addAudio(videoStream);
        remoteAudios.forEach(addAudio);
        dest.stream.getAudioTracks().forEach((t) => combined.addTrack(t));
      } catch {
        // Record video-only if AudioContext fails
      }

      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

      const mr = new MediaRecorder(combined, { mimeType });
      recorderRef.current = mr;

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `edgeshare-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
      };

      mr.start(1000);
      setRecording(true);
      return true;
    },
    []
  );

  return { recording, elapsedSec, startRecording, stopRecording };
}
