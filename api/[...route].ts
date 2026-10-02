import { createApp } from '../server/app';

/**
 * Vercel serverless entry point for the Seedance Studio API.
 * Mounts the same Express app used in local dev.
 */
const app = createApp();

export const config = {
  api: { bodyParser: false },
};

export default function handler(req: any, res: any) {
  app(req, res);
}
