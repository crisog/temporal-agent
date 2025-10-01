# Temporal Agent

An AI agent powered by Temporal workflows and OpenAI.

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

- `POST /agent` - Start AI agent workflow (non-blocking)
- `GET /agent/:workflowId` - Get workflow status and results
- `POST /agent/execute` - Start and wait for workflow (blocking)
- `POST /agent/stream` - Start workflow and stream progress (SSE)
- `GET /agent/:workflowId/stream` - Stream progress for existing workflow (SSE)
- `GET /health` - Health check

## Scripts

- `npm run dev` - Start API server with auto-reload
- `npm run worker` - Start Temporal worker
- `npm run worker.watch` - Start worker with auto-reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run production build
