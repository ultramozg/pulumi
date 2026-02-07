/**
 * JMX Prometheus exporter configuration for Kafka metrics.
 * Used by StrimziKafkaComponent metricsConfig.
 */
export const kafkaMetricsConfig = `lowercaseOutputName: true
rules:
  - pattern: kafka.server<type=(.+), name=(.+)><>Count
    name: kafka_server_$1_$2_total
    type: COUNTER
  - pattern: kafka.server<type=(.+), name=(.+)><>Value
    name: kafka_server_$1_$2
    type: GAUGE
  - pattern: kafka.controller<type=(.+), name=(.+)><>(Count|Value)
    name: kafka_controller_$1_$2
    type: GAUGE
`;

/**
 * JMX Prometheus exporter configuration for MirrorMaker 2 metrics.
 * Used by KafkaMirrorMaker2Component metricsConfig.
 */
export const mm2MetricsConfig = `lowercaseOutputName: true
rules:
  - pattern: kafka.connect<type=(.+), name=(.+)><>Value
    name: kafka_connect_$1_$2
    type: GAUGE
  - pattern: kafka.connect<type=(.+), name=(.+)><>Count
    name: kafka_connect_$1_$2_total
    type: COUNTER
`;
