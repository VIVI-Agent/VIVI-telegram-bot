import { UserWithSettings } from "@domain";
import { BaseService, GlobalSceneContext } from "@types";

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
}
