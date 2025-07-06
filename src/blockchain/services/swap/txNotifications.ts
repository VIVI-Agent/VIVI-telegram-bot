// src/services/txNotifications.ts

import { TransactionReceipt } from "viem";

import { explorerUrl } from "@client";
import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import { formatHash, viviJoin } from "@utils";

/**
 * Genera un enlace formateado HTML del símbolo con la acción correspondiente (buy/sell)
 * @param symbol - El símbolo del token a mostrar
 * @param tokenAddress - La dirección del token para el enlace
 * @param botUsername - El username del bot para construir el enlace
 * @param isGroupChat - Indica si la notificación es para un chat grupal
 * @param swapType - El tipo de operación ("Buy" | "Sell")
 * @returns HTML con el símbolo y enlace formateado
 */
function getFormattedSymbolLink(
  symbol: string,
  tokenAddress?: string,
  botUsername?: string,
  isGroupChat?: boolean,
  swapType?: "Buy" | "Sell"
): string {
  // Si no tenemos dirección del token o username del bot, retornamos el símbolo sin enlace
  if (!tokenAddress || !botUsername) {
    return symbol;
  }

  let action = "buy"; // Por defecto, siempre buy para chats grupales

  // En chats privados, el enlace depende del tipo de swap
  if (!isGroupChat && swapType) {
    // Si es una notificación de compra, enlace a vender
    // Si es una notificación de venta, enlace a comprar
    action = swapType === "Buy" ? "sell" : "buy";
  }

  const link = `https://t.me/${botUsername}?start=trade_${action}_${tokenAddress}`;
  return `<a href="${link}">${symbol}</a>`;
}

interface HandleTxNotificationsParams {
  ctx: GlobalSceneContext;
  txHash: string;
  waitReceipt: Promise<TransactionReceipt>;
  parseLogsFn?: (receipt: TransactionReceipt) => Promise<string>;
  onMinedFn?: (receipt: TransactionReceipt) => Promise<void>;
  swapType: "Buy" | "Sell"; // Cambiado a tipo específico en vez de string
  symbol?: string; // Símbolo del token
  tokenAddress?: string; // Dirección del token para construir enlaces
}

/**
 * handleTxNotifications:
 * Envía un primer mensaje con ⏳, luego espera waitReceipt,
 * y envía un segundo mensaje (o edita) indicando “✅” al confirmarse.
 * Sincroniza con receipt.status:
 * - 'reverted' => fallback “❌” msg
 * - 'success' => parseLogs, etc.
 */
