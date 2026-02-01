import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { logs } from '@opentelemetry/api-logs';
import { Resource } from '@opentelemetry/resources';

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';

const resource = new Resource({
  'service.name': process.env.OTEL_SERVICE_NAME || 'app2-consumer',
  'service.version': '1.0.0',
  'deployment.environment': process.env.DEPLOYMENT_ENVIRONMENT || 'local',
});

const traceExporter = new OTLPTraceExporter({
  url: OTEL_ENDPOINT,
});

const metricExporter = new OTLPMetricExporter({
  url: OTEL_ENDPOINT,
});

const logExporter = new OTLPLogExporter({
  url: OTEL_ENDPOINT,
});

const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 10000,
});

// Set up the LoggerProvider
const loggerProvider = new LoggerProvider({ resource });
loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));
logs.setGlobalLoggerProvider(loggerProvider);

const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader: metricReader as any,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

export function startTracing(): void {
  sdk.start();
  console.log('OpenTelemetry tracing initialized');
  console.log(`Exporting to: ${OTEL_ENDPOINT}`);

  process.on('SIGTERM', () => {
    Promise.all([
      sdk.shutdown(),
      loggerProvider.shutdown(),
    ])
      .then(() => console.log('Tracing and logging terminated'))
      .catch((error) => console.error('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
}
