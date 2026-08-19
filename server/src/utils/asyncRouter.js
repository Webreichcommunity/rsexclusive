import express from 'express'

const methods = ['get', 'post', 'put', 'patch', 'delete', 'use']

function wrap(handler) {
  if (typeof handler !== 'function' || handler.length >= 4) return handler
  return function asyncRouteHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

export function createAsyncRouter(options) {
  const router = express.Router(options)

  for (const method of methods) {
    const original = router[method].bind(router)
    router[method] = (...args) => original(...args.map(wrap))
  }

  return router
}
