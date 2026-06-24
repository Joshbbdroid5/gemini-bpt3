import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

const _log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

function wrap(method: (obj: object, msg?: string) => void) {
  return (msg: string, meta?: Record<string, unknown>): void => {
    method.call(_log, meta ?? {}, msg);
  };
}

export const logger = {
  info: wrap(_log.info.bind(_log)),
  warn: wrap(_log.warn.bind(_log)),
  error: wrap(_log.error.bind(_log)),
  debug: wrap(_log.debug.bind(_log)),
  fatal: wrap(_log.fatal.bind(_log)),
};

export const pinoLogger = _log;
