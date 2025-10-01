# Temporal Agent

An AI agent powered by Temporal workflows and AI SDK 5.0.

## Setup

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

## Environment Variables

```env
TEMPORAL_ADDRESS=localhost:7233      # Temporal server address
TEMPORAL_NAMESPACE=default           # Temporal namespace
TEMPORAL_API_KEY=                    # Optional: for Temporal Cloud
OPENAI_API_KEY=                      # Required: OpenAI API key
PORT=3000                            # Server port
```

## Running Locally

**Terminal 1 - Start Temporal (via Docker):**
```bash
docker run -p 7233:7233 temporalio/auto-setup:latest
```

**Terminal 2 - Start Worker:**
```bash
npm run worker
# or with auto-reload:
npm run worker.watch
```

**Terminal 3 - Start API Server:**
```bash
npm run dev
```

Visit: `http://localhost:3000`

## Available Endpoints

**Start workflow (non-blocking):**
```bash
curl -X POST http://localhost:3000/agent \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is the weather in San Francisco in Celsius?"}'
```

**Get workflow status:**
```bash
curl http://localhost:3000/agent/{workflowId}
```

**Execute workflow (blocking):**
```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is the weather in San Francisco in Celsius?"}'
```

**Stream workflow progress (SSE):**
```bash
curl -X POST http://localhost:3000/agent/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is the weather in San Francisco in Celsius?"}'
```

**Stream existing workflow:**
```bash
curl http://localhost:3000/agent/{workflowId}/stream
```

**Health check:**
```bash
curl http://localhost:3000/health
```

## Scripts

```bash
npm run dev            # Start API server with auto-reload
npm run worker         # Start Temporal worker
npm run worker.watch   # Start worker with auto-reload
npm run build          # Build TypeScript to JavaScript
npm start              # Run production build
```
