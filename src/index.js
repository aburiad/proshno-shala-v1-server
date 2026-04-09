require('dotenv').config()
console.log('--- Server Startup Diagnostics ---')
console.log('ENV PORT:', process.env.PORT)
console.log('NODE_ENV:', process.env.NODE_ENV)

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const { errorHandler } = require('./middleware/errorHandler')

const authRoutes = require('./routes/auth')
const paperRoutes = require('./routes/papers')
const examRoutes = require('./routes/exam')
const paymentRoutes = require('./routes/payment')
const adminRoutes = require('./routes/admin')
const aiRoutes = require('./routes/ai')
const questionRoutes = require('./routes/questions')
const bookRoutes = require('./routes/book')
const generateRoutes = require('./routes/generate')

const app = express()
app.set('trust proxy', 1)
const PORT = process.env.PORT || 8080
console.log('Server initialized. Port target:', PORT)

// 1. CORS - MUST BE FIRST for OPTIONS preflight handling
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  'https://ai-hub-client-575245300411.europe-west1.run.app',
  'http://localhost:5173',
].filter(Boolean)

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.includes(origin) || 
                     origin.endsWith('.run.app') || 
                     origin.endsWith('.vercel.app') ||
                     origin.includes('localhost');
                     
    if (isAllowed) {
      callback(null, true);
    } else {
      // In production, we might want to be stricter, but allow for debug
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}))

// 2. Security Headers - Relaxed for Google Auth Popups
app.use(helmet({
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow resources from other origins
  contentSecurityPolicy: false, // Disable for now to ensure no other blocks
}))

app.use(morgan('dev'))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/papers', paperRoutes)
app.use('/api/exam', examRoutes)
app.use('/api/payment', paymentRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/questions', questionRoutes)
app.use('/api/book', bookRoutes)
app.use('/api', generateRoutes)

// Error handler (must be last)
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Server successfully listening on port ${PORT}`)
})

module.exports = app
