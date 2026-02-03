"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TestResult = {
  ok: boolean;
  ingestResponse?: {
    ok: boolean;
    briefId: string;
    status: string;
  };
  error?: string;
};

export function TestPayloadButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const handleTest = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/test-payload", {
        method: "POST",
      });
      const data = await response.json();
      setResult(data);
      router.refresh();
    } catch {
      setResult({ ok: false, error: "Failed to send test payload" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={handleTest}
        disabled={loading}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
      >
        {loading ? "Sending..." : "Send Test Payload"}
      </button>

      {result && (
        <div
          className={`p-4 rounded ${
            result.ok && result.ingestResponse?.status === "SUCCESS"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {result.ok && result.ingestResponse ? (
            <div>
              <p className="font-medium">
                Status: {result.ingestResponse.status}
              </p>
              <p className="text-sm">Brief ID: {result.ingestResponse.briefId}</p>
            </div>
          ) : (
            <p>{result.error || "Something went wrong"}</p>
          )}
        </div>
      )}
    </div>
  );
}
