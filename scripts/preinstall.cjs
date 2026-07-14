#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Clean up lock files
const filesToRemove = ['package-lock.json', 'yarn.lock'];
filesToRemove.forEach(file => {
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`Removed: ${file}`);
    }
  } catch (err) {
    console.error(`Failed to remove ${file}:`, err.message);
  }
});

// Verify pnpm is being used
const userAgent = process.env.npm_config_user_agent || '';
if (!userAgent.startsWith('pnpm/')) {
  console.error('Please use pnpm instead of npm or yarn');
  process.exit(1);
}
