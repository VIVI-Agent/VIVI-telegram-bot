// src/bot/handlers/groupSwap/groupBalanceHandler.ts
import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import { Address, formatUnits } from "viem";
import { getWalletBalance } from "@services";
import { viviJoin, generateTradeLink } from "@utils";
import { secrets } from "config";

/**
 * Muestra el balance de ETH y tokens en chats grupales
 * @param {MyContext} ctx - Contexto de Telegram
 * @param {number} message_id - ID del mensaje original para respuestas
 * @param {string} [targetUsername] - Username opcional cuyo balance queremos ver
 * @throws {Error} Si el usuario no está registrado o no tiene wallet
 *
 * @example
 * // Comando en grupo:
 * // @YourBot balance
 * // @YourBot balance @username
 */
export async function balanceHandler(
  ctx: GlobalSceneContext,
  message_id: number,
  targetUsername?: string
) {
  const logPrefix = "[groupBalanceHandler]";

  try {
    // Variables para rastrear la identidad del usuario
    let userId: number | undefined;
    let username: string | undefined;
    let isPendingUser = false;

    if (targetUsername) {
      const cleanUsername = targetUsername.replace(/^@/, "").toLowerCase();
      if (cleanUsername === secrets.TELEGRAM_BOT_USERNAME.toLowerCase()) {
        await ctx.reply("Nice try kiddo, im keeping my bags private for now.", {
          reply_parameters: { message_id },
          link_preview_options: { is_disabled: true },
        });
        return;
      }
    }

    if (!targetUsername) {
      // CASO 1: USUARIO VIENDO SU PROPIO BALANCE
      if (!ctx.from) {
        logger.warn(`${logPrefix} Missing ctx.from`);
        return;
      }

      const fromId = ctx.from.id;
      username = ctx.from.username;

      // Primero intentamos buscar usuario activo por tgUserId
      const activeUser = await ctx.services.userService.getUserByTgId(
        fromId.toString()
      );

      if (activeUser) {
        // Usuario activo encontrado
        userId = activeUser.id;
        logger.debug(
          `${logPrefix} Found active user ID ${userId} by tgUserId ${fromId}`
        );
      }
      // Si no hay usuario activo pero hay username, buscar cuenta pendiente
      else if (username) {
        const pendingUser = await ctx.services.userService.getUserByUsername(
          username
        );
        if (pendingUser && pendingUser.tgUserId === null) {
          userId = pendingUser.id;
          isPendingUser = true;
          logger.debug(
            `${logPrefix} Found pending user ID ${userId} by username ${username}`
          );
        }
      }

      // Si no encontramos ningún usuario, error
      if (!userId) {
        logger.warn(
          `${logPrefix} No user found for tgUserId ${fromId} or username ${username}`
        );
        throw new Error(`Sorry kiddo, you're not in my books - ${viviJoin()}`);
      }
    } else {
      // CASO 2: BUSCANDO BALANCE DE OTRO USUARIO
      const cleanUsername = targetUsername.replace(/^@/, "");

      // Buscar usuario por username (podría ser activo o pendiente)
      const targetUser = await ctx.services.userService.getUserByUsername(
        cleanUsername
      );

      if (!targetUser) {
        logger.warn(`${logPrefix} Target user not found: ${cleanUsername}`);
        throw new Error(
          `Sorry kiddo, user @${cleanUsername} is not in my books yet\n${viviJoin()}`
        );
      }

      userId = targetUser.id;
      username = cleanUsername;
      isPendingUser = !targetUser.tgUserId;

      logger.debug(
        `${logPrefix} Found ${
          isPendingUser ? "pending" : "active"
        } user ID ${userId} by username ${username}`
      );
    }

    // BUSCAR WALLET Y HOLDINGS POR USERID
    logger.info(`${logPrefix} Getting wallet data for user ID ${userId}`);

    const user =
      await ctx.services.userService.getUserWithSelectedWalletAndHoldingsByUserId(
        userId
      );

    if (!user) {
      logger.warn(`${logPrefix} User data not found for ID: ${userId}`);
      throw new Error(
        `Sorry kiddo, ${
          targetUsername ? `@${username}` : "you're"
        } not in my books - ${viviJoin()}`
      );
    }

    // Validar wallet seleccionada
    if (!user.wallets.length) {
      logger.warn(`${logPrefix} No wallet found for user ID: ${userId}`);
      throw new Error(
        `Sorry kiddo, ${
          targetUsername ? `@${username} has` : "you have"
        } no wallet`
      );
    }

    const selectedWallet = user.wallets[0];
    logger.debug(`${logPrefix} Wallet address: ${selectedWallet.address}`);

    // Obtener balance de ETH
    const ethBalanceBN = await getWalletBalance(
      selectedWallet.address as Address
    );
    const ethHuman = parseFloat(formatUnits(ethBalanceBN, 18)).toFixed(4);

    // Construir mensaje
    const ownershipText = targetUsername
      ? `@${username} balance`
      : `Your balance`;
    let text =
      `<b>💰 ${ownershipText}:</b>\n` +
      `┌ ETH: <b>${ethHuman}</b>\n` +
      `└ <code>${selectedWallet.address}</code>\n\n`;

    // Procesar tokens
    if (selectedWallet.holdings.length > 0) {
      text += `<b>Tokens:</b>\n`;

      // Crear array con holdings para ordenarlos
      const sortedHoldings = selectedWallet.holdings.map((h) => {
        const balBN = BigInt(h.balance);
        const decimals = h.token.decimals || 18;
        const rawBalance = formatUnits(balBN, decimals);
        const tokenBalance = parseFloat(rawBalance);

        return {
          symbol: h.token.symbol,
          address: h.token.address,
          balance: tokenBalance,
          balanceBN: balBN,
          decimals: decimals,
        };
      });

      // Ordenar por balance (mayor a menor)
      sortedHoldings.sort((a, b) => b.balance - a.balance);

      // Mostrar los tokens ordenados
      for (const token of sortedHoldings) {
        const tokenBalanceFormatted = token.balance.toFixed(4);

        // Generate buy and sell links for the token
        try {
          const buyLink = generateTradeLink({
            tokenAddress: token.address as Address,
            mode: "buy",
          });
          const sellLink = generateTradeLink({
            tokenAddress: token.address as Address,
            mode: "sell",
          });
          text += `• ${token.symbol} <a href="${buyLink}">[Buy]</a> <a href="${sellLink}">[Sell]</a>: <b>${tokenBalanceFormatted}</b>\n`;
        } catch (error) {
          // Fallback to non-clickeable if link generation fails
          logger.warn(
            `Failed to generate trade link for ${token.symbol}:`,
            error
          );
          text += `• ${token.symbol}: <b>${tokenBalanceFormatted}</b>\n`;
        }
      }
    } else {
      text += `<i>No tokens found in vault</i>`;
    }

    // Añadir enlace de activación para usuarios pendientes que ven su propio balance
    if (isPendingUser && !targetUsername) {
      text += `\n${viviJoin()}`;
    }

    // Enviar respuesta
    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_parameters: { message_id },
      link_preview_options: { is_disabled: true },
    });

    logger.debug(
      `${logPrefix} Successfully displayed balance for user ID ${userId}${
        targetUsername ? ` (requested by ${ctx.from?.id})` : ""
      }${isPendingUser ? " (pending account)" : ""}`
    );
  } catch (error) {
    logger.error(
      `${logPrefix} Error: ${error instanceof Error ? error.stack : error}`
    );

    if (error instanceof Error) {
      await ctx.reply(error.message, {
        parse_mode: "HTML",
        reply_parameters: { message_id },
        link_preview_options: { is_disabled: true },
      });
    }
  }
}
