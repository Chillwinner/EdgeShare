import { motion } from 'framer-motion';
import {
  Activity,
  Copy,
  Check,
  Lock,
  Unlock,
  Settings,
  LogOut,
  ShieldAlert,
  RefreshCw,
  Globe,
  MicOff,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../i18n';
import { ThemeSwitcher } from '../theme';
import type { QuotaSnapshot, RoomInfo, SessionTrafficStats, TunnelStatus } from '../types';
import { LanguageSwitcher } from './LanguageSwitcher';

interface TopQuotaBarProps {
  room: RoomInfo;
  isHost: boolean;
  quota: QuotaSnapshot;
  tunnel: TunnelStatus;
  traffic: SessionTrafficStats;
  onRefreshQuota: () => void;
  onOpenSettings: () => void;
  onToggleLock: () => void;
  onMuteAll: () => void;
  onApproveGuest: (id: string) => void;
  onRejectGuest: (id: string) => void;
  onLeave: () => void;
}

export function TopQuotaBar({
  room,
  isHost,
  quota,
  tunnel,
  traffic,
  onRefreshQuota,
  onOpenSettings,
  onToggleLock,
  onMuteAll,
  onApproveGuest,
  onRejectGuest,
  onLeave,
}: TopQuotaBarProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const inviteBase = tunnel.running && tunnel.publicUrl ? tunnel.publicUrl : tunnel.lanUrl || window.location.origin;
  const inviteUrl = `${inviteBase}/?room=${room.id}`;

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const viewers = Math.max(room.participants.length - 1, 1);
  const rxMB = traffic.sessionEgressBytes / (1024 * 1024);
  const txMB = traffic.sessionUplinkBytes / (1024 * 1024);
  const isSendingMainly = traffic.currentUplinkMbps > traffic.currentBitrateMbps && traffic.currentUplinkMbps > 0.05;

  const estEgressMbps = isSendingMainly ? traffic.currentUplinkMbps * viewers : traffic.currentBitrateMbps;
  const sessionDisplayMB = isSendingMainly ? txMB : rxMB;
  const effectiveUsedGb = quota.available ? quota.usedGb + rxMB / 1024 : 0;
  const pct = quota.available ? Math.min((effectiveUsedGb / quota.freeLimitGb) * 100, 100) : 0;

  // Estimate remaining hours at current bitrate
  const remainingGb = Math.max(quota.freeLimitGb - effectiveUsedGb, 0);
  const gbPerHour = (estEgressMbps * 3600) / 8 / 1024;
  const estHours = gbPerHour > 0.01 ? remainingGb / gbPerHour : null;

  const barColor = quota.blocked
    ? 'from-rose-500 to-red-500'
    : quota.warning
    ? 'from-amber-400 to-orange-500'
    : 'from-emerald-400 to-cyan-400';

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className="h-14 px-4 flex items-center justify-between gap-3 border-b border-white/[0.08] bg-zinc-950/75 backdrop-blur-xl z-20 shrink-0"
    >
      {/* Left: Brand & Room Info */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <span className="text-xs font-bold text-white tracking-tight">ES</span>
          </div>
          <span className="font-semibold text-sm tracking-tight text-zinc-100 hidden sm:inline">EdgeShare</span>
        </div>

        <div className="h-4 w-px bg-white/10" />

        <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1">
          <span className="text-xs text-zinc-400">{t('roomLabel')}</span>
          <span className="text-xs font-mono font-semibold text-zinc-100">{room.id}</span>
          {room.locked && <Lock className="w-3 h-3 text-amber-400" />}
        </div>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={copyInvite}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-200 transition-colors cursor-pointer"
          title={inviteUrl}
        >
          {tunnel.running && <Globe className="w-3.5 h-3.5 text-emerald-400" />}
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
          <span className="hidden md:inline">{copied ? t('copiedInvite') : t('copyInvite')}</span>
        </motion.button>
      </div>

      {/* Center: Live Traffic & Monthly Quota Gauge */}
      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs text-zinc-300 font-mono">
            {isSendingMainly
              ? `${t('uplink')} ${txMB.toFixed(1)} MB · ${traffic.currentUplinkMbps.toFixed(2)} Mbps`
              : `${t('downlink')} ${rxMB.toFixed(1)} MB · ${traffic.currentBitrateMbps.toFixed(2)} Mbps`}
          </span>
        </div>

        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
          {quota.available ? (
            <>
              <div className="flex flex-col gap-1 min-w-[140px] sm:min-w-[190px]">
                <div className="flex items-center justify-between text-[11px] leading-none">
                  <span className="text-zinc-400 flex items-center gap-1">
                    {quota.blocked && <ShieldAlert className="w-3 h-3 text-rose-400" />}
                    {t('freeQuotaLabel')}
                  </span>
                  <span className="font-mono font-medium text-zinc-200">
                    {effectiveUsedGb.toFixed(1)} / {quota.freeLimitGb} GB
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    className={`h-full rounded-full bg-gradient-to-r ${barColor}`}
                  />
                </div>
              </div>
              {estHours !== null && (
                <span className="hidden xl:inline text-[11px] text-zinc-400 font-mono">
                  {t('estRemaining')} {estHours > 999 ? '999+' : estHours.toFixed(0)}h
                </span>
              )}
              {isHost && (
                <button
                  onClick={onRefreshQuota}
                  className="p-1 rounded-md hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                  title="Refresh Quota"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              )}
            </>
          ) : (
            <span className="text-xs text-zinc-400">
              {isHost ? `${t('noQuotaToken')} · ` : ''}{t('sessionUsed')} {sessionDisplayMB.toFixed(1)} MB
            </span>
          )}
        </div>
      </div>

      {/* Right: Host Controls & Leave */}
      <div className="flex items-center gap-2">
        <ThemeSwitcher />
        <LanguageSwitcher />
        {isHost && room.waiting && room.waiting.length > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/35 text-xs">
            <span className="text-amber-200 truncate max-w-[110px]">
              {room.waiting[0].name} {t('approveJoin')}
            </span>
            <button
              onClick={() => onApproveGuest(room.waiting![0].id)}
              className="p-1 rounded-md bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-300 cursor-pointer"
              title={t('allow')}
            >
              <UserCheck className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onRejectGuest(room.waiting![0].id)}
              className="p-1 rounded-md bg-rose-500/25 hover:bg-rose-500/40 text-rose-300 cursor-pointer"
              title={t('reject')}
            >
              <UserX className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {isHost && (
          <>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={onMuteAll}
              className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-zinc-300 transition-colors cursor-pointer"
              title={t('muteAll')}
            >
              <MicOff className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={onToggleLock}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                room.locked
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] text-zinc-300'
              }`}
              title={room.locked ? t('unlockRoom') : t('lockRoom')}
            >
              {room.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={onOpenSettings}
              className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-zinc-300 transition-colors cursor-pointer"
              title={t('settings')}
            >
              <Settings className="w-4 h-4" />
            </motion.button>
          </>
        )}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onLeave}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-medium transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{isHost ? t('endMeeting') : t('leaveMeeting')}</span>
        </motion.button>
      </div>
    </motion.header>
  );
}
