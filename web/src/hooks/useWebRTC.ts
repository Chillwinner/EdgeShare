import { useCallback, useEffect, useRef, useState } from 'react';
import type { Participant, ScreenShareInfo, SessionTrafficStats, ShareQuality } from '../types';

interface UseWebRTCOptions {
  selfId: string;
  participants: Participant[];
  activeShares: ScreenShareInfo[];
  ecoMode: boolean;
  onMediaState: (state: {
    sfuSessionId?: string;
    audioTrackName?: string;
    muted?: boolean;
    cameraOn?: boolean;
    camTrackName?: string;
  }) => void;
  onShareStart: (info: { sfuSessionId: string; videoTrackName: string; audioTrackName?: string; quality: ShareQuality }) => void;
  onShareStop: () => void;
  onError: (msg: string) => void;
}

const QUALITY_CONFIG: Record<ShareQuality, { width: number; height: number; frameRate: number; maxBitrate: number }> = {
  eco: { width: 1280, height: 720, frameRate: 15, maxBitrate: 1_000_000 },
  standard: { width: 1920, height: 1080, frameRate: 30, maxBitrate: 2_500_000 },
  ultra: { width: 3840, height: 2160, frameRate: 60, maxBitrate: 10_000_000 },
};

function waitForPeerConnected(pc: RTCPeerConnection, timeoutMs = 8000): Promise<void> {
  if (
    pc.connectionState === 'connected' ||
    pc.iceConnectionState === 'connected' ||
    pc.iceConnectionState === 'completed'
  ) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    const check = () => {
      if (
        pc.connectionState === 'connected' ||
        pc.iceConnectionState === 'connected' ||
        pc.iceConnectionState === 'completed'
      ) {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      pc.removeEventListener('connectionstatechange', check);
      pc.removeEventListener('iceconnectionstatechange', check);
    };
    pc.addEventListener('connectionstatechange', check);
    pc.addEventListener('iceconnectionstatechange', check);
  });
}

