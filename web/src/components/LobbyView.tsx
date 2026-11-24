import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Globe,
  HardDriveUpload,
  KeyRound,
  Lock,
  MonitorUp,
  Settings,
  ShieldCheck,
  Sparkles,
  Wifi,
  Zap,
  Loader2,
  BookOpen,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { ThemeSwitcher } from '../theme';
import type { AppStatus } from '../types';
import { LanguageSwitcher } from './LanguageSwitcher';

interface LobbyViewProps {
  status: AppStatus;
  initialRoomId: string;
  onJoinRoom: (opts: {
    roomId: string;
    name: string;
    password: string;
    maxParticipants?: number;
    waitingRoom?: boolean;
    withTunnel?: boolean;
  }) => Promise<void>;
  onOpenSettings: () => void;
}

export function LobbyView({ status, initialRoomId, onJoinRoom, onOpenSettings }: LobbyViewProps) {
  const { t } = useI18n();
  const isGuestJoin = Boolean(initialRoomId && !status.isHost);
  const [name, setName] = useState(status.isHost ? t('hostDefaultName') : '');
  const [roomId, setRoomId] = useState(initialRoomId);
  const [password, setPassword] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [waitingRoom, setWaitingRoom] = useState(false);
  const [withTunnel, setWithTunnel] = useState(status.tunnel.hasBinary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openStep, setOpenStep] = useState<number>(status.config.configured ? -1 : 0);

  useEffect(() => {
    if (status.isHost && !name) {
      setName(t('hostDefaultName'));
    }
  }, [status.isHost, name, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('nicknamePlaceholder'));
      return;
    }
    if (status.isHost && !status.config.configured) {
      onOpenSettings();
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onJoinRoom({
        roomId: roomId.trim(),
        name: name.trim(),
        password: password.trim(),
        maxParticipants: status.isHost ? maxParticipants : undefined,
        waitingRoom: status.isHost ? waitingRoom : undefined,
        withTunnel: status.isHost ? withTunnel : false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const guideSteps = [
    {
      title: t('guideStep1Title'),
      desc: t('guideStep1Desc'),
      action: (
        <a
          href="https://dash.cloudflare.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-orange-400 hover:text-orange-300 mt-1.5"
        >
          <span>{t('openCfDash')}</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      ),
    },
    {
      title: t('guideStep2Title'),
      desc: t('guideStep2Desc'),
    },
    {
      title: t('guideStep3Title'),
      desc: t('guideStep3Desc'),
      action: status.isHost ? (
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 mt-1.5 cursor-pointer"
        >
          <KeyRound className="w-3 h-3" />
          <span>{t('configureBtn')}</span>
        </button>
      ) : null,
    },
    {
      title: t('guideStep4Title'),
      desc: t('guideStep4Desc'),
    },
  ];

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden bg-[#09090b]">
      {/* Ambient Animated Orbs & Subtle Grid */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="ambient-orb absolute -top-36 -left-24 w-[520px] h-[520px] rounded-full bg-orange-500/14 blur-[130px]" />
        <div className="ambient-orb absolute -bottom-36 -right-24 w-[560px] h-[560px] rounded-full bg-cyan-500/12 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* Top Navigation */}
      <header className="relative z-20 w-full max-w-6xl mx-auto px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
            <MonitorUp className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-zinc-100">EdgeShare</span>
            <p className="text-[11px] text-zinc-400 hidden sm:block">{t('brandSub')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <LanguageSwitcher />
          {status.isHost && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-zinc-200 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('settings')}</span>
            </motion.button>
          )}
        </div>
      </header>

      {/* Main Split Content */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-5 py-6 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
        {/* Left Column: Hero + Features + Interactive Setup Guide */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="lg:col-span-7 space-y-6"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/25 text-xs font-medium text-orange-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('heroBadge')}</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.12] text-zinc-100">
              {t('heroTitle1')}
              <br />
              <span className="bg-gradient-to-r from-orange-400 via-amber-300 to-cyan-300 bg-clip-text text-transparent">
                {t('heroTitle2')}
              </span>
            </h1>
            <p className="text-sm sm:text-base text-zinc-400 max-w-xl leading-relaxed">{t('heroDesc')}</p>
          </div>

          {/* 3 Feature Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] backdrop-blur-md">
              <Zap className="w-4 h-4 text-orange-400 mb-2" />
              <div className="text-xs font-semibold text-zinc-100">{t('feat1Title')}</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">{t('feat1Desc')}</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] backdrop-blur-md">
              <HardDriveUpload className="w-4 h-4 text-cyan-400 mb-2" />
              <div className="text-xs font-semibold text-zinc-100">{t('feat2Title')}</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">{t('feat2Desc')}</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] backdrop-blur-md">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mb-2" />
              <div className="text-xs font-semibold text-zinc-100">{t('feat3Title')}</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">{t('feat3Desc')}</div>
            </div>
          </div>

          {/* Interactive Step-by-Step Setup Guide (shown for Host) */}
          {status.isHost && (
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 backdrop-blur-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                  <BookOpen className="w-4 h-4 text-orange-400" />
                  <span>{t('guideTitle')}</span>
                </div>
                <span className="text-[11px] text-zinc-500">4 Steps</span>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {guideSteps.map((step, idx) => {
                  const isOpen = openStep === idx;
                  return (
                    <div key={idx}>
                      <button
                        type="button"
                        onClick={() => setOpenStep(isOpen ? -1 : idx)}
                        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                      >
                        <span className={`text-xs font-medium ${isOpen ? 'text-orange-300' : 'text-zinc-300'}`}>
                          {step.title}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-3 text-xs text-zinc-400 leading-relaxed">
                              <p>{step.desc}</p>
                              {step.action}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>

        {/* Right Column: Action Card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.06 }}
          className="lg:col-span-5 rounded-3xl border border-white/10 bg-zinc-900/75 backdrop-blur-2xl shadow-2xl p-6 sm:p-7"
        >
          {/* Host Status Banner */}
          {status.isHost && (
            <div className="mb-5">
              {!status.config.configured ? (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={onOpenSettings}
                  className="w-full p-3.5 rounded-2xl bg-orange-500/12 hover:bg-orange-500/18 border border-orange-500/30 flex items-center justify-between text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <KeyRound className="w-4 h-4 text-orange-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-orange-200">{t('setupRequiredTitle')}</div>
                      <div className="text-[11px] text-orange-300/70">{t('setupRequiredDesc')}</div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-orange-400 shrink-0" />
                </motion.button>
              ) : (
                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-zinc-300">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t('sfuReady')}</span>
                  </div>
                  {status.quota.available ? (
                    <span className="text-xs font-mono text-zinc-300">
                      {t('monthUsed')}{' '}
                      <strong className="text-emerald-400">{status.quota.usedGb.toFixed(1)}</strong> / 1000 GB
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-500">{t('noQuotaToken')}</span>
                  )}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300"
              >
                {error}
              </motion.div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">{t('nickname')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('nicknamePlaceholder')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/80 border border-white/10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
                autoFocus
              />
            </div>

            {!status.isHost && (
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{t('roomId')}</label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder={t('roomIdPlaceholder')}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/80 border border-white/10 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/60"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-zinc-400" />
                <span>{status.isHost ? t('roomPassword') : t('roomPasswordGuest')}</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={status.isHost ? t('passwordPlaceholderHost') : t('passwordPlaceholderGuest')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/80 border border-white/10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/60"
              />
            </div>

            {status.isHost && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-300">{t('maxParticipants')}</span>
                <div className="flex items-center gap-1">
                  {[
                    { label: `4${t('peopleUnit')}`, val: 4 },
                    { label: `8${t('peopleUnit')}`, val: 8 },
                    { label: `12${t('peopleUnit')}`, val: 12 },
                    { label: t('unlimited'), val: 0 },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setMaxParticipants(opt.val)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                        maxParticipants === opt.val
                          ? 'bg-orange-500/25 border border-orange-500/40 text-orange-300'
                          : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {status.isHost && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-zinc-200">{t('waitingRoomTitle')}</div>
                  <div className="text-[11px] text-zinc-400">{t('waitingRoomDesc')}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setWaitingRoom(!waitingRoom)}
                  className={`w-10 h-5.5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                    waitingRoom ? 'bg-orange-500' : 'bg-zinc-700'
                  }`}
                >
                  <motion.div
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className={`w-4.5 h-4.5 rounded-full bg-white shadow ${waitingRoom ? 'ml-auto' : ''}`}
                  />
                </button>
              </div>
            )}

            {status.isHost && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {withTunnel ? (
                    <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Wifi className="w-4 h-4 text-zinc-400 shrink-0" />
                  )}
                  <div>
                    <div className="text-xs font-medium text-zinc-200">{t('tunnelTitle')}</div>
                    <div className="text-[11px] text-zinc-400">
                      {status.tunnel.hasBinary ? t('tunnelDescReady') : t('tunnelDescMissing')}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWithTunnel(!withTunnel)}
                  className={`w-10 h-5.5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                    withTunnel ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <motion.div
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className={`w-4.5 h-4.5 rounded-full bg-white shadow ${withTunnel ? 'ml-auto' : ''}`}
                  />
                </button>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{withTunnel ? t('startingRoom') : t('joiningRoom')}</span>
                </>
              ) : (
                <>
                  <span>{isGuestJoin || !status.isHost ? t('joinMeeting') : t('createAndStart')}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>
          </form>
        </motion.div>
      </main>
    </div>
  );
}
