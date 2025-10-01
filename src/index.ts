import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'
import 'dotenv/config'

const app = new Hono()

app.post('/', async (c) => {
  const result = streamText({
    model: openai('gpt-4o-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
  })
  return result.toTextStreamResponse()
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
