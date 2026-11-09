import assert from "node:assert/strict";
import test from "node:test";
import { isOtpMessage, isPaymentSender } from "./payment-sms.ts";

test("a wallet sender can verify a payment", () => {
  assert.equal(isPaymentSender("bKash"), true);
  assert.equal(isPaymentSender("16216"), true);
  assert.equal(isPaymentSender("+88016216"), true);
  assert.equal(isPaymentSender("NAGAD"), true);
});

test("a personal number is never a payment sender", () => {
  assert.equal(isPaymentSender("01711111111"), false);
  assert.equal(isPaymentSender("+8801711111111"), false);
  assert.equal(isPaymentSender(""), false);
  assert.equal(isPaymentSender("Mom"), false);
});

test("an otp or verification code is not a payment", () => {
  assert.equal(isOtpMessage("Your OTP is 123456"), true);
  assert.equal(isOtpMessage("verification code 998877"), true);
  assert.equal(isOtpMessage("You have received Tk 260.00. TrxID ABC12345"), false);
});
