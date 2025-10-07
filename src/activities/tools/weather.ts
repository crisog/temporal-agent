import { Context } from '@temporalio/activity';
import { z } from 'zod';

export const WeatherInputSchema = z.object({
  location: z.string(),
});

export const WeatherOutputSchema = z.object({
  location: z.string(),
  temperature: z.number(),
});

export type WeatherInput = z.infer<typeof WeatherInputSchema>;
export type WeatherOutput = z.infer<typeof WeatherOutputSchema>;

export async function executeGetWeather(input: WeatherInput): Promise<WeatherOutput> {
  console.log(`  [Tool Activity] Getting weather for ${input.location}`);
  Context.current().heartbeat();

  await new Promise(resolve => setTimeout(resolve, 1000));
  const temperature = Math.round(Math.random() * (90 - 32) + 32);

  console.log(`  [Tool Activity] Weather: ${temperature}°F in ${input.location}`);
  return { location: input.location, temperature };
}
