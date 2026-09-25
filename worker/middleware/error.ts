import type { ErrorHandler } from 'hono';

export const errorHandler: ErrorHandler = (err, c) => {
  console.error(`[API Error] ${err.message}`, err.stack);
  
  if (err.message.includes('NOT NULL') || err.message.includes('UNIQUE constraint')) {
    return c.json({
      error: 'Database constraint violation',
      details: err.message
    }, 400);
  }

  return c.json({
    error: err.message || 'Internal Server Error'
  }, 500);
};
