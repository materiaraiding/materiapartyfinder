-- Schema for Discord forum threads database

DROP TABLE IF EXISTS discord_threads;

-- Create table for Discord forum threads
CREATE TABLE discord_threads (
  thread_id TEXT PRIMARY KEY,
  thread_name TEXT NOT NULL,
  owner_id TEXT,
  created_timestamp INTEGER,
  member_count INTEGER,
  message_count INTEGER,
  applied_tags TEXT, -- JSON string of tag IDs
  last_updated INTEGER NOT NULL
);