export async function handleTxNotifications({
  ctx,
  txHash,
  waitReceipt,
  parseLogsFn,
  onMinedFn,
  swapType,
  symbol,
  tokenAddress,
}: HandleTxNotificationsParams) {
  const explorerLink = `${explorerUrl}/tx/${txHash}`;
  const shortTx = formatHash(txHash);

  // Determinar si es un chat grupal
  const isGroupChat = ctx.chat?.type !== "private";

  // Para el mensaje inicial, usamos el símbolo sin enlace
  let symbolDisplay = symbol || "";

  // ───────────────────────────────────────────────────────────
  // 1. Mensaje inicial  ⏳
  // ───────────────────────────────────────────────────────────
  let initialMessage = `${swapType} ⏳ <b>Hash:</b> <a href="${explorerLink}">${shortTx}</a>`;

  // Si tenemos símbolo, añadirlo al mensaje (sin enlace en la notificación pendiente)
  if (symbol) {
    initialMessage = `${swapType} ${symbolDisplay} ⏳ <b>Hash:</b> <a href="${explorerLink}">${shortTx}</a>`;
  }

  const init = await ctx.reply(initialMessage, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });

  // guardamos datos para editar
  const chatId = ctx.chat!.id;
  const msgId = init.message_id;

  // ───────────────────────────────────────────────────────────
  // 2. Esperar receipt
  // ───────────────────────────────────────────────────────────
  let receipt: TransactionReceipt;
  try {
    receipt = await waitReceipt;
  } catch (err) {
    logger.error(`${swapType} waitReceipt error:`, err);

    // Crear teclado con botón dismiss para errores de espera
    const errorKeyboard = {
      inline_keyboard: [
        [
          {
            text: "🗑️ Dismiss",
            callback_data: `DISMISS_TX_MSG:${msgId}`,
          },
        ],
      ],
    };

    await ctx.telegram.editMessageText(
      chatId,
      msgId,
      undefined,
      `${swapType} ❌ Error esperando confirmación.\n<b>Hash:</b> <a href="${explorerLink}">${shortTx}</a>`,
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: errorKeyboard,
      }
    );
    return;
  }

  // ───────────────────────────────────────────────────────────
  // 3. Verificar estado
  // ───────────────────────────────────────────────────────────
  if (receipt.status === "reverted") {
    // Crear teclado con botón dismiss para transacciones fallidas
    const failedKeyboard = {
      inline_keyboard: [
        [
          {
            text: "🗑️ Dismiss",
            callback_data: `DISMISS_TX_MSG:${msgId}`,
          },
        ],
      ],
    };

    await ctx.telegram.editMessageText(
      chatId,
      msgId,
      undefined,
      `${swapType} ❌ Transaction failed.\n<b>Hash:</b> <a href="${explorerLink}">${shortTx}</a>`,
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: failedKeyboard,
      }
    );
    return;
  }

  // Éxito: parsear logs y callbacks opcionales
  let details = `<b>Hash:</b> <a href="${explorerLink}">${shortTx}</a>`;
  if (parseLogsFn) {
    try {
      details += `\n${await parseLogsFn(receipt)}`;
    } catch (err) {
      logger.error("Error parseLogsFn:", err);
    }
  }

  if (onMinedFn) {
    try {
      await onMinedFn(receipt);
    } catch (err) {
      logger.error("Error onMinedFn:", err);
    }
  }

  // ───────────────────────────────────────────────────────────
  // 4. Editar mensaje final  ✅
  // ───────────────────────────────────────────────────────────

  // Formatear símbolo con enlace SOLO para mensajes confirmados
  let formattedSymbol = symbolDisplay;
  if (symbol && tokenAddress && ctx.botInfo?.username) {
    formattedSymbol = getFormattedSymbolLink(
      symbol,
      tokenAddress,
      ctx.botInfo.username,
      isGroupChat,
      swapType
    );
  }

  let finalMessage = `${swapType} ✅ ${details}`;

  // Si tenemos símbolo con enlace, añadirlo al mensaje final
  if (symbol) {
    finalMessage = `${swapType} ${formattedSymbol} ✅ ${details}`;
  }

  // Crear teclado con botón dismiss
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🗑️ Dismiss",
          callback_data: `DISMISS_TX_MSG:${msgId}`,
        },
      ],
    ],
  };

  await ctx.telegram.editMessageText(chatId, msgId, undefined, finalMessage, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
  });
}

interface ReplyTxNotificationsParams {
  ctx: GlobalSceneContext;
  userMessageId: number;
  txHash: string;
  waitReceipt: Promise<TransactionReceipt>;
  parseLogsFn?: (receipt: TransactionReceipt) => Promise<string>;
  onMinedFn?: (receipt: TransactionReceipt) => Promise<void>;
  swapType: "Buy" | "Sell"; // Indica tipo de operación
  amountIn: string; // e.g. "0.1234"
  symbol: string; // e.g. "USDC"
  tokenAddress?: string; // Dirección del token para construir el link
  botUsername?: string; // Username del bot para los enlaces
}

/**
 * replyTxNotifications:
 * Envía / edita un mensaje de confirmación en línea, atado a un userMessageId (por ejemplo,
 * el mensaje donde el usuario pidió el swap). Muestra "⏳" y luego al confirmar "✅" o "❌".
 * Maneja buy/sell con un formato predeterminado (ETH <-> tokens).
 */
