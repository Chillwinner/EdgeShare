import { AnimatePresence, motion } from 'framer-motion';
import { Send, X, ImagePlus, Paperclip, Download, FileText, MessageSquare } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { ChatMessage, P2PFileItem } from '../types';

interface ChatDrawerProps {
  open: boolean;
  messages: ChatMessage[];
  transfers: P2PFileItem[];
  notes: string;
  selfId: string;
  onClose: () => void;
  onSend: (text: string, imageData?: string) => void;
  onSendFile: (file: File) => void;
  onUpdateNotes: (notes: string) => void;
}

export function ChatDrawer({
  open,
  messages,
  transfers,
  notes,
  selfId,
  onClose,
  onSend,
  onSendFile,
  onUpdateNotes,
}: ChatDrawerProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'chat' | 'notes'>('chat');
  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && tab === 'chat') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, transfers, open, tab]);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            setPendingImage(reader.result);
          }
        };
        reader.readAsDataURL(file);
        e.preventDefault();
        break;
      }
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPendingImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleP2PFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onSendFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onSendFile(file);
  };

  const exportNotes = () => {
    const blob = new Blob([notes], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-notes-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const submit = () => {
    if (!text.trim() && !pendingImage) return;
    onSend(text.trim(), pendingImage || undefined);
    setText('');
    setPendingImage(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className="fixed inset-y-0 right-0 z-40 sm:relative sm:inset-auto h-full border-l border-white/[0.08] bg-zinc-950/90 sm:bg-zinc-950/75 backdrop-blur-2xl flex flex-col overflow-hidden shrink-0"
          >
            {dragging && (
              <div className="absolute inset-0 z-30 bg-indigo-500/15 border-2 border-dashed border-indigo-400 flex items-center justify-center text-xs font-semibold text-indigo-200 pointer-events-none">
                {t('dropP2P')}
              </div>
            )}

            <div className="w-[340px] h-full flex flex-col">
              {/* Top Header with Tabs */}
              <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl">
                  <button
                    onClick={() => setTab('chat')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      tab === 'chat' ? 'bg-white/10 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{t('chat')}</span>
                  </button>
                  <button
                    onClick={() => setTab('notes')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      tab === 'notes' ? 'bg-white/10 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{t('notes')}</span>
                  </button>
                </div>

                <button
                  onClick={onClose}
                  className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {tab === 'chat' ? (
                <>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {messages.map((m) => {
                      if (m.kind === 'system') {
                        return (
                          <div key={m.id} className="text-center text-[0.6875rem] text-zinc-500 py-0.5">
                            {m.text}
                          </div>
                        );
                      }
                      const isSelf = m.senderId === selfId;
                      return (
                        <motion.div
                          key={m.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 px-1">
                            <span className="text-[0.6875rem] font-medium text-zinc-400">{m.senderName}</span>
                            <span className="text-[0.625rem] text-zinc-600">
                              {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div
                            className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed break-words ${
                              isSelf
                                ? 'bg-gradient-to-br from-indigo-500/25 to-indigo-600/20 border border-indigo-500/30 text-zinc-100'
                                : 'bg-white/[0.06] border border-white/[0.08] text-zinc-200'
                            }`}
                          >
                            {m.imageData && (
                              <img
                                src={m.imageData}
                                alt="chat-attachment"
                                onClick={() => setPreviewImage(m.imageData!)}
                                className="rounded-xl max-h-48 mb-1.5 cursor-zoom-in border border-white/10"
                              />
                            )}
                            {m.text && <MessageBody text={m.text} />}
                          </div>
                        </motion.div>
                      );
                    })}

                    {/* P2P File Transfers */}
                    {transfers.map((tr) => (
                      <motion.div
                        key={tr.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-cyan-200 truncate">{tr.fileName}</span>
                          <span className="text-[0.625rem] text-cyan-300/80 shrink-0">
                            {(tr.fileSize / 1024 / 1024).toFixed(2)} MB · P2P
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-400 transition-all duration-150"
                            style={{ width: `${tr.progress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[0.6875rem] text-zinc-400">
                          <span>
                            {tr.direction === 'send' ? t('sendToAll') : `${t('fromSender')} ${tr.senderName}`} · {tr.progress}%
                          </span>
                          {tr.status === 'done' && tr.downloadUrl && (
                            <a
                              href={tr.downloadUrl}
                              download={tr.fileName}
                              className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-medium"
                            >
                              <Download className="w-3 h-3" />
                              <span>{t('saveFile')}</span>
                            </a>
                          )}
                        </div>
                      </motion.div>
                    ))}

                    <div ref={bottomRef} />
                  </div>

                  {/* Input area */}
                  <div className="p-3 border-t border-white/[0.06] space-y-2">
                    {pendingImage && (
                      <div className="relative inline-block">
                        <img
                          src={pendingImage}
                          alt="pending"
                          className="h-16 rounded-xl border border-white/15 object-cover"
                        />
                        <button
                          onClick={() => setPendingImage(null)}
                          className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-zinc-800 border border-white/20 text-zinc-200 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    <div className="flex items-end gap-1.5 bg-zinc-900/90 border border-white/10 rounded-2xl p-2 focus-within:border-indigo-500/50 transition-colors">
                      <label
                        className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-zinc-200 cursor-pointer shrink-0"
                        title="发送图片"
                      >
                        <ImagePlus className="w-4 h-4" />
                        <input type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
                      </label>
                      <label
                        className="p-1.5 rounded-lg hover:bg-white/10 text-cyan-400 hover:text-cyan-300 cursor-pointer shrink-0"
                        title="P2P 快传文件（0 消耗 Cloudflare 额度）"
                      >
                        <Paperclip className="w-4 h-4" />
                        <input type="file" onChange={handleP2PFilePick} className="hidden" />
                      </label>
                      <textarea
                        rows={1}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder={t('chatPlaceholder')}
                        className="flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 resize-none focus:outline-none max-h-24 py-1"
                      />
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={submit}
                        className="p-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white cursor-pointer shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </motion.button>
                    </div>
                  </div>
                </>
              ) : (
                /* Shared Markdown Notes Tab */
                <div className="flex-1 flex flex-col p-3 gap-2.5 min-h-0">
                  <div className="flex items-center justify-between text-[0.6875rem] text-zinc-400">
                    <span>全员实时同步 · 支持 Markdown</span>
                    <button
                      onClick={exportNotes}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>{t('exportMd')}</span>
                    </button>
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => onUpdateNotes(e.target.value)}
                    placeholder="# 会议纪要..."
                    className="flex-1 w-full p-3 rounded-2xl bg-zinc-900/80 border border-white/10 text-xs font-mono text-zinc-200 leading-relaxed resize-none focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Image Lightbox */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 cursor-zoom-out"
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={previewImage}
              alt="preview"
              className="max-w-full max-h-full rounded-2xl shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function MessageBody({ text }: { text: string }) {
  if (text.startsWith('```') && text.endsWith('```') && text.length > 6) {
    const code = text.slice(3, -3).replace(/^[a-z]+\n/, '');
    return (
      <pre className="p-2 rounded-lg bg-black/50 font-mono text-[0.6875rem] overflow-x-auto text-emerald-300">
        {code}
      </pre>
    );
  }
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, idx) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={idx}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
          >
            {part}
          </a>
        ) : (
          <span key={idx}>{part}</span>
        )
      )}
    </span>
  );
}
