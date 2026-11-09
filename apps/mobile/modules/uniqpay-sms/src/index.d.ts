export type PaymentSms = {
  address: string;
  body: string;
  trxId: string;
  amount: string;
  receivedAt: number;
};

export const smsReady: boolean;

export function listPaymentSms(limit?: number): Promise<PaymentSms[]>;

export function listRecentSms(limit?: number): Promise<PaymentSms[]>;

export function batteryIgnored(): boolean;

export function askBattery(): void;

export function sendOneSms(to: string, message: string, slot?: number): Promise<void>;
