/**
 * Discord Forum Thread Tracker
 * Cloudflare Worker that fetches all active Discord forum threads and stores them in D1
 */

import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

// Helper function to handle the scheduled task
async function handleScheduled(env) {
  console.log('Starting scheduled task: Discord forum thread tracking');
  const startTime = Date.now();

  const results = {
    success: true,
    threadsProcessed: 0,
    errors: []
  };

  try {
    // Initialize Discord REST client
    const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
    console.log('Discord REST client initialized');

    // Parse forum channel IDs from environment variable
    const forumChannelIds = env.DISCORD_FORUM_CHANNEL_IDS.split(',').map(id => id.trim());
    console.log(`Processing ${forumChannelIds.length} forum channels: ${forumChannelIds.join(', ')}`);

    // Fetch and process threads for each forum channel
    for (const channelId of forumChannelIds) {
      try {
        console.log(`Fetching threads for channel ID: ${channelId}`);

        // Fetch active threads in the forum channel
        const activeThreads = await rest.get(
          Routes.channelThreads(channelId)
        );

        console.log(`Found ${activeThreads.length} active threads in channel ${channelId}`);

        // Process each thread
        for (const thread of activeThreads) {
          console.log(`Processing thread: ${thread.id} - "${thread.name}"`);
          await processThread(env, thread);
          results.threadsProcessed++;
        }
      } catch (error) {
        console.error(`Error processing channel ${channelId}: ${error.message}`);
        results.errors.push({
          channelId,
          message: error.message
        });
      }
    }
  } catch (error) {
    console.error(`Fatal error in handleScheduled: ${error.message}`);
    results.success = false;
    results.errors.push({
      message: error.message
    });
  }

  const executionTime = Date.now() - startTime;
  console.log(`Completed task with ${results.success ? 'success' : 'failure'}, processed ${results.threadsProcessed} threads in ${executionTime}ms`);
  if (results.errors.length > 0) {
    console.error(`Encountered ${results.errors.length} errors:`, results.errors);
  }

  return results;
}

/**
 * Process a single Discord thread and store it in the D1 database
 */
async function processThread(env, thread) {
  // Extract relevant thread information
  const { id, name, owner_id, created_timestamp, member_count, message_count, applied_tags } = thread;

  try {
    console.log(`Storing thread ${id} in database with ${message_count} messages, ${member_count} members`);

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

    console.log(`Successfully stored thread ${id} in database`);
  } catch (error) {
    console.error(`Error storing thread ${id} in database: ${error.message}`);
    throw error; // Re-throw to be handled by the caller
  }
}

// Export a default object with scheduled and fetch handlers
export default {
  // Schedule the worker to run according to cron expression defined in wrangler.toml
  async scheduled(event, env, ctx) {
    console.log(`Running scheduled execution triggered by ${event.cron}`);
    ctx.waitUntil(handleScheduled(env));
  },

  // Handler for HTTP requests - useful for testing and on-demand execution
  async fetch(request, env, ctx) {
    console.log(`Received HTTP request: ${request.method} ${request.url}`);
    try {
      const result = await handleScheduled(env);
      console.log(`HTTP request completed successfully with ${result.threadsProcessed} threads processed`);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error(`HTTP request failed with error: ${error.message}`);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
