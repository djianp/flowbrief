import { prisma } from "./prisma";

export type BriefStatus = "SUCCESS" | "FAILED";

export interface CreateBriefParams {
  userId: string;
  status: BriefStatus;
  inputJson: unknown;
  summaryText: string;
  actionItemsJson: string[];
  errorMessage?: string;
}

export async function createBrief({
  userId,
  status,
  inputJson,
  summaryText,
  actionItemsJson,
  errorMessage,
}: CreateBriefParams) {
  return prisma.brief.create({
    data: {
      userId,
      status,
      inputJson: JSON.stringify(inputJson),
      summaryText,
      actionItemsJson: JSON.stringify(actionItemsJson),
      errorMessage,
    },
  });
}

export async function getUserBriefs(userId: string, limit = 10) {
  return prisma.brief.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getLastSuccessBrief(userId: string) {
  return prisma.brief.findFirst({
    where: { userId, status: "SUCCESS" },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLastBrief(userId: string) {
  return prisma.brief.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
