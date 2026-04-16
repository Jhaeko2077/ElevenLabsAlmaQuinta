import { createApp } from './app';
import { getEnv } from './config/env';
import { createLogger } from './config/logger';

const env = getEnv();
const logger = createLogger(env);
const app = createApp({ env, logger });

app.listen(env.PORT, () => {
  logger.info({
    event: 'server_started',
    port: env.PORT,
  }, 'alma-quinta-elevenlabs-backend listening');
});
