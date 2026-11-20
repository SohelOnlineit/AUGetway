export type PaymentSms = {
  address: string;
  body: string;
  trxId: string;
  amount: string;
  receivedAt: number;
};

export const smsReady: boolean;

export function listRecentSms(limit?: number): Promise<PaymentSms[]>;

export function batteryIgnored(): boolean;

export function askBattery(): void;

export function batteryLevel(): number | null;

export function startKeepAlive(base: string, token: string, uid: string, label: string): void;

export function stopKeepAlive(): void;

export function setSmsSync(spec: { enabled: boolean; senders: string[]; keywords: string[]; cleanDays: number }): void;

export function syncedKeys(): string[];

export function rememberSynced(keys: string[]): void;

export function clearSynced(): void;
