import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { Connection, WorkflowClient } from '@temporalio/client'
import { aiAgentWorkflow, progressQuery } from './workflows'
import { nanoid } from 'nanoid'
import { stream } from 'hono/streaming'
import 'dotenv/config'

const app = new Hono()

let client: WorkflowClient | null = null

async function getTemporalClient() {
  if (client) return client

  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233'
  const namespace = process.env.TEMPORAL_NAMESPACE || 'default'
  const apiKey = process.env.TEMPORAL_API_KEY

  const connectionOptions: any = {
    address: address,
  }

  if (apiKey) {
    connectionOptions.tls = true
    connectionOptions.apiKey = apiKey
    connectionOptions.metadata = {
      'temporal-namespace': namespace,
    }
  } else {
    connectionOptions.tls = false
  }

  const connection = await Connection.connect(connectionOptions)
  client = new WorkflowClient({ connection, namespace })

  return client
}

// Start a crash-proof AI agent workflow
app.post('/agent', async (c) => {
  const { prompt } = await c.req.json()

  if (!prompt) {
    return c.json({ error: 'prompt is required' }, 400)
  }

  const client = await getTemporalClient()

  // Generate unique workflow ID
  const workflowId = `agent-${nanoid()}`

  console.log(`[API] Starting workflow ${workflowId}`)

  // Start the workflow (non-blocking)
  const handle = await client.start(aiAgentWorkflow, {
    args: [{ prompt }],
    taskQueue: 'ai-agent-queue',
    workflowId,
  })

  // Return immediately with workflow ID
  // Client can poll for results or use signals for streaming
  return c.json({
    workflowId: handle.workflowId,
    runId: handle.firstExecutionRunId,
    status: 'started',
    message: 'Agent workflow started. Use /agent/:workflowId to get results.',
  })
})

// Get workflow status and results
app.get('/agent/:workflowId', async (c) => {
  const workflowId = c.req.param('workflowId')

  const client = await getTemporalClient()

  try {
    const handle = client.getHandle(workflowId)

    // Try to get the result (non-blocking check)
    const description = await handle.describe()

    if (description.status.name === 'COMPLETED') {
      const result = await handle.result()
      return c.json({
        workflowId,
        status: 'completed',
        result,
      })
    } else if (description.status.name === 'RUNNING') {
      return c.json({
        workflowId,
        status: 'running',
        message: 'Workflow is still executing',
      })
    } else {
      return c.json({
        workflowId,
        status: description.status.name.toLowerCase(),
      })
    }
  } catch (error) {
    return c.json({ error: 'Workflow not found' }, 404)
  }
})

// Start workflow and wait for result (blocking)
app.post('/agent/execute', async (c) => {
  const { prompt } = await c.req.json()

  if (!prompt) {
    return c.json({ error: 'prompt is required' }, 400)
  }

  const client = await getTemporalClient()
  const workflowId = `agent-${nanoid()}`

  console.log(`[API] Starting and waiting for workflow ${workflowId}`)

  const handle = await client.start(aiAgentWorkflow, {
    args: [{ prompt }],
    taskQueue: 'ai-agent-queue',
    workflowId,
  })

  // Wait for result (this will survive app crashes!)
  const result = await handle.result()

  return c.json({
    workflowId: handle.workflowId,
    result,
  })
})

// Stream workflow progress in real-time (SSE)
app.get('/agent/:workflowId/stream', async (c) => {
  const workflowId = c.req.param('workflowId')
  const client = await getTemporalClient()

  return stream(c, async (stream) => {
    try {
      const handle = client.getHandle(workflowId)

      // Poll for progress updates
      let lastProgress = ''
      let isComplete = false

      while (!isComplete) {
        try {
          // Query the workflow for current progress
          const progress = await handle.query(progressQuery)

          // Only send if progress changed
          if (progress !== lastProgress) {
            await stream.writeln(`data: ${JSON.stringify({ type: 'progress', message: progress })}\n`)
            lastProgress = progress
          }

          // Check if workflow is complete
          const description = await handle.describe()
          if (description.status.name === 'COMPLETED') {
            const result = await handle.result()
            await stream.writeln(`data: ${JSON.stringify({ type: 'complete', result })}\n`)
            isComplete = true
          } else if (description.status.name !== 'RUNNING') {
            await stream.writeln(`data: ${JSON.stringify({ type: 'error', message: `Workflow ${description.status.name}` })}\n`)
            isComplete = true
          }
        } catch (error: any) {
          await stream.writeln(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n`)
          isComplete = true
        }

        if (!isComplete) {
          // Poll every 500ms
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    } catch (error: any) {
      await stream.writeln(`data: ${JSON.stringify({ type: 'error', message: 'Workflow not found' })}\n`)
    }
  })
})

// Start workflow and stream results immediately
app.post('/agent/stream', async (c) => {
  const { prompt } = await c.req.json()

  if (!prompt) {
    return c.json({ error: 'prompt is required' }, 400)
  }

  const client = await getTemporalClient()
  const workflowId = `agent-${nanoid()}`

  // Start the workflow
  const handle = await client.start(aiAgentWorkflow, {
    args: [{ prompt }],
    taskQueue: 'ai-agent-queue',
    workflowId,
  })

  console.log(`[API] Starting streaming workflow ${workflowId}`)

  // Return SSE stream
  return stream(c, async (stream) => {
    // Send workflow ID immediately
    await stream.writeln(`data: ${JSON.stringify({ type: 'started', workflowId })}\n`)

    // Poll for progress updates
    let lastProgress = ''
    let isComplete = false

    while (!isComplete) {
      try {
        // Query the workflow for current progress
        const progress = await handle.query(progressQuery)

        // Only send if progress changed
        if (progress !== lastProgress) {
          await stream.writeln(`data: ${JSON.stringify({ type: 'progress', message: progress })}\n`)
          lastProgress = progress
        }

        // Check if workflow is complete
        const description = await handle.describe()
        if (description.status.name === 'COMPLETED') {
          const result = await handle.result()
          await stream.writeln(`data: ${JSON.stringify({ type: 'complete', result })}\n`)
          isComplete = true
        } else if (description.status.name !== 'RUNNING') {
          await stream.writeln(`data: ${JSON.stringify({ type: 'error', message: `Workflow ${description.status.name}` })}\n`)
          isComplete = true
        }
      } catch (error: any) {
        // Workflow might not be ready yet, continue polling
        if (error.message?.includes('not found')) {
          // Wait a bit for workflow to initialize
          await new Promise(resolve => setTimeout(resolve, 100))
          continue
        }
      }

      if (!isComplete) {
        // Poll every 500ms
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
  })
})

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
  console.log(`\nAvailable endpoints:`)
  console.log(`  POST /agent - Start AI agent workflow (non-blocking)`)
  console.log(`  GET  /agent/:workflowId - Get workflow status and results`)
  console.log(`  POST /agent/execute - Start and wait for workflow (blocking)`)
  console.log(`  POST /agent/stream - Start workflow and stream progress (SSE)`)
  console.log(`  GET  /agent/:workflowId/stream - Stream progress for existing workflow (SSE)`)
  console.log(`  GET  /health - Health check`)
})
