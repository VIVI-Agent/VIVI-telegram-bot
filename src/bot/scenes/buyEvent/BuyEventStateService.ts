import { logger } from "@logger";
import { redisStore } from "@config";
import { createClient } from "redis";

export interface BuyEventState {
  step: number;
  name?: string;
  bannerFileId?: string;
  tokenId?: number;
  tempMessageIds: number[];
}

export class BuyEventStateService {
  private redis: ReturnType<typeof createClient>;

  constructor() {
    this.redis = createClient({ url: redisStore.REDIS_STORE_URL });
    this.redis.connect().catch(console.error);
  }

  private getStateKey(chatId: number, instanceId: string): string {
    return `buyevent:${chatId}:${instanceId}`;
  }

  async getState(
    chatId: number,
    instanceId: string
  ): Promise<BuyEventState | null> {
    try {
      const key = this.getStateKey(chatId, instanceId);
      const data = await this.redis.get(key);

      if (!data) {
        logger.debug(`[BuyEventStateService] No state found for key: ${key}`);
        return null;
      }

      const state = JSON.parse(data) as BuyEventState;
      logger.debug(
        `[BuyEventStateService] Retrieved state for key ${key}:`,
        JSON.stringify(state)
      );
      return state;
    } catch (error) {
      logger.error(`[BuyEventStateService] Error getting state:`, error);
      return null;
    }
  }

  async setState(
    chatId: number,
    instanceId: string,
    state: BuyEventState
  ): Promise<void> {
    try {
      const key = this.getStateKey(chatId, instanceId);
      const data = JSON.stringify(state);

      await this.redis.setEx(key, 3600, data); // 1 hour expiration

      logger.debug(
        `[BuyEventStateService] Saved state for key ${key}:`,
        JSON.stringify(state)
      );
    } catch (error) {
      logger.error(`[BuyEventStateService] Error setting state:`, error);
    }
  }

  async updateState(
    chatId: number,
    instanceId: string,
    updates: Partial<BuyEventState>
  ): Promise<void> {
    try {
      const currentState = (await this.getState(chatId, instanceId)) || {
        step: 1,
        tempMessageIds: [],
      };

      const newState = { ...currentState, ...updates };
      await this.setState(chatId, instanceId, newState);

      logger.debug(
        `[BuyEventStateService] Updated state for key ${this.getStateKey(
          chatId,
          instanceId
        )}:`,
        JSON.stringify(newState)
      );
    } catch (error) {
      logger.error(`[BuyEventStateService] Error updating state:`, error);
    }
  }

  async deleteState(chatId: number, instanceId: string): Promise<void> {
    try {
      const key = this.getStateKey(chatId, instanceId);
      await this.redis.del(key);

      logger.debug(`[BuyEventStateService] Deleted state for key: ${key}`);
    } catch (error) {
      logger.error(`[BuyEventStateService] Error deleting state:`, error);
    }
  }
}

// Singleton instance
export const buyEventStateService = new BuyEventStateService();
