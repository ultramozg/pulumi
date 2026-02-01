import { trace, SpanKind, SpanStatusCode, context } from '@opentelemetry/api';
import { log } from './logger';

const tracer = trace.getTracer('app2-consumer');

interface OrderEvent {
  eventType: 'ORDER_CREATED';
  orderId: string;
  product: string;
  quantity: number;
  customerId: string;
  status: string;
  timestamp: string;
  traceId?: string;
}

interface PaymentEvent {
  eventType: 'PAYMENT_PROCESSED';
  paymentId: string;
  orderId: string;
  amount: number;
  method: string;
  status: string;
  timestamp: string;
  traceId?: string;
}

interface ShipmentEvent {
  eventType: 'SHIPMENT_CREATED';
  shipmentId: string;
  orderId: string;
  address: string;
  carrier: string;
  estimatedDelivery?: string;
  status: string;
  timestamp: string;
  traceId?: string;
}

type EventPayload = OrderEvent | PaymentEvent | ShipmentEvent;

// Simulated database/storage
const processedOrders = new Map<string, OrderEvent>();
const processedPayments = new Map<string, PaymentEvent>();
const processedShipments = new Map<string, ShipmentEvent>();

async function processOrderCreated(event: OrderEvent): Promise<void> {
  const span = tracer.startSpan('process-order', {
    kind: SpanKind.INTERNAL,
    attributes: {
      'order.id': event.orderId,
      'order.product': event.product,
      'order.quantity': event.quantity,
      'order.customer_id': event.customerId,
    },
  });

  try {
    // Simulate order validation
    await tracer.startActiveSpan('validate-order', async (validationSpan) => {
      await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 30));

      if (event.quantity <= 0) {
        throw new Error('Invalid quantity');
      }

      validationSpan.setAttribute('validation.passed', true);
      validationSpan.setStatus({ code: SpanStatusCode.OK });
      validationSpan.end();
    });

    // Simulate inventory check
    await tracer.startActiveSpan('check-inventory', async (inventorySpan) => {
      await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50));

      const inStock = Math.random() > 0.1; // 90% in stock
      inventorySpan.setAttribute('inventory.in_stock', inStock);
      inventorySpan.setAttribute('inventory.product', event.product);

      if (!inStock) {
        log.warn(`Product ${event.product} is out of stock`, { product: event.product, orderId: event.orderId });
      }

      inventorySpan.setStatus({ code: SpanStatusCode.OK });
      inventorySpan.end();
    });

    // Simulate database save
    await tracer.startActiveSpan('save-order', async (saveSpan) => {
      await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));

      processedOrders.set(event.orderId, event);
      saveSpan.setAttribute('db.operation', 'insert');
      saveSpan.setAttribute('db.table', 'orders');
      saveSpan.setStatus({ code: SpanStatusCode.OK });
      saveSpan.end();
    });

    log.info(`Processed order ${event.orderId} for ${event.quantity}x ${event.product}`, {
      orderId: event.orderId,
      product: event.product,
      quantity: event.quantity,
      eventType: 'ORDER_CREATED',
    });
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

async function processPayment(event: PaymentEvent): Promise<void> {
  const span = tracer.startSpan('process-payment', {
    kind: SpanKind.INTERNAL,
    attributes: {
      'payment.id': event.paymentId,
      'payment.order_id': event.orderId,
      'payment.amount': event.amount,
      'payment.method': event.method,
    },
  });

  try {
    // Simulate payment verification
    await tracer.startActiveSpan('verify-payment', async (verifySpan) => {
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

      // Simulate occasional payment verification failure
      if (Math.random() < 0.05) {
        const error = new Error('Payment verification failed - retry needed');
        verifySpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        verifySpan.recordException(error);
        verifySpan.end();
        throw error;
      }

      verifySpan.setAttribute('verification.passed', true);
      verifySpan.setStatus({ code: SpanStatusCode.OK });
      verifySpan.end();
    });

    // Simulate fraud check
    await tracer.startActiveSpan('fraud-check', async (fraudSpan) => {
      await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 40));

      const fraudScore = Math.random() * 100;
      fraudSpan.setAttribute('fraud.score', fraudScore);
      fraudSpan.setAttribute('fraud.passed', fraudScore < 80);
      fraudSpan.setStatus({ code: SpanStatusCode.OK });
      fraudSpan.end();
    });

    // Simulate database save
    await tracer.startActiveSpan('save-payment', async (saveSpan) => {
      await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));

      processedPayments.set(event.paymentId, event);
      saveSpan.setAttribute('db.operation', 'insert');
      saveSpan.setAttribute('db.table', 'payments');
      saveSpan.setStatus({ code: SpanStatusCode.OK });
      saveSpan.end();
    });

    log.info(`Processed payment ${event.paymentId} for order ${event.orderId}: $${event.amount.toFixed(2)}`, {
      paymentId: event.paymentId,
      orderId: event.orderId,
      amount: event.amount,
      eventType: 'PAYMENT_PROCESSED',
    });
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

