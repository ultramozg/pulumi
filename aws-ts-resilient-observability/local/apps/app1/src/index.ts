// Initialize tracing before any other imports
import { startTracing } from './tracing';
startTracing();

import express, { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { initKafkaProducer, sendMessage, disconnectProducer } from './kafka';
import { log } from './logger';

const app = express();
const PORT = process.env.PORT || 3000;
const tracer = trace.getTracer('app1-api');

app.use(express.json());

// Request logging middleware with tracing
app.use((req: Request, res: Response, next: NextFunction) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute('http.request_id', uuidv4());
  }
  log.info(`${req.method} ${req.path}`, { method: req.method, path: req.path });
  next();
});

// Health check endpoints
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'app1-producer', timestamp: new Date().toISOString() });
});

app.get('/ready', (req: Request, res: Response) => {
  res.json({ status: 'ready', service: 'app1-producer' });
});

// Main API endpoint - Generates an order event
interface OrderRequest {
  product: string;
  quantity: number;
  customerId?: string;
}

app.post('/api/order', async (req: Request, res: Response) => {
  const span = tracer.startSpan('process-order');

  try {
    const { product, quantity, customerId } = req.body as OrderRequest;

    if (!product || !quantity) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing required fields' });
      res.status(400).json({ error: 'product and quantity are required' });
      return;
    }

    const orderId = uuidv4();
    span.setAttribute('order.id', orderId);
    span.setAttribute('order.product', product);
    span.setAttribute('order.quantity', quantity);

    const orderEvent = {
      eventType: 'ORDER_CREATED',
      orderId,
      product,
      quantity,
      customerId: customerId || 'anonymous',
      status: 'pending',
    };

    await sendMessage(orderId, orderEvent);

    span.setStatus({ code: SpanStatusCode.OK });
    res.status(201).json({
      message: 'Order created successfully',
      orderId,
      traceId: span.spanContext().traceId,
    });
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    span.recordException(error as Error);
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    span.end();
  }
});

// Simulate a payment event
interface PaymentRequest {
  orderId: string;
  amount: number;
  method: string;
}

app.post('/api/payment', async (req: Request, res: Response) => {
  const span = tracer.startSpan('process-payment');

  try {
    const { orderId, amount, method } = req.body as PaymentRequest;

    if (!orderId || !amount) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing required fields' });
      res.status(400).json({ error: 'orderId and amount are required' });
      return;
    }

    span.setAttribute('payment.order_id', orderId);
    span.setAttribute('payment.amount', amount);
    span.setAttribute('payment.method', method || 'card');

    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    const paymentId = uuidv4();
    const paymentEvent = {
      eventType: 'PAYMENT_PROCESSED',
      paymentId,
      orderId,
      amount,
      method: method || 'card',
      status: 'completed',
    };

    await sendMessage(paymentId, paymentEvent);

    span.setStatus({ code: SpanStatusCode.OK });
    res.status(200).json({
      message: 'Payment processed successfully',
      paymentId,
      traceId: span.spanContext().traceId,
    });
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    span.recordException(error as Error);
    res.status(500).json({ error: 'Failed to process payment' });
  } finally {
    span.end();
  }
});

// Simulate shipping event
interface ShipRequest {
  orderId: string;
  address: string;
}

app.post('/api/ship', async (req: Request, res: Response) => {
  const span = tracer.startSpan('initiate-shipping');

  try {
    const { orderId, address } = req.body as ShipRequest;

    if (!orderId || !address) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing required fields' });
      res.status(400).json({ error: 'orderId and address are required' });
      return;
    }

    span.setAttribute('shipping.order_id', orderId);
    span.setAttribute('shipping.address', address);

    // Simulate shipping processing
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));

    const shipmentId = uuidv4();
    const shipmentEvent = {
      eventType: 'SHIPMENT_CREATED',
      shipmentId,
      orderId,
      address,
      carrier: 'FastShip',
      estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'shipped',
    };

    await sendMessage(shipmentId, shipmentEvent);

    span.setStatus({ code: SpanStatusCode.OK });
    res.status(200).json({
      message: 'Shipment initiated successfully',
      shipmentId,
      estimatedDelivery: shipmentEvent.estimatedDelivery,
      traceId: span.spanContext().traceId,
    });
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    span.recordException(error as Error);
    res.status(500).json({ error: 'Failed to initiate shipment' });
  } finally {
    span.end();
  }
});

