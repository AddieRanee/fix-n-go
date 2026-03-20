import "dotenv/config";
import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";

const env = loadEnv(process.env);
const app = createApp(env);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${env.PORT}`);
});

