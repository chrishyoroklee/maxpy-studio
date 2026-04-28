import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineInt } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

admin.initializeApp();
const firestore = admin.firestore();

export const deleteUserData = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const userRef = firestore.doc(`users/${uid}`);
    await firestore.recursiveDelete(userRef);

    const bucket = admin.storage().bucket();
    await bucket.deleteFiles({ prefix: `generations/${uid}/` });

    return { ok: true };
  },
);

const openrouterApiKey = defineSecret("OPENROUTER_API_KEY");
const rateLimitPerHour = defineInt("RATE_LIMIT_PER_HOUR", { default: 20 });

// Load base system prompt + examples at cold start
type DeviceType = "audio_effect" | "instrument" | "midi_effect";
const VALID_DEVICE_TYPES = new Set<DeviceType>(["audio_effect", "instrument", "midi_effect"]);

const promptsDir = path.join(__dirname, "..", "prompts");
const baseSystemPrompt = fs.readFileSync(path.join(promptsDir, "system_prompt.md"), "utf-8");

interface ExampleFile {
  deviceType: string;
  name: string;
  code: string;
}

const allExamples: ExampleFile[] = (() => {
  const examplesDir = path.join(promptsDir, "examples");
  if (!fs.existsSync(examplesDir)) return [];
  return fs.readdirSync(examplesDir)
    .filter(f => f.endsWith(".py"))
    .sort()
    .map(file => {
      const basename = path.basename(file, ".py");
      const parts = basename.split("__");
      const deviceType = parts.length === 2 ? parts[0] : "";
      const name = parts.length === 2 ? parts[1] : basename;
      const code = fs.readFileSync(path.join(examplesDir, file), "utf-8");
      return { deviceType, name, code };
    });
})();

async function classifyDeviceType(
  prompt: string,
  apiKey: string,
): Promise<DeviceType> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://maxpy-studio.vercel.app",
        "X-Title": "MaxPy Studio",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-lite-001",
        messages: [
          {
            role: "system",
            content:
              "You classify Max for Live device requests. Respond with exactly one word:\n" +
              "- audio_effect — for effects that process audio (reverb, delay, EQ, compressor, chorus, etc.)\n" +
              "- instrument — for things that generate sound from MIDI (synth, piano, drum, sampler, etc.)\n" +
              "- midi_effect — for things that process or generate MIDI data (sequencer, arpeggiator, chord generator, transposer, etc.)\n\n" +
              "If unclear, respond: audio_effect",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 3,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.warn(`Classification call failed: ${response.status} ${errBody}`);
      return "audio_effect";
    }

    const data = await response.json();
    const raw = (data.choices?.[0]?.message?.content ?? "").trim().toLowerCase() as DeviceType;
    const result = VALID_DEVICE_TYPES.has(raw) ? raw : "audio_effect";
    console.log(`[classify] prompt="${prompt.slice(0, 80)}" raw="${raw}" result="${result}"`);
    return result;
  } catch (err) {
    console.warn("Classification error, defaulting to audio_effect:", err);
    return "audio_effect";
  }
}

const DEVICE_TYPE_INSTRUCTIONS: Record<DeviceType, { hard: string; soft: string }> = {
  midi_effect: {
    hard:
      "**TARGET DEVICE TYPE: MIDI Effect**\n" +
      "You MUST use `noteout` (via place_raw) for output. Using plugout~ is WRONG for this device type.\n" +
      "You MUST use `device_type=\"midi_effect\"` in save_amxd().\n" +
      "Do NOT use any audio objects (plugout~, plugin~, clip~, cycle~, etc.).",
    soft:
      "**LIKELY DEVICE TYPE: MIDI Effect**\n" +
      "The user is most likely asking for a midi_effect. Use noteout (via place_raw) for output\n" +
      "unless the prompt clearly indicates otherwise. Use device_type=\"midi_effect\" in save_amxd().",
  },
  instrument: {
    hard:
      "**TARGET DEVICE TYPE: Instrument**\n" +
      "You MUST use `plugout~` for audio output with `clip~ -1. 1.` before it.\n" +
      "You MUST use `device_type=\"instrument\"` in save_amxd().\n" +
      "Use notein → poly for MIDI input.",
    soft:
      "**LIKELY DEVICE TYPE: Instrument**\n" +
      "The user is most likely asking for an instrument. Use plugout~ for audio output\n" +
      "unless the prompt clearly indicates otherwise. Use device_type=\"instrument\" in save_amxd().",
  },
  audio_effect: {
    hard:
      "**TARGET DEVICE TYPE: Audio Effect**\n" +
      "You MUST use `plugin~` for audio input and `plugout~` for output with `clip~ -1. 1.` before it.\n" +
      "You MUST use `device_type=\"audio_effect\"` in save_amxd().",
    soft:
      "**LIKELY DEVICE TYPE: Audio Effect**\n" +
      "The user is most likely asking for an audio effect. Use plugin~ for input and plugout~ for output\n" +
      "unless the prompt clearly indicates otherwise. Use device_type=\"audio_effect\" in save_amxd().",
  },
};

