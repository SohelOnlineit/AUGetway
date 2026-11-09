const { Platform } = require("react-native");
const { requireNativeModule } = require("expo-modules-core");

function loadNative() {
  if (Platform.OS !== "android") return null;
  try {
    return requireNativeModule("UniqpaySms");
  } catch {
    return null;
  }
}

const native = loadNative();

async function listPaymentSms(limit = 15) {
  if (!native) throw new Error("SMS reading needs the UniqBD Pay Android build.");
  return native.listPaymentSms(limit);
}

async function listRecentSms(limit = 40) {
  if (!native) throw new Error("SMS reading needs the UniqBD Pay Android build.");
  return native.listRecentSms(limit);
}

function batteryIgnored() {
  if (!native) return false;
  return native.batteryIgnored() === true;
}

function askBattery() {
  if (!native) throw new Error("Battery settings need the UniqBD Pay Android build.");
  native.askBattery();
}

function batteryLevel() {
  if (!native || typeof native.batteryLevel !== "function") return null;
  const value = Number(native.batteryLevel());
  if (!Number.isInteger(value) || value < 0 || value > 100) return null;
  return value;
}

function startKeepAlive(base, token, uid, label) {
  if (!native) return;
  native.startKeepAlive(String(base), String(token), String(uid), String(label || "UniqBD handset"));
}

function stopKeepAlive() {
  if (!native) return;
  native.stopKeepAlive();
}

function setSmsSync(spec) {
  if (!native) return;
  native.setSmsSync(JSON.stringify(spec || {}));
}

function syncedKeys() {
  if (!native) return [];
  const rows = native.syncedKeys();
  return Array.isArray(rows) ? rows.filter((key) => typeof key === "string") : [];
}

function rememberSynced(keys) {
  if (!native) return;
  native.rememberSynced((keys || []).filter((key) => typeof key === "string").slice(0, 80));
}

function clearSynced() {
  if (!native) return;
  native.clearSynced();
}

async function sendOneSms(to, message, slot = 0) {
  if (!native) throw new Error("SMS sending needs the UniqBD Pay Android build.");
  return native.sendSms(to, message, slot === 1 ? 1 : 0);
}

module.exports = {
  smsReady: native !== null,
  listPaymentSms,
  listRecentSms,
  batteryIgnored,
  askBattery,
  batteryLevel,
  startKeepAlive,
  stopKeepAlive,
  setSmsSync,
  syncedKeys,
  rememberSynced,
  clearSynced,
  sendOneSms,
};
