import {
  OverwriteType,
  PermissionFlagsBits,
  type APIOverwrite,
  type APIRole,
} from "discord-api-types/v10";
import { channelPermissions, type ChannelPermission } from "@embed-dash/shared";

export interface PermissionContext {
  guildId: string;
  ownerId: string;
  roles: readonly Pick<APIRole, "id" | "permissions">[];
  member: { userId: string; roleIds: readonly string[] };
}

const all = ~0n;

/** The member's server-wide permissions, before any channel overwrites. */
export function basePermissions(context: PermissionContext): bigint {
  if (context.member.userId === context.ownerId) return all;
  const byId = new Map(context.roles.map((r) => [r.id, BigInt(r.permissions)]));
  // The @everyone role shares the guild's ID.
  let permissions = byId.get(context.guildId) ?? 0n;
  for (const id of context.member.roleIds) permissions |= byId.get(id) ?? 0n;
  return permissions & PermissionFlagsBits.Administrator ? all : permissions;
}

/** Discord's documented order: @everyone overwrite, then roles combined, then the member. */
export function channelPermissionBits(
  context: PermissionContext,
  overwrites: readonly APIOverwrite[],
): bigint {
  let permissions = basePermissions(context);
  if (permissions === all) return all;
  const apply = (overwrite: { allow: bigint; deny: bigint }) => {
    permissions = (permissions & ~overwrite.deny) | overwrite.allow;
  };
  const bits = (o: APIOverwrite) => ({
    allow: BigInt(o.allow),
    deny: BigInt(o.deny),
  });
  const everyone = overwrites.find((o) => o.id === context.guildId);
  if (everyone) apply(bits(everyone));
  const roles = { allow: 0n, deny: 0n };
  for (const o of overwrites)
    if (
      o.type === OverwriteType.Role &&
      o.id !== context.guildId &&
      context.member.roleIds.includes(o.id)
    ) {
      roles.allow |= BigInt(o.allow);
      roles.deny |= BigInt(o.deny);
    }
  apply(roles);
  const member = overwrites.find(
    (o) => o.type === OverwriteType.Member && o.id === context.member.userId,
  );
  if (member) apply(bits(member));
  return permissions;
}

/**
 * The checked permissions the bot lacks in a channel. Without View Channel
 * nothing else applies, so that is reported alone; without Send Messages Discord
 * also denies Embed Links and Attach Files implicitly, so only Send is named.
 */
export function missingPermissions(
  context: PermissionContext,
  overwrites: readonly APIOverwrite[],
): ChannelPermission[] {
  const permissions = channelPermissionBits(context, overwrites);
  const missing = channelPermissions
    .filter((p) => !(permissions & p.bit))
    .map((p) => p.key);
  for (const key of ["viewChannel", "sendMessages"] as const)
    if (missing.includes(key)) return [key];
  return missing;
}
