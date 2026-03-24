const { Client } = require('ssh2');
const fs = require('fs');

function transfer(localFilePath) {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        const readStream = fs.createReadStream(localFilePath);
        const writeStream = sftp.createWriteStream(process.env.SSH_REMOTE_PATH);

        writeStream.on('close', () => {
          conn.end();
          resolve();
        });

        writeStream.on('error', (err) => {
          conn.end();
          reject(err);
        });

        readStream.pipe(writeStream);
      });
    });

    conn.on('error', (err) => {
      reject(err);
    });

    conn.connect({
      host: process.env.SSH_HOST,
      port: 22,
      username: process.env.SSH_USER,
      privateKey: fs.readFileSync(process.env.SSH_KEY_PATH),
      readyTimeout: 10000
    });
  });
}

module.exports = { transfer };
