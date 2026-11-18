import { decode } from "jsonwebtoken";
import { AuthService } from "../services/identity-service/src/modules/auth/auth.service";
import { createDatabase } from "../services/identity-service/src/database";
import { config, registration } from "./helpers";
describe("P4 absolute session expiry with injected clock and real DB", () => {
  const db = createDatabase(process.env.DATABASE_URL!);
  afterAll(() => db.$disconnect());
  it("rotates immediately before seven-day boundary, refuses at boundary without extending deadline", async () => {
    const initial = Date.now();
    let now = initial;
    const service = new AuthService(db, config(), () => new Date(now));
    const input = registration();
    await service.register(input);
    const first = await service.login(input),
      claims = decode(first.access_token) as { sid: string; sub: string };
    const session = await db.refreshSession.findUniqueOrThrow({
      where: { id: claims.sid },
    });
    now = session.expires_at.getTime() - 1;
    const next = await service.refresh(first.refresh_token);
    const after = await db.refreshSession.findUniqueOrThrow({
      where: { id: claims.sid },
    });
    expect(after.expires_at).toEqual(session.expires_at);
    now = session.expires_at.getTime();
    await expect(service.refresh(next.refresh_token)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      service.logout(next.refresh_token, { sub: claims.sub, sid: claims.sid }),
    ).rejects.toMatchObject({ status: 401 });
    expect(after.expires_at.getTime() - initial).toBe(7 * 86400000);
  });
  it("retains revoked proof and does not move revoked_at across valid retry", async () => {
    let now = Date.now();
    const service = new AuthService(db, config(), () => new Date(now));
    const input = registration();
    await service.register(input);
    const tokens = await service.login(input),
      claims = decode(tokens.access_token) as { sid: string; sub: string };
    await service.logout(tokens.refresh_token, {
      sub: claims.sub,
      sid: claims.sid,
    });
    const first = await db.refreshSession.findUniqueOrThrow({
      where: { id: claims.sid },
    });
    now += 1000;
    await service.logout(tokens.refresh_token, {
      sub: claims.sub,
      sid: claims.sid,
    });
    const second = await db.refreshSession.findUniqueOrThrow({
      where: { id: claims.sid },
    });
    expect(second.revoked_at).toEqual(first.revoked_at);
    expect(second.token_hash).toBe(first.token_hash);
    now = first.expires_at.getTime() + 900001;
    await expect(service.refresh(tokens.refresh_token)).rejects.toMatchObject({
      status: 401,
    });
    expect(
      await db.refreshSession.findUnique({ where: { id: claims.sid } }),
    ).not.toBeNull();
  });
});
