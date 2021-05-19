import { LogService, MatrixClient, MessageEvent, RoomAlias, UserID } from "matrix-bot-sdk";

// The prefix required to trigger the bot. The bot will also respond
// to being pinged directly.
export const COMMAND_PREFIX = "!convert";

// This is where all of our commands will be handled
export default class CommandHandler {

    // Just some variables so we can cache the bot's display name and ID
    // for command matching later.
    private displayName: string;
    private userId: string;
    private localpart: string;

    constructor(private client: MatrixClient) {
    }

    public async start() {
        // Populate the variables above (async)
        await this.prepareProfile();

        // Set up the event handler
        this.client.on("room.message", this.onMessage.bind(this));
    }

    private async prepareProfile() {
        this.userId = await this.client.getUserId();
        this.localpart = new UserID(this.userId).localpart;

        try {
            const profile = await this.client.getUserProfile(this.userId);
            if (profile && profile['displayname']) this.displayName = profile['displayname'];
        } catch (e) {
            // Non-fatal error - we'll just log it and move on.
            LogService.warn("CommandHandler", e);
        }
    }

    private async onMessage(roomId: string, ev: any) {
        const event = new MessageEvent(ev);
        if (event.isRedacted) return; // Ignore redacted events that come through
        if (event.sender === this.userId) return; // Ignore ourselves
        if (event.messageType !== "m.text") return; // Ignore non-text messages

        // Ensure that the event is a command before going on. We allow people to ping
        // the bot as well as using our COMMAND_PREFIX.
        const prefixes = [COMMAND_PREFIX, `${this.localpart}:`, `${this.displayName}:`, `${this.userId}:`];
        const prefixUsed = prefixes.find(p => event.textBody.startsWith(p));
        if (!prefixUsed) return; // Not a command (as far as we're concerned)

        // Check to see what the arguments were to the command
        const args = event.textBody.substring(prefixUsed.length).trim().split(' ');

        // Try and figure out what command the user ran, defaulting to help
        let progressReactionId: string;
        try {
            if (!args[0]) {
                const html = "This bot's sole purpose is to convert communities to spaces. Use <code>!convert +group:example.org</code> to convert.";
                return this.client.replyHtmlNotice(roomId, ev, html);
            } else {
                progressReactionId = await this.client.unstableApis.addReactionToEvent(roomId, ev['event_id'], 'In Progress');

                const groupId = args[0];

                const botServer = (new UserID(await this.client.getUserId())).domain;
                const alias = `#spaceconvert_${groupId.replace(/:/g, '_')}:${botServer}`;

                try {
                    await this.client.resolveRoom(alias);

                    // noinspection ES6MissingAwait - we don't care if this fails
                    this.client.redactEvent(roomId, progressReactionId);

                    return this.client.replyText(roomId, ev, "It appears as though that community has already been converted to a Space. If this is incorrect, please contact the bot administrator.");
                } catch (e) {
                    // Assume not created
                }

                const joinedGroups = await this.client.unstableApis.getJoinedGroups();
                if (!joinedGroups.includes(groupId)) {
                    try {
                        await this.client.unstableApis.joinGroup(groupId);
                    } catch (e) {
                        LogService.error("CommandHandler", e);

                        try {
                            await this.client.unstableApis.acceptGroupInvite(groupId);
                        } catch (e) {
                            LogService.error("CommandHandler", e);

                            // noinspection ES6MissingAwait - we don't care if this fails
                            this.client.redactEvent(roomId, progressReactionId);

                            return this.client.replyNotice(roomId, ev, "There was an error joining your community. Please invite me to your community then try again.");
                        }
                    }
                }

                const members = await this.client.unstableApis.getGroupUsers(groupId);
                const admins = members.filter(u => u.is_privileged).map(u => u.user_id);
                if (!admins.includes(ev['sender'])) {
                    // noinspection ES6MissingAwait - we don't care if this fails
                    this.client.redactEvent(roomId, progressReactionId);
                    return this.client.replyNotice(roomId, ev, "Sorry, you are not an admin of that community.");
                }
                const profile = await this.client.unstableApis.getGroupProfile(groupId);

                const space = await this.client.createSpace({
                    name: profile['name'] || `${ev['sender']}'s Space`,
                    topic: profile['short_description'] || '',
                    isPublic: profile['is_openly_joinable'],
                });
                await this.client.sendStateEvent(space.roomId, "m.room.avatar", "", {
                    url: profile['avatar_url'],
                });

                const groupRooms = await this.client.unstableApis.getGroupRooms(groupId);

                for (const room of groupRooms) {
                    const server = (room['canonical_alias']
                        ? (new RoomAlias(room['canonical_alias']))
                        : (new UserID(ev['sender']))
                    ).domain;
                    await space.addChildRoom(room['room_id'], {
                        via: [server],
                    });
                }

                const powerLevels = await this.client.getRoomStateEvent(space.roomId, "m.room.power_levels", "");
                for (const admin of admins) {
                    powerLevels['users'][admin] = 100;
                }
                await this.client.sendStateEvent(space.roomId, "m.room.power_levels", "", powerLevels);

                await this.client.createRoomAlias(alias, space.roomId);

                for (const admin of admins) {
                    await this.client.inviteUser(admin, space.roomId);
                }

                powerLevels['users'][await this.client.getUserId()] = 0;
                await this.client.sendStateEvent(space.roomId, "m.room.power_levels", "", powerLevels);
                await this.client.unstableApis.addReactionToEvent(roomId, ev['event_id'], '✅');
                await this.client.redactEvent(roomId, progressReactionId);
                return this.client.replyHtmlNotice(roomId, ev, "Your community is now a space! I've made you admin, but <b>have not</b> invited your community's members just in case you'd like to change some settings first. Inviting your community members is a task left to you: typically the Space is advertised within your community rooms so people can join at their own leisure.");
            }
        } catch (e) {
            // Log the error
            LogService.error("CommandHandler", e);

            if (progressReactionId) {
                // noinspection ES6MissingAwait - we don't care if this fails
                this.client.redactEvent(roomId, progressReactionId);
            }

            // Tell the user there was a problem
            return this.client.replyNotice(roomId, ev, "There was an error processing your command");
        }
    }
}
