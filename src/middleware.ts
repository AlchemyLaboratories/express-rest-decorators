import { NextFunction, Request, RequestHandler, Response } from 'express'

export interface Middleware {
  use: (req: Request, res: Response, next: NextFunction) => void
}

export interface ErrorMiddleware {
  use: (error: Error, request: Request, response: Response, next: NextFunction) => void
}

/**
 * Create request middleware handler that uses class or function provided as middleware
 */
export function middlewareHandler(middleware: Middleware): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    invokeMiddleware(middleware, [req, res, next]).catch(next)
  }
}

/**
 * Instantiate middleware and invoke it with arguments
 */
async function invokeMiddleware(
  middleware: Middleware | ErrorMiddleware,
  args: Parameters<Middleware['use']> | Parameters<ErrorMiddleware['use']>
) {
  const next = args[args.length - 1] as NextFunction

  try {
    if (!middleware) {
      return next()
    }

    // @ts-ignore
    middleware.use.apply(args)
  } catch (err) {
    next(err)
  }
}
