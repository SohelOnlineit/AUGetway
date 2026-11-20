import { THEME_PREFERENCES, type ThemePreference } from "@amarpin/types";

export const THEME_STORAGE_KEY = "uq_theme";
export const THEME_COOKIE = "uq_theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "DARK") return "dark";
  if (preference === "LIGHT") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function readThemePreference(): ThemePreference {
  const fromDom = document.documentElement.dataset.themePreference;
  if (isThemePreference(fromDom)) return fromDom;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    /* private mode */
  }
  return "SYSTEM";
}

export function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* private mode */
  }
  document.cookie = `${THEME_COOKIE}=${preference}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.dispatchEvent(
    new CustomEvent("uq-theme-change", { detail: preference }),
  );
}

export const THEME_BOOT_SCRIPT = `(function(){try{var pref=null;var parts=document.cookie.split(";");for(var i=0;i<parts.length;i++){var part=parts[i].trim();if(part.indexOf("uq_theme=")===0)pref=decodeURIComponent(part.slice(9));}if(pref!=="LIGHT"&&pref!=="DARK"&&pref!=="SYSTEM"){try{pref=localStorage.getItem("uq_theme");}catch(e){pref=null;}}if(pref!=="LIGHT"&&pref!=="DARK"&&pref!=="SYSTEM")pref="SYSTEM";var dark=pref==="DARK"||(pref==="SYSTEM"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var root=document.documentElement;root.setAttribute("data-theme",dark?"dark":"light");root.setAttribute("data-theme-preference",pref);root.style.colorScheme=dark?"dark":"light";}catch(e){}})();`;
