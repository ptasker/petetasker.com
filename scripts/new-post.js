#!/usr/bin/env node

/**
 * Script to create a new blog post with proper frontmatter
 * Usage: node scripts/new-post.js "Your Post Title"
 * Or: npm run new-post "Your Post Title"
 */

const fs = require('fs');
const path = require('path');

// Get title from command line arguments
const title = process.argv.slice(2).join(' ');

if (!title) {
  console.error('❌ Error: Please provide a post title');
  console.log('Usage: node scripts/new-post.js "Your Post Title"');
  console.log('   Or: npm run new-post "Your Post Title"');
  process.exit(1);
}

// Generate slug from title
const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

// Generate filename
const filename = `${slug}.md`;
const filepath = path.join(__dirname, '..', 'content', 'blog', filename);

// Check if file already exists
if (fs.existsSync(filepath)) {
  console.error(`❌ Error: File already exists: ${filename}`);
  process.exit(1);
}

// Get current date in ISO format
const now = new Date();
const dateString = now.toISOString().split('.')[0] + '-05:00'; // EST timezone

// Create frontmatter template
const template = `---
title: '${title}'
date: '${dateString}'
status: publish
permalink: /${slug}
author: Pete
excerpt: ''
type: post
category:
    - Code
tag: []
---

Write your introduction here...

## First Section

Your content goes here.

\`\`\`javascript
// Code example
const example = "Hello World";
\`\`\`

## Conclusion

Wrap up your thoughts.
`;

// Write the file
try {
  fs.writeFileSync(filepath, template, 'utf8');
  console.log('✅ Blog post created successfully!');
  console.log(`📝 File: content/blog/${filename}`);
  console.log(`🔗 URL: /${slug}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Edit the file: code content/blog/${filename}`);
  console.log('  2. Add your content');
  console.log('  3. Update the excerpt and categories');
} catch (error) {
  console.error('❌ Error creating file:', error.message);
  process.exit(1);
}
