const MOCK_USER = {
  uid: 'anonymous-user',
  email: 'user@example.com',
  role: 'school',
  subscription: 'free'
}

function mockAuth(req, res, next) {
  req.user = MOCK_USER
  req.profile = MOCK_USER
  next()
}

module.exports = { mockAuth, MOCK_USER }