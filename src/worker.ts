// Temporal Worker for AI Agent
// This runs the workflows and executes activities
// Can be scaled horizontally for more throughput

import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function run() {
  // Get Temporal connection details from environment
  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
  const apiKey = process.env.TEMPORAL_API_KEY;

  console.log(`[Worker] Connecting to Temporal at ${address}`);
  console.log(`[Worker] Using namespace: ${namespace}`);

  // Configure connection
  const connectionOptions: any = {
    address: address,
  };

  if (apiKey) {
    // Temporal Cloud with API key
    connectionOptions.tls = true;
    connectionOptions.apiKey = apiKey;
    connectionOptions.metadata = {
      'temporal-namespace': namespace,
    };
    console.log('[Worker] Using API key authentication');
  } else {
    // Local Temporal server
    connectionOptions.tls = false;
    console.log('[Worker] Using local Temporal server (no TLS)');
  }

  // Create connection
  const connection = await NativeConnection.connect(connectionOptions);

  console.log('[Worker] Connected successfully');

  // Create worker
  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: 'ai-agent-queue',
    workflowsPath: join(__dirname, 'workflows.ts'),
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
