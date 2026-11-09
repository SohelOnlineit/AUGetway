export type PaymentSms = {
  address: string;
  body: string;
  trxId: string;
  amount: string;
  receivedAt: number;
};

export const smsReady: boolean;

export function listPaymentSms(limit?: number): Promise<PaymentSms[]>;

export function sendOneSms(to: string, message: string): Promise<void>;
