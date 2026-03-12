import { env } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import { AiProvider, MarketInsightSource } from "../domain/types.js";

interface OpenAiResponseShape {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
}

interface AnthropicResponseShape {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

interface WebSourceCandidate {
  title?: unknown;
  url?: unknown;
}

export interface ProviderSelection {
  provider: AiProvider;
  label: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  webSearchEnabled: boolean;
  anthropicVersion?: string;
}

interface StructuredAiRequest {
  provider?: AiProvider;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  schema: object;
}

interface StructuredAiResponse<T> {
  payload: T;
  sources: MarketInsightSource[];
  selection: ProviderSelection;
}

const toProviderLabel = (provider: AiProvider): string => {
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
};

const stripCodeFence = (value: string): string => {
  const trimmed = value.trim();

  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
};

const parseJsonPayload = <T>(value: string): T => {
  return JSON.parse(stripCodeFence(value)) as T;
};

const getOpenAiOutputText = (response: OpenAiResponseShape): string => {
  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  const text = response.output
    ?.flatMap((entry) => entry.content ?? [])
    .map((entry) => entry.text)
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (!text) {
    throw new AppError("AI provider returned an empty response.", 502);
  }

  return text;
};

const getAnthropicOutputText = (response: AnthropicResponseShape): string => {
  const text = response.content
    ?.map((entry) => entry.text)
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (!text) {
    throw new AppError("Anthropic returned an empty response.", 502);
  }

  return text;
};

const extractSources = (value: unknown): MarketInsightSource[] => {
  const discovered = new Map<string, MarketInsightSource>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const candidate = node as WebSourceCandidate;

    if (typeof candidate.url === "string" && candidate.url.startsWith("http")) {
      const url = candidate.url.trim();
      const title = typeof candidate.title === "string" && candidate.title.trim().length > 0 ? candidate.title.trim() : url;
      discovered.set(url, { title, url });
    }

    Object.values(node).forEach(visit);
  };

  visit(value);
  return Array.from(discovered.values()).slice(0, 8);
};

export const resolveProviderSelection = ({ provider, model }: { provider?: AiProvider; model?: string }): ProviderSelection => {
  const selectedProvider = provider ?? env.aiDefaultProvider;
  const requestedModel = model?.trim();

  if (!selectedProvider) {
    throw new AppError("No AI provider is configured on the backend.", 503);
  }

  if (selectedProvider === "anthropic") {
    if (!env.anthropicApiKey) {
      throw new AppError("Anthropic is not configured on the backend.", 503);
    }

    return {
      provider: selectedProvider,
      label: toProviderLabel(selectedProvider),
      model: requestedModel || env.anthropicModel,
      apiKey: env.anthropicApiKey,
      baseUrl: env.anthropicBaseUrl,
      webSearchEnabled: env.anthropicWebSearchEnabled,
      anthropicVersion: env.anthropicVersion
    };
  }

  if (!env.openAiApiKey) {
    throw new AppError("OpenAI is not configured on the backend.", 503);
  }

  return {
    provider: selectedProvider,
    label: toProviderLabel(selectedProvider),
    model: requestedModel || env.openAiModel,
    apiKey: env.openAiApiKey,
    baseUrl: env.openAiBaseUrl,
    webSearchEnabled: env.openAiWebSearchEnabled
  };
};

const createOpenAiJson = async <T>(selection: ProviderSelection, request: StructuredAiRequest, signal: AbortSignal) => {
  const response = await fetch(`${selection.baseUrl}/responses`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${selection.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: selection.model,
      tools: selection.webSearchEnabled ? [{ type: "web_search" }] : undefined,
      include: selection.webSearchEnabled ? ["web_search_call.action.sources"] : undefined,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: request.systemPrompt }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: request.userPrompt }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "edge_structured_response",
          strict: true,
          schema: request.schema
        }
      }
    })
  });

  const rawBody = (await response.json()) as OpenAiResponseShape;

  if (!response.ok) {
    throw new AppError(rawBody.error?.message ?? "OpenAI request failed.", 502);
  }

  return {
    payload: parseJsonPayload<T>(getOpenAiOutputText(rawBody)),
    sources: extractSources(rawBody)
  };
};

const createAnthropicJson = async <T>(selection: ProviderSelection, request: StructuredAiRequest, signal: AbortSignal) => {
  const response = await fetch(`${selection.baseUrl}/messages`, {
    method: "POST",
    signal,
    headers: {
      "x-api-key": selection.apiKey,
      "anthropic-version": selection.anthropicVersion ?? "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: selection.model,
      max_tokens: 1800,
      system: `${request.systemPrompt} Return only valid JSON that matches the requested schema.`,
      tools: selection.webSearchEnabled
        ? [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 5
            }
          ]
        : undefined,
      messages: [
        {
          role: "user",
          content: `${request.userPrompt}\n\nJSON schema to respect:\n${JSON.stringify(request.schema)}`
        }
      ]
    })
  });

  const rawBody = (await response.json()) as AnthropicResponseShape;

  if (!response.ok) {
    throw new AppError(rawBody.error?.message ?? "Anthropic request failed.", 502);
  }

  return {
    payload: parseJsonPayload<T>(getAnthropicOutputText(rawBody)),
    sources: extractSources(rawBody),
  };
};

export const generateStructuredAiResponse = async <T>(request: StructuredAiRequest): Promise<StructuredAiResponse<T>> => {
  const selection = resolveProviderSelection({ provider: request.provider, model: request.model });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.openAiTimeoutMs);

  try {
    const generated =
      selection.provider === "anthropic"
        ? await createAnthropicJson<T>(selection, request, controller.signal)
        : await createOpenAiJson<T>(selection, request, controller.signal);

    return {
      ...generated,
      selection
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if ((error as { name?: string } | null)?.name === "AbortError") {
      throw new AppError("AI generation timed out.", 504);
    }

    throw new AppError(error instanceof Error ? error.message : "AI generation failed.", 502);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
};
