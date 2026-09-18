import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {emptySharingState} from './sharing-store.js';

// Node-only provider; never imported into the Cloudflare Worker. SQLite WAL and
// an atomic conditional UPDATE support restarts and concurrent local clients.
export class LocalSharingStore {
  constructor(filename) {
    mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
    this.database=new DatabaseSync(filename);
    try {chmodSync(filename,0o600);} catch {} // Windows access is governed by ACLs.
    this.database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS sharing_state(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL);');
  }
  async read() {
    const row=this.database.prepare('SELECT revision,body FROM sharing_state WHERE id=?').get('pilot');
    return row?{revision:row.revision,value:JSON.parse(row.body)}:{revision:0,value:emptySharingState()};
  }
  async compareAndSwap(revision,value) {
    const body=JSON.stringify(value);
    const result=revision===0
      ?this.database.prepare('INSERT OR IGNORE INTO sharing_state(id,revision,body) VALUES(?,1,?)').run('pilot',body)
      :this.database.prepare('UPDATE sharing_state SET revision=revision+1,body=? WHERE id=? AND revision=?').run(body,'pilot',revision);
    return result.changes===1;
  }
  close(){this.database.close();}
}
