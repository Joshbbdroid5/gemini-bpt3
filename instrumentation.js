import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import dotenv from 'dotenv';
import * as resourcesPkg from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Load environment variables
dotenv.config();

// Enable internal diagnostic logging to catch configuration issues early
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

// Fix: Robust Resource constructor resolution for hybrid ESM/CJS environments.
// tsx/Node ESM sometimes wraps CJS exports in a .default property. 
// We must ensure we pick a function (the constructor) rather than the module object.
const Resource = typeof resourcesPkg.Resource === 'function' 
  ? resourcesPkg.Resource 
  : (resourcesPkg.default && typeof resourcesPkg.default.Resource === 'function' ? resourcesPkg.default.Resource : null);

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

  // Build a guaranteed-valid Resource. If Resource resolution fails, fall back to default (no crash).
  const resource = Resource
    ? new Resource({
        [ATTR_SERVICE_NAME]: 'bingo-app-render',
        [ATTR_SERVICE_VERSION]: '1.0.0',
      })
    : undefined;

  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: `${process.env.GRAFANA_OTLP_ENDPOINT}/v1/traces`,
      headers: commonHeaders,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${process.env.GRAFANA_OTLP_ENDPOINT}/v1/metrics`,
        headers: commonHeaders,
      }),
      // Export metrics every 60 seconds to stay within free tier limits
      exportIntervalMillis: 60000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Filter instrumentations to avoid crashes during OTLP export serialization
        '@opentelemetry/instrumentation-http': {
          ignoreOutgoingUrls: [
            (url) => url.includes('grafana.net'),
            (url) => process.env.GRAFANA_OTLP_ENDPOINT && url.includes(process.env.GRAFANA_OTLP_ENDPOINT),
          ],
        },
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-grpc': { enabled: false },
        '@opentelemetry/instrumentation-socket.io': { enabled: false },
        '@opentelemetry/instrumentation-winston': { enabled: false },
        // Only keep essential instrumentations for this app
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-mongoose': { enabled: true },
      }),
    ],
  });

  sdk.start();
  console.log('OpenTelemetry Instrumentation started successfully');

  // Ensure the SDK is shut down gracefully on process termination
  const shutDown = () => {
    sdk.shutdown()
      .then(() => console.log('OTEL: Tracing shut down successfully'))
      .catch((error) => console.error('OTEL: Error shutting down', error));
  };

  // Register listeners but don't force process.exit here. 
  // server.ts handles the actual process termination sequence.
  process.on('SIGTERM', shutDown);
  process.on('SIGINT', shutDown);
}