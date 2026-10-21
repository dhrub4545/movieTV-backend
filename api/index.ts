import { app } from '../src/app';
import { connectDb } from '../src/db';

export default async function handler(req: any, res: any) {
  await connectDb();
  return app(req, res);
}

export { app };
