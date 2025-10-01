// Streaming AI Agent Workflow
// This workflow uses streaming LLM responses with Signal+Query pattern

import { proxyActivities, defineQuery, defineSignal, setHandler } from '@temporalio/workflow';
import type * as activities from '../activities';
import type { AssistantModelMessage, ToolModelMessage, UserModelMessage, ToolResultPart, ToolCallPart, JSONValue } from 'ai';
import type { AgentInput, AgentResult, ToolCallRecord } from './agent';

// Streaming-specific queries and signals
export const streamingTextQuery = defineQuery<string>('streamingText');
export const streamTokenSignal = defineSignal<[string]>('streamToken');
export const streamingProgressQuery = defineQuery<string>('progress');

// Proxy activities with retry configuration
const {
  generateWithLLM,
  generateWithLLMStreaming,
  executeGetWeather,
  executeConvertToCelsius,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes', // Longer timeout for streaming
  heartbeatTimeout: '30 seconds',
  retry: {
    initialInterval: '1 second',
    maximumInterval: '30 seconds',
    backoffCoefficient: 2,
    maximumAttempts: 10,
  },
});

export async function streamingAiAgentWorkflow(input: AgentInput): Promise<AgentResult> {
  console.log(`[Streaming Workflow] Starting AI Agent for prompt: "${input.prompt}"`);

  let currentProgress = 'Starting AI agent...';
  let streamingText = '';

  // Set up handlers
  setHandler(streamingProgressQuery, () => currentProgress);
  setHandler(streamingTextQuery, () => streamingText);
  setHandler(streamTokenSignal, (token: string) => {
    streamingText += token;
  });

  const maxSteps = input.maxSteps || 5;
  const allToolCalls: ToolCallRecord[] = [];

  let messages: Array<UserModelMessage | AssistantModelMessage | ToolModelMessage> = [];
  let stepCount = 0;
  let finalResponse = '';

  // Get workflow ID to pass to streaming activity
  const workflowId = (await import('@temporalio/workflow')).workflowInfo().workflowId;

  while (stepCount < maxSteps) {
    stepCount++;
    currentProgress = `Step ${stepCount}: Calling LLM...`;
    console.log(`[Streaming Workflow] Step ${stepCount}: Calling LLM`);

    // Use regular generateText for tool-calling steps (crash-proof)
    const llmResult = await generateWithLLM({
      prompt: input.prompt,
      messages: messages.length > 0 ? messages : undefined,
    });

    console.log(`[Streaming Workflow] LLM returned ${llmResult.toolCalls.length} tool calls`);

    if (llmResult.toolCalls.length === 0) {
      // No tool calls - this is likely the final response after tools
      // Don't break yet, let it continue to streaming step
      finalResponse = llmResult.text;
      console.log(`[Streaming Workflow] No tool calls, will stream final response`);
      break;
    }

    // Add assistant message with tool calls
    const toolCallParts: ToolCallPart[] = llmResult.toolCalls.map(tc => ({
      type: 'tool-call',
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      input: tc.input,
    }));

    messages.push({
      role: 'assistant',
      content: toolCallParts,
    });

    // Execute tools
    const toolResults: ToolResultPart[] = [];

    for (const toolCall of llmResult.toolCalls) {
      currentProgress = `Step ${stepCount}: Executing ${toolCall.toolName}...`;
      console.log(`[Streaming Workflow] Executing tool: ${toolCall.toolName}`);

      let toolResult: unknown;

      switch (toolCall.toolName) {
        case 'getWeather':
          toolResult = await executeGetWeather(toolCall.input as activities.WeatherInput);
          break;
        case 'convertTocelsius':
          toolResult = await executeConvertToCelsius(toolCall.input as activities.CelsiusInput);
          break;
        default:
          console.log(`[Streaming Workflow] Unknown tool: ${toolCall.toolName}`);
          toolResult = { error: `Unknown tool: ${toolCall.toolName}` };
      }

      console.log(`[Streaming Workflow] Tool ${toolCall.toolName} completed`);

      allToolCalls.push({
        toolName: toolCall.toolName,
        input: toolCall.input,
        result: toolResult,
        timestamp: Date.now(),
      });

      toolResults.push({
        type: 'tool-result',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        output: {
          type: 'json',
          value: toolResult as JSONValue,
        },
      });
    }

    messages.push({
      role: 'tool',
      content: toolResults,
    });

    if (llmResult.text && llmResult.finishReason === 'stop') {
      finalResponse = llmResult.text;
      console.log(`[Streaming Workflow] LLM generated final response after tools`);
      break;
    }
  }

  // Now stream the final response (whether from tool results or direct response)
  if (!finalResponse || finalResponse === '') {
    // Edge case: if we got here without a final response, generate one
    currentProgress = 'Generating final response (streaming)...';
    console.log(`[Streaming Workflow] Max steps reached, streaming final response`);

    streamingText = '';
    const finalLLMResult = await generateWithLLMStreaming({
      prompt: 'Please provide a final response based on the tool results.',
      messages,
      workflowId,
    });

    finalResponse = finalLLMResult.text;
  } else {
    // We have a text response, but let's re-stream it for consistency
    // This allows the final answer to be streamed even if it came from generateText
    currentProgress = 'Streaming final response...';
    console.log(`[Streaming Workflow] Streaming final response`);

    streamingText = '';
    const streamedResult = await generateWithLLMStreaming({
      prompt: input.prompt,
      messages,
      workflowId,
    });

    finalResponse = streamedResult.text;
  }

  currentProgress = 'Completed!';
  console.log('[Streaming Workflow] AI Agent workflow completed successfully');

  return {
    finalResponse,
    toolCalls: allToolCalls,
    totalSteps: stepCount,
  };
}
