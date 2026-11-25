import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatDrawer } from './components/ChatDrawer';
import { DeviceModal } from './components/DeviceModal';
import { LobbyView } from './components/LobbyView';
import { SetupModal } from './components/SetupModal';
import { StageArea } from './components/StageArea';
import { TopQuotaBar } from './components/TopQuotaBar';
import { useP2PTransfer } from './hooks/useP2PTransfer';
import { useRecorder } from './hooks/useRecorder';
import { useVAD } from './hooks/useVAD';
import { useWebRTC } from './hooks/useWebRTC';
import { useI18n } from './i18n';
import type { AnnotationStroke, AppStatus, ChatMessage, RoomInfo, ShareQuality } from './types';

function RemoteAudioPlayer({ stream, sinkId }: { stream: MediaStream; sinkId?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el) return;
    el.srcObject = stream;
    if (sinkId && typeof el.setSinkId === 'function') {
      el.setSinkId(sinkId).catch(() => {});
    }
    el.play().catch(() => {});
  }, [stream, sinkId]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

export default function App() {
  const { t } = useI18n();
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialRoomId = urlParams.get('room') || '';

  const [hostToken] = useState(() => {
    const fromUrl = urlParams.get('hostToken');
    if (fromUrl) {
      localStorage.setItem('edgeshare_host_token', fromUrl);
      // Clean hostToken from URL bar so user doesn't accidentally share it
      const clean = new URL(window.location.href);
      clean.searchParams.delete('hostToken');
      window.history.replaceState({}, '', clean.toString());
      return fromUrl;
    }
    return localStorage.getItem('edgeshare_host_token') || '';
  });

  const [status, setStatus] = useState<AppStatus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);

  // Active meeting state
  const [inMeeting, setInMeeting] = useState(false);
  const [waitingApproval, setWaitingApproval] = useState(false);
  const [selfId, setSelfId] = useState('');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notes, setNotes] = useState('# 会议纪要\n\n- ');
  const [strokes, setStrokes] = useState<AnnotationStroke[]>([]);
  const [chatOpen, setChatOpen] = useState(true);
  const [ecoMode, setEcoMode] = useState(false);
  const [speakerId, setSpeakerId] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const intentionalLeaveRef = useRef(false);
  const reconnectParamsRef = useRef<{ roomId: string; name: string; password: string } | null>(null);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }, []);

  const fetchStatus = useCallback(async () => {
    const headers: Record<string, string> = {};
    if (hostToken) headers['X-Host-Token'] = hostToken;
    const res = await fetch('/api/status', { headers });
    const data: AppStatus = await res.json();
    setStatus(data);
    return data;
  }, [hostToken]);

  useEffect(() => {
    fetchStatus().catch(() => {});
    const timer = setInterval(() => {
      fetchStatus().catch(() => {});
    }, 60_000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  const sendWS = useCallback((type: string, payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const handleMediaState = useCallback(
    (state: { sfuSessionId?: string; audioTrackName?: string; muted?: boolean; cameraOn?: boolean; camTrackName?: string }) => {
      sendWS('media_state', state);
    },
    [sendWS]
  );

  const handleShareStart = useCallback(
    (info: { sfuSessionId: string; videoTrackName: string; audioTrackName?: string; quality: ShareQuality }) => {
      sendWS('share_start', info);
    },
    [sendWS]
  );

  const handleShareStop = useCallback(() => {
    sendWS('share_stop', {});
  }, [sendWS]);

  const rtc = useWebRTC({
    selfId: inMeeting ? selfId : '',
    participants: room?.participants || [],
    activeShares: room?.activeShares || [],
    ecoMode,
    onMediaState: handleMediaState,
    onShareStart: handleShareStart,
    onShareStop: handleShareStop,
    onError: showToast,
  });

  const handleSpeakingChange = useCallback(
    (speaking: boolean) => {
      if (inMeeting) {
        sendWS('media_state', { speaking });
      }
    },
    [inMeeting, sendWS]
  );

  useVAD(rtc.localMicStream, rtc.muted, handleSpeakingChange);

  const p2p = useP2PTransfer({
    selfId,
    participants: room?.participants || [],
    sendSignal: (payload) => sendWS('p2p_signal', payload),
  });
  const p2pHandleRef = useRef(p2p.handleSignal);
  p2pHandleRef.current = p2p.handleSignal;

  const recorder = useRecorder();

  // Push-to-Talk: hold Spacebar while muted to temporarily unmute
  const pttActiveRef = useRef(false);
  const rtcMutedRef = useRef(rtc.muted);
  rtcMutedRef.current = rtc.muted;
  const setMutedStateRef = useRef(rtc.setMutedState);
  setMutedStateRef.current = rtc.setMutedState;

  useEffect(() => {
    if (!inMeeting) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setMutedStateRef.current(!rtcMutedRef.current);
        return;
      }
      if (e.code !== 'Space' || e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (rtcMutedRef.current) {
        e.preventDefault();
        pttActiveRef.current = true;
        setMutedStateRef.current(false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && pttActiveRef.current) {
        e.preventDefault();
        pttActiveRef.current = false;
        setMutedStateRef.current(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [inMeeting]);

  const handleJoinRoom = useCallback(
    async ({
      roomId,
      name,
      password,
      maxParticipants,
      waitingRoom,
      withTunnel,
    }: {
      roomId: string;
      name: string;
      password: string;
      maxParticipants?: number;
      waitingRoom?: boolean;
      withTunnel?: boolean;
    }) => {
      let targetRoomId = roomId;

      if (status?.isHost) {
        if (withTunnel && !status.tunnel.running) {
          await fetch('/api/tunnel/start', {
            method: 'POST',
            headers: { 'X-Host-Token': hostToken },
          });
        }
        if (!targetRoomId) {
          const res = await fetch('/api/rooms', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Host-Token': hostToken,
            },
            body: JSON.stringify({
              password,
              maxParticipants: maxParticipants ?? 0,
              waitingRoom: waitingRoom ?? false,
            }),
          });
          const created: RoomInfo = await res.json();
          targetRoomId = created.id;
        }
        await fetchStatus();
      }

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const qs = new URLSearchParams({
        room: targetRoomId,
        name,
        password,
      });
      if (status?.isHost && hostToken) {
        qs.set('hostToken', hostToken);
      }

      intentionalLeaveRef.current = false;
      reconnectParamsRef.current = { roomId: targetRoomId, name, password };

      const connectWS = () =>
        new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(`${proto}//${window.location.host}/ws?${qs.toString()}`);
          let settled = false;

          ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            switch (msg.type) {
              case 'wait_approval':
                setWaitingApproval(true);
                if (!settled) {
                  settled = true;
                  resolve();
                }
                break;
              case 'welcome':
                setWaitingApproval(false);
                setSelfId(msg.payload.selfId);
                setRoom(msg.payload.room);
                setMessages(msg.payload.history || []);
                if (typeof msg.payload.notes === 'string') setNotes(msg.payload.notes);
                setInMeeting(true);
                if (!settled) {
                  settled = true;
                  resolve();
                }
                break;
              case 'room_state':
                setRoom(msg.payload);
                break;
              case 'chat':
                setMessages((prev) => [...prev, msg.payload]);
                if (!chatOpenRef.current && msg.payload.kind !== 'system') {
                  setUnreadCount((c) => c + 1);
                }
                break;
              case 'annotation':
                setStrokes((prev) => [
                  ...prev.filter((s) => Date.now() - s.createdAt < 4000),
                  { ...msg.payload, id: `${Date.now()}-${Math.random()}`, createdAt: Date.now() },
                ]);
                break;
              case 'p2p_signal':
                p2pHandleRef.current(msg.payload);
                break;
              case 'notes_update':
                if (typeof msg.payload?.notes === 'string') {
                  setNotes(msg.payload.notes);
                }
                break;
              case 'force_mute':
                setMutedStateRef.current(true);
                showToast(msg.payload || '房主已开启全员静音');
                break;
              case 'kicked':
              case 'room_ended':
                intentionalLeaveRef.current = true;
                showToast(msg.payload);
                ws.close();
                setWaitingApproval(false);
                setInMeeting(false);
                setRoom(null);
                setSelfId('');
                break;
            }
          };

          ws.onerror = () => {
            if (!settled) {
              settled = true;
              reject(new Error('无法连接到房间（请检查房间号或密码）'));
            }
          };

          ws.onclose = () => {
            if (!settled) {
              settled = true;
              reject(new Error('连接已关闭（房间不存在、已锁定或密码错误）'));
              return;
            }
            if (!intentionalLeaveRef.current && reconnectParamsRef.current) {
              showToast('网络波动，2 秒后尝试自动重连...');
              setTimeout(() => {
                if (!intentionalLeaveRef.current) {
                  connectWS().catch(() => {});
                }
              }, 2000);
            }
          };

          wsRef.current = ws;
        });

      await connectWS();
    },
    [status, hostToken, fetchStatus, showToast]
  );

  const handleLeave = useCallback(async () => {
    intentionalLeaveRef.current = true;
    reconnectParamsRef.current = null;
    if (status?.isHost) {
      sendWS('host_action', { action: 'end' });
      await fetch('/api/tunnel/stop', {
        method: 'POST',
        headers: { 'X-Host-Token': hostToken },
      }).catch(() => {});
      await fetchStatus().catch(() => {});
    }
    wsRef.current?.close();
    wsRef.current = null;
    setInMeeting(false);
    setRoom(null);
    setSelfId('');
  }, [status, hostToken, sendWS, fetchStatus]);

  const handleRefreshQuota = useCallback(async () => {
    const headers: Record<string, string> = {};
    if (hostToken) headers['X-Host-Token'] = hostToken;
    await fetch('/api/quota?force=1', { headers });
    await fetchStatus();
  }, [hostToken, fetchStatus]);

  if (!status) {
    return (
      <div className="min-h-screen  flex items-center justify-center text-xs text-zinc-500">
        正在连接 EdgeShare...
      </div>
    );
  }

  return (
    <div className="min-h-screen  text-zinc-100">
      {/* Hidden remote audio elements */}
      {rtc.remoteAudioStreams.map((stream) => (
        <RemoteAudioPlayer key={stream.id} stream={stream} sinkId={speakerId} />
      ))}

      <AnimatePresence mode="wait">
        {waitingApproval ? (
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex items-center justify-center p-4"
          >
            <div className="p-6 rounded-3xl border border-white/10 bg-zinc-900/80 text-center space-y-3 max-w-sm">
              <div className="w-10 h-10 mx-auto rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              <h2 className="text-sm font-semibold text-zinc-100">{t('waitingApprovalTitle')}</h2>
              <p className="text-xs text-zinc-400">{t('waitingApprovalDesc')}</p>
            </div>
          </motion.div>
        ) : !inMeeting || !room ? (
          <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LobbyView
              status={status}
              initialRoomId={initialRoomId}
              onJoinRoom={handleJoinRoom}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="meeting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-screen flex flex-col overflow-hidden "
          >
            <TopQuotaBar
              room={room}
              isHost={status.isHost}
              quota={status.quota}
              tunnel={status.tunnel}
              traffic={rtc.trafficStats}
              onRefreshQuota={handleRefreshQuota}
              onOpenSettings={() => setSettingsOpen(true)}
              onToggleLock={() => sendWS('host_action', { action: room.locked ? 'unlock' : 'lock' })}
              onMuteAll={() => sendWS('host_action', { action: 'mute_all' })}
              onApproveGuest={(targetId) => sendWS('host_action', { action: 'approve', targetId })}
              onRejectGuest={(targetId) => sendWS('host_action', { action: 'reject', targetId })}
              onLeave={handleLeave}
            />

            <div className="flex-1 flex min-h-0 overflow-hidden">
              <StageArea
                selfId={selfId}
                isHost={status.isHost}
                participants={room.participants}
                activeShares={room.activeShares || []}
                localScreenStream={rtc.localScreenStream}
                localCamStream={rtc.localCamStream}
                remoteVideoStreams={rtc.remoteVideoStreams}
                sharing={rtc.sharing}
                muted={rtc.muted}
                cameraOn={rtc.cameraOn}
                ecoMode={ecoMode}
                quotaWarning={status.quota.warning}
                recording={recorder.recording}
                recordElapsedSec={recorder.elapsedSec}
                strokes={strokes}
                shareQuality={rtc.shareQuality}
                chatOpen={chatOpen}
                unreadCount={unreadCount}
                onToggleMute={rtc.toggleMute}
                onToggleCamera={rtc.toggleCamera}
                onToggleEcoMode={() => setEcoMode((e) => !e)}
                onStartShare={(q) => rtc.startScreenShare(q)}
                onStopShare={rtc.stopScreenShare}
                onToggleRecord={(stream) => {
                  if (recorder.recording) {
                    recorder.stopRecording();
                    showToast('录制已保存');
                  } else {
                    const ok = recorder.startRecording(stream, rtc.localMicStream, rtc.remoteAudioStreams);
                    if (!ok) showToast('请先等待屏幕画面加载后再录制');
                  }
                }}
                onEmitStroke={(stroke) => sendWS('annotation', stroke)}
                onOpenDevices={() => setDevicesOpen(true)}
                onToggleChat={() => {
                  setChatOpen((o) => !o);
                  setUnreadCount(0);
                }}
                onKick={(targetId) => sendWS('host_action', { action: 'kick', targetId })}
              />

              <ChatDrawer
                open={chatOpen}
                messages={messages}
                transfers={p2p.transfers}
                notes={notes}
                selfId={selfId}
                onClose={() => setChatOpen(false)}
                onSend={(text, imageData) => sendWS('chat', { text, imageData })}
                onSendFile={(file) => p2p.sendFileToPeers(file)}
                onUpdateNotes={(next) => {
                  setNotes(next);
                  sendWS('notes_update', { notes: next });
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <DeviceModal
        open={devicesOpen}
        localMicStream={rtc.localMicStream}
        onClose={() => setDevicesOpen(false)}
        onSelectMic={(id) => rtc.switchMicDevice(id)}
        onSelectCam={(id) => rtc.switchCamDevice(id)}
        onSelectSpeaker={(id) => setSpeakerId(id)}
      />

      {status.isHost && (
        <SetupModal
          open={settingsOpen}
          config={status.config}
          tunnel={status.tunnel}
          hostToken={hostToken}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => fetchStatus()}
        />
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-zinc-800/95 border border-white/15 shadow-2xl text-xs text-zinc-100"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
