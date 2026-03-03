import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import helmet from 'helmet'
import { createProxyMiddleware } from 'http-proxy-middleware'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '.env') })

//Validate required environment variables
if(!process.env.SECRET_KEY){
    console.error(`ERROR: SECRET_KEY environment variable is not set`)
    process.exit(0)
}

const app = express()
const PORT = process.env.PORT || 3001

//CSP
app.use(helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    }
}))

//Proxy config
app.use('/api', createProxyMiddleware({
    target: 'http://localhost:3000',
    changeOrigin: true,
    pathRewrite: {
        '^/api': ''
    },
    on: {
        proxyReq: (proxyReq, _req, _res) => {
            proxyReq.setHeader('X-Internal-Secret', process.env.SECRET_KEY)
        },
        error: (err, _req, res) => {
            console.error('Proxy error', err),
            res.status(502).json({ error: 'Bad Gateway' })
        }
    }

}))

//Serve static files
app.use(express.static(path.join(__dirname, 'public')))

//Catch-all route for SPA
app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

//Listen
app.listen(PORT, () => {
    console.log(`Frontend server is running on ${PORT}`)
})