import { Context } from '@temporalio/activity';
import { openai } from '@ai-sdk/openai';
import { generateText, streamText, stepCountIs } from 'ai';
import type { UserModelMessage, AssistantModelMessage, ToolModelMessage } from 'ai';
import { z } from 'zod';
import { tools } from '../tools';

export const StreamTokenPayloadSchema = z.object({
  offset: z.number(),
  content: z.string(),
});

export const StreamingHeartbeatSchema = z.object({
  deliveredLength: z.number(),
  fullText: z.string(),
});

export const LLMGenerationInputSchema = z.object({
  prompt: z.string(),
  messages: z.array(z.any()).optional(),
  maxSteps: z.number().optional(),
  workflowId: z.string().optional(),
});

export const ToolCallInfoSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
});

export const LLMGenerationResultSchema = z.object({
  toolCalls: z.array(ToolCallInfoSchema),
  text: z.string(),
  finishReason: z.string(),
});

export type StreamTokenPayload = z.infer<typeof StreamTokenPayloadSchema>;
export type StreamingHeartbeat = z.infer<typeof StreamingHeartbeatSchema>;
export type LLMGenerationInput = z.infer<typeof LLMGenerationInputSchema>;
export type ToolCallInfo = z.infer<typeof ToolCallInfoSchema>;
export type LLMGenerationResult = z.infer<typeof LLMGenerationResultSchema>;

export async function generateWithLLM(input: LLMGenerationInput): Promise<LLMGenerationResult> {
  console.log(`[LLM Activity] Generating response for: "${input.prompt}"`);
  Context.current().heartbeat();

  const messages = input.messages && input.messages.length > 0
    ? input.messages
    : [{ role: 'user' as const, content: input.prompt }];

  const result = await generateText({
    model: openai('gpt-4o-mini'),
    system: 'You are a helpful assistant. After calling any tools, you MUST generate a natural language response to answer the user\'s question using the tool results. Do not stop after calling tools.',
    messages,
    stopWhen: stepCountIs(1),
    tools,
  });

  Context.current().heartbeat();

  return {
    toolCalls: result.toolCalls.map(tc => ({
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      input: tc.input,
    })),
    text: result.text,
    finishReason: result.finishReason,
  };
}

export async function generateWithLLMStreaming(input: LLMGenerationInput): Promise<LLMGenerationResult> {
  console.log(`[LLM Activity] Streaming response for: "${input.prompt}"`);
  const ctx = Context.current();
  ctx.heartbeat();

  if (!input.workflowId) {
    throw new Error('workflowId is required for streaming');
  }

  const { getTemporalClient } = await import('../config/temporal');

  const client = await getTemporalClient();
  const handle = client.getHandle(input.workflowId);

  const heartbeatState = ctx.info.heartbeatDetails as StreamingHeartbeat | undefined;
  let deliveredLength = heartbeatState?.deliveredLength ?? 0;
  let fullText = heartbeatState?.fullText ?? '';
  let observedLength = 0;

  const messages = input.messages && input.messages.length > 0
    ? input.messages
    : [{ role: 'user' as const, content: input.prompt }];

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: 'You are a helpful assistant. After calling any tools, you MUST generate a natural language response to answer the user\'s question using the tool results. Do not stop after calling tools.',
    messages,
    tools,
    toolChoice: 'none',
  });

  for await (const chunk of result.textStream) {
    const chunkLength = chunk.length;
    const chunkStart = observedLength;
    observedLength += chunkLength;

    const alreadyDelivered = Math.max(Math.min(deliveredLength - chunkStart, chunkLength), 0);

    if (alreadyDelivered >= chunkLength) {
      continue;
    }

    const newContent = chunk.slice(alreadyDelivered);
    if (newContent.length === 0) {
      continue;
    }

    const payload: StreamTokenPayload = {
      offset: deliveredLength,
      content: newContent,
    };

    await handle.signal('streamToken', payload);

    deliveredLength += newContent.length;
    fullText += newContent;
    ctx.heartbeat({ deliveredLength, fullText } satisfies StreamingHeartbeat);
  }

  const finishReason = await result.finishReason;

  ctx.heartbeat({ deliveredLength, fullText } satisfies StreamingHeartbeat);

  return {
    toolCalls: [],
    text: fullText,
    finishReason,
  };
}
