import { Context } from '@temporalio/activity';

export interface CelsiusInput {
  temperature: number;
}

export interface CelsiusOutput {
  celsius: number;
}

export async function executeConvertToCelsius(input: CelsiusInput): Promise<CelsiusOutput> {
  console.log(`  [Tool Activity] Converting ${input.temperature}°F to Celsius`);
  Context.current().heartbeat();

  await new Promise(resolve => setTimeout(resolve, 500));
  const celsius = Math.round((input.temperature - 32) * (5 / 9));

  console.log(`  [Tool Activity] Converted to ${celsius}°C`);
  return { celsius };
}
