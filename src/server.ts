import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { agentRoutes } from './routes/agent';
import { healthRoutes } from './routes/health';
import 'dotenv/config';

const app = new Hono();

// Mount routes
app.route('/agent', agentRoutes);
app.route('/health', healthRoutes);

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  POST /agent - Start AI agent workflow (non-blocking)`);
  console.log(`  GET  /agent/:workflowId - Get workflow status and results`);
  console.log(`  POST /agent/execute - Start and wait for workflow (blocking)`);
  console.log(`  POST /agent/stream - Start workflow and stream progress (SSE)`);
  console.log(`  GET  /agent/:workflowId/stream - Stream progress for existing workflow (SSE)`);
  console.log(`  GET  /health - Health check`);
});
