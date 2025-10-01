import { Context } from '@temporalio/activity';

export interface WeatherInput {
  location: string;
}

export interface WeatherOutput {
  location: string;
  temperature: number;
}

export async function executeGetWeather(input: WeatherInput): Promise<WeatherOutput> {
  console.log(`  [Tool Activity] Getting weather for ${input.location}`);
  Context.current().heartbeat();

  await new Promise(resolve => setTimeout(resolve, 1000));
  const temperature = Math.round(Math.random() * (90 - 32) + 32);

  console.log(`  [Tool Activity] Weather: ${temperature}°F in ${input.location}`);
  return { location: input.location, temperature };
}
