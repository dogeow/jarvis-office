import { NextResponse } from "next/server";
import { loadAgents, payloadAgents, payloadSignature } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  let previousSignature = "";

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (text: string) => {
        controller.enqueue(new TextEncoder().encode(text));
      };

      const sendHeartbeat = () => {
        encode(": heartbeat\n\n");
      };

      const sendData = async () => {
        try {
          const agents = await loadAgents();
          const payload = payloadAgents(agents);
          const signature = payloadSignature(payload);

          if (signature !== previousSignature) {
            previousSignature = signature;
            const data = JSON.stringify(payload);
            encode(`data: ${data}\n\n`);
          } else {
            sendHeartbeat();
          }
        } catch {
          sendHeartbeat();
        }
      };

      // Send initial data immediately
      await sendData();

      // Then every 3 seconds
      const interval = setInterval(async () => {
        try {
          await sendData();
        } catch {
          // ignore
        }
      }, 3000);

      // Clean up after 60 seconds max (SSE connections should reconnect)
      setTimeout(() => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }, 60000);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
