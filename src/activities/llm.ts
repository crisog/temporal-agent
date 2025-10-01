import { Context } from '@temporalio/activity';
import { openai } from '@ai-sdk/openai';
import { generateText, streamText, stepCountIs } from 'ai';
import type { UserModelMessage, AssistantModelMessage, ToolModelMessage } from 'ai';
import { tools } from '../tools';

// LLM activity types
export interface LLMGenerationInput {
  prompt: string;
  messages?: Array<UserModelMessage | AssistantModelMessage | ToolModelMessage>;
  maxSteps?: number;
  workflowId?: string; // For streaming - to send signals back
}

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface LLMGenerationResult {
  toolCalls: ToolCallInfo[];
  text: string;
  finishReason: string;
}

export async function generateWithLLM(input: LLMGenerationInput): Promise<LLMGenerationResult> {
  console.log(`[LLM Activity] Generating response for: "${input.prompt}"`);
  Context.current().heartbeat();

  // Build messages array - if we have existing messages, use them; otherwise start with user prompt
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

// Streaming version that sends tokens via Temporal client signals
export async function generateWithLLMStreaming(input: LLMGenerationInput): Promise<LLMGenerationResult> {
  console.log(`[LLM Activity] Streaming response for: "${input.prompt}"`);
  Context.current().heartbeat();

  if (!input.workflowId) {
    throw new Error('workflowId is required for streaming');
  }

  // Import temporal client to send signals
  const { getTemporalClient } = await import('../config/temporal');

  const client = await getTemporalClient();
  const handle = client.getHandle(input.workflowId);

  // Build messages array
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

  let fullText = '';

  // Stream tokens and send signals
  for await (const chunk of result.textStream) {
    fullText += chunk;
    // Send signal to workflow with new token
    await handle.signal('streamToken', chunk);
    Context.current().heartbeat({ streamedSoFar: fullText });
  }

  const finishReason = await result.finishReason;

  Context.current().heartbeat();

  return {
    toolCalls: [],
    text: fullText,
    finishReason,
  };
}
