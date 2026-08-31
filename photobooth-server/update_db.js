const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const msgs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'messages.json'), 'utf8'));

const dbPath = path.join(__dirname, 'storage', 'db', 'hellomyphoto.db');
const db = new Database(dbPath);

const stmt = db.prepare(`
  UPDATE global_settings SET 
    msg_homepage = ?,
    msg_countdown = ?,
    msg_post_session = ?,
    msg_share_title = ?
  WHERE id = 1
`);

stmt.run(
  JSON.stringify(msgs.homepage),
  JSON.stringify(msgs.countdown),
  JSON.stringify(msgs.postSession),
  JSON.stringify(msgs.shareTitle)
);

console.log("Database updated successfully.");