export function useWebRTC({
  selfId,
  participants,
  activeShares,
  ecoMode,
  onMediaState,
  onShareStart,
  onShareStop,
  onError,
}: UseWebRTCOptions) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef<string>('');
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const localMicStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const localCamStreamRef = useRef<MediaStream | null>(null);
  const screenSendersRef = useRef<RTCRtpSender[]>([]);
  const camSenderRef = useRef<RTCRtpSender | null>(null);

  const pulledKeysRef = useRef<Set<string>>(new Set());
  const midToTrackNameRef = useRef<Map<string, string>>(new Map());
  const remoteAudioStreamsRef = useRef<Map<string, MediaStream>>(new Map());

  const [muted, setMuted] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [initDone, setInitDone] = useState(false);
  const [shareQuality, setShareQuality] = useState<ShareQuality>('standard');
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [localCamStream, setLocalCamStream] = useState<MediaStream | null>(null);
  // Keyed by trackName (covers both remote screens and remote cameras)
  const [remoteVideoStreams, setRemoteVideoStreams] = useState<Record<string, MediaStream>>({});
  const [remoteAudioStreams, setRemoteAudioStreams] = useState<MediaStream[]>([]);
  const [trafficStats, setTrafficStats] = useState<SessionTrafficStats>({
    sessionEgressBytes: 0,
    currentBitrateMbps: 0,
    sessionUplinkBytes: 0,
    currentUplinkMbps: 0,
  });

  const enqueue = useCallback(
    (fn: () => Promise<void>) => {
      const next = queueRef.current.then(fn).catch((err) => {
        console.error('[SFU queue error]', err);
        onError(err instanceof Error ? err.message : String(err));
      });
      queueRef.current = next;
      return next;
    },
    [onError]
  );

  const sfuFetch = useCallback(async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`/api/sfu${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error || data?.errorDescription || `SFU HTTP ${res.status}`) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    return data;
  }, []);

  const resetPeer = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    sessionIdRef.current = '';
    pulledKeysRef.current.clear();
    midToTrackNameRef.current.clear();
    screenSendersRef.current = [];
    camSenderRef.current = null;
    setRemoteVideoStreams({});
  }, []);

  const createPeerAndSession = useCallback(async () => {
    if (pcRef.current && sessionIdRef.current) {
      return { pc: pcRef.current, sessionId: sessionIdRef.current };
    }

    const iceRes = await fetch('/api/ice-servers').then((r) => r.json());
    const pc = new RTCPeerConnection({
      iceServers: iceRes.iceServers || [{ urls: 'stun:stun.cloudflare.com:3478' }],
      bundlePolicy: 'max-bundle',
    });

    pc.ontrack = (ev) => {
      const mid = ev.transceiver.mid || '';
      if (ev.track.kind === 'video') {
        const trackName = midToTrackNameRef.current.get(mid) || mid || ev.track.id;
        const stream = new MediaStream([ev.track]);
        setRemoteVideoStreams((prev) => ({ ...prev, [trackName]: stream }));
        ev.track.onended = () => {
          setRemoteVideoStreams((prev) => {
            const copy = { ...prev };
            delete copy[trackName];
            return copy;
          });
        };
      } else if (ev.track.kind === 'audio') {
        const stream = ev.streams[0] || new MediaStream([ev.track]);
        remoteAudioStreamsRef.current.set(mid || ev.track.id, stream);
        setRemoteAudioStreams(Array.from(remoteAudioStreamsRef.current.values()));
        ev.track.onended = () => {
          remoteAudioStreamsRef.current.delete(mid || ev.track.id);
          setRemoteAudioStreams(Array.from(remoteAudioStreamsRef.current.values()));
        };
      }
    };

    const sess = await sfuFetch('POST', '/sessions/new');
    const sessionId: string = sess.sessionId;
    pcRef.current = pc;
    sessionIdRef.current = sessionId;

    return { pc, sessionId };
  }, [sfuFetch]);

  // Initialize microphone on room join (only create SFU session if mic is available)
  useEffect(() => {
    if (!selfId) {
      setInitDone(false);
      resetPeer();
      return;
    }

    enqueue(async () => {
      let mic: MediaStream | null = null;
      try {
        mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        localMicStreamRef.current = mic;
      } catch (err) {
        console.warn('Microphone unavailable, joining as listener:', err);
        onMediaState({ muted: true });
        setMuted(true);
      }

      if (mic) {
        const { pc, sessionId } = await createPeerAndSession();
        const audioTrack = mic.getAudioTracks()[0];
        const transceiver = pc.addTransceiver(audioTrack, { direction: 'sendonly' });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const audioTrackName = `mic-${selfId}-${Date.now()}`;
        const res = await sfuFetch('POST', `/sessions/${sessionId}/tracks/new`, {
          sessionDescription: { type: 'offer', sdp: offer.sdp },
          tracks: [{ location: 'local', mid: transceiver.mid, trackName: audioTrackName }],
        });
        await pc.setRemoteDescription(res.sessionDescription);
        await waitForPeerConnected(pc);
        onMediaState({ sfuSessionId: sessionId, audioTrackName, muted: false });
      }
      setInitDone(true);
    });
  }, [selfId, enqueue, createPeerAndSession, onMediaState, sfuFetch, resetPeer]);

  // Pull remote tracks whenever participants, activeShares, ecoMode, or initDone changes
  useEffect(() => {
    if (!selfId || !initDone) return;

    const toPull: Array<{ location: 'remote'; sessionId: string; trackName: string; key: string }> = [];

    for (const p of participants) {
      if (p.id === selfId || !p.sfuSessionId) continue;

      if (p.audioTrackName) {
        const key = `${p.sfuSessionId}:${p.audioTrackName}`;
        if (!pulledKeysRef.current.has(key)) {
          toPull.push({ location: 'remote', sessionId: p.sfuSessionId, trackName: p.audioTrackName, key });
        }
      }

      if (!ecoMode && p.cameraOn && p.camTrackName) {
        const camKey = `${p.sfuSessionId}:${p.camTrackName}`;
        if (!pulledKeysRef.current.has(camKey)) {
          toPull.push({ location: 'remote', sessionId: p.sfuSessionId, trackName: p.camTrackName, key: camKey });
        }
      }
    }

    for (const share of activeShares) {
      if (share.sharerId === selfId) continue;
      const vKey = `${share.sfuSessionId}:${share.videoTrackName}`;
      if (!pulledKeysRef.current.has(vKey)) {
        toPull.push({
          location: 'remote',
          sessionId: share.sfuSessionId,
          trackName: share.videoTrackName,
          key: vKey,
        });
      }
      if (share.audioTrackName) {
        const aKey = `${share.sfuSessionId}:${share.audioTrackName}`;
        if (!pulledKeysRef.current.has(aKey)) {
          toPull.push({
            location: 'remote',
            sessionId: share.sfuSessionId,
            trackName: share.audioTrackName,
            key: aKey,
          });
        }
      }
    }

    if (toPull.length === 0) return;

    const pullTracks = async (pc: RTCPeerConnection, sessionId: string, batch: typeof toPull) => {
      const tracks = batch.map((t) => ({
        location: t.location,
        sessionId: t.sessionId,
        trackName: t.trackName,
      }));
      const res = await sfuFetch('POST', `/sessions/${sessionId}/tracks/new`, { tracks });

      if (Array.isArray(res.tracks)) {
        res.tracks.forEach((t: { mid?: string; trackName?: string }, idx: number) => {
          const tName = t.trackName || tracks[idx]?.trackName;
          if (t.mid && tName) {
            midToTrackNameRef.current.set(String(t.mid), String(tName));
          }
        });
      }

      if (res.requiresImmediateRenegotiation) {
        await pc.setRemoteDescription(res.sessionDescription);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sfuFetch('PUT', `/sessions/${sessionId}/renegotiate`, {
          sessionDescription: { type: 'answer', sdp: answer.sdp },
        });
        await waitForPeerConnected(pc);
      }

      batch.forEach((t) => pulledKeysRef.current.add(t.key));
    };

    enqueue(async () => {
      const freshBatch = toPull.filter((t) => !pulledKeysRef.current.has(t.key));
      if (freshBatch.length === 0) return;

      const { pc, sessionId } = await createPeerAndSession();
      try {
        await pullTracks(pc, sessionId, freshBatch);
      } catch (err) {
        if ((err as { status?: number })?.status === 410) {
          resetPeer();
          const fresh = await createPeerAndSession();
          await pullTracks(fresh.pc, fresh.sessionId, freshBatch);
        } else {
          throw err;
        }
      }
    });
  }, [participants, activeShares, ecoMode, selfId, initDone, enqueue, createPeerAndSession, resetPeer, sfuFetch]);

  const setMutedState = useCallback(
    (nextMuted: boolean) => {
      const mic = localMicStreamRef.current;
      if (!mic) return;
      mic.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
      setMuted(nextMuted);
      onMediaState({ muted: nextMuted });
    },
    [onMediaState]
  );

  const toggleMute = useCallback(() => {
    setMutedState(!muted);
  }, [muted, setMutedState]);

  const switchMicDevice = useCallback(
    async (deviceId: string) => {
      try {
        const newMic = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        const newTrack = newMic.getAudioTracks()[0];
        newTrack.enabled = !muted;
        const pc = pcRef.current;
        if (pc) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'audio' && localMicStreamRef.current?.getAudioTracks().includes(s.track));
          if (sender) await sender.replaceTrack(newTrack);
        }
        localMicStreamRef.current?.getTracks().forEach((t) => t.stop());
        localMicStreamRef.current = newMic;
      } catch {
        onError('切换麦克风失败');
      }
    },
    [muted, onError]
  );

  const switchCamDevice = useCallback(
    async (deviceId: string) => {
      if (!cameraOn) return;
      try {
        const newCam = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } },
          audio: false,
        });
        const newTrack = newCam.getVideoTracks()[0];
        if (camSenderRef.current) {
          await camSenderRef.current.replaceTrack(newTrack);
        }
        localCamStreamRef.current?.getTracks().forEach((t) => t.stop());
        localCamStreamRef.current = newCam;
        setLocalCamStream(newCam);
      } catch {
        onError('切换摄像头失败');
      }
    },
    [cameraOn, onError]
  );

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      if (localCamStreamRef.current) {
        localCamStreamRef.current.getTracks().forEach((t) => t.stop());
        localCamStreamRef.current = null;
      }
      setLocalCamStream(null);
      setCameraOn(false);
      onMediaState({ cameraOn: false, camTrackName: '' });

      await enqueue(async () => {
        const pc = pcRef.current;
        const sessionId = sessionIdRef.current;
        const sender = camSenderRef.current;
        if (!pc || !sessionId || !sender) return;
        const mid = pc.getTransceivers().find((tr) => tr.sender === sender)?.mid;
        pc.removeTrack(sender);
        camSenderRef.current = null;
        if (mid) {
          await sfuFetch('PUT', `/sessions/${sessionId}/tracks/close`, {
            tracks: [{ mid }],
            force: true,
          }).catch(() => {});
        }
      });
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } },
        audio: false,
      });
    } catch (err) {
      onError('无法打开摄像头，请检查浏览器权限');
      return;
    }

    localCamStreamRef.current = stream;
    const videoTrack = stream.getVideoTracks()[0];

    await enqueue(async () => {
      try {
        const { pc, sessionId } = await createPeerAndSession();
        const transceiver = pc.addTransceiver(videoTrack, { direction: 'sendonly' });
        camSenderRef.current = transceiver.sender;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const params = transceiver.sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        params.encodings[0].maxBitrate = 450_000; // 450kbps quota-friendly camera
        await transceiver.sender.setParameters(params).catch(() => {});

        const camTrackName = `cam-${selfId}-${Date.now()}`;
        const res = await sfuFetch('POST', `/sessions/${sessionId}/tracks/new`, {
          sessionDescription: { type: 'offer', sdp: offer.sdp },
          tracks: [{ location: 'local', mid: transceiver.mid!, trackName: camTrackName }],
        });
        await pc.setRemoteDescription(res.sessionDescription);
        await waitForPeerConnected(pc);

        setLocalCamStream(stream);
        setCameraOn(true);
        onMediaState({ sfuSessionId: sessionId, cameraOn: true, camTrackName });
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        localCamStreamRef.current = null;
        setLocalCamStream(null);
        setCameraOn(false);
        throw err;
      }
    });
  }, [cameraOn, enqueue, createPeerAndSession, selfId, sfuFetch, onMediaState, onError]);

  const stopScreenShare = useCallback(() => {
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;
    }
    setLocalScreenStream(null);
    setSharing(false);
    onShareStop();

    enqueue(async () => {
      const pc = pcRef.current;
      const sessionId = sessionIdRef.current;
      if (!pc || !sessionId || screenSendersRef.current.length === 0) return;
      const mids = screenSendersRef.current
        .map((s) => pc.getTransceivers().find((tr) => tr.sender === s)?.mid)
        .filter(Boolean);
      screenSendersRef.current.forEach((s) => pc.removeTrack(s));
      screenSendersRef.current = [];
      if (mids.length > 0) {
        await sfuFetch('PUT', `/sessions/${sessionId}/tracks/close`, {
          tracks: mids.map((mid) => ({ mid })),
          force: true,
        }).catch(() => {});
      }
    });
  }, [enqueue, onShareStop, sfuFetch]);

  const startScreenShare = useCallback(
    async (quality: ShareQuality = shareQuality) => {
      const preset = QUALITY_CONFIG[quality];
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: preset.width },
            height: { ideal: preset.height },
            frameRate: { ideal: preset.frameRate, max: preset.frameRate },
          },
          audio: true,
        });
      } catch {
        return; // user cancelled picker
      }

      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      localScreenStreamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      videoTrack.onended = () => {
        stopScreenShare();
      };

      const publishWithSession = async (pc: RTCPeerConnection, sessionId: string) => {
        const tracksToPublish: Array<{ location: 'local'; mid: string; trackName: string }> = [];
        const senders: RTCRtpSender[] = [];

        const vTransceiver = pc.addTransceiver(videoTrack, { direction: 'sendonly' });
        senders.push(vTransceiver.sender);

        const videoTrackName = `screen-v-${selfId}-${Date.now()}`;
        let audioTrackName: string | undefined;

        const sysAudio = stream.getAudioTracks()[0];
        let aTransceiver: RTCRtpTransceiver | null = null;
        if (sysAudio) {
          aTransceiver = pc.addTransceiver(sysAudio, { direction: 'sendonly' });
          senders.push(aTransceiver.sender);
          audioTrackName = `screen-a-${selfId}-${Date.now()}`;
        }
        screenSendersRef.current = senders;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const params = vTransceiver.sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = preset.maxBitrate;
        await vTransceiver.sender.setParameters(params).catch(() => {});

        tracksToPublish.push({
          location: 'local',
          mid: vTransceiver.mid!,
          trackName: videoTrackName,
        });
        if (aTransceiver && audioTrackName) {
          tracksToPublish.push({
            location: 'local',
            mid: aTransceiver.mid!,
            trackName: audioTrackName,
          });
        }

        const res = await sfuFetch('POST', `/sessions/${sessionId}/tracks/new`, {
          sessionDescription: { type: 'offer', sdp: offer.sdp },
          tracks: tracksToPublish,
        });
        await pc.setRemoteDescription(res.sessionDescription);
        await waitForPeerConnected(pc);

        setLocalScreenStream(stream);
        setShareQuality(quality);
        setSharing(true);

        onShareStart({
          sfuSessionId: sessionId,
          videoTrackName,
          audioTrackName,
          quality,
        });
      };

      await enqueue(async () => {
        try {
          const { pc, sessionId } = await createPeerAndSession();
          try {
            await publishWithSession(pc, sessionId);
          } catch (err) {
            if ((err as { status?: number })?.status === 410) {
              resetPeer();
              const fresh = await createPeerAndSession();
              await publishWithSession(fresh.pc, fresh.sessionId);
            } else {
              throw err;
            }
          }
        } catch (err) {
          stream.getTracks().forEach((t) => t.stop());
          localScreenStreamRef.current = null;
          setLocalScreenStream(null);
          setSharing(false);
          throw err;
        }
      });
    },
    [shareQuality, enqueue, createPeerAndSession, resetPeer, selfId, sfuFetch, onShareStart, stopScreenShare]
  );

  // Poll WebRTC getStats() every 2s to compute live downlink & uplink traffic / Mbps
  useEffect(() => {
    let prevRxBytes = 0;
    let prevTxBytes = 0;
    let prevTime = Date.now();

    const timer = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let totalReceived = 0;
        let totalSent = 0;
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && typeof report.bytesReceived === 'number') {
            totalReceived += report.bytesReceived;
          }
          if (report.type === 'outbound-rtp' && typeof report.bytesSent === 'number') {
            totalSent += report.bytesSent;
          }
        });
        const now = Date.now();
        const dtSec = Math.max((now - prevTime) / 1000, 0.5);
        const rxMbps = (Math.max(totalReceived - prevRxBytes, 0) * 8) / (dtSec * 1_000_000);
        const txMbps = (Math.max(totalSent - prevTxBytes, 0) * 8) / (dtSec * 1_000_000);
        prevRxBytes = totalReceived;
        prevTxBytes = totalSent;
        prevTime = now;

        setTrafficStats({
          sessionEgressBytes: totalReceived,
          currentBitrateMbps: rxMbps,
          sessionUplinkBytes: totalSent,
          currentUplinkMbps: txMbps,
        });
      } catch {
        // ignore stats errors
      }
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      localMicStreamRef.current?.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
      localCamStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
    };
  }, []);

  return {
    muted,
    sharing,
    cameraOn,
    shareQuality,
    setShareQuality,
    toggleMute,
    setMutedState,
    switchMicDevice,
    switchCamDevice,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    localMicStream: localMicStreamRef.current,
    localScreenStream,
    localCamStream,
    remoteVideoStreams,
    remoteAudioStreams,
    trafficStats,
  };
}
