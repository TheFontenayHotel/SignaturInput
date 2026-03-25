const MAX_URL_LENGTH = 2048;

module.exports = function validateUrl(req, res, next) {
  const raw = req.body && req.body.bannerUrl;

  // Field is optional — no URL means keep the current link
  if (!raw || raw.trim() === '') {
    req.bannerUrl = null;
    return next();
  }

  const trimmed = raw.trim();

  if (trimmed.length > MAX_URL_LENGTH) {
    return res.status(400).json({ error: `URL too long (max ${MAX_URL_LENGTH} characters).` });
  }

  // Parse and validate
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return res.status(400).json({ error: 'Invalid URL. Please enter a valid web address.' });
  }

  if (parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'URL must use HTTPS.' });
  }

  // Strip characters that could enable HTML injection
  const sanitized = trimmed.replace(/[<>"'`]/g, '');

  if (sanitized !== trimmed) {
    return res.status(400).json({ error: 'URL contains invalid characters.' });
  }

  req.bannerUrl = sanitized;
  next();
};
