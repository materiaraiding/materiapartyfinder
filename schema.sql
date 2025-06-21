-- Schema for Discord forum threads database

DROP TABLE IF EXISTS discord_threads;

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
