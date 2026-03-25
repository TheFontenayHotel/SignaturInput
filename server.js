require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const uploadMiddleware = require('./middleware/upload');
const sanitize = require('./middleware/sanitize');
const validateUrl = require('./middleware/validateUrl');
const { transfer } = require('./services/scp');
const { transferLink } = require('./services/smb');

// Validate required env vars
const required = ['SSH_KEY_PATH', 'SSH_HOST', 'SSH_USER', 'SSH_REMOTE_PATH'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// Warn if SSH key is not accessible
try {
  fs.accessSync(process.env.SSH_KEY_PATH, fs.constants.R_OK);
} catch {
  console.warn(`WARNING: SSH key not readable at ${process.env.SSH_KEY_PATH}`);
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "blob:", "data:"]
    }
  }
}));

// Parse form bodies for login
app.use(express.urlencoded({ extended: false }));

// Session management
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login');
}

// Login page (public)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login handler
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'Sales' && password === 'Sales.2026') {
    req.session.authenticated = true;
    return res.redirect('/');
  }
  res.redirect('/login?error=1');
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Serve static assets without auth, but block direct access to index.html
app.use((req, res, next) => {
  if (req.path === '/index.html') return res.redirect('/');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  index: false
}));

// Protected main page
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rate limit on upload endpoint
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many uploads. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Origin check middleware
function checkOrigin(req, res, next) {
  const origin = req.headers['origin'];
  const allowed = process.env.ALLOWED_ORIGIN;
  if (allowed && origin && origin !== allowed) {
    return res.status(403).json({ error: 'Forbidden: invalid origin' });
  }
  next();
}

// Upload route
app.post('/upload', requireAuth, uploadLimiter, checkOrigin, (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 10 MB.' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: err.message || 'Only PNG files are allowed.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(500).json({ error: 'Upload failed unexpectedly.' });
    }
    next();
  });
}, sanitize, validateUrl, async (req, res) => {
  const filePath = req.file.path;
  try {
    await transfer(filePath);

    // Transfer banner link URL via SMB if provided
    let linkMsg = '';
    if (req.bannerUrl) {
      try {
        await transferLink(req.bannerUrl);
        linkMsg = ' The banner link has also been updated.';
      } catch (err) {
        console.error('SMB link transfer error:', err.message);
        // Banner uploaded OK but link failed — report partial success
        return res.json({
          success: true,
          message: 'Banner uploaded successfully, but failed to update the link URL. Please contact IT.',
          dimensions: req.imageInfo
        });
      }
    }

    res.json({
      success: true,
      message: 'Banner uploaded successfully! The signature image has been updated.' + linkMsg,
      dimensions: req.imageInfo
    });
  } catch (err) {
    console.error('SCP transfer error:', err.message);
    res.status(500).json({ error: 'Failed to transfer file to server. Please contact IT.' });
  } finally {
    try { fs.unlinkSync(filePath); } catch (_) { /* already cleaned up */ }
  }
});

const HOST = process.env.HOST || '10.88.14.78';
const PORT = parseInt(process.env.PORT, 10) || 3000;

app.listen(PORT, HOST, () => {
  console.log(`Signature upload server running at http://${HOST}:${PORT}`);
});
