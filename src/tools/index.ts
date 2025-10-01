import { tool } from 'ai';
import { z } from 'zod';

export const tools = {
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

export type ToolName = keyof typeof tools;
