import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { nanoid } from 'nanoid';
import { getTemporalClient } from '../config/temporal';
import { aiAgentWorkflow, progressQuery } from '../workflows/agent';
import { streamingAiAgentWorkflow, streamingTextQuery } from '../workflows/streaming-agent';
import type { AgentInput } from '../workflows/agent';

export const agentRoutes = new Hono();

agentRoutes.post('/', async (c) => {
  const { prompt } = await c.req.json();

  if (!prompt) {
    return c.json({ error: 'prompt is required' }, 400);
  }

  const client = await getTemporalClient();

  const workflowId = `agent-${nanoid()}`;

  console.log(`[API] Starting workflow ${workflowId}`);

  const handle = await client.start(aiAgentWorkflow, {
    args: [{ prompt }],
    taskQueue: 'ai-agent-queue',
    workflowId,
  });

  return c.json({
    workflowId: handle.workflowId,
    runId: handle.firstExecutionRunId,
    status: 'started',
    message: 'Agent workflow started. Use /agent/:workflowId to get results.',
  });
});

agentRoutes.get('/:workflowId', async (c) => {
  const workflowId = c.req.param('workflowId');

  const client = await getTemporalClient();

  try {
    const handle = client.getHandle(workflowId);

    const description = await handle.describe();

    if (description.status.name === 'COMPLETED') {
      const result = await handle.result();
      return c.json({
        workflowId,
        status: 'completed',
        result,
      });
    } else if (description.status.name === 'RUNNING') {
      return c.json({
        workflowId,
        status: 'running',
        message: 'Workflow is still executing',
      });
    } else {
      return c.json({
        workflowId,
        status: description.status.name.toLowerCase(),
      });
    }
  } catch (error) {
    return c.json({ error: 'Workflow not found' }, 404);
  }
});

agentRoutes.post('/execute', async (c) => {
  const { prompt } = await c.req.json();

  if (!prompt) {
    return c.json({ error: 'prompt is required' }, 400);
  }

  const client = await getTemporalClient();
  const workflowId = `agent-${nanoid()}`;

  console.log(`[API] Starting and waiting for workflow ${workflowId}`);

  const handle = await client.start(aiAgentWorkflow, {
    args: [{ prompt }],
    taskQueue: 'ai-agent-queue',
    workflowId,
  });

  const result = await handle.result();

  return c.json({
    workflowId: handle.workflowId,
    result,
  });
});

agentRoutes.get('/:workflowId/stream', async (c) => {
  const workflowId = c.req.param('workflowId');
  const client = await getTemporalClient();

  return stream(c, async (stream) => {
    try {
      const handle = client.getHandle(workflowId);

      let lastProgress = '';
      let isComplete = false;

      while (!isComplete) {
        try {
          const progress = await handle.query(progressQuery);

          if (progress !== lastProgress) {
            await stream.writeln(`data: ${JSON.stringify({ type: 'progress', message: progress })}\n`);
            lastProgress = progress;
          }

          const description = await handle.describe();
          if (description.status.name === 'COMPLETED') {
            const result = await handle.result();
            await stream.writeln(`data: ${JSON.stringify({ type: 'complete', result })}\n`);
            isComplete = true;
          } else if (description.status.name !== 'RUNNING') {
            await stream.writeln(`data: ${JSON.stringify({ type: 'error', message: `Workflow ${description.status.name}` })}\n`);
            isComplete = true;
          }
        } catch (error: any) {
          await stream.writeln(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n`);
          isComplete = true;
        }

        if (!isComplete) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error: any) {
      await stream.writeln(`data: ${JSON.stringify({ type: 'error', message: 'Workflow not found' })}\n`);
    }
  });
});

agentRoutes.post('/stream', async (c) => {
  const { prompt } = await c.req.json();

  if (!prompt) {
    return c.json({ error: 'prompt is required' }, 400);
  }

  const client = await getTemporalClient();
  const workflowId = `agent-${nanoid()}`;

  const handle = await client.start(aiAgentWorkflow, {
    args: [{ prompt }],
    taskQueue: 'ai-agent-queue',
    workflowId,
  });

  console.log(`[API] Starting streaming workflow ${workflowId}`);

  return stream(c, async (stream) => {
    await stream.writeln(`data: ${JSON.stringify({ type: 'started', workflowId })}\n`);

    let lastProgress = '';
    let isComplete = false;

    while (!isComplete) {
      try {
        const progress = await handle.query(progressQuery);

        if (progress !== lastProgress) {
          await stream.writeln(`data: ${JSON.stringify({ type: 'progress', message: progress })}\n`);
          lastProgress = progress;
        }

        const description = await handle.describe();
        if (description.status.name === 'COMPLETED') {
          const result = await handle.result();
          await stream.writeln(`data: ${JSON.stringify({ type: 'complete', result })}\n`);
          isComplete = true;
        } else if (description.status.name !== 'RUNNING') {
          await stream.writeln(`data: ${JSON.stringify({ type: 'error', message: `Workflow ${description.status.name}` })}\n`);
          isComplete = true;
        }
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
      }

      if (!isComplete) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  });
});

agentRoutes.post('/stream-tokens', async (c) => {
  const { prompt } = await c.req.json();

  if (!prompt) {
    return c.json({ error: 'prompt is required' }, 400);
  }

  const client = await getTemporalClient();
  const workflowId = `agent-${nanoid()}`;

  const handle = await client.start(streamingAiAgentWorkflow, {
    args: [{ prompt }],
    taskQueue: 'ai-agent-queue',
    workflowId,
  });

  console.log(`[API] Starting token streaming workflow ${workflowId}`);

  return stream(c, async (stream) => {
    await stream.writeln(`data: ${JSON.stringify({ type: 'started', workflowId })}\n`);

    let lastStreamedText = '';
    let isComplete = false;

    while (!isComplete) {
      try {
        const streamedText = await handle.query(streamingTextQuery);

        if (streamedText !== lastStreamedText) {
          const newTokens = streamedText.substring(lastStreamedText.length);
          if (newTokens) {
            await stream.writeln(`data: ${JSON.stringify({ type: 'token', content: newTokens })}\n`);
            lastStreamedText = streamedText;
          }
        }

        const description = await handle.describe();
        if (description.status.name === 'COMPLETED') {
          const result = await handle.result();
          await stream.writeln(`data: ${JSON.stringify({ type: 'complete', result })}\n`);
          isComplete = true;
        } else if (description.status.name !== 'RUNNING') {
          await stream.writeln(`data: ${JSON.stringify({ type: 'error', message: `Workflow ${description.status.name}` })}\n`);
          isComplete = true;
        }
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
      }

      if (!isComplete) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  });
});