function buildDynamicPrompt(
  basePrompt: string,
  deviceType: DeviceType,
  isTemplate: boolean,
): string {
  const allTypes: DeviceType[] = ["audio_effect", "instrument", "midi_effect"];
  let prompt = basePrompt;
  for (const type of allTypes) {
    if (type === deviceType) continue;
    const sectionRe = new RegExp(
      `<!-- DEVICE_TYPE:${type}:START -->[\\s\\S]*?<!-- DEVICE_TYPE:${type}:END -->`,
      "g",
    );
    prompt = prompt.replace(sectionRe, "");
  }
  prompt = prompt.replace(new RegExp(`<!-- DEVICE_TYPE:${deviceType}:(?:START|END) -->`, "g"), "");

  const instruction = isTemplate
    ? DEVICE_TYPE_INSTRUCTIONS[deviceType].hard
    : DEVICE_TYPE_INSTRUCTIONS[deviceType].soft;
  prompt += "\n\n" + instruction;

  return prompt;
}

function buildSystemPrompt(deviceType?: DeviceType, isTemplate?: boolean): string {
  let system = baseSystemPrompt;

  const examples = deviceType
    ? allExamples.filter(e => e.deviceType === deviceType || e.deviceType === "")
    : allExamples;

  console.log(`[prompt] deviceType=${deviceType ?? "none"} isTemplate=${isTemplate ?? false} examples=[${examples.map(e => e.name).join(", ")}]`);

  for (const example of examples) {
    system += `\n\n## Complete Example: ${example.name}\n\`\`\`python\n${example.code}\`\`\`\n`;
  }

  if (deviceType) {
    system = buildDynamicPrompt(system, deviceType, isTemplate ?? false);
  }

  console.log(`[prompt] final length=${system.length} chars`);
  return system;
}

interface GenerateRequestBody {
  prompt: string;
  model?: string;
  messages?: { role: string; content: string }[];
  template?: string;
  templateCode?: string;
  deviceType?: "audio_effect" | "instrument" | "midi_effect";
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

    // Resolve device type: use client-provided for templates, classify for free-form
    console.log(`[route] body.deviceType="${body.deviceType}" body.template="${body.template}"`);
    let deviceType: DeviceType | undefined = undefined;
    if (body.deviceType && VALID_DEVICE_TYPES.has(body.deviceType as DeviceType)) {
      deviceType = body.deviceType as DeviceType;
      console.log(`[route] using client-provided deviceType="${deviceType}"`);
    }

    const isTemplate = !!body.template;

    // For free-form prompts without a client deviceType, classify with LLM
    if (!deviceType && !isTemplate) {
      console.log(`[route] classifying prompt: "${body.prompt.slice(0, 100)}"`);
      deviceType = await classifyDeviceType(body.prompt, openrouterApiKey.value());
    }

    console.log(`[route] resolved deviceType="${deviceType}" isTemplate=${isTemplate} model="${body.model}"`);

    // Emit deviceType SSE event early so the frontend can use it for validation
    if (deviceType) {
      res.write(`data: ${JSON.stringify({ type: "deviceType", content: deviceType })}\n\n`);
    }

    const systemPrompt = buildSystemPrompt(deviceType, isTemplate);

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
