const { checkLimit } = (limitType) => {
  return async (req, res, next) => {
    next()
  }
}

module.exports = { checkLimit }