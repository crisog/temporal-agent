import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const schema = z.object({
  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  TEMPORAL_API_KEY: z.string().optional(),

  OPENAI_API_KEY: z.string(),

  PORT: z.string().default('3000'),
});

export const env = schema.parse(process.env);
