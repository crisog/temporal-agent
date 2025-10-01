// Temporal Worker for AI Agent
// This runs the workflows and executes activities
// Can be scaled horizontally for more throughput

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

  // Create connection
  const connection = await createWorkerConnection();

  console.log('[Worker] Connected successfully');

  // Create worker
  const worker = await Worker.create({
    connection,
    namespace: config.namespace,
    taskQueue: 'ai-agent-queue',
    workflowsPath: join(__dirname, 'workflows/agent.ts'),
    activities,
  });

  console.log('[Worker] Worker created successfully');
  console.log('[Worker] Registered workflows: aiAgentWorkflow');
  console.log('[Worker] Registered activities: runAIAgent');
  console.log('[Worker] Listening on task queue: ai-agent-queue');
  console.log('[Worker] Starting worker...\n');

  // Handle graceful shutdown
  const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  shutdownSignals.forEach((signal) => {
    process.on(signal, async () => {
      console.log(`\n[Worker] Received ${signal}, starting graceful shutdown...`);
      // This allows in-flight activities to complete before shutting down
      await worker.shutdown();
      console.log('[Worker] Graceful shutdown complete');
      process.exit(0);
    });
  });

  // Start accepting tasks
  await worker.run();
}

run().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
