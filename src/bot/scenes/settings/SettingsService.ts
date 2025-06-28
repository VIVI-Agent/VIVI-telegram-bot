import { UserWithSettings } from "@domain";
import { SpeedEnum } from "@prisma/client";
import { BaseService, BuySettingsFieldName, GlobalSceneContext } from "@types";

export class SettingsService extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "SettingsService");
  }

  public async loadUserData(
    ctx: GlobalSceneContext
  ): Promise<UserWithSettings | null> {
    this.log("info", ctx, "Loading user data");

    try {
      if (ctx.user.id) {
        const user = await ctx.services.userService.getUserWithSettings(
          ctx.user.id
        );

        return user;
      }
    } catch (error) {
      this.logError(ctx, "loadUserData", error);
    }

    return null;
  }

  public async updateUserSpeedSettings(
    ctx: GlobalSceneContext,
    speed: SpeedEnum
  ): Promise<void> {
    try {
      await ctx.services.userService.updateUserSpeed(ctx.user.id, speed);
      this.log("info", ctx, `Updated user speed to ${speed}`);
    } catch (error) {
      this.logError(ctx, "updateUserSpeedSettings", error);
    }
  }

  public async updateUserBuySettings(
    ctx: GlobalSceneContext,
    fieldName: BuySettingsFieldName,
    value: string
  ): Promise<void> {
    try {
      await ctx.services.buySettingsService.updateBuySettings(
        ctx.user.id,
        fieldName,
        Number(value)
      );
    } catch (error) {
      this.logError(ctx, "updateUserBuySettings", error);
    }
  }
}
