/**
 * Discord Thread Tracker
 * Cloudflare Worker that fetches all active Discord threads and stores them in D1
 */

import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

// Helper function to handle the scheduled task
async function handleScheduled(env) {
  console.log({ message: 'Starting scheduled task: Discord thread tracking' });
  const startTime = Date.now();

  const results = {
    success: true,
    threadsProcessed: 0,
    errors: []
  };

  try {
    // Initialize Discord REST client
    const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
    console.log({ message: 'Discord REST client initialized' });

    // Get guild ID from environment variable
    const guildId = env.DISCORD_GUILD_ID;
    console.log({ message: 'Processing threads for guild', guildId });

    // Get all active threads in the guild
    console.log({ message: 'Fetching all active threads in the guild' });
    const activeThreads = await rest.get(
      Routes.guildActiveThreads(guildId)
    );

    console.log({
      message: 'Found active threads in guild',
      count: activeThreads.threads?.length || 0,
      guildId
    });

    // Process each active thread
    if (activeThreads.threads && activeThreads.threads.length > 0) {
      for (const thread of activeThreads.threads) {
        console.log({
          message: 'Processing thread',
          threadId: thread.id,
          threadName: thread.name
        });
        await processThread(env, thread);
        results.threadsProcessed++;
      }
    } else {
      console.log({ message: 'No active threads found in the guild' });
    }
  } catch (error) {
    console.error({
      message: 'Fatal error in handleScheduled',
      error: error.message
    });
    results.success = false;
    results.errors.push({
      message: error.message
    });
  }

  const executionTime = Date.now() - startTime;
  console.log({
    message: 'Completed task',
    status: results.success ? 'success' : 'failure',
    threadsProcessed: results.threadsProcessed,
    executionTimeMs: executionTime
  });
  if (results.errors.length > 0) {
    console.error({
      message: 'Encountered errors',
      errorCount: results.errors.length,
      errors: results.errors
    });
  }

  return results;
}

/**
 * Process a single Discord thread and store it in the D1 database
 */
async function processThread(env, thread) {
  // Extract relevant thread information
  const {
    id,
    name,
    topic,
    owner_id,
    parent_id,
    member_count,
    message_count,
    available_tags,
    applied_tags,
    thread_metadata
  } = thread;

  try {
    // Log detailed thread information for debugging
    console.log({ message: 'Processing thread with details' });
    console.log({
      message: 'Thread data',
      thread_id: id,
      thread_name: name,
      topic: topic || 'N/A',
      owner_id: owner_id,
      parent_id: parent_id || 'N/A',
      member_count: member_count,
      message_count: message_count,
      available_tags: available_tags || [],
      applied_tags: applied_tags || [],
      thread_metadata: thread_metadata || {}
    });

    console.log({
      message: 'Storing thread in database',
      threadId: id,
      messageCount: message_count,
      memberCount: member_count
    });

    // Store thread in D1 database
    await env.DB.prepare(`
      INSERT INTO discord_threads (
        thread_id, thread_name, topic, owner_id, parent_id,
        member_count, message_count, available_tags, applied_tags, thread_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (thread_id) DO UPDATE SET
        thread_name = excluded.thread_name,
        topic = excluded.topic,
        parent_id = excluded.parent_id,
        member_count = excluded.member_count,
        message_count = excluded.message_count,
        available_tags = excluded.available_tags,
        applied_tags = excluded.applied_tags,
        thread_metadata = excluded.thread_metadata
    `)
        .bind(
            id,
            name,
            topic || null,
            owner_id,
            parent_id || null,
            member_count,
            message_count,
            available_tags ? JSON.stringify(available_tags) : null,
            applied_tags ? JSON.stringify(applied_tags) : null,
            thread_metadata ? JSON.stringify(thread_metadata) : null
        )
        .run();

    console.log({ message: 'Successfully stored thread in database', threadId: id });
  } catch (error) {
    console.error({
      message: 'Error storing thread in database',
      threadId: id,
      error: error.message
    });
    throw error; // Re-throw to be handled by the caller
  }
}

// Export a default object with scheduled and fetch handlers
export default {
  // Schedule the worker to run according to cron expression defined in wrangler.toml
  async scheduled(event, env, ctx) {
    console.log({ message: 'Running scheduled execution', trigger: event.cron });
    ctx.waitUntil(handleScheduled(env));
  },

  // Handler for HTTP requests - useful for testing and on-demand execution
  async fetch(request, env, ctx) {
    console.log({
      message: 'Received HTTP request',
      method: request.method,
      url: request.url
    });
    try {
      const result = await handleScheduled(env);
      console.log({
        message: 'HTTP request completed successfully',
        threadsProcessed: result.threadsProcessed
      });
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error({
        message: 'HTTP request failed',
        error: error.message
      });
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
