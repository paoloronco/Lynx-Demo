import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Solo in ambiente demo
if (process.env.NODE_ENV !== 'demo') {
  // No-op fuori dalla demo
} else {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const DB_PATH = join(__dirname, 'lynx.db');

  // Intervallo configurabile (default 15 minuti)
  const intervalMinutes = Number(process.env.DEMO_RESET_INTERVAL_MINUTES || 15);

  function ensureTables(db) {
    // Crea le tabelle se non esistono ancora (SENZA toccare quelle sensibili)
    // NOTA: queste CREATE IF NOT EXISTS non sovrascrivono dati.
    db.run(`
      CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        url TEXT,
        icon TEXT,
        type TEXT DEFAULT 'link',
        text_items TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        background_color TEXT,
        text_color TEXT,
        size TEXT,
        icon_type TEXT,
        content TEXT
      )
    `);

    // Le altre tabelle NON vengono droppate né ricreate:
    // - profile_data
    // - theme_config
    // - admin_users
    // Se proprio vuoi assicurarne l’esistenza in ambienti puliti, puoi aggiungere
    // CREATE TABLE IF NOT EXISTS ... ma SENZA droppare/riseminare dati.
  }

  function resetLinksOnly() {
    const db = new sqlite3.Database(DB_PATH);

    db.serialize(() => {
      // Assicura che la tabella links esista
      ensureTables(db);

      // Disabilita FK per sicurezza durante il truncate
      db.run('PRAGMA foreign_keys = OFF');

      // Svuota SOLO i link
      db.run('DELETE FROM links', function (err) {
        if (err) {
          console.error('Errore nel cancellare i link:', err.message);
        }
      });

      // Azzera l’autoincrement di links (se presente in sqlite_sequence)
      db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'`, (err, row) => {
        if (!err && row) {
          db.run(`DELETE FROM sqlite_sequence WHERE name = 'links'`, (e) => {
            if (e) {
              console.warn('Impossibile resettare la sequence di links:', e.message);
            }
          });
        }
      });

      // Riabilita FK
      db.run('PRAGMA foreign_keys = ON');
    });

    db.close();
    console.log('Reset (SOLO links) eseguito alle', new Date().toLocaleString());
  }

  // Reset iniziale
  function resetLinksOnly() {
  const db = new sqlite3.Database(DB_PATH);

  // Assicura che la tabella links esista (non tocca le altre)
  ensureTables(db);

  // Esegui i comandi in sequenza atomica
  db.exec(
    `
    PRAGMA foreign_keys = OFF;
    DELETE FROM links;
    PRAGMA foreign_keys = ON;
    `,
    (err) => {
      if (err) {
        console.error('Errore durante il reset dei links:', err.message);
      } else {
        console.log('Reset (SOLO links) eseguito alle', new Date().toLocaleString());
      }
      // Chiudi SOLO quando il lavoro è finito
      db.close((closeErr) => {
        if (closeErr) {
          console.error('Errore in chiusura DB:', closeErr.message);
        }
      });
    }
  );
}


  // Reset periodico
  setInterval(resetLinksOnly, intervalMinutes * 60 * 1000);
}
