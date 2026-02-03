"use client";

import { useState } from "react";

export function WebhookUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 bg-gray-100 px-4 py-2 rounded text-sm font-mono text-gray-800 overflow-x-auto">
        {url}
      </code>
      <button
        onClick={handleCopy}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition whitespace-nowrap"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
