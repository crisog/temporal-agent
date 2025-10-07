import { Worker } from '@temporalio/worker';
import * as activities from './activities';
import { createWorkerConnection, getTemporalConfig } from './config/temporal';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import './env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function run() {
  const config = getTemporalConfig();

  const connection = await createWorkerConnection();

  console.log('[Worker] Connected successfully');

  const worker = await Worker.create({
    connection,
    namespace: config.namespace,
    taskQueue: 'ai-agent-queue',
    workflowsPath: join(__dirname, 'workflows'),
    activities,
  });

  console.log('[Worker] Worker created successfully');
  console.log('[Worker] Registered workflows: aiAgentWorkflow, streamingAiAgentWorkflow');
  console.log('[Worker] Registered activities: generateWithLLM, generateWithLLMStreaming, executeGetWeather, executeConvertToCelsius');
  console.log('[Worker] Listening on task queue: ai-agent-queue');
  console.log('[Worker] Starting worker...\n');

  const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  shutdownSignals.forEach((signal) => {
    process.on(signal, async () => {
      console.log(`\n[Worker] Received ${signal}, starting graceful shutdown...`);
      await worker.shutdown();
      console.log('[Worker] Graceful shutdown complete');
      process.exit(0);
    });
  });

  await worker.run();
}

run().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
