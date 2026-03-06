import { env } from "./config/env.js";
import { buildApp } from "./app.js";

const start = async (): Promise<void> => {
  const app = await buildApp();

  try {
    await app.listen({
      port: env.port,
      host: "0.0.0.0"
    });
    app.log.info(`EdgeMarkets backend running on port ${env.port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
