/**
 * Discord Forum Thread Tracker
 * Cloudflare Worker that fetches all active Discord forum threads and stores them in D1
 */

import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

// Helper function to handle the scheduled task
async function handleScheduled(env) {
  const results = {
    success: true,
    threadsProcessed: 0,
    errors: []
  };

  try {
    // Initialize Discord REST client
    const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

    // Parse forum channel IDs from environment variable
    const forumChannelIds = env.DISCORD_FORUM_CHANNEL_IDS.split(',').map(id => id.trim());

    // Fetch and process threads for each forum channel
    for (const channelId of forumChannelIds) {
      try {
        // Fetch active threads in the forum channel
        const activeThreads = await rest.get(
          Routes.channelThreads(channelId)
        );

        // Process each thread
        for (const thread of activeThreads) {
          await processThread(env, thread);
          results.threadsProcessed++;
        }
      } catch (error) {
        results.errors.push({
          channelId,
          message: error.message
        });
      }
    }
  } catch (error) {
    results.success = false;
    results.errors.push({
      message: error.message
    });
  }

  return results;
}

/**
 * Process a single Discord thread and store it in the D1 database
 */
async function processThread(env, thread) {
  // Extract relevant thread information
  const { id, name, owner_id, created_timestamp, member_count, message_count, applied_tags } = thread;

  // Store thread in D1 database
  await env.DB.prepare(`
    INSERT INTO discord_threads (
      thread_id, thread_name, owner_id, created_timestamp,
      member_count, message_count, applied_tags, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (thread_id) DO UPDATE SET
      thread_name = excluded.thread_name,
                                   member_count = excluded.member_count,
                                   message_count = excluded.message_count,
                                   applied_tags = excluded.applied_tags,
                                   last_updated = excluded.last_updated
  `)
      .bind(
          id,
          name,
          owner_id,
          created_timestamp,
          member_count,
          message_count,
          JSON.stringify(applied_tags),
          Date.now()
      )
      .run();
}

// Export a default object with scheduled and fetch handlers
export default {
  // Schedule the worker to run according to cron expression defined in wrangler.toml
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },

  // Handler for HTTP requests - useful for testing and on-demand execution
  async fetch(request, env, ctx) {
    try {
      const result = await handleScheduled(env);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
