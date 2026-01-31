import { Kafka, Producer, Message } from 'kafkajs';
import { context, trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'events';

const kafka = new Kafka({
  clientId: 'app1-producer',
  brokers: KAFKA_BROKERS,
  retry: {
    initialRetryTime: 1000,
    retries: 10,
  },
});

let producer: Producer | null = null;

export async function initKafkaProducer(): Promise<void> {
  producer = kafka.producer();

  producer.on('producer.connect', () => {
    console.log('Kafka producer connected');
  });

  producer.on('producer.disconnect', () => {
    console.log('Kafka producer disconnected');
  });

  await producer.connect();
  console.log(`Kafka producer initialized, brokers: ${KAFKA_BROKERS.join(', ')}`);
}

export async function sendMessage(key: string, value: object): Promise<void> {
  if (!producer) {
    throw new Error('Kafka producer not initialized');
  }

  const tracer = trace.getTracer('app1-producer');

  await tracer.startActiveSpan(
    `kafka.produce ${KAFKA_TOPIC}`,
    {
      kind: SpanKind.PRODUCER,
      attributes: {
        'messaging.system': 'kafka',
        'messaging.destination': KAFKA_TOPIC,
        'messaging.destination_kind': 'topic',
        'messaging.kafka.client_id': 'app1-producer',
      },
    },
    async (span) => {
      try {
        // Inject trace context into message headers
        const headers: Record<string, string> = {};
        const currentContext = context.active();

        // Add traceparent header for context propagation
        const spanContext = span.spanContext();
        headers['traceparent'] = `00-${spanContext.traceId}-${spanContext.spanId}-01`;

        const message: Message = {
          key,
          value: JSON.stringify({
            ...value,
            timestamp: new Date().toISOString(),
            traceId: spanContext.traceId,
          }),
          headers,
        };

        await producer!.send({
          topic: KAFKA_TOPIC,
          messages: [message],
        });

        span.setStatus({ code: SpanStatusCode.OK });
        console.log(`Message sent to topic ${KAFKA_TOPIC}: ${key}`);
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
  }
}
