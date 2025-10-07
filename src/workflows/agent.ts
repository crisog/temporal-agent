import { proxyActivities, defineQuery, defineSignal, setHandler } from '@temporalio/workflow';
import { z } from 'zod';
import type * as activities from '../activities';
import type { AssistantModelMessage, ToolModelMessage, UserModelMessage, ToolResultPart, ToolCallPart, JSONValue } from 'ai';

export const AgentInputSchema = z.object({
  prompt: z.string(),
  maxSteps: z.number().optional(),
});

export const ToolCallRecordSchema = z.object({
  toolName: z.string(),
  input: z.unknown(),
  result: z.unknown(),
  timestamp: z.number(),
});

export const AgentResultSchema = z.object({
  finalResponse: z.string(),
  toolCalls: z.array(ToolCallRecordSchema),
  totalSteps: z.number(),
});

export type AgentInput = z.infer<typeof AgentInputSchema>;
export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;
export type AgentResult = z.infer<typeof AgentResultSchema>;

export const progressQuery = defineQuery<string>('progress');

const {
  generateWithLLM,
  executeGetWeather,
  executeConvertToCelsius,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  heartbeatTimeout: '30 seconds',
  retry: {
    initialInterval: '1 second',
    maximumInterval: '30 seconds',
    backoffCoefficient: 2,
    maximumAttempts: 10,
  },
});

export async function aiAgentWorkflow(input: AgentInput): Promise<AgentResult> {
  console.log(`[Workflow] Starting AI Agent for prompt: "${input.prompt}"`);

  let currentProgress = 'Starting AI agent...';
  setHandler(progressQuery, () => currentProgress);

  const maxSteps = input.maxSteps || 5;
  const allToolCalls: ToolCallRecord[] = [];

  let messages: Array<UserModelMessage | AssistantModelMessage | ToolModelMessage> = [];
  let stepCount = 0;
  let finalResponse = '';

  while (stepCount < maxSteps) {
    stepCount++;
    currentProgress = `Step ${stepCount}: Calling LLM...`;
    console.log(`[Workflow] Step ${stepCount}: Generating with LLM`);

    const llmResult = await generateWithLLM({
      prompt: input.prompt,
      messages: messages.length > 0 ? messages : undefined,
    });

    console.log(`[Workflow] LLM returned ${llmResult.toolCalls.length} tool calls`);

    if (llmResult.toolCalls.length === 0) {
      finalResponse = llmResult.text;
      console.log(`[Workflow] No tool calls, final response generated`);
      break;
    }

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

    const toolResults: ToolResultPart[] = [];

    for (const toolCall of llmResult.toolCalls) {
      currentProgress = `Step ${stepCount}: Executing ${toolCall.toolName}...`;
      console.log(`[Workflow] Executing tool: ${toolCall.toolName}`);

      let toolResult: unknown;

      switch (toolCall.toolName) {
        case 'getWeather':
          toolResult = await executeGetWeather(toolCall.input as activities.WeatherInput);
          break;
        case 'convertTocelsius':
          toolResult = await executeConvertToCelsius(toolCall.input as activities.CelsiusInput);
          break;
        default:
          console.log(`[Workflow] Unknown tool: ${toolCall.toolName}`);
          toolResult = { error: `Unknown tool: ${toolCall.toolName}` };
      }

      console.log(`[Workflow] Tool ${toolCall.toolName} completed`);

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
      console.log(`[Workflow] LLM generated final response after tools`);
      break;
    }
  }

  if (!finalResponse) {
    currentProgress = 'Generating final response...';
    console.log(`[Workflow] Max steps reached, generating final response`);

    const finalLLMResult = await generateWithLLM({
      prompt: 'Please provide a final response based on the tool results.',
      messages,
    });

    finalResponse = finalLLMResult.text;
  }

  currentProgress = 'Completed!';
  console.log('[Workflow] AI Agent workflow completed successfully');

  return {
    finalResponse,
    toolCalls: allToolCalls,
    totalSteps: stepCount,
  };
}
