const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-proto');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');

// Load environment variables
require('dotenv').config();

const sdk = new NodeSDK({
  serviceName: 'bingo-app-render',
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${process.env.GRAFANA_OTLP_ENDPOINT}/v1/metrics`,
      headers: {
        Authorization: `Basic ${process.env.GRAFANA_AUTH_TOKEN}`,
      },
    }),
    exportIntervalMillis: 60000, // Send metrics every 60 seconds
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

console.log('OpenTelemetry Instrumentation started');