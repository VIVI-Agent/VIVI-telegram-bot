// src/blockchain/services/swap/v4/integratedService.ts
import { Address, Hex, formatUnits, createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { logger } from "@logger";
import { getV4QuoteBuy, getV4QuoteSell } from "./quoter";
import { VIVIUniswapV4ABI } from "@abis";
import {
  IntegratedTradeResult,
  V4BuyParams,
  V4IntegratedBuyParams,
  V4IntegratedSellParams,
  V4SellParams,
} from "../types";
import { ensurePermit2AllowanceLogic } from "../../permit2/ensurePermit2Allowance";
import { ensureAllowanceLogic } from "../../token/ensureAllowance";
import { publicClientDRPC } from "@client";
import { executeBuyV4, executeSellV4 } from "./contractService";

export async function executeV4IntegratedBuy(
  params: V4IntegratedBuyParams
): Promise<IntegratedTradeResult> {
  const { ctx, walletEntity, privateKey, contractAddress, tokenAddress, ethAmount, feeBps, slippagePercent, additionalFeeReceivers = [] } = params;

  try {
    logger.info(`[V4:Integrated] BUY ${formatUnits(ethAmount, 18)} ETH`);

    const quote = await getV4QuoteBuy(publicClientDRPC, tokenAddress, ethAmount, 18);
    if (!quote) return { hash: "0x0" as `0x${string}`, success: false, error: "No V4 liquidity available for this token" };

    const expectedOut = BigInt(quote.amountOut);
    const slippageAmount = (expectedOut * BigInt(slippagePercent * 100)) / 10000n;
    const minAmountOut = expectedOut - slippageAmount;

    // Approve WETH Permit2 (wrap path)
    try {
      const account = privateKeyToAccount(privateKey);
      const walletClient = createWalletClient({ account, chain: base, transport: http(process.env.RPC_URL) }).extend(publicActions);
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      const approveHash = await walletClient.writeContract({ address: contractAddress, abi: VIVIUniswapV4ABI, functionName: "approveWETHPermit2", args: [ethAmount, expiration], gas: 200_000n });
      await walletClient.waitForTransactionReceipt({ hash: approveHash });
    } catch (approveError) {
      throw new Error(`WETH approval failed: ${approveError}`);
    }

    const tradeParams: V4BuyParams = { contractAddress, privateKey, poolKey: quote.poolKey, ethAmount, minAmountOut, feeBps, additionalFeeReceivers, gasLimit: 1_000_000n };
    const result = await executeBuyV4(tradeParams);
    return { ...result, quote, actualAmountOut: quote.amountOut, formattedAmountOut: quote.formattedOut };
  } catch (error: any) {
    logger.error(`[V4:Integrated] BUY error: ${error.message}`);
    return { hash: "0x0" as `0x${string}`, success: false, error: error.message };
  }
}

export async function executeV4IntegratedSell(
  params: V4IntegratedSellParams
): Promise<IntegratedTradeResult> {
  const { ctx, walletEntity, privateKey, contractAddress, tokenAddress, tokenAmount, feeBps, slippagePercent, decimalsIn, additionalFeeReceivers = [] } = params;

  try {
    logger.info(`[V4:Integrated] SELL ${formatUnits(tokenAmount, decimalsIn)} tokens`);

    const quote = await getV4QuoteSell(publicClientDRPC, tokenAddress, tokenAmount, decimalsIn, 18);
    if (!quote) return { hash: "0x0" as `0x${string}`, success: false, error: "No V4 liquidity available for this token" };

    const expectedOut = BigInt(quote.amountOut);
    const slippageAmount = (expectedOut * BigInt(slippagePercent * 100)) / 10000n;
    const minAmountOut = expectedOut - slippageAmount;

    // Ensure allowances
    await ensureAllowanceLogic(ctx, { walletEntity, tokenAddress, requiredAmount: tokenAmount, spender: contractAddress, privateKey });
    await ensurePermit2AllowanceLogic(ctx, { walletEntity, tokenAddress, requiredAmount: tokenAmount, spender: contractAddress, privateKey, viviContractAddress: contractAddress });

    const tradeParams: V4SellParams = { contractAddress, privateKey, poolKey: quote.poolKey, tokenAmount, minAmountOut, feeBps, additionalFeeReceivers, gasLimit: 1_200_000n };
    const result = await executeSellV4(tradeParams);
    return { ...result, quote, actualAmountOut: quote.amountOut, formattedAmountOut: quote.formattedOut };
  } catch (error: any) {
    logger.error(`[V4:Integrated] SELL error: ${error.message}`);
    return { hash: "0x0" as `0x${string}`, success: false, error: error.message };
  }
}

