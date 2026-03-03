import * as Sentry from '@sentry/node';
import { config } from './config.js';

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    tracesSampleRate: config.isDev ? 1.0 : 0.2,
  });
}

export { Sentry };
