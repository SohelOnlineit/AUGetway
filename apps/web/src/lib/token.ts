const KEY = "uniqpay_token";

export function readToken() {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem(KEY);
  if (saved) return saved;
  const currentTab = sessionStorage.getItem(KEY);
  if (!currentTab) return null;
  localStorage.setItem(KEY, currentTab);
  sessionStorage.removeItem(KEY);
  return currentTab;
}

export function saveToken(token: string) {
  localStorage.setItem(KEY, token);
  sessionStorage.removeItem(KEY);
}

export function clearToken() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
  // API keys shown once after creation are kept in this tab only while someone is signed in.
  // They must not stay behind for the next person who uses this browser.
  sessionStorage.removeItem("uniqpay_fresh_key");
  sessionStorage.removeItem("uniqpay_seen_keys");
}
