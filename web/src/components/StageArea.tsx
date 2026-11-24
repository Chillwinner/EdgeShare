import { AnimatePresence, motion } from 'framer-motion';
import {
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  MonitorUp,
  MonitorOff,
  MessageSquare,
  ChevronDown,
  Video,
  VideoOff,
  Columns2,
  Square,
  Leaf,
  Crown,
  UserX,
  ChevronUp,
  Pencil,
  Circle,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { AnnotationStroke, Participant, ScreenShareInfo, ShareQuality } from '../types';
import { AnnotationCanvas } from './AnnotationCanvas';

interface StreamVideoProps {
  stream: MediaStream;
  muted?: boolean;
  mirror?: boolean;
  className?: string;
  onDoubleClick?: () => void;
}

function StreamVideo({ stream, muted = false, mirror = false, className = '', onDoubleClick }: StreamVideoProps) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!el) return;
    el.srcObject = stream;
    el.play().catch(() => {});
  }, [el, stream]);

  return (
    <video
      ref={setEl}
      autoPlay
      playsInline
      muted={muted}
      onDoubleClick={onDoubleClick}
      className={`${className} ${mirror ? '-scale-x-100' : ''}`}
    />
  );
}

interface StageAreaProps {
  selfId: string;
  isHost: boolean;
  participants: Participant[];
  activeShares: ScreenShareInfo[];
  localScreenStream: MediaStream | null;
  localCamStream: MediaStream | null;
  remoteVideoStreams: Record<string, MediaStream>;
  sharing: boolean;
  muted: boolean;
  cameraOn: boolean;
  ecoMode: boolean;
  quotaWarning: boolean;
  recording: boolean;
  recordElapsedSec: number;
  strokes: AnnotationStroke[];
  shareQuality: ShareQuality;
  chatOpen: boolean;
  unreadCount: number;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleEcoMode: () => void;
  onStartShare: (quality: ShareQuality) => void;
  onStopShare: () => void;
  onToggleRecord: (videoStream: MediaStream | null) => void;
  onEmitStroke: (stroke: Omit<AnnotationStroke, 'id' | 'senderId' | 'senderName' | 'createdAt'>) => void;
  onOpenDevices: () => void;
  onToggleChat: () => void;
  onKick: (targetId: string) => void;
}

