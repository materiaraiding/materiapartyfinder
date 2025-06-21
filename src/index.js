/**
 * Discord Thread Tracker
 * Cloudflare Worker that fetches all active Discord threads and stores them in D1
 */

import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

/**
 * Fetch all members of a guild in batches of 1000
 * @param {Object} rest - Discord REST client
 * @param {string} guildId - Discord guild ID
 * @returns {Object} - Map of user IDs to nicknames/usernames
 */
async function fetchAllGuildMembers(rest, guildId) {
  console.log({ message: 'Starting to fetch all guild members' });
  const memberMap = {};

  try {
    let lastId = '0';
    let hasMore = true;
    let fetchedCount = 0;

    while (hasMore) {
      console.log({ message: `Fetching batch of guild members after ID ${lastId}` });
      try {
        // Create query parameters using URLSearchParams
        const params = new URLSearchParams({
          limit: '1000',
          after: lastId
        });

        // Fetch 1000 members at a time (Discord API limit)
        const response = await rest.get(
          `${Routes.guildMembers(guildId)}?${params.toString()}`
        );

        // The response should be an array of member objects
        const members = Array.isArray(response) ? response : [];

        console.log({
          message: 'Response from Discord API',
          isArray: Array.isArray(response),
          responseType: typeof response,
          memberCount: members.length,
          firstMember: members.length > 0 ? JSON.stringify(members[0]).substring(0, 100) + '...' : 'none'
        });

        if (!members.length) {
          console.log({ message: 'No more members to fetch' });
          hasMore = false;
          break;
        }

        // Update the lastId for pagination
        lastId = members[members.length - 1].user.id;
        fetchedCount += members.length;

        // Store member information in the map
        for (const member of members) {
          if (member.user) {
            memberMap[member.user.id] = member.nick || member.user.username;
          }
        }

        console.log({
          message: 'Fetched batch of guild members',
          count: members.length,
          totalFetched: fetchedCount,
          firstMemberId: members.length > 0 ? members[0].user?.id : 'none',
          lastMemberId: members.length > 0 ? members[members.length - 1].user?.id : 'none'
        });

        // If we got fewer than 1000 members, we've reached the end
        if (members.length < 1000) {
          hasMore = false;
        }
      } catch (error) {
        // If we get a "Missing Access" error, it means we don't have the GUILD_MEMBERS intent
        if (error.message.includes('Missing Access')) {
          console.warn({
            message: 'Missing GUILD_MEMBERS privileged intent. Cannot fetch all members at once.',
            error: error.message
          });
          // Break the loop as we don't have permission
          hasMore = false;
          break;
        } else {
          console.error({
            message: 'Error fetching guild members',
            error: error.message,
            stack: error.stack
          });
          // Break the loop on other errors
          hasMore = false;
          break;
        }
      }
    }

    // If no members were fetched, try fetching individual members for thread owners
    if (Object.keys(memberMap).length === 0) {
      console.log({
        message: 'No members could be fetched in bulk. Will fetch individual thread owners later.'
      });
    }
  } catch (error) {
    console.error({
      message: 'Fatal error in fetchAllGuildMembers',
      error: error.message,
      stack: error.stack
    });
  }

  console.log({
    message: 'Completed fetching all guild members',
    totalMembers: Object.keys(memberMap).length,
    hasMembers: Object.keys(memberMap).length > 0,
    sampleMembers: Object.keys(memberMap).slice(0, 5).map(id => ({ id, name: memberMap[id] }))
  });

  return memberMap;
}

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

    // First, clear all existing records from the discord_threads table
    console.log({ message: 'Clearing existing thread records from database' });
    try {
      await env.DB.prepare('DELETE FROM discord_threads').run();
      console.log({ message: 'Successfully cleared thread records from database' });

      // Also clear the channel tags table
      await env.DB.prepare('DELETE FROM discord_channel_tags').run();
      console.log({ message: 'Successfully cleared channel tags from database' });
    } catch (error) {
      console.error({ message: 'Error clearing records', error: error.message });
      // Continue processing even if clearing fails
    }

    // Fetch all guild members to create a mapping of user IDs to nicknames
    console.log({ message: 'Fetching all guild members to create user mapping' });
    const memberMap = await fetchAllGuildMembers(rest, guildId);
    console.log({
      message: 'Created member mapping',
      memberCount: Object.keys(memberMap).length
    });

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

    // Track unique parent_ids
    const uniqueParentIds = new Set();

    // Process each active thread
    if (activeThreads.threads && activeThreads.threads.length > 0) {
      for (const thread of activeThreads.threads) {
        console.log({
          message: 'Processing thread',
          threadId: thread.id,
          threadName: thread.name
        });
        await processThread(env, thread, memberMap);

        // Store parent_id if it exists
        if (thread.parent_id) {
          uniqueParentIds.add(thread.parent_id);
        }

        results.threadsProcessed++;
      }
    } else {
      console.log({ message: 'No active threads found in the guild' });
    }

    // After processing all threads, fetch channel info for each unique parent_id
    console.log({
      message: 'Fetching channel info for unique parent channels',
      uniqueChannelCount: uniqueParentIds.size
    });

    if (uniqueParentIds.size > 0) {
      await processChannelTags(env, rest, guildId, uniqueParentIds);
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
async function processThread(env, thread, memberMap) {
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
    // Initialize variable for owner nickname
    let owner_nickname = null;

    // Fetch thread owner details from the member map
    if (owner_id && memberMap[owner_id]) {
      owner_nickname = memberMap[owner_id];
      console.log({
        message: 'Found owner nickname in member map',
        ownerId: owner_id,
        nickname: owner_nickname
      });
    } else {
      console.log({
        message: 'Owner nickname not found in member map, will be null',
        ownerId: owner_id
      });
    }

    // Log detailed thread information after nickname is fetched
    console.log({
      message: 'Thread data',
      thread_id: id,
      thread_name: name,
      topic: topic || 'N/A',
      owner_id: owner_id,
      owner_nickname: owner_nickname || 'N/A',
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
      memberCount: member_count,
      ownerNickname: owner_nickname
    });

    // Store thread in D1 database
    await env.DB.prepare(`
      INSERT INTO discord_threads (
        thread_id, thread_name, topic, owner_id, owner_nickname,
        parent_id, member_count, message_count, available_tags, applied_tags, thread_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (thread_id) DO UPDATE SET
        thread_name = excluded.thread_name,
        topic = excluded.topic,
        owner_id = excluded.owner_id,
        owner_nickname = excluded.owner_nickname,
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
            owner_nickname,
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

/**
 * Fetch channel information and store tags for each unique parent channel
 * @param {Object} env - Environment variables
 * @param {Object} rest - Discord REST client
 * @param {string} guildId - Discord guild ID
 * @param {Set} uniqueParentIds - Set of unique parent channel IDs
 */
async function processChannelTags(env, rest, guildId, uniqueParentIds) {
  console.log({ message: 'Starting to fetch and store channel tags' });

  for (const channelId of uniqueParentIds) {
    try {
      console.log({ message: `Fetching channel info for channel ${channelId}` });

      // Fetch channel info from Discord API
      const channelInfo = await rest.get(
        Routes.channel(channelId)
      );

      // Check if channel has available_tags
      if (channelInfo && channelInfo.available_tags && channelInfo.available_tags.length > 0) {
        console.log({
          message: 'Found tags for channel',
          channelId,
          tagCount: channelInfo.available_tags.length
        });

        // Process each tag
        for (const tag of channelInfo.available_tags) {
          const { id: tagId, name, emoji } = tag;

          // Extract emoji information if available
          const emojiInfo = emoji ? (emoji.name || null) : null;

          console.log({
            message: 'Storing tag in database',
            channelId,
            tagId,
            tagName: name,
            tagEmoji: emojiInfo
          });

          // Store tag in database
          await env.DB.prepare(`
            INSERT INTO discord_channel_tags (parent_id, tag_id, tag_name, tag_emoji)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (parent_id, tag_id) DO UPDATE SET
            tag_name = excluded.tag_name,
            tag_emoji = excluded.tag_emoji
          `)
            .bind(
              channelId,
              tagId,
              name,
              emojiInfo
            )
            .run();
        }
      } else {
        console.log({
          message: 'No tags found for channel or channel not accessible',
          channelId
        });
      }
    } catch (error) {
      console.error({
        message: 'Error fetching or storing channel tags',
        channelId,
        error: error.message
      });
      // Continue with next channel even if this one fails
    }
  }

  console.log({ message: 'Completed fetching and storing channel tags' });
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
