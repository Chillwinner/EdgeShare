import { AnimatePresence, motion } from 'framer-motion';
import { X, KeyRound, ShieldCheck, Globe, Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../i18n';
import type { PublicConfig, TunnelStatus } from '../types';

interface SetupModalProps {
  open: boolean;
  config: PublicConfig;
  tunnel: TunnelStatus;
  hostToken: string;
  onClose: () => void;
  onSaved: () => void;
}

export function SetupModal({ open, config, tunnel, hostToken, onClose, onSaved }: SetupModalProps) {
  const { t } = useI18n();
  const [appId, setAppId] = useState(config.appId || '');
  const [appSecret, setAppSecret] = useState('');
  const [accountId, setAccountId] = useState(config.accountId || '');
  const [analyticsToken, setAnalyticsToken] = useState('');
  const [quotaWarnGb, setQuotaWarnGb] = useState(String(config.quotaWarnGb || 850));
  const [quotaLimitGb, setQuotaLimitGb] = useState(String(config.quotaLimitGb || 950));
  const [saving, setSaving] = useState(false);
  const [installingTunnel, setInstallingTunnel] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Host-Token': hostToken,
        },
        body: JSON.stringify({
          appId: appId.trim(),
          appSecret: appSecret.trim(),
          accountId: accountId.trim(),
          analyticsToken: analyticsToken.trim(),
          quotaWarnGb: Number(quotaWarnGb) || 850,
          quotaLimitGb: Number(quotaLimitGb) || 950,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleInstallTunnel = async () => {
    setInstallingTunnel(true);
    setError('');
    try {
      const res = await fetch('/api/tunnel/install', {
        method: 'POST',
        headers: { 'X-Host-Token': hostToken },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '下载失败');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingTunnel(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-900/95 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">{t('cfModalTitle')}</h2>
                  <p className="text-xs text-zinc-400">{t('cfModalSub')}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Realtime SFU App ID *</label>
                  <input
                    type="text"
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    placeholder="在 Cloudflare Dashboard -> Realtime -> SFU 创建"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500/60"
                    required={!config.configured}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Realtime SFU App Secret {config.appSecretMasked ? `(已配置 ${config.appSecretMasked})` : '*'}
                  </label>
                  <input
                    type="password"
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    placeholder={config.configured ? t('appSecretKeep') : 'App Secret'}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500/60"
                    required={!config.configured}
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-white/[0.06] space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>额度监控与防超额熔断（可选）</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[0.6875rem] text-zinc-400 mb-1">Cloudflare Account ID</label>
                    <input
                      type="text"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      placeholder="32位 Account ID"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500/60"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.6875rem] text-zinc-400 mb-1">
                      Analytics 只读 Token {config.analyticsMasked ? `(${config.analyticsMasked})` : ''}
                    </label>
                    <input
                      type="password"
                      value={analyticsToken}
                      onChange={(e) => setAnalyticsToken(e.target.value)}
                      placeholder="Account Analytics: Read"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500/60"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[0.6875rem] text-zinc-400 mb-1">黄灯警告阈值 (GB)</label>
                    <input
                      type="number"
                      value={quotaWarnGb}
                      onChange={(e) => setQuotaWarnGb(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500/60"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.6875rem] text-zinc-400 mb-1">自动熔断上限 (GB)</label>
                    <input
                      type="number"
                      value={quotaLimitGb}
                      onChange={(e) => setQuotaLimitGb(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500/60"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  <div>
                    <div className="text-xs font-medium text-zinc-200">{t('tunnelTitle')} (cloudflared)</div>
                    <div className="text-[0.6875rem] text-zinc-400">
                      {tunnel.hasBinary ? t('tunnelInstalled') : t('tunnelNotInstalled')}
                    </div>
                  </div>
                </div>
                {!tunnel.hasBinary && (
                  <button
                    type="button"
                    disabled={installingTunnel}
                    onClick={handleInstallTunnel}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs cursor-pointer disabled:opacity-50"
                  >
                    {installingTunnel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>{installingTunnel ? t('installing') : t('installTunnel')}</span>
                  </button>
                )}
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs text-zinc-300 hover:bg-white/5 cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 cursor-pointer disabled:opacity-50"
                >
                  {saving ? t('saving') : t('saveConfig')}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
