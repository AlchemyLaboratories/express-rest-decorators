import { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express'
import { Type } from './types'

export type MiddlewareFunction = (req: Request, res: Response, next: NextFunction) => void
export interface MiddlewareClass {
  use: MiddlewareFunction
}
export type Middleware = MiddlewareFunction | Type<MiddlewareClass>

export type ErrorMiddlewareFunction = (error: Error, request: Request, response: Response, next: NextFunction) => void
export interface ErrorMiddlewareClass {
  use: ErrorMiddlewareFunction
}
export type ErrorMiddleware = ErrorMiddlewareFunction | Type<ErrorMiddlewareClass>

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
  args: Parameters<MiddlewareFunction> | Parameters<ErrorMiddlewareFunction>
) {
  const next = args[args.length - 1] as NextFunction

  try {
    const instance = await getMiddlewareInstance(middleware)

    if (!instance) {
      return next()
    }

    const handler = (instance as MiddlewareClass | ErrorMiddlewareClass)?.use ?? instance
    // @ts-ignore
    const result = typeof handler === 'function' ? handler.apply(instance, args) : instance

    if (result instanceof Promise) {
      result.catch(next)
    }
  } catch (err) {
    next(err)
  }
}

async function getMiddlewareInstance(middleware: Middleware | ErrorMiddleware) {
  if (typeof middleware === 'function') {
    return middleware.prototype?.use ? new (middleware as Type<MiddlewareClass | ErrorMiddlewareClass>)() : middleware
  }
}
