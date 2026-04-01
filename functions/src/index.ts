import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

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

export const generateCode = onRequest(
  {
    secrets: [anthropicApiKey],
    timeoutSeconds: 300,
    memory: "256MiB",
    cors: true,
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

    const messages: Anthropic.MessageParam[] = [
      ...(body.messages || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: userContent },
    ];

    const model = body.model || "claude-sonnet-4-20250514";

    try {
      const client = new Anthropic({ apiKey: anthropicApiKey.value() });

      const stream = await client.messages.stream({
        model,
        max_tokens: 8192,
        temperature: 0.3,
        system: systemPrompt,
        messages,
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          const data = JSON.stringify({ type: "chunk", content: event.delta.text });
          res.write(`data: ${data}\n\n`);
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
