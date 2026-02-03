import { prisma } from "./prisma";

export interface LogEventParams {
  userId?: string;
  eventName: string;
  propertiesJson: Record<string, unknown>;
}

export async function logEvent({
  userId,
  eventName,
  propertiesJson,
}: LogEventParams) {
  return prisma.event.create({
    data: {
      userId,
      eventName,
      propertiesJson: JSON.stringify(propertiesJson),
    },
  });
}
