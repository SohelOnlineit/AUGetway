export type MailMessageKind =
  | "email_verification"
  | "password_reset"
  | "contact_reply"
  | "product_request_reply"
  | "order_note"
  | "order_pending"
  | "order_paid"
  | "order_completed"
  | "order_admin"
  | "customer_broadcast";

export interface MailMessage {
  kind: MailMessageKind;
  /** Recipient user id only — adapters must not require logging the address. */
  userId: string;
  to: string;
  subject: string;
  text: string;
  /** Shop whose SMTP settings should send this message. */
  storefront?: "amarpin" | "uniqbd";
  /** Absolute URL for one-click flows (optional). */
  actionUrl?: string;
  /** Short code when applicable. */
  code?: string;
  /** Values for {{order_number}} and other template tokens. */
  templateVars?: Record<string, string>;
}

export interface MailSendResult {
  delivered: boolean;
  provider: string;
  /** Present only for development adapters — never enable in production. */
  devPreview?: {
    actionUrl?: string;
    code?: string;
  };
}

export interface MailPort {
  send(message: MailMessage): Promise<MailSendResult>;
  isReady(): Promise<{ ready: boolean; provider: string; message?: string }>;
}

export const MAIL_PORT = Symbol("MAIL_PORT");
