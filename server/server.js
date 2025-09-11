if (process.env.NODE_ENV === 'demo') {
  await import('./reset-demo.js');
}

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';
import { initializeDatabase, dbGet, dbAll, dbRun } from './database.js';
import {
  isFirstTimeSetup,
  setupInitialCredentials,
  authenticateUser,
  generateToken,
  authenticateToken,
  isPasswordStrong,
  generateSecurePassword
} from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
// Increase body size limits to support base64-encoded avatar images
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(join(__dirname, '../dist')));

// Initialize database
await initializeDatabase();

// Auth Routes
app.get('/api/auth/setup-status', async (req, res) => {
  try {
    const firstTime = await isFirstTimeSetup();
    res.json({ isFirstTimeSetup: firstTime });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

app.post('/api/auth/setup', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    
    await setupInitialCredentials(password);
    const token = generateToken('admin');
    
    res.json({ 
      success: true, 
      token,
      message: 'Admin account created successfully' 
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    
    const isValid = await authenticateUser(password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    const token = generateToken('admin');
    res.json({ success: true, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/verify', authenticateToken, async (req, res) => {
  try {
    // Get the full user data from database
    const user = await dbGet(
      'SELECT username FROM admin_users WHERE username = ?',
      [req.user.username]
    );
    
    if (!user) {
      return res.status(404).json({ valid: false, error: 'User not found' });
    }
    
    res.json({ 
      valid: true, 
      user: { 
        username: user.username 
      } 
    });
  } catch (error) {
    console.error('Error verifying user:', error);
    res.status(500).json({ valid: false, error: 'Verification failed' });
  }
});

// Profile Routes
app.get('/api/profile', async (req, res) => {
  try {
    const profile = await dbGet('SELECT * FROM profile_data ORDER BY id DESC LIMIT 1');
    
    if (!profile) {
      // Return default profile
      return res.json({
        name: "Alex Johnson",
        bio: "Digital creator & entrepreneur sharing my favorite tools and resources. Follow along for the latest in tech, design, and productivity.",
        avatar: "/src/assets/profile-avatar.jpg",
        social_links: {},
        show_avatar: 1
      });
    }
    
    res.json({
      name: profile.name,
      bio: profile.bio,
      avatar: profile.avatar,
      social_links: profile.social_links ? JSON.parse(profile.social_links) : {},
      show_avatar: profile.show_avatar === 0 ? 0 : 1
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { name, bio, avatar, socialLinks, showAvatar } = req.body;
    
    // Check if profile exists
    const existing = await dbGet('SELECT id FROM profile_data LIMIT 1');
    
    if (existing) {
      await dbRun(
        'UPDATE profile_data SET name = ?, bio = ?, avatar = ?, social_links = ?, show_avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [name, bio, avatar, JSON.stringify(socialLinks || {}), showAvatar ? 1 : 0, existing.id]
      );
    } else {
      await dbRun(
        'INSERT INTO profile_data (name, bio, avatar, social_links, show_avatar) VALUES (?, ?, ?, ?, ?)',
        [name, bio, avatar, JSON.stringify(socialLinks || {}), showAvatar ? 1 : 0]
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// Links Routes
app.get('/api/links', async (req, res) => {
  try {
    const links = await dbAll('SELECT * FROM links WHERE is_active = 1 ORDER BY sort_order');
    
    const formattedLinks = links.map(link => ({
      id: link.id,
      title: link.title,
      description: link.description || '',
      url: link.url,
      type: link.type || 'link',
      icon: link.icon,
      iconType: link.icon_type || undefined,
      backgroundColor: link.background_color || undefined,
      textColor: link.text_color || undefined,
      size: link.size || undefined,
      content: link.content || undefined,
      textItems: link.text_items ? JSON.parse(link.text_items) : undefined
    }));
    
    res.json(formattedLinks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load links' });
  }
});

app.put('/api/links', authenticateToken, async (req, res) => {
  try {
    const links = req.body;
    
    // Delete all existing links
    await dbRun('DELETE FROM links');
    
    // Insert new links
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      await dbRun(
        'INSERT INTO links (id, title, description, url, icon, type, text_items, sort_order, is_active, background_color, text_color, size, icon_type, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          link.id,
          link.title,
          link.description || '',
          link.url || '',
          link.icon || null,
          link.type || 'link',
          link.textItems ? JSON.stringify(link.textItems) : null,
          i,
          1,
          link.backgroundColor || null,
          link.textColor || null,
          link.size || null,
          link.iconType || null,
          link.content || null
        ]
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save links' });
  }
});

// Theme Routes
app.get('/api/theme', async (req, res) => {
  try {
    const theme = await dbGet('SELECT * FROM theme_config ORDER BY id DESC LIMIT 1');
    
    if (!theme) {
      return res.json({
        primary: '#007bff',
        background: '#ffffff',
        foreground: '#000000'
      });
    }
    
    // If we have a full theme configuration stored, return it
    if (theme.full_config) {
      try {
        const fullConfig = JSON.parse(theme.full_config);
        return res.json(fullConfig);
      } catch (e) {
        // Fall back to basic config if JSON parsing fails
      }
    }
    
    // Return basic config for backward compatibility
    res.json({
      primary: theme.primary_color,
      background: theme.background_color,
      foreground: theme.text_color
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load theme' });
  }
});

app.put('/api/theme', authenticateToken, async (req, res) => {
  try {
    const themeConfig = req.body;
    
    // Extract basic colors for backward compatibility
    const primary = themeConfig.primary || '#007bff';
    const background = themeConfig.background || '#ffffff';
    const foreground = themeConfig.foreground || '#000000';
    
    // Check if theme exists
    const existing = await dbGet('SELECT id FROM theme_config LIMIT 1');
    
    if (existing) {
      await dbRun(
        'UPDATE theme_config SET primary_color = ?, background_color = ?, text_color = ?, full_config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [primary, background, foreground, JSON.stringify(themeConfig), existing.id]
      );
    } else {
      await dbRun(
        'INSERT INTO theme_config (primary_color, background_color, text_color, full_config) VALUES (?, ?, ?, ?)',
        [primary, background, foreground, JSON.stringify(themeConfig)]
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

// Utility Routes
app.get('/api/generate-password', (req, res) => {
  const password = generateSecurePassword();
  res.json({ password });
});

app.post('/api/validate-password', (req, res) => {
  const { password } = req.body;
  const isStrong = isPasswordStrong(password);
  res.json({ isStrong });
});

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  return res.status(403).json({ 
    success: false, 
    error: 'Password changes are disabled in the demo.' 
  });
});

// Internal function to reset the application (used by both endpoints)
const resetApplicationData = async () => {
  // Start a transaction to ensure all or nothing
  await dbRun('BEGIN TRANSACTION');
  
  try {
    console.log('Starting application reset...');
    
    // Get list of all tables
    const tables = await dbAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'"
    );
    
    // Disable foreign key constraints temporarily
    await dbRun('PRAGMA foreign_keys = OFF');
    
    // Clear all data from all tables
    for (const table of tables) {
      try {
        console.log(`Clearing table: ${table.name}`);
        await dbRun(`DELETE FROM ${table.name}`);
      } catch (error) {
        console.warn(`Could not clear table ${table.name}:`, error.message);
      }
    }
    
    // Re-enable foreign key constraints
    await dbRun('PRAGMA foreign_keys = ON');
    
    // Reset SQLite sequences
    try {
      const sequences = await dbAll(
        "SELECT name FROM sqlite_sequence"
      );
      
      for (const seq of sequences) {
        await dbRun(`DELETE FROM sqlite_sequence WHERE name = '${seq.name}'`);
      }
    } catch (error) {
      console.warn('Could not reset SQLite sequences:', error.message);
    }
    
    // Insert default theme
    console.log('Setting up default theme...');
    await dbRun(`
      INSERT OR REPLACE INTO theme_config (id, primary_color, background_color, text_color, button_style, full_config)
      VALUES (1, ?, ?, ?, ?, ?)
    `, [
      '#007bff', 
      '#ffffff', 
      '#000000', 
      'rounded',
      JSON.stringify({
        primaryColor: '#007bff',
        backgroundColor: '#ffffff',
        textColor: '#000000',
        buttonStyle: 'rounded',
        fontFamily: 'Inter, system-ui, sans-serif',
        linkStyle: 'card',
        customCSS: ''
      })
    ]);
    
    // Insert default empty profile
    console.log('Setting up default profile...');
    await dbRun(`
      INSERT OR REPLACE INTO profile_data (id, name, bio, avatar, social_links, show_avatar)
      VALUES (1, 'Your Name', 'A short bio about yourself', '', '{}', 1)
    `);
    
    // Commit the transaction
    await dbRun('COMMIT');
    
    console.log('Application reset completed successfully');
    
    return { 
      success: true, 
      message: 'Application reset successful. All data has been cleared and default settings have been restored.'
    };
    
  } catch (error) {
    // Rollback in case of any error
    console.error('Error in resetApplicationData:', error);
    try {
      await dbRun('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error during transaction rollback:', rollbackError);
    }
    throw error;
  }
};

// Reset authentication - clear ALL data and reset to initial state (requires authentication)
app.post('/api/auth/reset', authenticateToken, async (req, res) => {
  try {
    console.log('Authenticated reset endpoint called by user:', req.user?.username || 'unknown');
    
    // Add CORS headers
    res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    const result = await resetApplicationData();
    
    // Clear the auth token from the response
    res.clearCookie('token');
    
    res.json({
      ...result,
      success: true,
      message: 'Application reset successful. You will be redirected to the setup page.'
    });
  } catch (error) {
    console.error('Error in authenticated reset:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reset application. ' + (error.message || 'Please try again.') 
    });
  }
});

// Special unauthenticated reset endpoint (for when you're locked out)
app.post('/api/auth/force-reset', async (req, res) => {
  try {
    console.log('Force reset endpoint called');
    
    // Add CORS headers
    res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Reset-Token');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    // Verify reset token from environment variable or header
    const resetToken = process.env.RESET_TOKEN || 'default-reset-token';
    const providedToken = req.headers['x-reset-token'] || (req.body ? req.body.token : null);
    
    if (!providedToken || providedToken !== resetToken) {
      console.log('Invalid or missing reset token');
      return res.status(403).json({ 
        success: false, 
        error: 'Unauthorized: Invalid reset token' 
      });
    }
    
    console.log('Resetting application data...');
    const result = await resetApplicationData();
    
    console.log('Reset successful, sending response');
    res.json({
      ...result,
      success: true,
      message: 'Application reset successful. You can now set up a new admin account.'
    });
  } catch (error) {
    console.error('Error in force reset:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reset application. ' + (error.message || 'Please try again.') 
    });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend: http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
});
