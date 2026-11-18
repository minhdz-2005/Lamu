# ADR 0006: Backend media and password recovery

Date: 2026-11-15
Status: Accepted; backend implemented and verified locally and against authorized providers

## Decision

Implement password recovery in Identity first, then user avatars and organization covers. Frontend integration and Notification delivery are later phases. The implementation checklist and acceptance criteria live in [the Identity plan](../../services/identity-service/report/media-password-recovery-plan.md).

Identity owns OTP generation, HMAC validation, single-use reset tokens, password changes and session revocation. Recovery writes encrypted durable mail jobs atomically with challenges into identity_db. A separate identity-mail-worker polls that database and uses an SMTP adapter. Gmail SMTP with implicit TLS on port 465 is the selected real-mail provider; Mailpit is the isolated integration-test provider. Recovery must work without RabbitMQ or Notification.

SMTP credentials belong to the mail worker; Identity API needs the OTP HMAC key and mail-job encryption key. Recovery must not call SMTP synchronously. Never store or log plaintext OTPs in domain events. A later Notification migration moves templates, delivery and retries only, retaining the recovery API and security decisions in Identity.

Cloudinary uploads use signed intents with random server-owned public IDs and overwrite=false. Identity verifies provider metadata before committing references, rechecks authorization, and schedules retryable cleanup. Avatar source renditions are square for circular display during later frontend integration; covers use a 3:1 display ratio. Media limits are enforced before DB commit, and are not claimed to prevent direct uploads reaching Cloudinary.

## Consequences and implementation gates

- Validate revoked sessions on all protected Identity endpoints and serialize login/refresh/reset consistently before claiming immediate session revocation.
- Define contracts, DB constraints, migration upgrade tests, encrypted job retention and retry leases before implementing handlers.
- Append org.profile.update safely to permission seeds and migrate existing databases; cover edits require that permission in the target organization.
- Do not add a Compose worker pointing to a nonexistent entrypoint. Wire configuration and start workers when their runtime exists.
- Acceptance requires recovery through Gateway with Mailpit, concurrency/security cases, and Cloudinary upload/metadata/cleanup smoke. Credential authentication alone is not feature acceptance.
- Do not add incomplete routes to the published API catalog or generated contracts as if operational.


## Implementation decisions and evidence (2026-11-15)

- Canonical HTTP is v1.4.0 (v1.3.0 already covered organization slug allocation). Generated Gateway projection/types are authoritative derivatives. See [runbook](../integration/media-password-recovery.md) and [verification report](../../services/identity-service/report/REPORT_MEDIA_RECOVERY_01.md).
- Recovery success is 202/200/200 JSON. Media intent/commit/delete use 200 JSON; delete returns nullable display + revision, allowing a client to obtain the new revision directly. Intent ID is the commit idempotency identity; replay never reattaches an obsolete asset. Empty-image delete is a no-op even with an old revision.
- Access revocation now queries live session state. Preserve existing logout retry only with matching current refresh proof until expiry; this exception cannot authorize another protected operation. Login/refresh/reset serialize user before session/challenge. Org mutations retain existing org-before-user ordering. Retry only explicit aborted deadlock/serialization, at most three attempts.
- Fixed DB hour budgets: verify 20/email and 100/IP; reset 30/IP, independent of resend. Generic forgot responses use a 75–100ms minimum floor with jitter to reduce fast-path timing differences; this is not a constant-time network guarantee.
- Gmail uses Nodemailer 10.5.0, TLS with certificate validation, a 15-second AbortSignal send deadline and 60-second DB leases. Previous decryption keys are configurable by key ID; no existing key was rotated. Delivery remains at-least-once; SMTP accepted does not prove inbox placement.
- Metadata timeout 1.8 seconds proved too short in a real smoke. Use a bounded 4-second provider deadline including body parsing and a separate 8-second Gateway media deadline. Normal auth timeout remains unchanged. No mutation retry at Gateway.
- Cleanup jobs exist from intent creation. Tombstones watch three hours from signing, including repeated not-found scans. Expire/mark deleting under the intent lock before external destroy. Active references are never destroyed; replacing/deleting reschedules cleanup atomically. Provider failures retry with capped one-hour backoff; completed intent results are retained for replay/audit.
- Recovery and media DDL migrations are additive, with a separate permission reference migration. Explicit Prisma referential actions match PostgreSQL; disposable DB `prisma migrate diff` reports no difference. Old production migrations were not modified.
- All provider smoke assets were synthetic and scoped to random `lamu/test-smoke/*` IDs, destroyed afterwards. One Gmail smoke email was accepted for SMTP_USER; inbox receipt is not independently verified. Frontend and Notification remain deferred.
