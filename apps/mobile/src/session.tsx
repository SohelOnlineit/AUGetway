import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import type { PublicCart, PublicUser } from "./types";
import { api, uuid } from "./api";

const GUEST_KEY = "amarpin.guest";
const ACCESS_KEY = "amarpin.access";
const REFRESH_KEY = "amarpin.refresh";
const USER_KEY = "amarpin.user";

type SessionValue = {
  ready: boolean;
  guest: string | null;
  token: string | null;
  user: PublicUser | null;
  cart: PublicCart | null;
  cartCount: number;
  refreshCart: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

async function read(key: string) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string | null) {
  try {
    if (value) await SecureStore.setItemAsync(key, value);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // Secure storage can be unavailable in a simulator preview. The session still works in memory.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refresh, setRefresh] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [cart, setCart] = useState<PublicCart | null>(null);

  const refreshCart = useCallback(async () => {
    if (!token && !guest) return;
    const next = await api<PublicCart>("/cart", { token, guest });
    setCart(next);
  }, [token, guest]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedGuest, storedToken, storedRefresh, storedUser] = await Promise.all([
        read(GUEST_KEY),
        read(ACCESS_KEY),
        read(REFRESH_KEY),
        read(USER_KEY),
      ]);
      const nextGuest = storedGuest || uuid();
      if (!storedGuest) await write(GUEST_KEY, nextGuest);
      if (cancelled) return;
      setGuest(nextGuest);
      setToken(storedToken);
      setRefresh(storedRefresh);
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser) as PublicUser);
        } catch {
          setUser(null);
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    refreshCart().catch(() => setCart(null));
  }, [ready, refreshCart]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api<{ user: PublicUser; tokens: { accessToken: string; refreshToken: string } }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email: email.trim(), password }) },
    );
    setToken(result.tokens.accessToken);
    setRefresh(result.tokens.refreshToken);
    setUser(result.user);
    await Promise.all([
      write(ACCESS_KEY, result.tokens.accessToken),
      write(REFRESH_KEY, result.tokens.refreshToken),
      write(USER_KEY, JSON.stringify(result.user)),
    ]);
  }, []);

  const signOut = useCallback(async () => {
    const current = refresh;
    setToken(null);
    setRefresh(null);
    setUser(null);
    await Promise.all([write(ACCESS_KEY, null), write(REFRESH_KEY, null), write(USER_KEY, null)]);
    if (current) {
      await api("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken: current }) }).catch(() => {});
    }
  }, [refresh]);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      guest,
      token,
      user,
      cart,
      cartCount: cart?.itemCount ?? 0,
      refreshCart,
      signIn,
      signOut,
    }),
    [ready, guest, token, user, cart, refreshCart, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session missing");
  return value;
}
