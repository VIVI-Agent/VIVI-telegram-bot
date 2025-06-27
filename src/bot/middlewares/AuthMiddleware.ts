import { GENERIC_ERRORS } from "@texts";
import { GlobalSceneContext } from "@types";
import { logger } from "@logger";
import { MiddlewareFn } from "telegraf";

export const createAuthMiddleware: MiddlewareFn<GlobalSceneContext> = async (
  ctx,
  next
) => {
  logger.info("AuthMiddleware");
  // User Data From Telegram
  const tgUserId = ctx.from?.id.toString();
  const tgUsername = ctx.from?.username;

  // 1 - Check if username is set on telegram and stop ANY flow if not
  if (!tgUsername) {
    await ctx.reply(GENERIC_ERRORS.USERNAME_NOT_SET);
    return;
  }

  // 2 - Check if tgUserId is in DB and update tgUsername if needed
  if (tgUserId && tgUsername) {
    try {
      // Check User in DB by tgUserId
      let user = await ctx.services.userService.getUserByTgId(tgUserId);

      if (user) {
        // 2.1 - Update tgUsername if changed
        if (user.tgUsername !== tgUsername) {
          user = await ctx.services.userService.updateTgUsername(
            tgUserId,
            tgUsername
          );
        }
        ctx.user = user;
      } else {
        // 3 - User not found by tgUserId, check if pending
        const pendingUser = await ctx.services.userService.getUserByTgUsername(
          tgUsername
        );
        if (pendingUser) {
          // 3.1 - Activate pending user
          user = await ctx.services.userService.updateTgUserId(
            pendingUser.id,
            tgUserId
          );
        } else {
          // 3.2 - Create new user
          user = await ctx.services.userService.createUserWithSettings({
            tgUserId,
            tgUsername,
          });
        }
        ctx.user = user;
      }
    } catch (error: any) {
      // Capturar error específico de Prisma P2002
      if (
        error.code === "P2002" &&
        error.meta?.target?.includes("tgUsername")
      ) {
        logger.info(
          `Username ${tgUsername} already exists, fetching existing user`
        );

        // Si falló por username duplicado, buscar el usuario existente
        const existingUser = await ctx.services.userService.getUserByTgUsername(
          tgUsername
        );
        if (existingUser && !existingUser.tgUserId) {
          ctx.user = await ctx.services.userService.updateTgUserId(
            existingUser.id,
            tgUserId
          );
        } else {
          ctx.user = existingUser;
        }
      } else {
        logger.error("AuthMiddleware error:", error);
        await ctx.reply(GENERIC_ERRORS.USER_NOT_FOUND);
        return;
      }
    }

    // Final validation
    if (!ctx.user) {
      await ctx.reply(GENERIC_ERRORS.USER_NOT_FOUND);
      return;
    }

    // Check if user has a wallet created,  this decide to go to main menu or to initUser scene
    const userWallet = await ctx.services.walletService.getUserWallet(
      ctx.user.id
    );

    if (userWallet) {
      ctx.walletCreated = true;
    } else {
      ctx.walletCreated = false;
    }
  }

  return next();
};
