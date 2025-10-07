// Crash-proof AI Agent Workflow
// This workflow orchestrates AI tool calls as durable activities
// Each tool execution is a separate activity for maximum durability
// If the app crashes/redeploys, the workflow resumes from the last completed activity

import { proxyActivities, defineQuery, defineSignal, setHandler } from '@temporalio/workflow';
import type * as activities from '../activities';
import type { AssistantModelMessage, ToolModelMessage, UserModelMessage, ToolResultPart, ToolCallPart, JSONValue } from 'ai';

// Workflow types
export interface AgentInput {
  prompt: string;
  maxSteps?: number;
}

export interface ToolCallRecord {
  toolName: string;
  input: unknown;
  result: unknown;
  timestamp: number;
}

export interface AgentResult {
  finalResponse: string;
  toolCalls: ToolCallRecord[];
  totalSteps: number;
}

// Define a query to get the current progress
export const progressQuery = defineQuery<string>('progress');

// Proxy activities with retry configuration
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

// Multi-step AI Agent workflow - each tool execution is a separate durable activity
export async function aiAgentWorkflow(input: AgentInput): Promise<AgentResult> {
  console.log(`[Workflow] Starting AI Agent for prompt: "${input.prompt}"`);

  // Progress tracking
  let currentProgress = 'Starting AI agent...';

  // Set up query handler for progress
  setHandler(progressQuery, () => currentProgress);

  const maxSteps = input.maxSteps || 5;
  const allToolCalls: ToolCallRecord[] = [];

  let messages: Array<UserModelMessage | AssistantModelMessage | ToolModelMessage> = [];
  let stepCount = 0;
  let finalResponse = '';

  // Multi-step loop: LLM generates -> execute tools as separate activities -> repeat
  while (stepCount < maxSteps) {
    stepCount++;
    currentProgress = `Step ${stepCount}: Calling LLM...`;
    console.log(`[Workflow] Step ${stepCount}: Generating with LLM`);

    // Step 1: Call LLM (separate activity)
    const llmResult = await generateWithLLM({
      prompt: input.prompt,
      messages: messages.length > 0 ? messages : undefined,
    });

    console.log(`[Workflow] LLM returned ${llmResult.toolCalls.length} tool calls`);

    // If no tool calls, we're done
    if (llmResult.toolCalls.length === 0) {
      finalResponse = llmResult.text;
      console.log(`[Workflow] No tool calls, final response generated`);
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

    // Step 2: Execute each tool as a separate durable activity
    const toolResults: ToolResultPart[] = [];

    for (const toolCall of llmResult.toolCalls) {
      currentProgress = `Step ${stepCount}: Executing ${toolCall.toolName}...`;
      console.log(`[Workflow] Executing tool: ${toolCall.toolName}`);

      let toolResult: unknown;

      // Execute the appropriate activity based on tool name
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

      // Track tool call and result
      allToolCalls.push({
        toolName: toolCall.toolName,
        input: toolCall.input,
        result: toolResult,
        timestamp: Date.now(),
      });

      // Add to tool results for next LLM call
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

    // Add tool results to messages
    messages.push({
      role: 'tool',
      content: toolResults,
    });

    // If LLM also generated text (not just tool calls), check if we should continue
    if (llmResult.text && llmResult.finishReason === 'stop') {
      finalResponse = llmResult.text;
      console.log(`[Workflow] LLM generated final response after tools`);
      break;
    }
  }

  // If we exhausted steps without getting a final response, call LLM one more time
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
