import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { trace, context } from '@opentelemetry/api';

const logger = logs.getLogger('app2-consumer');

interface LogAttributes {
  [key: string]: string | number | boolean | undefined;
}

function emitLog(
  severityNumber: SeverityNumber,
  severityText: string,
  message: string,
  attributes?: LogAttributes
): void {
  const activeSpan = trace.getSpan(context.active());
  const spanContext = activeSpan?.spanContext();

  logger.emit({
    severityNumber,
    severityText,
    body: message,
    attributes: {
      ...attributes,
      ...(spanContext && {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
      }),
    },
  });

  // Also log to console for local debugging
  const timestamp = new Date().toISOString();
  const traceInfo = spanContext ? ` [trace_id=${spanContext.traceId}]` : '';
  console.log(`${timestamp} ${severityText}${traceInfo}: ${message}`);
}

export const log = {
  info(message: string, attributes?: LogAttributes): void {
    emitLog(SeverityNumber.INFO, 'INFO', message, attributes);
  },

  warn(message: string, attributes?: LogAttributes): void {
    emitLog(SeverityNumber.WARN, 'WARN', message, attributes);
  },

  error(message: string, attributes?: LogAttributes): void {
    emitLog(SeverityNumber.ERROR, 'ERROR', message, attributes);
  },

  debug(message: string, attributes?: LogAttributes): void {
    emitLog(SeverityNumber.DEBUG, 'DEBUG', message, attributes);
  },
};
