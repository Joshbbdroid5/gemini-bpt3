import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import dotenv from 'dotenv';
import resourcesPkg from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Load environment variables
dotenv.config();

// Robust Resource constructor resolution to handle hybrid ESM/CJS environments
const Resource = resourcesPkg.Resource || resourcesPkg.default?.Resource || resourcesPkg;

// Enable internal diagnostic logging to see why exports might be failing
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const hasRequiredEnv = process.env.GRAFANA_INSTANCE_ID && 
                       process.env.GRAFANA_AUTH_TOKEN && 
                       process.env.GRAFANA_OTLP_ENDPOINT;

if (!hasRequiredEnv) {
  console.error('OTEL ERROR: Missing Grafana credentials in environment variables.');
}

if (hasRequiredEnv) {
  // Construct the Base64 Auth header from raw credentials
  const authHeader = Buffer.from(`${process.env.GRAFANA_INSTANCE_ID}:${process.env.GRAFANA_AUTH_TOKEN}`).toString('base64');
  const commonHeaders = {
    Authorization: `Basic ${authHeader}`,
  };

  const sdk = new NodeSDK({
    resource: new (Resource)({
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
          ignoreOutgoingUrls: [
            (url) => url.includes('grafana.net'),
            (url) => process.env.GRAFANA_OTLP_ENDPOINT && url.includes(process.env.GRAFANA_OTLP_ENDPOINT),
          ],
        },
        // The 'fs' instrumentation is extremely noisy and can create thousands of 
        // spans during startup, which is the most common cause of this crash.
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        // Disabling net and dns resolves the "Cannot read properties of undefined (reading 'name')"
        // error which occurs when these instrumentations fire during OTLP export serialization.
        '@opentelemetry/instrumentation-net': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-dns': {
          enabled: false,
        },
      }),
    ],
  });

  sdk.start();
  console.log('OpenTelemetry Instrumentation started successfully');

  // Ensure the SDK is shut down gracefully on process termination
  const shutDown = () => {
    sdk.shutdown()
      .then(() => console.log('OTEL: Tracing and Metrics shut down successfully'))
      .catch((error) => console.error('OTEL: Error shutting down', error))
      .finally(() => process.exit(0));
  };

  process.on('SIGTERM', shutDown);
  process.on('SIGINT', shutDown);
}