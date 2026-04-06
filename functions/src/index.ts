import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineInt } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

admin.initializeApp();
const firestore = admin.firestore();

const openrouterApiKey = defineSecret("OPENROUTER_API_KEY");
const rateLimitPerHour = defineInt("RATE_LIMIT_PER_HOUR", { default: 20 });

// Load system prompt + examples at cold start
function buildSystemPrompt(): string {
  const promptsDir = path.join(__dirname, "..", "prompts");
  let system = fs.readFileSync(path.join(promptsDir, "system_prompt.md"), "utf-8");

  const examplesDir = path.join(promptsDir, "examples");
  if (fs.existsSync(examplesDir)) {
    const files = fs.readdirSync(examplesDir).filter(f => f.endsWith(".py")).sort();
    for (const file of files) {
      const name = path.basename(file, ".py");
      const code = fs.readFileSync(path.join(examplesDir, file), "utf-8");
      system += `\n\n## Complete Example: ${name}\n\`\`\`python\n${code}\`\`\`\n`;
    }
  }

  return system;
}

interface GenerateRequestBody {
  prompt: string;
  model?: string;
  messages?: { role: string; content: string }[];
  template?: string;
  templateCode?: string;
}

async function verifyAuthToken(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

async function checkUserRateLimit(
  uid: string,
  limit: number,
): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const snapshot = await firestore
    .collection("users").doc(uid).collection("prompts")
    .where("createdAt", ">", admin.firestore.Timestamp.fromDate(oneHourAgo))
    .orderBy("createdAt", "asc")
    .get();

  if (snapshot.size < limit) {
    return { allowed: true };
  }

  const oldestDoc = snapshot.docs[0];
  const oldestTimestamp = oldestDoc.data().createdAt as admin.firestore.Timestamp;
  const oldestMs = oldestTimestamp.toMillis();
  const expiresAt = oldestMs + 60 * 60 * 1000;
  const retryAfter = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));

  return { allowed: false, retryAfter };
}

export const generateCode = onRequest(
  {
    secrets: [openrouterApiKey],
    timeoutSeconds: 300,
    memory: "256MiB",
    cors: true,
    invoker: "public",
    maxInstances: 100,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    const body = req.body as GenerateRequestBody;
    if (!body.prompt) {
      res.status(400).send("Missing prompt");
      return;
    }

    // --- Auth + Rate limiting ---
    const uid = await verifyAuthToken(req.headers.authorization);

    if (uid) {
      try {
        const rateLimitResult = await checkUserRateLimit(uid, rateLimitPerHour.value());
        if (!rateLimitResult.allowed) {
          res.status(429).json({
            error: "Rate limit exceeded",
            retryAfter: rateLimitResult.retryAfter,
          });
          return;
        }
      } catch (rateLimitErr) {
        console.warn("Rate limit check failed, proceeding:", rateLimitErr);
      }
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const systemPrompt = buildSystemPrompt();

    // Build user content, optionally injecting template
    let userContent = body.prompt;
    if (body.template && body.templateCode) {
      userContent =
        "Here is an existing working device code. Modify it based on my request below.\n" +
        "Keep the same save pattern (save_amxd). Output the complete modified Python code.\n\n" +
        "```python\n" + body.templateCode + "\n```\n\n" +
        "My modification request: " + body.prompt;
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...(body.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: userContent },
    ];

    const model = body.model || "anthropic/claude-sonnet-4";

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openrouterApiKey.value()}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://maxpy-studio.vercel.app",
          "X-Title": "MaxPy Studio",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 8192,
          temperature: 0.3,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        res.write(`data: ${JSON.stringify({ type: "error", content: `${response.status} ${errText}` })}\n\n`);
        res.end();
        return;
      }

      const reader = response.body as any;
      if (!reader) {
        res.write(`data: ${JSON.stringify({ type: "error", content: "No response body" })}\n\n`);
        res.end();
        return;
      }

      // Parse OpenAI-format SSE stream
      let buffer = "";
      const decoder = new TextDecoder();

      for await (const chunk of reader) {
        buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                res.write(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`);
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      }

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : "LLM request failed";
      res.write(`data: ${JSON.stringify({ type: "error", content: message })}\n\n`);
      res.end();
    }
  }
);
