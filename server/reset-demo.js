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

  // Theme defaults (can be overridden by environment variables)
  const THEME_PRIMARY = process.env.THEME_PRIMARY_COLOR || '#007bff';
  const THEME_BACKGROUND = process.env.THEME_BACKGROUND_COLOR || '#ffffff';
  const THEME_TEXT = process.env.THEME_TEXT_COLOR || '#000000';
  const THEME_BUTTON_STYLE = process.env.THEME_BUTTON_STYLE || 'rounded';
  // Optional full theme config as JSON string; if not provided, build from primitives
  const THEME_FULL_CONFIG = (() => {
    try {
      if (process.env.THEME_FULL_CONFIG_JSON) {
        // Validate JSON
        JSON.parse(process.env.THEME_FULL_CONFIG_JSON);
        return process.env.THEME_FULL_CONFIG_JSON;
      }
    } catch {
      // fall through to default
    }
    const defaultTheme = {
      primaryColor: THEME_PRIMARY,
      backgroundColor: THEME_BACKGROUND,
      textColor: THEME_TEXT,
      buttonStyle: THEME_BUTTON_STYLE,
      fontFamily: 'Inter, system-ui, sans-serif',
      linkStyle: 'card',
      customCSS: ''
    };
    return JSON.stringify(defaultTheme);
  })();

  const DEMO_ADMIN_USERNAME = 'admin';
  const DEMO_ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'demo123';

  let isRunning = false; // prevent overlapping runs

  const run = (db, sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve(this);
      });
    });

  async function resetDatabase() {
    if (isRunning) {
      console.warn('[reset-demo] Previous run still in progress, skipping this cycle');
      return;
    }
    isRunning = true;

    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) console.error('[reset-demo] Error opening database:', err.message);
    });

    try {
      // Use serialize to maintain ordering
      db.serialize();

      // Begin transaction
      await run(db, 'BEGIN IMMEDIATE');

      // IMPORTANT: Do not touch sqlite_sequence explicitly.
      // Drop and recreate all tables EXCEPT theme_config
      await run(db, 'DROP TABLE IF EXISTS admin_users');
      await run(db, 'DROP TABLE IF EXISTS links');
      await run(db, 'DROP TABLE IF EXISTS profile_data');

      // Recreate admin_users (aligned with server/database.js)
      await run(db, `
        CREATE TABLE IF NOT EXISTS admin_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Recreate profile_data with show_avatar column (and default), aligned with server/database.js
      await run(db, `
        CREATE TABLE IF NOT EXISTS profile_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          bio TEXT,
          avatar TEXT,
          social_links TEXT,
          show_avatar BOOLEAN DEFAULT 1,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Recreate links with extended columns, aligned with server/database.js
      await run(db, `
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

      // Ensure theme_config exists (but DO NOT drop it), schema aligned with server/database.js
      await run(db, `
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

      // Preserve/restore theme_config to deployment defaults
      await run(
        db,
        `INSERT OR IGNORE INTO theme_config (id, primary_color, background_color, text_color, button_style, full_config)
         VALUES (1, ?, ?, ?, ?, ?)`,
        [THEME_PRIMARY, THEME_BACKGROUND, THEME_TEXT, THEME_BUTTON_STYLE, THEME_FULL_CONFIG]
      );
      await run(
        db,
        `UPDATE theme_config
           SET primary_color = ?,
               background_color = ?,
               text_color = ?,
               button_style = ?,
               full_config = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`
        , [THEME_PRIMARY, THEME_BACKGROUND, THEME_TEXT, THEME_BUTTON_STYLE, THEME_FULL_CONFIG]
      );

      // Seed an empty profile row (demo content)
      await run(
        db,
        `INSERT INTO profile_data (name, bio, avatar, social_links, show_avatar)
         VALUES (?, ?, ?, ?, 1)`,
        ['Your Name', 'A short bio about yourself', '', '{}']
      );

      // Seed demo admin user
      try {
        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, salt);
        await run(
          db,
          `INSERT INTO admin_users (username, password_hash, salt) VALUES (?, ?, ?)`,
          [DEMO_ADMIN_USERNAME, passwordHash, salt]
        );
      } catch (e) {
        console.error('[reset-demo] Error creating demo admin user:', e);
      }

      // Commit transaction
      await run(db, 'COMMIT');
      console.log('[reset-demo] Database has been reset at', new Date().toISOString());
    } catch (err) {
      try {
        await run(db, 'ROLLBACK');
      } catch {}
      console.error('[reset-demo] Error during reset:', err);
    } finally {
      // Close the DB handle after all statements have finished
      db.close((closeErr) => {
        if (closeErr) {
          console.error('[reset-demo] Error closing database:', closeErr.message);
        }
        isRunning = false;
      });
    }
  }

  // Initial reset
  resetDatabase();

  // Reset every 15 minutes (900000 ms)
  setInterval(resetDatabase, 15 * 60 * 1000);
}