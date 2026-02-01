// Initialize tracing before any other imports
import { startTracing } from './tracing';
startTracing();

import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import express, { Request, Response } from 'express';
import { processEvent, getStats } from './processor';
import { log } from './logger';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'events';
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || 'app2-consumer-group';
const PORT = process.env.PORT || 3001;

const kafka = new Kafka({
  clientId: 'app2-consumer',
  brokers: KAFKA_BROKERS,
  retry: {
    initialRetryTime: 1000,
    retries: 10,
  },
});

let consumer: Consumer | null = null;
let isConnected = false;

async function initKafkaConsumer(): Promise<void> {
  consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });

  consumer.on('consumer.connect', () => {
    log.info('Kafka consumer connected');
    isConnected = true;
  });

  consumer.on('consumer.disconnect', () => {
    log.warn('Kafka consumer disconnected');
    isConnected = false;
  });

  consumer.on('consumer.crash', (event) => {
    log.error(`Kafka consumer crashed: ${event.payload.error}`);
    isConnected = false;
  });

  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  log.info(`Kafka consumer initialized, subscribed to topic: ${KAFKA_TOPIC}`, { topic: KAFKA_TOPIC });
}

async function runConsumer(): Promise<void> {
  if (!consumer) {
    throw new Error('Consumer not initialized');
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
      const key = message.key?.toString() || 'unknown';
      const value = message.value?.toString() || '{}';

      // Extract headers
      const headers: Record<string, string> = {};
      if (message.headers) {
        for (const [headerKey, headerValue] of Object.entries(message.headers)) {
          if (headerValue) {
            headers[headerKey] = headerValue.toString();
          }
        }
      }

      log.info(`Received message: topic=${topic}, partition=${partition}, key=${key}`, {
        topic,
        partition,
        key,
      });

      try {
        await processEvent(key, value, headers);
      } catch (error) {
        log.error(`Error processing message: ${(error as Error).message}`, { key });
      }
    },
  });
}

// Express app for health checks and metrics
const app = express();

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'app2-consumer',
    kafkaConnected: isConnected,
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', (req: Request, res: Response) => {
  if (isConnected) {
    res.json({ status: 'ready', service: 'app2-consumer' });
  } else {
    res.status(503).json({ status: 'not ready', reason: 'Kafka not connected' });
  }
});

app.get('/stats', (req: Request, res: Response) => {
  const stats = getStats();
  res.json({
    service: 'app2-consumer',
    processedEvents: stats,
    kafkaConnected: isConnected,
    timestamp: new Date().toISOString(),
  });
});

async function start(): Promise<void> {
  try {
    // Start Express server for health checks
    app.listen(PORT, () => {
      log.info(`App2 (Consumer) health server listening on port ${PORT}`, { port: Number(PORT) });
      log.info('Available endpoints: GET /health, /ready, /stats');
    });

    // Wait for Kafka to be ready
    log.info('Waiting for Kafka to be ready...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Initialize and run Kafka consumer
    await initKafkaConsumer();
    await runConsumer();

    log.info('App2 (Consumer) is running and processing messages');

    process.on('SIGTERM', async () => {
      log.info('Shutting down...');
      if (consumer) {
        await consumer.disconnect();
      }
      process.exit(0);
    });
  } catch (error) {
    log.error(`Failed to start application: ${(error as Error).message}`);
    process.exit(1);
  }
}

start();
