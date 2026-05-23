import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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