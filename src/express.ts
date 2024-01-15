import { RequestHandler, Application, Router, Express, Request, Response, NextFunction } from 'express'

import { Type } from './types'
import { getMeta, ParameterType, ExpressClass, ParameterConfiguration, ExpressMeta } from './meta'
import { middlewareHandler, MiddlewareFunction, Middleware, MiddlewareClass } from './middleware'

/**
 * Attach controller instances to express application
 */
export async function attachControllersInstances(app: Express | Router, controllers: InstanceType<Type>[]) {
  const promises = controllers.map((controller) => registerController(app, controller, (c: InstanceType<Type>) => c))

  await Promise.all(promises)
}

/**
 * Attach middleware instances to express application
 */
export function attachMiddlewareInstances(app: Express | Router, middlewares: MiddlewareClass[]) {
  for (const middleware of middlewares) {
    if (typeof middleware === 'function') {
      app.use(middleware)
    } else {
      app.use(middleware.use)
    }
  }
}

/**
 * Register controller via registering new Router
 */
async function registerController(
  app: Application | Router,
  Controller: Type | InstanceType<Type>,
  extractController: (c: Type | InstanceType<Type>) => Promise<InstanceType<Type>> | InstanceType<Type>
) {
  const controller = await extractController(Controller)
  const meta = getMeta(controller)
  const router = Router(meta.routerOptions)

  /**
   * Wrap all registered middleware with helper function
   * that can instantiate or get from the container instance of the class
   * or execute given middleware function
   */
  const routerMiddleware: RequestHandler[] = (meta.middleware || []).map((middleware) => middlewareHandler(middleware))

  /**
   * Apply router middleware
   */
  if (routerMiddleware.length) {
    router.use(...routerMiddleware)
  }

  /**
   * Applying registered routes
   */
  for (const [methodName, methodMeta] of Object.entries(meta.routes)) {
    methodMeta.routes.forEach((route) => {
      const routeMiddleware: RequestHandler[] = (route.middleware || []).map((middleware) =>
        middlewareHandler(middleware)
      )
      const handler = routeHandler(controller, methodName, meta.params[methodName], methodMeta.status)
      // @ts-ignore
      router[route.method].apply(router, [route.url, ...routeMiddleware, handler])
    })
  }

  ;(app as Router).use(meta.url, router)

  return app
}

/**
 * Returns function that will call original route handler and wrap return options
 */
function routeHandler(controller: ExpressClass, methodName: string, params: ParameterConfiguration[], status?: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const args = extractParameters(req, res, next, params)
    // @ts-ignore
    const result = controller[methodName].call(controller, ...args)

    if (result instanceof Promise) {
      result
        .then((r: any) => {
          if (!res.headersSent && typeof r !== 'undefined') {
            if (status) {
              res.status(status)
            }
            res.send(r)
          }
        })
        .catch(next)
    } else if (typeof result !== 'undefined') {
      if (!res.headersSent) {
        if (status) {
          res.status(status)
        }
        res.send(result)
      }
    }

    return result
  }
}

/**
 * Extract parameters for handlers
 */
function extractParameters(
  req: Request,
  res: Response,
  next: NextFunction,
  params: ParameterConfiguration[] = []
): any[] {
  const args = []

  for (const { name, index, type } of params) {
    switch (type) {
      case ParameterType.RESPONSE:
        args[index] = res
        break
      case ParameterType.REQUEST:
        args[index] = getParam(req, undefined, name)
        break
      case ParameterType.NEXT:
        args[index] = next
        break
      case ParameterType.PARAMS:
        args[index] = getParam(req, 'params', name)
        break
      case ParameterType.QUERY:
        args[index] = getParam(req, 'query', name)
        break
      case ParameterType.BODY:
        args[index] = getParam(req, 'body', name)
        break
      case ParameterType.HEADERS:
        args[index] = getParam(req, 'headers', name)
        break
      case ParameterType.COOKIES:
        args[index] = getParam(req, 'cookies', name)
        break
    }
  }

  return args
}

/**
 * Get parameter value from the source object
 */
function getParam(source: any, paramType?: string, name?: string): any {
  const param = paramType ? source[paramType] || source : source

  return name ? param[name] : param
}

/**
 * Attach middleware to controller metadata
 *
 * @remarks
 * Please use custom decorators before express method decorators Get, Post, etc...
 */
export function attachMiddleware(target: any, property: string | undefined, middleware: MiddlewareFunction) {
  const targetClass: ExpressClass = typeof target === 'function' ? target.prototype : target
  const meta: ExpressMeta = getMeta(targetClass)
  if (meta.url !== '') {
    meta.middleware.unshift(middleware)
  } else if (property && property in meta.routes) {
    meta.routes[property].routes[0].middleware.unshift(middleware)
  }
}
