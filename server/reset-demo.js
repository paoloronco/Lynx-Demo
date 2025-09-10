import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Only run in demo environment
if (process.env.NODE_ENV !== 'demo') {
  // Do nothing if not in demo mode (this file may be imported by server.js)
} else {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const DB_PATH = join(__dirname, 'lynx.db');

  function resetDatabase() {
    const db = new sqlite3.Database(DB_PATH);

    db.serialize(() => {
      // Drop tables if they exist
      db.run('DROP TABLE IF EXISTS links');
      db.run('DROP TABLE IF EXISTS profile_data');
      db.run('DROP TABLE IF EXISTS theme_config');
      db.run('DROP TABLE IF EXISTS admin_users');

      // Recreate tables aligned with server/database.js
      // Admin users table
      db.run(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Profile data table
      db.run(`
        CREATE TABLE IF NOT EXISTS profile_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          bio TEXT,
          avatar TEXT,
          social_links TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Links table (with extended columns used in app)
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

      // Theme configuration table
      db.run(`
        CREATE TABLE IF NOT EXISTS theme_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          primary_color TEXT DEFAULT '#007bff',
          background_color TEXT DEFAULT '#ffffff',
          text_color TEXT DEFAULT '#000000',
          button_style TEXT DEFAULT 'rounded',
          full_config TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Insert default theme
      const defaultTheme = {
        primaryColor: '#007bff',
        backgroundColor: '#ffffff',
        textColor: '#000000',
        buttonStyle: 'rounded',
        fontFamily: 'Inter, system-ui, sans-serif',
        linkStyle: 'card',
        customCSS: ''
      };
      db.run(
        `INSERT OR REPLACE INTO theme_config (id, primary_color, background_color, text_color, button_style, full_config)
         VALUES (1, ?, ?, ?, ?, ?)`,
        [
          '#007bff',
          '#ffffff',
          '#000000',
          'rounded',
          JSON.stringify(defaultTheme)
        ]
      );

      // Insert default empty profile
      db.run(
        `INSERT OR REPLACE INTO profile_data (id, name, bio, avatar, social_links)
         VALUES (1, 'Your Name', 'A short bio about yourself', '', '{}')`
      );

      // Insert demo admin user with bcrypt hash and stored salt
      try {
        const salt = bcrypt.genSaltSync(12);
        const passwordHash = bcrypt.hashSync('demo123', salt);
        db.run(
          `INSERT INTO admin_users (username, password_hash, salt) VALUES (?, ?, ?)`,
          ['admin', passwordHash, salt],
          function (err) {
            if (err) {
              console.error('Error inserting demo admin user:', err.message);
            } else {
              console.log('Demo admin user created with username "admin".');
            }
          }
        );
      } catch (e) {
        console.error('Error generating demo admin credentials:', e);
      }
    });

    db.close();
    console.log('Database has been reset at', new Date().toLocaleString());
  }

  // Initial reset
  resetDatabase();

  // Reset every 15 minutes (900000 ms)
  setInterval(resetDatabase, 15 * 60 * 1000);
}