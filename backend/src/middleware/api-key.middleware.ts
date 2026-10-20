import { Request, Response, NextFunction } from 'express';

/**
 * Checks if the incoming request has a valid External API Key.
 * Returns true if valid, false otherwise.
 */
export const isValidApiKey = (req: Request): boolean => {
  const apiKey = req.headers['x-api-key'];
  const validKey = process.env.EXTERNAL_API_KEY;

  // If the server isn't configured with an API key, deny access to be safe.
  if (!validKey) {
    return false;
  }

  // Check if the provided header matches the configured key
  return apiKey === validKey;
};