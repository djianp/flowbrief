import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignOutButton } from "./sign-out-button";
import { getUserBriefs } from "@/lib/briefs";
import { WebhookUrl } from "./webhook-url";
import { TestPayloadButton } from "./test-payload-button";
import { BriefsList } from "./briefs-list";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;
  const briefs = await getUserBriefs(userId, 10);

  const webhookUrl = `${process.env.AUTH_URL || "http://localhost:3000"}/api/ingest/${userId}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-xl font-bold text-gray-900">FlowBrief</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {session.user?.email}
              </span>
              <SignOutButton />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* Webhook URL Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Your Webhook URL
            </h2>
            <WebhookUrl url={webhookUrl} />
            <p className="mt-2 text-sm text-gray-500">
              Send JSON payloads to this URL to generate briefs automatically.
            </p>
          </div>

          {/* Test Payload Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Test Your Integration
            </h2>
            <TestPayloadButton />
          </div>

          {/* Recent Briefs Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Recent Briefs
            </h2>
            <BriefsList briefs={briefs} />
          </div>
        </div>
      </main>
    </div>
  );
}
