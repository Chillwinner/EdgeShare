import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Mic, MicOff, MonitorUp, UserX, Users } from 'lucide-react';
import type { Participant } from '../types';

interface ParticipantRailProps {
  participants: Participant[];
  selfId: string;
  isHost: boolean;
  onKick: (targetId: string) => void;
}

export function ParticipantRail({ participants, selfId, isHost, onKick }: ParticipantRailProps) {
  return (
    <aside className="w-56 xl:w-64 border-r border-white/[0.08] bg-zinc-950/50 backdrop-blur-xl hidden md:flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
          <Users className="w-3.5 h-3.5 text-zinc-400" />
          <span>参会成员</span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-[11px] font-mono text-zinc-300">
          {participants.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <AnimatePresence initial={false}>
          {participants.map((p) => {
            const isSelf = p.id === selfId;
            return (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, x: -12, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -12, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                className={`group relative p-2.5 rounded-xl border transition-colors flex items-center justify-between gap-2 ${
                  p.speaking && !p.muted
                    ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                    : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Avatar with speaking ring */}
                  <div className="relative shrink-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
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
                        animate={{ scale: 1.35, opacity: 0 }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="absolute inset-0 rounded-full border-2 border-emerald-400"
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-zinc-100 truncate">
                        {p.name}
                        {isSelf && <span className="text-zinc-500 ml-1">(我)</span>}
                      </span>
                      {p.isHost && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {p.sharing && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-orange-400 font-medium">
                          <MonitorUp className="w-2.5 h-2.5" />
                          共享中
                        </span>
                      )}
                      {!p.sharing && (
                        <span className="text-[10px] text-zinc-500">
                          {p.muted ? '已静音' : p.speaking ? '正在说话' : '在线'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {p.muted ? (
                    <MicOff className="w-3.5 h-3.5 text-rose-400/80" />
                  ) : (
                    <Mic className={`w-3.5 h-3.5 ${p.speaking ? 'text-emerald-400' : 'text-zinc-500'}`} />
                  )}
                  {isHost && !isSelf && (
                    <button
                      onClick={() => onKick(p.id)}
                      className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 transition-all cursor-pointer"
                      title="移出会议"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </aside>
  );
}
