import { Decimal } from "@prisma/client/runtime/library";
import { Address, formatUnits } from "viem";
import { logger } from "@logger";

import { ERC20_ABI } from "@abis";
import { publicClientDRPC } from "@client";

import {
  getTokenFinancialInfo,
  getTokenSocialInfo,
  getCoingeckoEthPrice,
} from "@services";
import { getBestDexForSellTokenToEth, findOrCreateToken } from "@blockchain";
import { getBestDexForBuyEthToToken } from "../priceComparison/priceComparisonService";

import { GlobalSceneContext } from "@types";

export async function getTokenExternalInfo(
  ctx: GlobalSceneContext,
  tokenAddress: Address,
  chain: string = "base"
): Promise<{
  marketCap: Decimal | undefined;
  totalSupply: string | undefined;
  circulatingSupply: string | undefined;
  holders: string | undefined; // Add holders to return type
  website: string | undefined;
  telegramLink: string | undefined;
  twitterLink: string | undefined;
}> {
  try {
    // Step 1: Try to get data from Dextools first
    const dextoolsFinancialInfo = await getTokenFinancialInfo(
      chain,
      tokenAddress
    );
    const dextoolsSocialInfo = await getTokenSocialInfo(chain, tokenAddress);

    console.log(`🎯 [TOKEN EXTERNAL INFO] Processing ${tokenAddress}:`);
    console.log(`   🔢 Dextools Financial Info:`, dextoolsFinancialInfo);
    console.log(`   🌐 Dextools Social Info:`, dextoolsSocialInfo);

    // 🎯 MARKET CAP PRIORITY LOGIC
    // 1. If Dextools provides mcap, use it
    // 2. If no mcap but fdv available, use fdv as market cap
    // 3. If no fdv but mcap available, use mcap
    // 4. If none available, calculate from bestDex

    let marketCapFromDextools: Decimal | undefined;
    let marketCapSource = "none";

    if (dextoolsFinancialInfo?.mcap) {
      marketCapFromDextools = new Decimal(
        dextoolsFinancialInfo.mcap.toString()
      );
      marketCapSource = "mcap";
      console.log(
        `✅ [MARKET CAP PRIORITY] Using Dextools mcap: $${dextoolsFinancialInfo.mcap}`
      );
    } else if (dextoolsFinancialInfo?.fdv) {
      marketCapFromDextools = new Decimal(dextoolsFinancialInfo.fdv.toString());
      marketCapSource = "fdv";
      console.log(
        `✅ [MARKET CAP PRIORITY] Using Dextools fdv as market cap: $${dextoolsFinancialInfo.fdv}`
      );
    } else {
      console.log(
        `⚠️ [MARKET CAP PRIORITY] No Dextools mcap or fdv available, will calculate from bestDex`
      );
    }

    // If we have market cap from Dextools, return it immediately
    if (marketCapFromDextools) {
      const result = {
        marketCap: marketCapFromDextools,
        totalSupply: dextoolsFinancialInfo?.totalSupply?.toString(),
        circulatingSupply: dextoolsFinancialInfo?.circulatingSupply?.toString(),
        holders: dextoolsFinancialInfo?.holders?.toString(),
        website: dextoolsSocialInfo?.socialInfo?.website,
        telegramLink: dextoolsSocialInfo?.socialInfo?.telegram,
        twitterLink: dextoolsSocialInfo?.socialInfo?.twitter,
      };

      console.log(
        `✅ [TOKEN EXTERNAL INFO] Using Dextools ${marketCapSource} for ${tokenAddress}:`
      );
      console.log(`   📊 Market Cap: $${marketCapFromDextools}`);
      console.log(`   👥 Holders: ${result.holders}`);
      console.log(`   📜 Total Supply: ${result.totalSupply}`);

      return result;
    }

    // Get token decimals
    const token = await findOrCreateToken(ctx, tokenAddress);
    const decimals = token?.decimals;
    if (!decimals) {
      throw new Error("Decimals not found");
    }

    // Calculate exact price of 1 token in ETH using sell quote (more accurate for market cap)
    // We'll use a small amount of tokens to minimize price impact
    const smallTokenAmount = BigInt(10) ** BigInt(decimals); // 1 token
    const feeTiers = [100, 500, 3000, 10000];

    let ethPerToken: number;
    try {
      // Use sell quote for more accurate market cap calculation (avoids buy-side price impact)
      const quoteResult = await getBestDexForSellTokenToEth({
        publicClient: publicClientDRPC,
        tokenIn: tokenAddress,
        feeTiers,
        amountTokenIn: smallTokenAmount, // Quote for exactly 1 token
      });

      if (!quoteResult.best) {
        throw new Error("No liquidity pools found for token");
      }

      // Calculate ETH per token: ETH received / tokens sold
      const ethReceived = Number(quoteResult.best.formattedOut);
      ethPerToken = ethReceived; // This gives us ETH per token directly
      logger.info(
        `[calculateTokenMarketCap] Price of 1 token: ${ethPerToken} ETH (calculated from sell quote: 1 token = ${ethReceived} ETH)`
      );
    } catch (error) {
      logger.error(
        `[calculateTokenMarketCap] Error getting token price: ${error}`
      );

      const priceErrorResult = {
        marketCap: undefined,
        totalSupply: dextoolsFinancialInfo?.totalSupply?.toString(),
        circulatingSupply: dextoolsFinancialInfo?.circulatingSupply?.toString(),
        holders: dextoolsFinancialInfo?.holders?.toString(), // Include holders even if we couldn't calculate market cap
        website: dextoolsSocialInfo?.socialInfo?.website,
        telegramLink: dextoolsSocialInfo?.socialInfo?.telegram,
        twitterLink: dextoolsSocialInfo?.socialInfo?.twitter,
      };

      console.log(
        `⚠️ [TOKEN EXTERNAL INFO] Price error fallback for ${tokenAddress}:`
      );
      console.log(`   👥 Holders from Dextools: ${priceErrorResult.holders}`);
      console.log(
        `   📜 Total Supply from Dextools: ${priceErrorResult.totalSupply}`
      );

      return priceErrorResult;
    }

    // Get ETH price in USD
    let ethPriceUsd: number;
    try {
      ethPriceUsd = await getCoingeckoEthPrice();
    } catch (error) {
      logger.error(
        `[calculateTokenMarketCap] Error getting ETH price: ${error}`
      );
      return {
        marketCap: undefined,
        totalSupply: dextoolsFinancialInfo?.totalSupply?.toString(),
        circulatingSupply: dextoolsFinancialInfo?.circulatingSupply?.toString(),
        holders: dextoolsFinancialInfo?.holders?.toString(), // Include holders even if we couldn't calculate market cap
        website: dextoolsSocialInfo?.socialInfo?.website,
        telegramLink: dextoolsSocialInfo?.socialInfo?.telegram,
        twitterLink: dextoolsSocialInfo?.socialInfo?.twitter,
      };
    }

    // Calculate token price in USD directly
    const tokenPriceUsd = ethPerToken * ethPriceUsd;

    // Determine which supply to use for market cap calculation
    let supplyToUse: number | undefined;
    let supplyType: "circulating" | "total" = "total";

    console.log(`🔍 [SUPPLY DEBUG] Supply selection for ${tokenAddress}:`);
    console.log(
      `   📊 Dextools circulatingSupply: ${dextoolsFinancialInfo?.circulatingSupply}`
    );
    console.log(
      `   📜 Dextools totalSupply: ${dextoolsFinancialInfo?.totalSupply}`
    );
    console.log(
      `   🔢 Dextools totalSupply type: ${typeof dextoolsFinancialInfo?.totalSupply}`
    );

    // Prioritize circulating supply from Dextools if available
    if (dextoolsFinancialInfo?.circulatingSupply) {
      supplyToUse = dextoolsFinancialInfo.circulatingSupply;
      supplyType = "circulating";
      console.log(
        `✅ [SUPPLY DEBUG] Using Dextools circulating supply: ${supplyToUse}`
      );
    }
    // Then try total supply from Dextools
    else if (dextoolsFinancialInfo?.totalSupply) {
      supplyToUse = dextoolsFinancialInfo.totalSupply;
      console.log(
        `✅ [SUPPLY DEBUG] Using Dextools total supply: ${supplyToUse}`
      );
    }
    // Finally get total supply from blockchain if needed
    else {
      console.log(
        `⚠️ [SUPPLY DEBUG] No Dextools supply available, getting from blockchain`
      );
      try {
        const totalSupply = await publicClientDRPC.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "totalSupply",
        });
        supplyToUse = Number(formatUnits(totalSupply, decimals));
        console.log(
          `✅ [SUPPLY DEBUG] Using blockchain total supply: ${supplyToUse}`
        );
      } catch (error) {
        logger.error(
          `[calculateTokenMarketCap] Error getting totalSupply: ${error}`
        );
        return {
          marketCap: undefined,
          totalSupply: undefined,
          circulatingSupply: undefined,
          holders: dextoolsFinancialInfo?.holders?.toString(),
          website: dextoolsSocialInfo?.socialInfo?.website,
          telegramLink: dextoolsSocialInfo?.socialInfo?.telegram,
          twitterLink: dextoolsSocialInfo?.socialInfo?.twitter,
        };
      }
    }

    console.log(
      `🎯 [SUPPLY DEBUG] Final supply selection: ${supplyToUse} (${supplyType})`
    );

    // Calculate market cap from bestDex (fallback when Dextools data not available)
    if (supplyToUse) {
      console.log(
        `🧮 [MARKET CAP FALLBACK] Calculation details (no Dextools mcap/fdv):`
      );
      console.log(`   💰 Token price USD: ${tokenPriceUsd}`);
      console.log(`   📊 Supply used: ${supplyToUse}`);
      console.log(`   🔢 Supply type: ${supplyType}`);

      const marketCapNumber = tokenPriceUsd * supplyToUse;
      const marketCap = new Decimal(marketCapNumber.toString());

      console.log(
        `   🎯 Calculated market cap (fallback): $${marketCapNumber}`
      );
      console.log(
        `   📈 Expected with Dextools supply: $${
          tokenPriceUsd * 99990151333.5639
        }`
      );

      logger.info(
        `[calculateTokenMarketCap] Calculated market cap using ${supplyType} supply (fallback): $${marketCapNumber}`
      );

      const calculatedResult = {
        marketCap,
        totalSupply:
          dextoolsFinancialInfo?.totalSupply?.toString() ||
          formatUnits(BigInt(supplyToUse * 10 ** decimals), decimals),
        circulatingSupply:
          supplyType === "circulating" ? String(supplyToUse) : undefined,
        holders: dextoolsFinancialInfo?.holders?.toString(), // Include holders even if we couldn't calculate market cap
        website: dextoolsSocialInfo?.socialInfo?.website,
        telegramLink: dextoolsSocialInfo?.socialInfo?.telegram,
        twitterLink: dextoolsSocialInfo?.socialInfo?.twitter,
      };

      console.log(
        `🎯 [TOKEN EXTERNAL INFO] Fallback calculated result for ${tokenAddress}:`
      );
      console.log(`   📊 Market Cap (bestDex): $${marketCapNumber}`);
      console.log(`   👥 Holders: ${calculatedResult.holders}`);
      console.log(`   📜 Total Supply: ${calculatedResult.totalSupply}`);

      return calculatedResult;
    }

    const finalResult = {
      marketCap: undefined,
      totalSupply: undefined,
      circulatingSupply: undefined,
      holders: dextoolsFinancialInfo?.holders?.toString(), // Include holders even if we couldn't calculate market cap
      website: dextoolsSocialInfo?.socialInfo?.website,
      telegramLink: dextoolsSocialInfo?.socialInfo?.telegram,
      twitterLink: dextoolsSocialInfo?.socialInfo?.twitter,
    };

    console.log(`🔚 [TOKEN EXTERNAL INFO] Final result for ${tokenAddress}:`);
    console.log(`   👥 Holders: ${finalResult.holders}`);
    console.log(`   📜 Total Supply: ${finalResult.totalSupply}`);
    console.log(`   📊 Market Cap: ${finalResult.marketCap}`);

    return finalResult;
  } catch (error) {
    logger.error(`[calculateTokenMarketCap] Unexpected error: ${error}`);
    return {
      marketCap: undefined,
      totalSupply: undefined,
      circulatingSupply: undefined,
      holders: undefined, // Include holders even if we couldn't calculate market cap
      website: undefined,
      telegramLink: undefined,
      twitterLink: undefined,
    };
  }
}