export function StageArea({
  selfId,
  isHost,
  participants,
  activeShares,
  localScreenStream,
  localCamStream,
  remoteVideoStreams,
  sharing,
  muted,
  cameraOn,
  ecoMode,
  quotaWarning,
  recording,
  recordElapsedSec,
  strokes,
  shareQuality,
  chatOpen,
  unreadCount,
  onToggleMute,
  onToggleCamera,
  onToggleEcoMode,
  onStartShare,
  onStopShare,
  onToggleRecord,
  onEmitStroke,
  onOpenDevices,
  onToggleChat,
  onKick,
}: StageAreaProps) {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [focusedSharerId, setFocusedSharerId] = useState<string>('');
  const [splitView, setSplitView] = useState(false);
  const [stripCollapsed, setStripCollapsed] = useState(false);
  const [annotateMode, setAnnotateMode] = useState<'off' | 'pen' | 'laser'>('off');

  const QUALITY_LABELS: Record<ShareQuality, { label: string; desc: string }> = {
    eco: { label: t('qEco'), desc: t('qEcoDesc') },
    standard: { label: t('qStd'), desc: t('qStdDesc') },
    ultra: { label: t('qUltra'), desc: t('qUltraDesc') },
  };
  useEffect(() => {
    if (activeShares.length === 0) {
      setFocusedSharerId('');
      setSplitView(false);
      return;
    }
    if (!activeShares.some((s) => s.sharerId === focusedSharerId)) {
      setFocusedSharerId(activeShares[0].sharerId);
    }
    if (activeShares.length < 2 && splitView) {
      setSplitView(false);
    }
  }, [activeShares, focusedSharerId, splitView]);

  const toggleFullscreen = () => {
    if (!stageRef.current) return;
    if (!document.fullscreenElement) {
      stageRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const getShareStream = (share: ScreenShareInfo): MediaStream | null => {
    if (share.sharerId === selfId) return localScreenStream;
    return remoteVideoStreams[share.videoTrackName] || null;
  };

  const getCamStream = (p: Participant): MediaStream | null => {
    if (p.id === selfId) return cameraOn ? localCamStream : null;
    if (ecoMode || !p.cameraOn || !p.camTrackName) return null;
    return remoteVideoStreams[p.camTrackName] || null;
  };

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      const score = (p: Participant) =>
        (p.speaking && !p.muted ? 8 : 0) + (p.cameraOn ? 4 : 0) + (p.sharing ? 2 : 0) + (p.isHost ? 1 : 0);
      return score(b) - score(a);
    });
  }, [participants]);

  const hasShares = activeShares.length > 0;
  const visibleShares = splitView && activeShares.length >= 2
    ? activeShares.slice(0, 4)
    : activeShares.filter((s) => s.sharerId === (focusedSharerId || activeShares[0]?.sharerId));

  const gridColsClass =
    sortedParticipants.length <= 1
      ? 'grid-cols-1 max-w-2xl'
      : sortedParticipants.length <= 2
      ? 'grid-cols-1 sm:grid-cols-2 max-w-4xl'
      : sortedParticipants.length <= 4
      ? 'grid-cols-2 max-w-4xl'
      : sortedParticipants.length <= 6
      ? 'grid-cols-2 lg:grid-cols-3 max-w-5xl'
      : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4 max-w-6xl';

  return (
    <div ref={stageRef} className="relative flex-1 flex flex-col min-w-0 p-3 sm:p-4 gap-3 overflow-hidden">
      {/* Main Content Area: either Screen Share Stage + Camera Filmstrip, OR Centered Video Grid */}
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        {hasShares ? (
          <>
            {/* Multi-screen switcher bar when 2+ screens are shared */}
            <AnimatePresence>
              {activeShares.length > 1 && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/80 border border-white/10 shrink-0"
                >
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    <span className="text-[11px] text-zinc-400 mr-1 shrink-0">
                      正在共享 ({activeShares.length}):
                    </span>
                    {activeShares.map((s) => {
                      const active = !splitView && s.sharerId === (focusedSharerId || activeShares[0]?.sharerId);
                      return (
                        <button
                          key={s.sharerId}
                          onClick={() => {
                            setSplitView(false);
                            setFocusedSharerId(s.sharerId);
                          }}
                          className={`relative px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                            active ? 'text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="active-share-pill"
                              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                              className="absolute inset-0 rounded-lg bg-orange-500/25 border border-orange-500/40"
                            />
                          )}
                          <span className="relative z-10">{s.sharerName} 的屏幕</span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setSplitView((v) => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors cursor-pointer shrink-0 ${
                      splitView
                        ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-zinc-300'
                    }`}
                  >
                    {splitView ? <Square className="w-3.5 h-3.5" /> : <Columns2 className="w-3.5 h-3.5" />}
                    <span>{splitView ? '焦点大图' : activeShares.length > 2 ? '多屏宫格' : '双屏对比'}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Screen Share Viewport(s) */}
            <div
              className={`flex-1 min-h-0 grid gap-3 ${
                visibleShares.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
              }`}
            >
              <AnimatePresence mode="popLayout">
                {visibleShares.map((share) => {
                  const stream = getShareStream(share);
                  const isSelfShare = share.sharerId === selfId;
                  return (
                    <motion.div
                      key={share.sharerId}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                      className="relative w-full h-full min-h-[200px] rounded-2xl border border-white/10 bg-black/85 shadow-2xl overflow-hidden flex items-center justify-center group"
                    >
                      {stream ? (
                        <StreamVideo
                          stream={stream}
                          muted={isSelfShare}
                          onDoubleClick={toggleFullscreen}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-xs text-zinc-400 animate-pulse">
                          正在连接 {share.sharerName} 的屏幕画面...
                        </div>
                      )}

                      <AnnotationCanvas
                        sharerId={share.sharerId}
                        mode={annotateMode}
                        strokes={strokes}
                        onEmitStroke={onEmitStroke}
                      />

                      <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/10 flex items-center gap-2 text-xs text-zinc-200">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>{isSelfShare ? '你正在共享' : `${share.sharerName} 的屏幕`}</span>
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-zinc-300">
                          {QUALITY_LABELS[share.quality]?.label || share.quality}
                        </span>
                      </div>

                      <button
                        onClick={toggleFullscreen}
                        className="absolute top-3 right-3 p-2 rounded-xl bg-black/65 hover:bg-black/85 backdrop-blur-md border border-white/10 text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="切换全屏 (双击画面也可)"
                      >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Bottom Camera Filmstrip (collapsible) */}
            <div className="shrink-0 flex flex-col gap-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] text-zinc-500">参会成员 ({sortedParticipants.length})</span>
                <button
                  onClick={() => setStripCollapsed((c) => !c)}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  {stripCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>{stripCollapsed ? '展开摄像头栏' : '收起摄像头栏'}</span>
                </button>
              </div>
              <AnimatePresence initial={false}>
                {!stripCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 120, opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                    className="flex items-center gap-2.5 overflow-x-auto overflow-y-hidden py-0.5"
                  >
                    <AnimatePresence initial={false}>
                      {sortedParticipants.map((p) => {
                  const camStream = getCamStream(p);
                  const isSelf = p.id === selfId;
                  return (
                    <motion.div
                      key={p.id}
                      layoutId={`cam-card-${p.id}`}
                      layout
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                      className={`group relative w-44 sm:w-48 h-full shrink-0 rounded-2xl border overflow-hidden flex items-center justify-center bg-zinc-900/80 ${
                        p.speaking && !p.muted
                          ? 'border-emerald-400/70 shadow-lg shadow-emerald-500/15'
                          : 'border-white/10'
                      }`}
                    >
                      {camStream ? (
                        <StreamVideo
                          stream={camStream}
                          muted
                          mirror={isSelf}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="relative">
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                                p.isHost
                                  ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white'
                                  : 'bg-zinc-800 text-zinc-200 border border-white/10'
                              }`}
                            >
                              {p.name.slice(0, 1).toUpperCase()}
                            </div>
                            {p.speaking && !p.muted && (
                              <motion.span
                                initial={{ scale: 0.9, opacity: 0.8 }}
                                animate={{ scale: 1.4, opacity: 0 }}
                                transition={{ duration: 1, repeat: Infinity }}
                                className="absolute inset-0 rounded-full border-2 border-emerald-400"
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Bottom name & status overlay */}
                      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px]">
                        <span className="truncate text-zinc-100 flex items-center gap-1">
                          {p.isHost && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                          {p.name}
                          {isSelf && <span className="text-zinc-400">(我)</span>}
                        </span>
                        {p.muted ? (
                          <MicOff className="w-3 h-3 text-rose-400 shrink-0" />
                        ) : (
                          <Mic className={`w-3 h-3 shrink-0 ${p.speaking ? 'text-emerald-400' : 'text-zinc-400'}`} />
                        )}
                      </div>

                      {isHost && !isSelf && (
                        <button
                          onClick={() => onKick(p.id)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 hover:bg-rose-500/80 text-zinc-200 transition-all cursor-pointer"
                          title="移出会议"
                        >
                          <UserX className="w-3 h-3" />
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        ) : (
          /* No Screen Shares -> Centered Adaptive Camera / Participant Grid */
          <div className="flex-1 min-h-0 flex items-center justify-center overflow-y-auto py-2">
            <div className={`w-full mx-auto grid gap-3 sm:gap-4 ${gridColsClass}`}>
              <AnimatePresence initial={false}>
                {sortedParticipants.map((p) => {
                  const camStream = getCamStream(p);
                  const isSelf = p.id === selfId;
                  return (
                    <motion.div
                      key={p.id}
                      layoutId={`cam-card-${p.id}`}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                      className={`group relative aspect-video rounded-3xl border overflow-hidden flex items-center justify-center bg-zinc-900/70 backdrop-blur-xl shadow-xl ${
                        p.speaking && !p.muted
                          ? 'border-emerald-400/70 shadow-emerald-500/15'
                          : 'border-white/10'
                      }`}
                    >
                      {camStream ? (
                        <StreamVideo
                          stream={camStream}
                          muted
                          mirror={isSelf}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2.5">
                          <div className="relative">
                            <div
                              className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold shadow-lg ${
                                p.isHost
                                  ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white'
                                  : 'bg-zinc-800 text-zinc-200 border border-white/10'
                              }`}
                            >
                              {p.name.slice(0, 1).toUpperCase()}
                            </div>
                            {p.speaking && !p.muted && (
                              <motion.span
                                initial={{ scale: 0.9, opacity: 0.8 }}
                                animate={{ scale: 1.38, opacity: 0 }}
                                transition={{ duration: 1, repeat: Infinity }}
                                className="absolute inset-0 rounded-full border-2 border-emerald-400"
                              />
                            )}
                          </div>
                          <span className="text-xs text-zinc-400">
                            {p.cameraOn && ecoMode ? '省流模式已隐藏画面' : p.muted ? '已静音' : '摄像头未开启'}
                          </span>
                        </div>
                      )}

                      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-black/55 backdrop-blur-md border border-white/[0.06] text-xs">
                        <span className="truncate text-zinc-100 font-medium flex items-center gap-1.5">
                          {p.isHost && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                          {p.name}
                          {isSelf && <span className="text-zinc-400">(我)</span>}
                        </span>
                        {p.muted ? (
                          <MicOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        ) : (
                          <Mic className={`w-3.5 h-3.5 shrink-0 ${p.speaking ? 'text-emerald-400' : 'text-zinc-400'}`} />
                        )}
                      </div>

                      {isHost && !isSelf && (
                        <button
                          onClick={() => onKick(p.id)}
                          className="absolute top-3 right-3 p-1.5 rounded-xl bg-black/60 opacity-0 group-hover:opacity-100 hover:bg-rose-500/80 text-zinc-200 transition-all cursor-pointer"
                          title="移出会议"
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Control Dock */}
      <div className="flex justify-center shrink-0">
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="px-3 py-2 rounded-2xl bg-zinc-900/90 backdrop-blur-2xl border border-white/10 shadow-2xl flex items-center gap-2 z-20 flex-wrap justify-center"
        >
          {/* Mic Toggle */}
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={onToggleMute}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              muted
                ? 'bg-rose-500/20 border border-rose-500/35 text-rose-300'
                : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-100'
            }`}
          >
            {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-emerald-400" />}
            <span>{muted ? t('muted') : t('mic')}</span>
          </motion.button>

          {/* Camera Toggle */}
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={onToggleCamera}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              cameraOn
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-100'
            }`}
          >
            {cameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4 text-zinc-400" />}
            <span>{cameraOn ? t('camOff') : t('camera')}</span>
          </motion.button>

          {/* Screen Share + Quality Selector */}
          <div className="relative flex items-center">
            {sharing ? (
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={onStopShare}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-xs font-semibold text-white shadow-lg shadow-rose-500/25 cursor-pointer"
              >
                <MonitorOff className="w-4 h-4" />
                <span>{t('stopShare')}</span>
              </motion.button>
            ) : (
              <div className="flex items-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg shadow-orange-500/20">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onStartShare(shareQuality)}
                  className="flex items-center gap-2 pl-3.5 pr-2.5 py-2 text-xs font-semibold text-white cursor-pointer"
                >
                  <MonitorUp className="w-4 h-4" />
                  <span>{t('shareScreen')}</span>
                </motion.button>
                <button
                  onClick={() => setQualityMenuOpen(!qualityMenuOpen)}
                  className="px-2 py-2 border-l border-white/20 text-white/90 hover:text-white cursor-pointer"
                  title="选择共享画质"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <AnimatePresence>
              {qualityMenuOpen && !sharing && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-12 left-0 w-56 rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl p-1.5 z-30"
                >
                  {(Object.keys(QUALITY_LABELS) as ShareQuality[]).map((q) => {
                    const blockedByQuota = quotaWarning && q === 'ultra';
                    return (
                      <button
                        key={q}
                        disabled={blockedByQuota}
                        onClick={() => {
                          setQualityMenuOpen(false);
                          onStartShare(q);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          shareQuality === q ? 'bg-orange-500/15 text-orange-300' : 'hover:bg-white/5 text-zinc-200'
                        }`}
                      >
                        <div className="text-xs font-medium">
                          {QUALITY_LABELS[q].label}
                          {blockedByQuota && ' (额度预警禁用)'}
                        </div>
                        <div className="text-[11px] text-zinc-400">{QUALITY_LABELS[q].desc}</div>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Annotation / Laser Pointer (when sharing) */}
          {hasShares && (
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() =>
                setAnnotateMode((m) => (m === 'off' ? 'laser' : m === 'laser' ? 'pen' : 'off'))
              }
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                annotateMode !== 'off'
                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.08] text-zinc-300'
              }`}
              title="切换标注：关闭 -> 激光笔 -> 画笔"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {annotateMode === 'off' ? t('annotate') : annotateMode === 'laser' ? t('laser') : t('pen')}
              </span>
            </motion.button>
          )}

          {/* Local Screen Recording (when sharing) */}
          {hasShares && (
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => {
                const targetShare = visibleShares[0];
                const stream = targetShare ? getShareStream(targetShare) : null;
                onToggleRecord(stream);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                recording
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.08] text-zinc-300'
              }`}
              title={t('record')}
            >
              <Circle className={`w-3 h-3 ${recording ? 'fill-rose-500 text-rose-500 animate-pulse' : ''}`} />
              <span className="font-mono">
                {recording
                  ? `${String(Math.floor(recordElapsedSec / 60)).padStart(2, '0')}:${String(
                      recordElapsedSec % 60
                    ).padStart(2, '0')}`
                  : t('record')}
              </span>
            </motion.button>
          )}

          {/* Eco Mode Toggle */}
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={onToggleEcoMode}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              ecoMode
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.08] text-zinc-300'
            }`}
            title={t('ecoMode')}
          >
            <Leaf className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{ecoMode ? t('ecoActive') : t('ecoMode')}</span>
          </motion.button>

          {/* Devices Picker */}
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={onOpenDevices}
            className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-300 transition-colors cursor-pointer"
            title={t('devices')}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </motion.button>

          {/* Chat Toggle */}
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={onToggleChat}
            className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              chatOpen
                ? 'bg-cyan-500/15 border-cyan-500/35 text-cyan-300'
                : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.08] text-zinc-100'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">{t('chat')}</span>
            {unreadCount > 0 && !chatOpen && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="px-1.5 py-0.5 rounded-full bg-orange-500 text-[10px] font-bold text-white leading-none"
              >
                {unreadCount}
              </motion.span>
            )}
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
