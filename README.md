# Group/Community to Space converter bot

Converts groups (legacy, aka "communities") to Spaces on demand.

## Usage

1. DM [@spacebot:t2bot.io](https://matrix.to/#/@spacebot:t2bot.io)
2. Say `!convert +group:example.org` to start the conversion.
3. Give the bot a minute to figure things out.
4. You should receive an invite to your newly created Space, though your community members won't be invited.
5. Make any changes you like to the Space (it's yours).
6. Advertise the space within your community so people can join, or invite the people that need to be there.

If you run into issues, visit [#help:t2bot.io](https://matrix.to/#/#help:t2bot.io) on Matrix.

## Running / Building yourself

For help and support running this bot, visit [#spacebot:t2bot.io](https://matrix.to/#/#spacebot:t2bot.io) on Matrix.

The basic steps are:

```bash
npm install
cp config/default.yaml config/production.yaml
nano config/production.yaml  # or whatever editor you like
NODE_ENV=production npm run start:dev
```

A Docker [image](https://hub.docker.com/r/t2bot/groups-to-space-bot) is also available to make quick work of the deployment. Map a volume to `/data` which contains the `config` and `storage` directories and have at it.
