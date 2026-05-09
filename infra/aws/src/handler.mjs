import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({});
const bedrock = new BedrockRuntimeClient({});

export async function handler(event) {
  const origin = process.env.ALLOWED_ORIGIN || "*";

  try {
    if (process.env.ENDPOINT_TOKEN) {
      const providedToken = event.headers?.authorization?.replace(/^Bearer\s+/i, "");
      if (providedToken !== process.env.ENDPOINT_TOKEN) {
        return response(401, { error: "Unauthorized." }, origin);
      }
    }

    const request = JSON.parse(event.body || "{}");

    if (request.file?.dataUrl && process.env.UPLOAD_BUCKET) {
      await persistUpload(request.file);
    }

    if (process.env.BEDROCK_MODEL_ID) {
      return response(200, await generateWithBedrock(request), origin);
    }

    return response(
      422,
      {
        error:
          "AWS endpoint is deployed, but BEDROCK_MODEL_ID is not configured. Set it or let Cloudflare use local generation."
      },
      origin
    );
  } catch (error) {
    return response(500, { error: error instanceof Error ? error.message : "Unknown error." }, origin);
  }
}

async function persistUpload(file) {
  const [metadata, payload] = String(file.dataUrl).split(",");
  const contentType = metadata?.match(/^data:(.*?);base64$/)?.[1] || file.type || "application/octet-stream";
  const key = `${Date.now()}-${safeName(file.name || "lead-sheet")}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.UPLOAD_BUCKET,
      Key: key,
      Body: Buffer.from(payload || "", "base64"),
      ContentType: contentType
    })
  );
}

async function generateWithBedrock(request) {
  const prompt = [
    "Return strict JSON for a melodic pentatonic guitar solo generated from this lead sheet.",
    "Shape: title, detectedKey, feel, tempo, style, chords, form, phrases, fullTab, practiceNotes, warnings, source.",
    "Each phrase needs chorus, bar, chord, target, tab, notes, and line.",
    "Use playable standard-tuning guitar tab with motif-based pentatonic phrasing, not random scale runs.",
    JSON.stringify(request)
  ].join("\n\n");

  const command = new InvokeModelCommand({
    modelId: process.env.BEDROCK_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 2500,
      temperature: 0.7,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }]
    })
  });

  const result = await bedrock.send(command);
  const body = JSON.parse(new TextDecoder().decode(result.body));
  const text = body.content?.find((part) => part.type === "text")?.text || "{}";
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] || text;
  const solo = JSON.parse(jsonText);

  return {
    ...solo,
    source: "aws",
    warnings: Array.isArray(solo.warnings) ? solo.warnings : []
  };
}

function response(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization"
    },
    body: JSON.stringify(body)
  };
}

function safeName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(0, 120);
}
