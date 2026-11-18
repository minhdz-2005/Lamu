import { test } from "node:test";
import assert from "node:assert/strict";
test("T04: DTO boundaries without trimming password", async () => {
  const { validateAuth } = await import("../src/features/auth/validation");
  for (const length of [7, 129])
    assert.ok(
      validateAuth("login", {
        email: "a@b.test",
        password: "x".repeat(length),
        display_name: "n",
      }).password,
    );
  for (const length of [8, 128])
    assert.equal(
      validateAuth("login", {
        email: "a@b.test",
        password: " ".repeat(length),
        display_name: "n",
      }).password,
      undefined,
    );
  for (const length of [0, 101])
    assert.ok(
      validateAuth("register", {
        email: "a@b.test",
        password: "12345678",
        display_name: "x".repeat(length),
      }).display_name,
    );
  for (const length of [1, 100])
    assert.equal(
      validateAuth("register", {
        email: "a@b.test",
        password: "12345678",
        display_name: "x".repeat(length),
      }).display_name,
      undefined,
    );
  assert.ok(
    validateAuth("login", {
      email: "x".repeat(246) + "@mail.test",
      password: "12345678",
      display_name: "n",
    }).email,
  );
});
test("T11/T13: OTP string preserves zero; new email/resend/back never retains reset token", async () => {
  const { validCode, recoveryReducer, initialRecovery } = await import(
    "../src/features/auth/recoveryState"
  );
  assert.equal(validCode("012345"), true);
  assert.equal(validCode("12345"), false);
  assert.equal(validCode(123456), false);
  const verified = recoveryReducer(
    { ...initialRecovery, email: "a@b.test" },
    { type: "VERIFIED", token: "secret", expires: Date.now() + 300000 },
  );
  assert.equal(verified.step, "NEW_PASSWORD");
  for (const action of [
    { type: "START", email: "b@b.test" },
    { type: "SENT", until: Date.now() + 60000 },
    { type: "SUCCESS" },
    { type: "BACK" },
  ] as const)
    assert.equal(recoveryReducer(verified, action).token, undefined);
});
test("T04: DTO/OpenAPI length counts Unicode code points without altering password", async () => {
  const { validateAuth } = await import("../src/features/auth/validation");
  assert.deepEqual(
    validateAuth("register", {
      email: "a@b.test",
      password: "😀".repeat(128),
      display_name: "😀".repeat(100),
    }),
    {},
  );
  assert.ok(
    validateAuth("login", {
      email: "a@b.test",
      password: "😀".repeat(7),
      display_name: "",
    }).password,
  );
});
