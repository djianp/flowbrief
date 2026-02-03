import type { Brief } from "@prisma/client";

interface BriefsListProps {
  briefs: Brief[];
}

export function BriefsList({ briefs }: BriefsListProps) {
  if (briefs.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        No briefs yet. Send a test payload to get started!
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {briefs.map((brief) => {
        const actionItems = JSON.parse(brief.actionItemsJson) as string[];

        return (
          <div
            key={brief.id}
            className="border border-gray-200 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">
                {new Date(brief.createdAt).toLocaleString()}
              </span>
              <span
                className={`px-2 py-1 text-xs font-medium rounded ${
                  brief.status === "SUCCESS"
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {brief.status}
              </span>
            </div>

            <p className="text-gray-800 mb-3">{brief.summaryText}</p>

            {actionItems.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Action Items:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  {actionItems.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {brief.status === "FAILED" && brief.errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <p className="text-sm text-red-700">
                  <span className="font-medium">Error:</span> {brief.errorMessage}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
