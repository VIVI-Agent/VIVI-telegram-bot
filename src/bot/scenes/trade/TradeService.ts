import { findOrCreateToken } from "@blockchain";
import { BaseService, GlobalSceneContext } from "../../types";
import { Address } from "viem";
import { AddressValidator } from "@utils";
import { TRADE_TEXTS } from "./messages";

export class TradeService extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "TradeService");
  }

  /**
   * Load user trade data
   */
  async findToken(ctx: GlobalSceneContext, tokenAddress: Address) {
    try {
      this.log("info", ctx, `Loading trade data for user: ${ctx.user.id}`);
      this.log("info", ctx, `Token address: ${tokenAddress}`);
      if (!AddressValidator.parseEthereumAddress(tokenAddress)) {
        throw new Error(TRADE_TEXTS.ERRORS.TOKEN_NOT_FOUND);
      }

      return await findOrCreateToken(ctx, tokenAddress);
    } catch (error) {
      this.log("error", ctx, `Error loading trade data: ${error}`);
      throw new Error(TRADE_TEXTS.ERRORS.TOKEN_NOT_FOUND);
    }
  }

  /**
   * Execute buy order
   */
  async executeBuyOrder(
    ctx: GlobalSceneContext,
    tokenAddress: string,
    amount: string
  ) {
    try {
      this.log("info", ctx, `Executing buy order for user: ${ctx.user.id}`);

      // TODO: Implement buy order logic
      throw new Error("Buy order not implemented yet");
    } catch (error) {
      this.log("error", ctx, `Error executing buy order: ${error}`);
      throw error;
    }
  }

  /**
   * Execute sell order
   */
  async executeSellOrder(
    ctx: GlobalSceneContext,
    tokenAddress: string,
    amount: string
  ) {
    try {
      this.log("info", ctx, `Executing sell order for user: ${ctx.user.id}`);

      // TODO: Implement sell order logic
      throw new Error("Sell order not implemented yet");
    } catch (error) {
      this.log("error", ctx, `Error executing sell order: ${error}`);
      throw error;
    }
  }
}
