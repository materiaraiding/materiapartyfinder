-- Schema for Discord forum threads database

DROP TABLE IF EXISTS discord_threads;
DROP TABLE IF EXISTS discord_channel_tags;

-- Create table for Discord forum threads
CREATE TABLE discord_threads (
  thread_id TEXT PRIMARY KEY,
  thread_name TEXT NOT NULL,
  topic TEXT,
  owner_id TEXT,
  owner_nickname TEXT,
  parent_id TEXT,
  member_count INTEGER,
  message_count INTEGER,
  available_tags TEXT, -- JSON string of available tag objects
  applied_tags TEXT, -- JSON string of applied tag IDs
  thread_metadata TEXT -- JSON string of thread metadata
);

-- Create table for Discord channel tags
CREATE TABLE discord_channel_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  tag_emoji TEXT,
  UNIQUE(parent_id, tag_id)
);
