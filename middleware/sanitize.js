const fs = require('fs');
const sharp = require('sharp');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

const MIN_WIDTH = 1500;
const MAX_WIDTH = 2000;
const MIN_HEIGHT = 1000;
const MAX_HEIGHT = 1500;

module.exports = async function sanitize(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;

  try {
    // 1. Verify PNG magic bytes
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(8);
    fs.readSync(fd, header, 0, 8, 0);
    fs.closeSync(fd);

    if (!header.equals(PNG_MAGIC)) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'File is not a valid PNG (magic bytes mismatch)' });
    }

    // 2. Check dimensions via Sharp
    const metadata = await sharp(filePath).metadata();

    if (metadata.format !== 'png') {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'File is not a valid PNG image' });
    }

    if (metadata.width < MIN_WIDTH || metadata.width > MAX_WIDTH) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        error: `Image width must be between ${MIN_WIDTH}–${MAX_WIDTH}px. Yours: ${metadata.width}px`
      });
    }

    if (metadata.height < MIN_HEIGHT || metadata.height > MAX_HEIGHT) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        error: `Image height must be between ${MIN_HEIGHT}–${MAX_HEIGHT}px. Yours: ${metadata.height}px`
      });
    }

    // 3. Re-encode to strip all metadata
    const sanitizedBuffer = await sharp(filePath)
      .png({ effort: 1 })
      .toBuffer();

    fs.writeFileSync(filePath, sanitizedBuffer);

    req.imageInfo = { width: metadata.width, height: metadata.height };
    next();
  } catch (err) {
    try { fs.unlinkSync(filePath); } catch (_) { /* already deleted */ }
    console.error('Sanitization error:', err.message);
    return res.status(400).json({ error: 'Failed to process image. Ensure it is a valid PNG file.' });
  }
};
