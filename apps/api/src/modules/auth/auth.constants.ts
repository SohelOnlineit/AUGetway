/** Keep the signed-in session for 5 years (access JWT and refresh session). */
export const SESSION_TTL_SEC = 5 * 365 * 24 * 60 * 60;
export const ACCESS_TOKEN_TTL_SEC = SESSION_TTL_SEC;
export const REFRESH_TOKEN_TTL_SEC = SESSION_TTL_SEC;
export const EMAIL_VERIFY_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export const AUTH_INVALID_CREDENTIALS = "Invalid email or password";
export const AUTH_EMAIL_NOT_VERIFIED =
  "Email is not verified. Check your inbox for the verification code.";
export const AUTH_ACCOUNT_INACTIVE = "Account is not active";
export const AUTH_GENERIC_RESET =
  "If an account exists for that email, reset instructions have been sent.";
export const AUTH_GENERIC_VERIFY_RESEND =
  "If an unverified account exists for that email, a new verification message has been sent.";
