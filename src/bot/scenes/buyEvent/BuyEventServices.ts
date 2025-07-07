import { BaseService, GlobalSceneContext } from "@types";
import { logger } from "@logger";

export class BuyEventServices extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "BuyEventServices");
  }

  async checkIfUserIsAdmin(ctx: GlobalSceneContext): Promise<boolean> {
    try {
      if (!ctx.chat?.id || !ctx.from?.id) {
        return false;
      }

      const chatMember = await ctx.telegram.getChatMember(
        ctx.chat.id,
        ctx.from.id
      );

      return (
        chatMember.status === "creator" || chatMember.status === "administrator"
      );
    } catch (error) {
      this.log("error", ctx, `Error checking admin status: ${error}`);
      return false;
    }
  }

  async getActiveGroupEvent(
    ctx: GlobalSceneContext,
    groupChatId: string
  ): Promise<string | undefined> {
    try {
      const activeInstanceId =
        await ctx.services.buyEventService.getActiveGroupEvent(groupChatId);

      if (activeInstanceId) {
        this.log(
          "info",
          ctx,
          `Found active BuyEvent scene: ${activeInstanceId} for group: ${groupChatId}`
        );
        return activeInstanceId;
      }
    } catch (error) {
      this.log("error", ctx, `Error getting active group event: ${error}`);
      return;
    }
  }
}
