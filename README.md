# Discord Thread Tracker

A Cloudflare Worker that fetches Discord forum threads and stores them in a Cloudflare D1 database for easy querying and archiving.

## Features

- Automatically fetches active threads from Discord forums
- Stores thread data in Cloudflare D1 database
- Runs on a configurable schedule (default: every 5 minutes)
- Captures detailed thread information including tags, metadata, and message counts
- Provides both scheduled execution and on-demand HTTP endpoints

## Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (Cloudflare Workers CLI)
- A Cloudflare account
- A Discord bot token with appropriate permissions

## Initial Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/materiapartyfinder.git
   cd materiapartyfinder
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the example configuration:
   ```bash
   cp wrangler.toml.example wrangler.toml
   ```

4. Login to Cloudflare:
   ```bash
   npx wrangler login
   ```

## Discord Bot Setup

1. Create a Discord bot at the [Discord Developer Portal](https://discord.com/developers/applications)
2. Under the "Bot" tab, enable "Server Members Intent"
3. Copy the bot token for later use
4. Invite the bot to your server with the following permissions:
   - Read Messages/View Channels
   - Read Message History
   - View Server Insights

## D1 Database Configuration

1. Create a D1 database:
   ```bash
   npx wrangler d1 create discord_threads_db
   ```

2. Note the database ID in the command output and update your `wrangler.toml` file with this ID.

3. Create the database schema:
   ```bash
   npx wrangler d1 execute discord_threads_db --file=schema.sql
   ```

## Configuration

Update your `wrangler.toml` file with the following settings:

- Replace `YOUR_DISCORD_BOT_TOKEN` with your actual Discord bot token
- Replace `YOUR_DISCORD_GUILD_ID` with your Discord server ID
- Replace `YOUR_DATABASE_ID` with the D1 database ID from the previous step

For security reasons, it's recommended to set your Discord token as a secret instead of storing it in the config file:

```bash
npx wrangler secret put DISCORD_TOKEN
```

## Local Development

Run the worker locally for testing:

```bash
npm run dev
```

This will start a local development server that you can use to test the worker.

## Deployment

Deploy the worker to Cloudflare:

```bash
npm run deploy
```

After deployment, the worker will run on the schedule defined in your `wrangler.toml` file (default: every 5 minutes).

## Schema Details

The database stores the following information about each thread:

| Field            | Description                                       |
|------------------|---------------------------------------------------|
| thread_id        | Discord's unique identifier for the thread        |
| thread_name      | The name/title of the thread                      |
| topic            | The thread's topic description                    |
| owner_id         | Discord user ID of the thread creator             |
| owner_nickname   | Nickname of the thread creator                    |
| parent_id        | ID of the parent channel/forum                    |
| member_count     | Number of members in the thread                   |
| message_count    | Number of messages in the thread                  |
| available_tags   | JSON string of available tags for the thread      |
| applied_tags     | JSON string of tags applied to the thread         |
| thread_metadata  | JSON string containing thread metadata            |

## Troubleshooting

- **Worker fails to access Discord API**: Verify that your bot token is correct and the bot has the necessary permissions.
- **Database errors**: Check that your D1 database ID is correctly configured in `wrangler.toml`.
- **Missing threads**: Ensure the bot has been added to your Discord server with the correct permissions.

## License

ISC
