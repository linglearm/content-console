const { registerHooks } = require('node:module')

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^(?:\.\.?\/).+/.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context)
      } catch {
        // Let Node produce its normal resolution error below.
      }
    }
    return nextResolve(specifier, context)
  },
})
