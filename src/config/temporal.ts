import { Connection, WorkflowClient } from '@temporalio/client';
import { NativeConnection } from '@temporalio/worker';
import { env } from '../env';

let client: WorkflowClient | null = null;

interface TemporalConfig {
  address: string;
  namespace: string;
  apiKey?: string;
}

export function getTemporalConfig(): TemporalConfig {
  return {
    address: env.TEMPORAL_ADDRESS,
    namespace: env.TEMPORAL_NAMESPACE,
    apiKey: env.TEMPORAL_API_KEY,
  };
}

function buildConnectionOptions(config: TemporalConfig): any {
  const options: any = {
    address: config.address,
  };

  if (config.apiKey) {
    options.tls = true;
    options.apiKey = config.apiKey;
    options.metadata = {
      'temporal-namespace': config.namespace,
    };
  } else {
    options.tls = false;
  }

  return options;
}

export async function getTemporalClient(): Promise<WorkflowClient> {
  if (client) return client;

  const config = getTemporalConfig();
  const connectionOptions = buildConnectionOptions(config);

  const connection = await Connection.connect(connectionOptions);
  client = new WorkflowClient({ connection, namespace: config.namespace });

  return client;
}

export async function createWorkerConnection(): Promise<NativeConnection> {
  const config = getTemporalConfig();
  const connectionOptions = buildConnectionOptions(config);

  console.log(`[Worker] Connecting to Temporal at ${config.address}`);
  console.log(`[Worker] Using namespace: ${config.namespace}`);

  if (config.apiKey) {
    console.log('[Worker] Using API key authentication');
  } else {
    console.log('[Worker] Using local Temporal server (no TLS)');
  }

  return await NativeConnection.connect(connectionOptions);
}
