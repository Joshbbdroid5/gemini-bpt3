import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Enable internal diagnostic logging to see why exports might be failing
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

if (!process.env.GRAFANA_INSTANCE_ID || !process.env.GRAFANA_AUTH_TOKEN || !process.env.GRAFANA_OTLP_ENDPOINT) {
  console.error('OTEL ERROR: Missing Grafana credentials in environment variables.');
}

// Construct the Base64 Auth header from raw credentials
const authHeader = Buffer.from(`${process.env.GRAFANA_INSTANCE_ID}:${process.env.GRAFANA_AUTH_TOKEN}`).toString('base64');

const sdk = new NodeSDK({
  serviceName: 'bingo-app-render',
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${process.env.GRAFANA_OTLP_ENDPOINT}/v1/metrics`,
      headers: {
        Authorization: `Basic ${authHeader}`,
      },
    }),
    exportIntervalMillis: 10000, // Reduced to 10s for faster debugging/verification
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

console.log('OpenTelemetry Instrumentation started');