import { useCallback, useRef, useState } from 'react';
import type { P2PFileItem, Participant } from '../types';

const CHUNK_SIZE = 32 * 1024; // 32KB per DataChannel chunk

interface UseP2POptions {
  selfId: string;
  participants: Participant[];
  sendSignal: (payload: Record<string, unknown>) => void;
}

export function useP2PTransfer({ selfId, participants, sendSignal }: UseP2POptions) {
  const [transfers, setTransfers] = useState<P2PFileItem[]>([]);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const incomingBuffersRef = useRef<
    Map<string, { name: string; size: number; senderId: string; senderName: string; chunks: ArrayBuffer[]; received: number }>
  >(new Map());

  const upsertTransfer = useCallback((item: P2PFileItem) => {
    setTransfers((prev) => {
      const idx = prev.findIndex((t) => t.id === item.id);
      if (idx === -1) return [...prev, item];
      const next = [...prev];
      next[idx] = item;
      return next;
    });
  }, []);

  const updateProgress = useCallback((id: string, progress: number, status?: P2PFileItem['status'], downloadUrl?: string) => {
    setTransfers((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              progress,
              status: status ?? t.status,
              downloadUrl: downloadUrl ?? t.downloadUrl,
            }
          : t
      )
    );
  }, []);

  const setupReceiveChannel = useCallback(
    (dc: RTCDataChannel, fromId: string, fromName: string) => {
      dc.binaryType = 'arraybuffer';
      let currentFileId = '';

      dc.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          const meta = JSON.parse(ev.data);
          if (meta.type === 'file_meta') {
            currentFileId = meta.id;
            incomingBuffersRef.current.set(currentFileId, {
              name: meta.name,
              size: meta.size,
              senderId: fromId,
              senderName: fromName,
              chunks: [],
              received: 0,
            });
            upsertTransfer({
              id: currentFileId,
              fileName: meta.name,
              fileSize: meta.size,
              senderId: fromId,
              senderName: fromName,
              direction: 'receive',
              progress: 0,
              status: 'transferring',
            });
          } else if (meta.type === 'file_done' && currentFileId) {
            const buf = incomingBuffersRef.current.get(currentFileId);
            if (buf) {
              const blob = new Blob(buf.chunks);
              const url = URL.createObjectURL(blob);
              updateProgress(currentFileId, 100, 'done', url);
              incomingBuffersRef.current.delete(currentFileId);
            }
          }
        } else if (ev.data instanceof ArrayBuffer && currentFileId) {
          const buf = incomingBuffersRef.current.get(currentFileId);
          if (!buf) return;
          buf.chunks.push(ev.data);
          buf.received += ev.data.byteLength;
          const pct = buf.size > 0 ? Math.min(Math.round((buf.received / buf.size) * 100), 99) : 50;
          updateProgress(currentFileId, pct, 'transferring');
        }
      };
    },
    [upsertTransfer, updateProgress]
  );

  const handleSignal = useCallback(
    async (payload: {
      fromId: string;
      fromName: string;
      channelKey: string;
      sdp?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    }) => {
      const { fromId, fromName, channelKey, sdp, candidate } = payload;
      let pc = peersRef.current.get(channelKey);

      if (!pc) {
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
        });
        peersRef.current.set(channelKey, pc);
        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            sendSignal({ targetId: fromId, channelKey, candidate: ev.candidate });
          }
        };
        pc.ondatachannel = (ev) => {
          setupReceiveChannel(ev.channel, fromId, fromName);
        };
      }

      if (sdp) {
        await pc.setRemoteDescription(sdp);
        if (sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({ targetId: fromId, channelKey, sdp: answer });
        }
      } else if (candidate) {
        await pc.addIceCandidate(candidate).catch(() => {});
      }
    },
    [sendSignal, setupReceiveChannel]
  );

  const sendFileToPeers = useCallback(
    async (file: File) => {
      const targets = participants.filter((p) => p.id !== selfId);
      if (targets.length === 0) return;

      const transferId = `p2p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      upsertTransfer({
        id: transferId,
        fileName: file.name,
        fileSize: file.size,
        senderId: selfId,
        senderName: '我',
        direction: 'send',
        progress: 0,
        status: 'connecting',
      });

      const buffer = await file.arrayBuffer();

      await Promise.all(
        targets.map(async (target) => {
          const channelKey = `${transferId}-${target.id}`;
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
          });
          peersRef.current.set(channelKey, pc);

          const dc = pc.createDataChannel('file');
          dc.bufferedAmountLowThreshold = CHUNK_SIZE * 4;

          pc.onicecandidate = (ev) => {
            if (ev.candidate) {
              sendSignal({ targetId: target.id, channelKey, candidate: ev.candidate });
            }
          };

          dc.onopen = async () => {
            updateProgress(transferId, 1, 'transferring');
            dc.send(JSON.stringify({ type: 'file_meta', id: transferId, name: file.name, size: file.size }));

            let offset = 0;
            while (offset < buffer.byteLength) {
              if (dc.bufferedAmount > CHUNK_SIZE * 16) {
                await new Promise<void>((res) => {
                  const handler = () => {
                    dc.removeEventListener('bufferedamountlow', handler);
                    res();
                  };
                  dc.addEventListener('bufferedamountlow', handler);
                });
              }
              const slice = buffer.slice(offset, offset + CHUNK_SIZE);
              dc.send(slice);
              offset += slice.byteLength;
              const pct = Math.min(Math.round((offset / buffer.byteLength) * 100), 99);
              updateProgress(transferId, pct, 'transferring');
            }
            dc.send(JSON.stringify({ type: 'file_done', id: transferId }));
            updateProgress(transferId, 100, 'done');
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal({ targetId: target.id, channelKey, sdp: offer });
        })
      );
    },
    [participants, selfId, sendSignal, upsertTransfer, updateProgress]
  );

  return {
    transfers,
    sendFileToPeers,
    handleSignal,
  };
}
