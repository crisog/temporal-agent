// Import types at the top
import { z } from 'zod';
import { Context } from '@temporalio/activity';
import { stepCountIs } from 'ai';
import type { UserModelMessage, AssistantModelMessage, ToolModelMessage } from 'ai';

// Tool input/output types
export interface WeatherInput {
  location: string;
}

export interface WeatherOutput {
  location: string;
  temperature: number;
}

export interface CelsiusInput {
  temperature: number;
}

export interface CelsiusOutput {
  celsius: number;
}

// Tool execution activities
export async function executeGetWeather(input: WeatherInput): Promise<WeatherOutput> {
  console.log(`  [Tool Activity] Getting weather for ${input.location}`);
  Context.current().heartbeat();

  await new Promise(resolve => setTimeout(resolve, 1000));
  const temperature = Math.round(Math.random() * (90 - 32) + 32);

  console.log(`  [Tool Activity] Weather: ${temperature}°F in ${input.location}`);
  return { location: input.location, temperature };
}

export async function executeConvertToCelsius(input: CelsiusInput): Promise<CelsiusOutput> {
  console.log(`  [Tool Activity] Converting ${input.temperature}°F to Celsius`);
  Context.current().heartbeat();

  await new Promise(resolve => setTimeout(resolve, 500));
  const celsius = Math.round((input.temperature - 32) * (5 / 9));

  console.log(`  [Tool Activity] Converted to ${celsius}°C`);
  return { celsius };
}

// LLM generation activity
export interface LLMGenerationInput {
  prompt: string;
  messages?: Array<UserModelMessage | AssistantModelMessage | ToolModelMessage>;
  maxSteps?: number;
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

  const { openai } = await import('@ai-sdk/openai');
  const { generateText, tool } = await import('ai');

  // Define tools WITHOUT execute functions
  const tools = {
    getWeather: tool({
      description: 'Get the current weather in a specific location (returns temperature in Fahrenheit)',
      inputSchema: z.object({
        location: z.string().describe('The city or location to get weather for'),
      }),
    }),
    convertTocelsius: tool({
      description: 'Convert a temperature from Fahrenheit to Celsius',
      inputSchema: z.object({
        temperature: z.number().describe('The temperature in Fahrenheit to convert'),
      }),
    }),
  };

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

