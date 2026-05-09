import { generateSolo, type GenerateSoloRequest, type SoloResult } from "../../src/lib/solo";

interface Env {
  AWS_SOLO_ENDPOINT?: string;
  AWS_SOLO_ENDPOINT_TOKEN?: string;
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: corsHeaders()
  });

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const request = (await context.request.json()) as GenerateSoloRequest;
    const validation = validateRequest(request);

    if (validation) {
      return json({ error: validation }, 400);
    }

    if (context.env.AWS_SOLO_ENDPOINT) {
      try {
        const awsResult = await callAwsGenerator(context.env, request);
        return json({ ...awsResult, source: "aws" satisfies SoloResult["source"] });
      } catch (error) {
        const fallback = generateSolo(request);
        fallback.warnings.unshift(
          `AWS endpoint was unavailable, so local generation was used. ${errorMessage(error)}`
        );
        return json(fallback);
      }
    }

    return json(generateSolo(request));
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
};

function validateRequest(request: GenerateSoloRequest): string | undefined {
  if (!request || typeof request !== "object") return "Invalid request body.";

  const hasLeadText = typeof request.leadSheetText === "string" && request.leadSheetText.trim().length > 0;
  const hasFile = Boolean(request.file?.dataUrl || request.file?.name);

  if (!hasLeadText && !hasFile) {
    return "Upload a lead sheet or paste chord text.";
  }

  if (request.leadSheetText && request.leadSheetText.length > 40_000) {
    return "Lead sheet text is too large for this endpoint.";
  }

  if (request.file?.dataUrl && request.file.dataUrl.length > 6_000_000) {
    return "Uploaded file is too large for this endpoint.";
  }

  return undefined;
}

async function callAwsGenerator(env: Env, request: GenerateSoloRequest): Promise<SoloResult> {
  if (!env.AWS_SOLO_ENDPOINT) throw new Error("AWS_SOLO_ENDPOINT is not configured.");

  const response = await fetch(env.AWS_SOLO_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.AWS_SOLO_ENDPOINT_TOKEN ? { authorization: `Bearer ${env.AWS_SOLO_ENDPOINT_TOKEN}` } : {})
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`AWS endpoint returned ${response.status}.`);
  }

  return (await response.json()) as SoloResult;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function corsHeaders(): HeadersInit {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization"
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}
