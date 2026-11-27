import { REST } from "@discordjs/rest";
import {
  Routes,
  type RESTGetAPICurrentUserResult,
} from "discord-api-types/v10";
import { botIdentitySchema, type BotIdentity } from "@embed-dash/shared";
import type { Config } from "./config.js";
export function createDiscord(config: Config): {
  getBot: () => Promise<BotIdentity>;
} {
  const rest = new REST({
    api: config.discordApiBase,
    version: "10",
    retries: 0,
    rejectOnRateLimit: () => true,
    timeout: 5000,
  }).setToken(config.botToken);
  return {
    async getBot() {
      // The REST client clears its token after a 401; retries still use startup configuration.
      rest.setToken(config.botToken);
      const user = (await rest.get(
        Routes.user(),
      )) as RESTGetAPICurrentUserResult;
      return botIdentitySchema.parse({
        id: user.id,
        name: user.username,
        avatarUrl: user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
          : null,
      });
    },
  };
}
