export type SmsProviderId = "sms.net.bd" | "bulksmsbd" | "greenweb" | "mimsms" | "uniqbd" | "custom";

export type SmsTemplate = {
  id: string;
  name: string;
  body: string;
  enabled: boolean;
  isDefault: boolean;
};

export const SMS_PROVIDERS: Array<{ id: SmsProviderId; label: string; hint: string }> = [
  {
    id: "sms.net.bd",
    label: "SMS.net.bd",
    hint: "Paste the API key from your SMS.net.bd panel. Sender ID is optional.",
  },
  {
    id: "bulksmsbd",
    label: "BulkSMS BD",
    hint: "Use the API key and approved sender ID from bulksmsbd.net.",
  },
  {
    id: "greenweb",
    label: "GreenWeb",
    hint: "Use the token from your GreenWeb account as the API key.",
  },
  {
    id: "mimsms",
    label: "MimSMS",
    hint: "Username, API key, and sender name from the MimSMS panel.",
  },
  {
    id: "uniqbd",
    label: "UniqBD Pay",
    hint: "Paste an SMS key from pay.uniqbd.com. The signed-in Android phone sends the message.",
  },
  {
    id: "custom",
    label: "Custom HTTP",
    hint: "POST JSON to your URL with apiKey, senderId, to, and message.",
  },
];

export const DEFAULT_SMS_TEMPLATES: SmsTemplate[] = [
  {
    id: "order_placed",
    name: "Order placed",
    body: "AuGetway: Order {orderNumber} received. Amount {amount}. Complete payment to get your code.",
    enabled: true,
    isDefault: true,
  },
  {
    id: "order_paid",
    name: "Payment received",
    body: "AuGetway: Payment received for order {orderNumber}. We are preparing your delivery.",
    enabled: true,
    isDefault: true,
  },
  {
    id: "order_delivered",
    name: "Order delivered",
    body: "AuGetway: Your order {orderNumber} is complete. Thank you for shopping with us.",
    enabled: true,
    isDefault: true,
  },
  {
    id: "otp",
    name: "Verification code",
    body: "AuGetway verification code: {code}. It expires in 10 minutes.",
    enabled: true,
    isDefault: true,
  },
  {
    id: "password_reset",
    name: "Password reset",
    body: "AuGetway password reset code: {code}. If you did not ask for this, ignore this SMS.",
    enabled: true,
    isDefault: true,
  },
  {
    id: "welcome",
    name: "Welcome",
    body: "Welcome to AuGetway, {name}. Your account is ready.",
    enabled: true,
    isDefault: true,
  },
];