async function processShipment(event: ShipmentEvent): Promise<void> {
  const span = tracer.startSpan('process-shipment', {
    kind: SpanKind.INTERNAL,
    attributes: {
      'shipment.id': event.shipmentId,
      'shipment.order_id': event.orderId,
      'shipment.carrier': event.carrier,
      'shipment.address': event.address,
    },
  });

  try {
    // Simulate address validation
    await tracer.startActiveSpan('validate-address', async (addressSpan) => {
      await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50));

      addressSpan.setAttribute('address.valid', true);
      addressSpan.setAttribute('address.normalized', event.address.toUpperCase());
      addressSpan.setStatus({ code: SpanStatusCode.OK });
      addressSpan.end();
    });

    // Simulate carrier API call
    await tracer.startActiveSpan('call-carrier-api', async (carrierSpan) => {
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

      const trackingNumber = `TRK${Date.now()}${Math.random().toString(36).substring(7).toUpperCase()}`;
      carrierSpan.setAttribute('carrier.name', event.carrier);
      carrierSpan.setAttribute('carrier.tracking_number', trackingNumber);
      carrierSpan.setStatus({ code: SpanStatusCode.OK });
      carrierSpan.end();

      log.info(`Generated tracking number: ${trackingNumber}`, { trackingNumber, carrier: event.carrier });
    });

    // Simulate database save
    await tracer.startActiveSpan('save-shipment', async (saveSpan) => {
      await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));

      processedShipments.set(event.shipmentId, event);
      saveSpan.setAttribute('db.operation', 'insert');
      saveSpan.setAttribute('db.table', 'shipments');
      saveSpan.setStatus({ code: SpanStatusCode.OK });
      saveSpan.end();
    });

    log.info(`Processed shipment ${event.shipmentId} to ${event.address}`, {
      shipmentId: event.shipmentId,
      orderId: event.orderId,
      address: event.address,
      eventType: 'SHIPMENT_CREATED',
    });
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

export async function processEvent(key: string, value: string, headers: Record<string, string>): Promise<void> {
  let event: EventPayload;

  try {
    event = JSON.parse(value) as EventPayload;
  } catch (error) {
    log.error(`Failed to parse event: ${(error as Error).message}`, { key });
    return;
  }

  // Extract trace context from headers for distributed tracing
  const traceparent = headers['traceparent'];
  let parentTraceId: string | undefined;
  let parentSpanId: string | undefined;

  if (traceparent) {
    const parts = traceparent.split('-');
    if (parts.length >= 3) {
      parentTraceId = parts[1];
      parentSpanId = parts[2];
    }
  }

  const span = tracer.startSpan('kafka.consume events', {
    kind: SpanKind.CONSUMER,
    attributes: {
      'messaging.system': 'kafka',
      'messaging.destination': 'events',
      'messaging.destination_kind': 'topic',
      'messaging.message_key': key,
      'messaging.kafka.consumer_group': 'app2-consumer-group',
      'event.type': event.eventType,
    },
    links: parentTraceId && parentSpanId ? [
      {
        context: {
          traceId: parentTraceId,
          spanId: parentSpanId,
          traceFlags: 1,
        },
      },
    ] : undefined,
  });

  try {
    switch (event.eventType) {
      case 'ORDER_CREATED':
        await processOrderCreated(event);
        break;
      case 'PAYMENT_PROCESSED':
        await processPayment(event);
        break;
      case 'SHIPMENT_CREATED':
        await processShipment(event);
        break;
      default:
        log.warn(`Unknown event type: ${(event as any).eventType}`, { eventType: (event as any).eventType });
    }

    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    span.recordException(error as Error);
    log.error(`Failed to process event ${event.eventType}: ${(error as Error).message}`, { eventType: event.eventType });
  } finally {
    span.end();
  }
}

export function getStats(): { orders: number; payments: number; shipments: number } {
  return {
    orders: processedOrders.size,
    payments: processedPayments.size,
    shipments: processedShipments.size,
  };
}
