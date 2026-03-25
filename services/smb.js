const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function transferLink(url) {
  return new Promise((resolve, reject) => {
    const host = process.env.SMB_HOST;
    const share = process.env.SMB_SHARE;
    const authFile = process.env.SMB_AUTH_FILE;

    if (!host || !share || !authFile) {
      return reject(new Error('SMB configuration incomplete (SMB_HOST, SMB_SHARE, SMB_AUTH_FILE required)'));
    }

    // Write URL to a temp file
    const tmpFile = path.join(__dirname, '..', 'uploads', `link-${crypto.randomUUID()}.txt`);

    try {
      fs.writeFileSync(tmpFile, url, 'utf8');
    } catch (err) {
      return reject(new Error(`Failed to write temp file: ${err.message}`));
    }

    const smbPath = `//${host}/${share}`;
    const command = `put ${tmpFile} banner-link.txt`;

    execFile('smbclient', [smbPath, '-A', authFile, '-c', command], (err, stdout, stderr) => {
      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch (_) { /* already cleaned */ }

      if (err) {
        return reject(new Error(`SMB transfer failed: ${stderr || err.message}`));
      }

      // smbclient may print warnings to stderr even on success
      if (stderr && stderr.includes('NT_STATUS_')) {
        return reject(new Error(`SMB error: ${stderr}`));
      }

      resolve();
    });
  });
}

module.exports = { transferLink };
