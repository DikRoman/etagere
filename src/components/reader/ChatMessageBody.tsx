"use client";

import { parseChatBlocks } from "@/lib/chat-md";

export function ChatMessageBody({ text }: { text: string }) {
  const blocks = parseChatBlocks(text);
  const hasTable = blocks.some((b) => b.type === "table");
  if (!hasTable) return <>{text}</>;

  return (
    <div className="chat-md">
      {blocks.map((block, i) =>
        block.type === "text" ? (
          <div key={i} className="chat-md-text">
            {block.text}
          </div>
        ) : (
          <div key={i} className="chat-table-wrap">
            <table className="chat-table">
              <thead>
                <tr>
                  {block.headers.map((cell, j) => (
                    <th key={j}>{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  );
}
