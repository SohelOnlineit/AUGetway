import assert from "node:assert/strict";
import test from "node:test";
import { cleanSiteHost, currentRequest, describeRequest, hostCandidates, isValidSiteHost, pickHostHeader, runWithRequest } from "./request-context.ts";

test("a Host header is split into host, port and protocol", () => {
  assert.deepEqual(describeRequest("pay.amarpin.com", "https"), { host: "pay.amarpin.com", port: "", proto: "https" });
  assert.deepEqual(describeRequest("Pay.UniqBD.com:443", "https"), { host: "pay.uniqbd.com", port: ":443", proto: "https" });
  assert.deepEqual(describeRequest("127.0.0.1:3100", "http"), { host: "127.0.0.1", port: ":3100", proto: "http" });
  assert.deepEqual(describeRequest(undefined, undefined), { host: "", port: "", proto: "http" });
  assert.equal(describeRequest("pay.amarpin.com.", "https").host, "pay.amarpin.com");
});

test("X-Forwarded-Host counts only when the Host is this machine (the local dev proxy)", () => {
  assert.equal(pickHostHeader("pay.amarpin.com", "pay.uniqbd.com"), "pay.amarpin.com");
  assert.equal(pickHostHeader("api.pay.amarpin.com", "evil.example.com"), "api.pay.amarpin.com");
  assert.equal(pickHostHeader("127.0.0.1:4100", "localhost:3100"), "localhost:3100");
  assert.equal(pickHostHeader("localhost:4100", "pay.amarpin.com, other"), "pay.amarpin.com");
  assert.equal(pickHostHeader("127.0.0.1:4100", undefined), "127.0.0.1:4100");
  assert.equal(pickHostHeader(undefined, "pay.amarpin.com"), undefined);
});

test("the api. address of a site is read as the site", () => {
  assert.deepEqual(hostCandidates("api.pay.amarpin.com"), ["api.pay.amarpin.com", "pay.amarpin.com"]);
  assert.deepEqual(hostCandidates("pay.amarpin.com"), ["pay.amarpin.com"]);
  assert.deepEqual(hostCandidates("API.PAY.UNIQBD.COM:443"), ["api.pay.uniqbd.com", "pay.uniqbd.com"]);
  assert.deepEqual(hostCandidates("api.com"), ["api.com"]);
  assert.deepEqual(hostCandidates(""), []);
});

test("what a person types on the Domains page is cleaned", () => {
  assert.equal(cleanSiteHost("https://Pay.Amarpin.com/pay/abc?x=1"), "pay.amarpin.com");
  assert.equal(cleanSiteHost("  pay.uniqbd.com:3100  "), "pay.uniqbd.com");
  assert.equal(cleanSiteHost("pay.uniqbd.com."), "pay.uniqbd.com");
  assert.equal(cleanSiteHost("http://localhost:3100"), "localhost");
});

test("only real website addresses are accepted", () => {
  for (const good of ["pay.uniqbd.com", "pay.amarpin.com", "api.pay.amarpin.com", "example.co.uk", "localhost", "127.0.0.1"]) {
    assert.equal(isValidSiteHost(good), true, good);
  }
  for (const bad of ["", "com", "au_amarpin.com", "-au.com", "au..com", "pay.amarpin.com/x", "au amarpin.com", "javascript:alert(1)", "a.b", "<script>.com"]) {
    assert.equal(isValidSiteHost(bad), false, bad);
  }
});

test("the address stays known through async work of the same request, and does not leak to another", async () => {
  const seen: string[] = [];
  const one = runWithRequest({ host: "pay.uniqbd.com", port: "", proto: "https" }, async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    seen.push(`one:${currentRequest()?.host}`);
  });
  const two = runWithRequest({ host: "pay.amarpin.com", port: "", proto: "https" }, async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    seen.push(`two:${currentRequest()?.host}`);
  });
  await Promise.all([one, two]);
  assert.deepEqual(seen.sort(), ["one:pay.uniqbd.com", "two:pay.amarpin.com"]);
  assert.equal(currentRequest(), undefined);
});
