import { createDatabase } from "../src/database";
import { hash, argon2id } from "argon2";
const id = (group: number, n: number) =>
  group.toString().padStart(8, "0") +
  "-0000-4000-8000-" +
  n.toString().padStart(12, "0");
const permissions = [
  "org.read",
  "org.member.read",
  "org.member.manage",
  "event.create",
  "event.read",
  "event.update",
  "event.publish",
  "event.cancel",
  "ticket.checkin",
  "payment.refund",
  "org.profile.update",
];
export async function seed() {
  if (process.env.APP_ENV !== "local")
    throw new Error("Demo seed requires APP_ENV=local");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const password = process.env.SEED_PASSWORD ?? "LocalDemo!2026";
  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const db = createDatabase(process.env.DATABASE_URL);
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(1311,1)`;
        for (let i = 0; i < permissions.length; i++) {
          const p = await tx.permission.upsert({
            where: { code: permissions[i] },
            create: {
              id: id(3, i + 1),
              code: permissions[i],
              description: permissions[i],
            },
            update: {},
          });
          if (p.id !== id(3, i + 1))
            throw new Error("Seed permission ID drift");
        }
        const roles = ["OWNER", "ADMIN", "SPEAKER", "ATTENDEE"];
        for (let i = 0; i < roles.length; i++) {
          const r = await tx.role.upsert({
            where: { id: id(2, i + 1) },
            create: {
              id: id(2, i + 1),
              code: roles[i],
              name: roles[i],
              scope: i < 2 ? "ORG" : "EVENT",
            },
            update: {},
          });
          if (
            r.code !== roles[i] ||
            r.scope !== (i < 2 ? "ORG" : "EVENT") ||
            r.organization_id !== null
          )
            throw new Error("Seed role drift");
          const allowed =
            i === 0
              ? permissions
              : i === 1
                ? permissions.filter((p) => p !== "org.member.manage")
                : i === 2
                  ? ["event.read"]
                  : [];
          for (const p of allowed)
            await tx.rolePermission.upsert({
              where: {
                role_id_permission_id: {
                  role_id: r.id,
                  permission_id: id(3, permissions.indexOf(p) + 1),
                },
              },
              create: {
                role_id: r.id,
                permission_id: id(3, permissions.indexOf(p) + 1),
              },
              update: {},
            });
          if (
            (await tx.rolePermission.count({ where: { role_id: r.id } })) !==
            allowed.length
          )
            throw new Error("Seed role permission drift");
        }
        for (const [i, label] of [
          "owner1",
          "owner2",
          "admin",
          "speaker",
          "guest",
        ].entries()) {
          const user = await tx.user.upsert({
            where: { id: id(1, i + 1) },
            create: {
              id: id(1, i + 1),
              email: label + "@demo.lamu.test",
              display_name: label,
              password_hash: passwordHash,
            },
            update: {},
          });
          if (user.email !== label + "@demo.lamu.test")
            throw new Error("Seed user ID collision");
        }
        for (let i = 0; i < 2; i++) {
          const org = await tx.organization.upsert({
            where: { id: id(4, i + 1) },
            create: {
              id: id(4, i + 1),
              name: "Demo " + (i === 0 ? "A" : "B"),
              slug: "demo-" + (i === 0 ? "a" : "b"),
              created_by: id(1, i === 0 ? 1 : 3),
            },
            update: {},
          });
          if (org.slug !== "demo-" + (i === 0 ? "a" : "b"))
            throw new Error("Seed organization ID collision");
        }
        const members = [
          [1, 1, 1],
          [1, 2, 1],
          [1, 3, 2],
          [1, 4, 3],
          [2, 3, 1],
          [2, 2, 2],
        ];
        for (const [i, [org, user, role]] of members.entries()) {
          const member = await tx.membership.upsert({
            where: { id: id(5, i + 1) },
            create: {
              id: id(5, i + 1),
              organization_id: id(4, org),
              user_id: id(1, user),
            },
            update: {},
          });
          if (
            member.organization_id !== id(4, org) ||
            member.user_id !== id(1, user)
          )
            throw new Error("Seed membership ID collision");
          await tx.membershipRole.upsert({
            where: { id: id(6, i + 1) },
            create: {
              id: id(6, i + 1),
              membership_id: member.id,
              role_id: id(2, role),
              resource_type: role === 3 ? "EVENT" : "ORG",
              resource_id: role === 3 ? id(7, 1) : null,
            },
            update: {},
          });
        }
      },
      { timeout: 15000 },
    );
    process.stdout.write(
      "Local seed completed; EVENT IDs are test fixtures; no events emitted\n",
    );
  } finally {
    await db.$disconnect();
  }
}
if (require.main === module)
  seed().catch(() => {
    process.stderr.write(
      "Seed failed; check local mode, database and seed drift\n",
    );
    process.exitCode = 1;
  });
