import type { Permission, PublicUser, RoleName } from "@amarpin/types";

export interface JwtAccessPayload {
  sub: string;
  roles: RoleName[];
  typ: "access";
}

export interface AuthenticatedUser {
  id: string;
  roles: RoleName[];
  permissions: Permission[];
  /** True for a cookie-backed storefront shopper with no sign-in. */
  isGuest?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  tokenType: "Bearer";
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

export interface RegisterResult {
  userId: string;
  emailVerificationRequired: true;
  message: string;
  /** Only present when MAIL_PROVIDER=dev and NODE_ENV !== production. */
  devPreview?: {
    actionUrl?: string;
    code?: string;
  };
}

export interface MessageResult {
  message: string;
  devPreview?: {
    actionUrl?: string;
    code?: string;
  };
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
  storefront?: "amarpin" | "uniqbd";
}
