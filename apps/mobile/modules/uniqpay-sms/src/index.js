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

async function sendOneSms(to, message, slot = 0) {
  if (!native) throw new Error("SMS sending needs the UniqBD Pay Android build.");
  return native.sendSms(to, message, slot === 1 ? 1 : 0);
}

module.exports = {
  smsReady: native !== null,
  listPaymentSms,
  sendOneSms,
};
