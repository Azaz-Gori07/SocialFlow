/**
 * Vercel Serverless Function Handler
 * 
 * Exports the Express app as a serverless function handler.
 * This allows Vercel to properly invoke the app for each request.
 */

import app from '../src/server';

export default app;
