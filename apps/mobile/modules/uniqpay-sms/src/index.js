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

function startKeepAlive(base, token, uid, label) {
  if (!native) return;
  native.startKeepAlive(String(base), String(token), String(uid), String(label || "UniqBD handset"));
}

function stopKeepAlive() {
  if (!native) return;
  native.stopKeepAlive();
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
  startKeepAlive,
  stopKeepAlive,
  sendOneSms,
};
