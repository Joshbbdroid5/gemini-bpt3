import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import dotenv from 'dotenv';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Load environment variables
dotenv.config();

// Enable internal diagnostic logging to see why exports might be failing
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const hasRequiredEnv = process.env.GRAFANA_INSTANCE_ID && 
                       process.env.GRAFANA_AUTH_TOKEN && 
                       process.env.GRAFANA_OTLP_ENDPOINT;

if (!hasRequiredEnv) {
  console.error('OTEL ERROR: Missing Grafana credentials in environment variables.');
}

// Construct the Base64 Auth header from raw credentials
const authHeader = Buffer.from(`${process.env.GRAFANA_INSTANCE_ID}:${process.env.GRAFANA_AUTH_TOKEN}`).toString('base64');
const commonHeaders = {
  Authorization: `Basic ${authHeader}`,
};

if (hasRequiredEnv) {
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'bingo-app-render',
      [ATTR_SERVICE_VERSION]: '1.0.0',
    }),
    // Configure Traces to prevent the SDK from trying to hit localhost:4318
    traceExporter: new OTLPTraceExporter({
      url: `${process.env.GRAFANA_OTLP_ENDPOINT}/v1/traces`,
      headers: commonHeaders,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${process.env.GRAFANA_OTLP_ENDPOINT}/v1/metrics`,
        headers: commonHeaders,
      }),
      exportIntervalMillis: 10000, 
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Use a more robust filter to ensure export calls are never traced.
        // Tracing the export calls often leads to recursion and serialization errors.
        '@opentelemetry/instrumentation-http': {
          ignoreOutgoingUrls: [(url) => url.includes('grafana.net')],
        },
        // The 'fs' instrumentation is extremely noisy and can create thousands of 
        // spans during startup, which is the most common cause of this crash.
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
      }),
    ],
  });

  sdk.start();
  console.log('OpenTelemetry Instrumentation started successfully');
}