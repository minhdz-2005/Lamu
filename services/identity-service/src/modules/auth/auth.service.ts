import { Inject, Injectable } from "@nestjs/common";
import { type Config, fail } from "@lamu/runtime";
import { hash, verify, argon2id } from "argon2";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { sign } from "jsonwebtoken";
import { type Database, DATABASE } from "../../database";
import { RegisterDto, LoginDto } from "./dto/auth.dto";
import type { components } from "../../../../../shared/contracts/http/generated/identity";
export const AUTH_CONFIG = Symbol("AUTH_CONFIG");
export const CLOCK = Symbol("CLOCK");
export type Clock = () => Date;
export const hashOptions = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const refreshToken = () => randomBytes(32).toString("base64url");
@Injectable()
export class AuthService {
  private readonly dummyHash = hash(randomBytes(32), hashOptions);
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUTH_CONFIG) private readonly config: Config,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}
  async register(
    dto: RegisterDto,
  ): Promise<components["schemas"]["Registered"]> {
    const password_hash = await hash(dto.password, hashOptions);
    const userId = randomUUID(),
      eventId = randomUUID(),
      at = this.now();
    try {
      await this.db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id: userId,
            email: dto.email.toLowerCase(),
            display_name: dto.display_name,
            password_hash,
          },
        });
        await tx.outboxEvent.create({
          data: {
            event_id: eventId,
            event_type: "UserRegistered",
            version: 1,
            occurred_at: at,
            aggregate_type: "user",
            aggregate_id: user.id,
            producer: "identity-service",
            payload: {
              user_id: user.id,
              email: user.email,
              display_name: user.display_name,
            },
          },
        });
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      )
        fail(409, "EMAIL_TAKEN", "Email already registered");
      throw error;
    }
    return { user_id: userId };
  }
  async login(dto: LoginDto): Promise<components["schemas"]["Tokens"]> {
    const user = await this.db.user.findUnique({ where: { email: dto.email } });
    const valid = await verify(
      user?.password_hash ?? (await this.dummyHash),
      dto.password,
    );
    if (!user || !valid) fail(401, "UNAUTHENTICATED", "Invalid credentials");
    if (user.status !== "ACTIVE") fail(403, "FORBIDDEN", "Account unavailable");
    const token = refreshToken(),
      at = this.now();
    const session = await this.db.refreshSession.create({
      data: {
        id: randomUUID(),
        user_id: user.id,
        token_hash: tokenHash(token),
        created_at: at,
        expires_at: new Date(at.getTime() + 7 * 86400000),
      },
    });
    return this.tokens(user.id, session.id, token, at);
  }
  async refresh(token: string): Promise<components["schemas"]["Tokens"]> {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          user_id: string;
          expires_at: Date;
          revoked_at: Date | null;
          user_status: string;
        }>
      >`SELECT s.id,s.user_id,s.expires_at,s.revoked_at,u.status AS user_status FROM refresh_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=${tokenHash(token)} FOR UPDATE OF s,u`;
      const session = rows[0],
        at = this.now();
      if (
        !session ||
        session.revoked_at ||
        session.expires_at.getTime() <= at.getTime()
      )
        fail(401, "UNAUTHENTICATED", "Invalid refresh token");
      if (session.user_status !== "ACTIVE")
        fail(403, "FORBIDDEN", "Account unavailable");
      const next = refreshToken();
      await tx.refreshSession.update({
        where: { id: session.id },
        data: { token_hash: tokenHash(next) },
      });
      return this.tokens(session.user_id, session.id, next, at);
    });
  }
  async logout(
    token: string,
    identity: { sub: string; sid: string },
  ): Promise<components["schemas"]["LoggedOut"]> {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          user_id: string;
          expires_at: Date;
          revoked_at: Date | null;
        }>
      >`SELECT id,user_id,expires_at,revoked_at FROM refresh_sessions WHERE token_hash=${tokenHash(token)} FOR UPDATE`;
      const session = rows[0],
        at = this.now();
      if (
        !session ||
        session.expires_at.getTime() <= at.getTime() ||
        session.id !== identity.sid ||
        session.user_id !== identity.sub
      )
        fail(401, "UNAUTHENTICATED", "Invalid session credentials");
      if (!session.revoked_at)
        await tx.refreshSession.update({
          where: { id: session.id },
          data: { revoked_at: at },
        });
      return { status: "OK" };
    });
  }
  private tokens(
    userId: string,
    sid: string,
    refresh: string,
    at: Date,
  ): components["schemas"]["Tokens"] {
    const iat = Math.floor(at.getTime() / 1000);
    return {
      access_token: sign(
        { sub: userId, sid, iat, exp: iat + 900, jti: randomUUID() },
        this.config.secret,
        {
          algorithm: "HS256",
          issuer: this.config.issuer,
          audience: this.config.audience,
        },
      ),
      refresh_token: refresh,
      expires_in: 900,
    };
  }
}
