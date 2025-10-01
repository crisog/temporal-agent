import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { openai } from '@ai-sdk/openai'
import { streamText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import 'dotenv/config'

const app = new Hono()

app.post('/', async (c) => {
  const { prompt } = await c.req.json()

  const result = streamText({
    model: openai('gpt-4o-mini'),
    prompt: prompt || 'What is the weather in San Francisco?',
    tools: {
      weather: tool({
        description: 'Get the weather in a location (fahrenheit)',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => {
          const temperature = Math.round(Math.random() * (90 - 32) + 32)
          return {
            location,
            temperature,
          }
        },
      }),
      convertFahrenheitToCelsius: tool({
        description: 'Convert a temperature in fahrenheit to celsius',
        inputSchema: z.object({
          temperature: z.number().describe('The temperature in fahrenheit to convert'),
        }),
        execute: async ({ temperature }) => {
          const celsius = Math.round((temperature - 32) * (5 / 9))
          return {
            celsius,
          }
        },
      }),
    },
    stopWhen: stepCountIs(5),
    onStepFinish: async ({ toolResults }) => {
      if (toolResults.length) {
        console.log('Tool results:', JSON.stringify(toolResults, null, 2))
      }
    },
  })

  return result.toTextStreamResponse()
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
