const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (_req, _file, cb) => {
    cb(null, `${Date.now()}-${crypto.randomUUID()}.png`);
  }
});

function fileFilter(_req, file, cb) {
  if (file.mimetype !== 'image/png') {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only PNG files are allowed'));
  }
  cb(null, true);
}

const maxSize = (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10) * 1024 * 1024;

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxSize,
    files: 1
  }
});

module.exports = upload.single('banner');