// Batch endpoint - creates multiple events for tracing demo
app.post('/api/demo/batch', async (req: Request, res: Response) => {
  const span = tracer.startSpan('demo-batch-operation');

  try {
    const results: Array<{ type: string; id: string }> = [];

    // Create order
    const orderId = uuidv4();
    await sendMessage(orderId, {
      eventType: 'ORDER_CREATED',
      orderId,
      product: 'Demo Product',
      quantity: Math.floor(Math.random() * 5) + 1,
      customerId: 'demo-customer',
      status: 'pending',
    });
    results.push({ type: 'order', id: orderId });

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Process payment
    const paymentId = uuidv4();
    await sendMessage(paymentId, {
      eventType: 'PAYMENT_PROCESSED',
      paymentId,
      orderId,
      amount: Math.random() * 100 + 10,
      method: 'card',
      status: 'completed',
    });
    results.push({ type: 'payment', id: paymentId });

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create shipment
    const shipmentId = uuidv4();
    await sendMessage(shipmentId, {
      eventType: 'SHIPMENT_CREATED',
      shipmentId,
      orderId,
      address: '123 Demo Street',
      carrier: 'FastShip',
      status: 'shipped',
    });
    results.push({ type: 'shipment', id: shipmentId });

    span.setStatus({ code: SpanStatusCode.OK });
    span.setAttribute('batch.events_count', results.length);

    res.status(200).json({
      message: 'Batch operation completed',
      events: results,
      traceId: span.spanContext().traceId,
    });
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    span.recordException(error as Error);
    res.status(500).json({ error: 'Batch operation failed' });
  } finally {
    span.end();
  }
});

// Error simulation endpoint
app.get('/api/demo/error', async (req: Request, res: Response) => {
  const span = tracer.startSpan('demo-error');

  const errorRate = parseFloat(req.query.rate as string) || 0.5;

  if (Math.random() < errorRate) {
    const error = new Error('Simulated random error for tracing demo');
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    span.end();
    res.status(500).json({
      error: 'Simulated error',
      traceId: span.spanContext().traceId
    });
    return;
  }

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
  res.json({
    message: 'Success',
    traceId: span.spanContext().traceId
  });
});

// Latency simulation endpoint
app.get('/api/demo/latency', async (req: Request, res: Response) => {
  const span = tracer.startSpan('demo-latency');

  const minMs = parseInt(req.query.min as string) || 100;
  const maxMs = parseInt(req.query.max as string) || 500;
  const delay = minMs + Math.random() * (maxMs - minMs);

  span.setAttribute('simulated.delay_ms', delay);

  await new Promise(resolve => setTimeout(resolve, delay));

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
  res.json({
    message: 'Response after delay',
    delayMs: Math.round(delay),
    traceId: span.spanContext().traceId
  });
});

async function start(): Promise<void> {
  try {
    log.info('Waiting for Kafka to be ready...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    await initKafkaProducer();

    app.listen(PORT, () => {
      log.info(`App1 (Producer API) listening on port ${PORT}`, { port: Number(PORT) });
      log.info('Available endpoints: POST /api/order, /api/payment, /api/ship, /api/demo/batch, GET /api/demo/error, /api/demo/latency, /health, /ready');
    });

    process.on('SIGTERM', async () => {
      log.info('Shutting down...');
      await disconnectProducer();
      process.exit(0);
    });
  } catch (error) {
    log.error(`Failed to start application: ${(error as Error).message}`);
    process.exit(1);
  }
}

start();
