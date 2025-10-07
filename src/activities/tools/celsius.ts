import { Context } from '@temporalio/activity';
import { z } from 'zod';

export const CelsiusInputSchema = z.object({
  temperature: z.number(),
});

export const CelsiusOutputSchema = z.object({
  celsius: z.number(),
});

export type CelsiusInput = z.infer<typeof CelsiusInputSchema>;
export type CelsiusOutput = z.infer<typeof CelsiusOutputSchema>;

export async function executeConvertToCelsius(input: CelsiusInput): Promise<CelsiusOutput> {
  console.log(`  [Tool Activity] Converting ${input.temperature}°F to Celsius`);
  Context.current().heartbeat();

  await new Promise(resolve => setTimeout(resolve, 500));
  const celsius = Math.round((input.temperature - 32) * (5 / 9));

  console.log(`  [Tool Activity] Converted to ${celsius}°C`);
  return { celsius };
}
