import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadEnv } from "../backend/src/config/env.js";
import { createApp } from "../backend/src/app.js";

const env = loadEnv(process.env);
const app = createApp(env);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}
