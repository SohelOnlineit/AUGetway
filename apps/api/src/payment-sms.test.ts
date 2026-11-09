import assert from "node:assert/strict";
import test from "node:test";
import { acceptInboundSms, bodyHasRef, isOtpMessage, isPaymentSender, readTrxId, senderFitsMethod, trxRefOk } from "./payment-sms.ts";

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

test("the desk stores a wallet payment and refuses a personal message", () => {
  assert.equal(acceptInboundSms("bKash", "You have received Tk 260.00. TrxID ABC12345"), true);
  assert.equal(acceptInboundSms("16316", "Received BDT 50.00"), true);
  assert.equal(acceptInboundSms("", "TrxID ABC12345 amount Tk 10.00"), true);
  assert.equal(acceptInboundSms("01711111111", "You have received Tk 260.00. TrxID ABC12345"), false);
  assert.equal(acceptInboundSms("Mom", "Come home"), false);
  assert.equal(acceptInboundSms("Mom", "Send Tk 20"), false);
  assert.equal(acceptInboundSms("Dutch Bangla", "Cash in Tk 500.00. TrxID ZXCVBN12"), true);
  assert.equal(acceptInboundSms("bKash", "Your OTP is 123456"), false);
});

test("a transaction id is a whole code, not part of an amount", () => {
  assert.equal(trxRefOk("8N70O2M4RB"), true);
  assert.equal(trxRefOk("100"), false);
  assert.equal(trxRefOk("ABC"), false);
  assert.equal(bodyHasRef("You have received Tk 1.00. TrxID 8N70O2M4RB.", "8N70O2M4RB"), true);
  assert.equal(bodyHasRef("You have received Tk 100.00.", "100"), false);
  assert.equal(bodyHasRef("TrxID 8N70O2M4RBX extra", "8N70O2M4RB"), false);
});

test("a unique-amount message keeps its own transaction id and wallet", () => {
  const body = "You have received Tk 1.00 from 01700000000. TrxID 8N70O2M4RB.";
  assert.equal(readTrxId(body), "8N70O2M4RB");
  assert.equal(readTrxId("You have received Tk 100.00."), "");
  assert.equal(senderFitsMethod("bKash", body, "bKash Merchant"), true);
  assert.equal(senderFitsMethod("Nagad", body, "bKash Merchant"), false);
});

test("an otp or verification code is not a payment", () => {
  assert.equal(isOtpMessage("Your OTP is 123456"), true);
  assert.equal(isOtpMessage("verification code 998877"), true);
  assert.equal(isOtpMessage("You have received Tk 260.00. TrxID ABC12345"), false);
});