export async function replyTxNotifications({
  ctx,
  userMessageId,
  txHash,
  waitReceipt,
  parseLogsFn,
  onMinedFn,
  swapType,
  amountIn,
  symbol,
  tokenAddress,
  botUsername,
}: ReplyTxNotificationsParams) {
  const explorerLink = `${explorerUrl}/tx/${txHash}`;
  const shortHash = formatHash(txHash);

  // Determinar si es un chat grupal
  const isGroupChat = ctx.chat?.type !== "private";

  // Para mensaje pendiente (⏳), usamos el símbolo sin enlace
  // El símbolo formateado con enlace se usará solo en la transacción confirmada

  // Texto inicial (⏳) - sin enlaces en el símbolo
  let lineInitial = "";
  if (swapType === "Buy") {
    // E.g. "Buy ⏳ 0.15 ETH for USDC" (sin enlace)
    lineInitial = `Buy ⏳ ${parseFloat(amountIn).toFixed(4)} ETH for ${symbol}`;
  } else {
    // E.g. "Sell ⏳ 100 USDC for ETH" (sin enlace)
    lineInitial = `Sell ⏳ ${parseFloat(amountIn).toFixed(
      4
    )} ${symbol} for ETH`;
  }

  // Enviamos / respondemos en el chat
  const initMsg = await ctx.reply(
    `${lineInitial}\nHash: <a href="${explorerLink}">${shortHash}</a>${
      ctx.chat?.type === "private" ? `` : `\n${viviJoin(ctx.from?.username)}`
    }`,
    {
      reply_parameters: { message_id: userMessageId },
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }
  );

  // Esperamos la confirmación
  let receipt: TransactionReceipt;
  try {
    receipt = await waitReceipt;
  } catch (err) {
    logger.error(`${swapType} waitReceipt error:`, err);
    await ctx.reply(`❌ Error waiting for ${swapType} tx confirmation.`, {
      reply_parameters: { message_id: userMessageId },
    });
    return;
  }

  // Chequeo si se revirtió
  if (receipt.status === "reverted") {
    // Editamos el mensaje para notificar fail
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      initMsg.message_id,
      undefined,
      `${swapType} ❌ Transaction failed.\nHash: <a href="${explorerLink}">${shortHash}</a>${
        ctx.chat?.type === "private" ? `` : `\n${viviJoin(ctx.from?.username)}`
      }`,
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }
    );
    return;
  }

  // parseLogsFn
  let details = `<a href="${explorerLink}">${shortHash}</a>\n`;
  if (parseLogsFn) {
    try {
      details += await parseLogsFn(receipt);
    } catch (err) {
      logger.error("Error parseLogsFn:", err);
    }
  }

  // Formatear el símbolo con el enlace correspondiente SOLO para transacciones confirmadas
  const formattedSymbol = getFormattedSymbolLink(
    symbol,
    tokenAddress,
    botUsername,
    isGroupChat,
    swapType
  );

  // Construimos el texto final (✅) - ahora SÍ con enlaces
  let lineFinal = "";
  if (swapType === "Buy") {
    lineFinal = `Buy ✅ ${amountIn} ETH for ${formattedSymbol}`;
  } else {
    lineFinal = `Sell ✅ ${amountIn} ${formattedSymbol} for ETH`;
  }

  // Editamos el mensaje inicial para reflejar la confirmación (status=1)
  await ctx.telegram.editMessageText(
    ctx.chat!.id,
    initMsg.message_id,
    undefined,
    `${lineFinal}\nHash: ${details}${
      ctx.chat?.type === "private" ? `` : `\n${viviJoin(ctx.from?.username)}`
    }`,
    {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }
  );

  // Llamamos a onMinedFn si existe
  if (onMinedFn) {
    try {
      await onMinedFn(receipt);
    } catch (err) {
      logger.error("Error onMinedFn:", err);
    }
  }
}

/**
 * replyTxNotificationsWithLinks:
 * Versión mejorada de replyTxNotifications que añade automáticamente tokenAddress y botUsername
 * para generar links a buy/sell en las notificaciones de transacciones
 */
export async function replyTxNotificationsWithLinks({
  ctx,
  userMessageId,
  txHash,
  waitReceipt,
  parseLogsFn,
  onMinedFn,
  swapType,
  amountIn,
  symbol,
  tokenAddress,
}: Omit<ReplyTxNotificationsParams, "botUsername"> & { tokenAddress: string }) {
  await replyTxNotifications({
    ctx,
    userMessageId,
    txHash,
    waitReceipt,
    parseLogsFn,
    onMinedFn,
    swapType,
    amountIn,
    symbol,
    tokenAddress,
    botUsername: ctx.botInfo?.username,
  });
}

/**
 * handleTxNotificationsWithLinks:
 * Versión mejorada de handleTxNotifications que añade automáticamente enlaces a los símbolos
 * de tokens en las notificaciones de transacciones
 */
export async function handleTxNotificationsWithLinks({
  ctx,
  txHash,
  waitReceipt,
  parseLogsFn,
  onMinedFn,
  swapType,
  symbol,
  tokenAddress,
}: Omit<HandleTxNotificationsParams, "botUsername"> & {
  symbol: string;
  tokenAddress: string;
}) {
  await handleTxNotifications({
    ctx,
    txHash,
    waitReceipt,
    parseLogsFn,
    onMinedFn,
    swapType,
    symbol,
    tokenAddress,
  });
}
