import type { FastifyBaseLogger } from "fastify";
import type { BotIdentity } from "@embed-dash/shared";
import { discordFailure } from "./errors.js";

/**
 * One look at the bot token once the server is listening, so a wrong or
 * unusable token shows up in `docker compose logs` instead of only as "Not
 * connected" in the app. The server keeps running whatever the answer: the
 * operator may fix the network, and the app explains the problem too.
 */
export async function checkBot(
  getBot: () => Promise<BotIdentity>,
  log: FastifyBaseLogger,
) {
  try {
    const bot = await getBot();
    log.info(`Discord: connected as ${bot.name}`);
  } catch (error) {
    const { code, status, causeCode, discordCode } = discordFailure(error);
    log.warn(
      { code, status, causeCode, discordCode },
      `Discord: ${advice[code] ?? advice.other}`,
    );
  }
}

const advice: Record<string, string> = {
  DISCORD_INVALID_TOKEN:
    "the bot token was refused. Copy the token from the Bot page of your application in the Discord developer portal (Reset Token), not the client secret or application ID, save it as the token secret, then restart.",
  DISCORD_UNREACHABLE:
    "can't reach Discord. Check this host's network connection and DNS (inside Docker, the container's), then restart or retry from the app.",
  DISCORD_UNAVAILABLE:
    "Discord is answering with errors on its side. The app will connect once it answers again.",
  DISCORD_RATE_LIMITED:
    "the bot is rate limited. The app will connect once the limit passes.",
  other:
    "the bot lookup was refused. Check the bot token and the bot's application settings.",
};
