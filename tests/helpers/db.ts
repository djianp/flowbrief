import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";

/**
 * Wipe every table. Children are deleted before the parent `User` so this
 * stays FK-safe regardless of each relation's onDelete behavior. Call from
 * `beforeEach` so integration tests are isolated and order-independent.
 */
export async function resetDb(): Promise<void> {
  await prisma.event.deleteMany();
  await prisma.brief.deleteMany();
  await prisma.account.deleteMany();
  await prisma.session.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Create a User with a stable id (default "test-user-1") so ingest tests
 * can deterministically exercise both the known-user and USER_NOT_FOUND
 * paths.
 */
export async function seedUser(
  overrides: { id?: string; email?: string; name?: string } = {},
) {
  const id = overrides.id ?? "test-user-1";
  return prisma.user.create({
    data: {
      id,
      email: overrides.email ?? `${id}@example.test`,
      name: overrides.name ?? "Test User",
    },
  });
}

/**
 * Plant a webhook_failed event row — the record /api/activation-debug
 * surfaces to the n8n rescue agent.
 */
export async function seedFailureEvent(
  userId: string,
  properties: Record<string, unknown>,
) {
  return logEvent({
    userId,
    eventName: "webhook_failed",
    propertiesJson: properties,
  });
}

/** Plant a webhook_received event row. */
export async function seedReceivedEvent(
  userId: string,
  properties: Record<string, unknown>,
) {
  return logEvent({
    userId,
    eventName: "webhook_received",
    propertiesJson: properties,
  });
}
