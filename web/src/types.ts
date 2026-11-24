export type ShareQuality = 'eco' | 'standard' | 'ultra';

export interface PublicConfig {
  configured: boolean;
  hasAnalytics: boolean;
  appId?: string;
  appSecretMasked?: string;
  accountId?: string;
  analyticsMasked?: string;
  quotaWarnGb: number;
  quotaLimitGb: number;
  port: number;
}

export interface TunnelStatus {
  hasBinary: boolean;
  running: boolean;
  installing: boolean;
  publicUrl?: string;
  lanUrl?: string;
  error?: string;
}

export interface QuotaSnapshot {
  available: boolean;
  usedBytes: number;
  sfuBytes: number;
  turnBytes: number;
  usedGb: number;
  freeLimitGb: number;
  warnThresholdGb: number;
  limitGb: number;
  percentUsed: number;
  warning: boolean;
  blocked: boolean;
  lastSyncedAt?: string;
  error?: string;
}

export interface AppStatus {
  isHost: boolean;
  config: PublicConfig;
  tunnel: TunnelStatus;
  quota: QuotaSnapshot;
}

export interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  muted: boolean;
  speaking: boolean;
  sharing: boolean;
  cameraOn: boolean;
  sfuSessionId?: string;
  audioTrackName?: string;
  camTrackName?: string;
}

export interface ScreenShareInfo {
  sharerId: string;
  sharerName: string;
  sfuSessionId: string;
  videoTrackName: string;
  audioTrackName?: string;
  quality: ShareQuality;
}

export interface WaitingGuest {
  id: string;
  name: string;
}

export interface RoomInfo {
  id: string;
  hasPassword: boolean;
  locked: boolean;
  waitingRoom: boolean;
  maxParticipants: number;
  participants: Participant[];
  activeShares: ScreenShareInfo[];
  waiting?: WaitingGuest[];
}

export interface AnnotationStroke {
  id: string;
  senderId: string;
  senderName: string;
  sharerId: string;
  kind: 'stroke' | 'laser';
  color: string;
  points: Array<{ x: number; y: number }>;
  createdAt: number;
}

export interface P2PFileItem {
  id: string;
  fileName: string;
  fileSize: number;
  senderId: string;
  senderName: string;
  direction: 'send' | 'receive';
  progress: number; // 0..100
  status: 'connecting' | 'transferring' | 'done' | 'error';
  downloadUrl?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  kind: 'text' | 'system';
  text: string;
  imageData?: string;
  timestamp: number;
}

export interface SessionTrafficStats {
  sessionEgressBytes: number;
  currentBitrateMbps: number;
  sessionUplinkBytes: number;
  currentUplinkMbps: number;
}
