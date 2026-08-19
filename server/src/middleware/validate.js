export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.parse(req[source])
    req[source] = parsed
    next()
  }
}
