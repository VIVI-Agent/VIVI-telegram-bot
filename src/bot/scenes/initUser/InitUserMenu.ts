import { BaseMenus, GlobalSceneContext } from "@types";
import { INITUSER_TEXTS } from "./messages";
import { CALLBACKS } from "./callbacks";

export class InitUserMenus extends BaseMenus {
  constructor(instanceId: string) {
    super(instanceId, "InitUserMenus");
  }

  public async showInitUserMenu(
    ctx: GlobalSceneContext,
    wallet: any
  ): Promise<number> {
    this.log("info", ctx, "Showing InitUser menu");
    // Show private key message
    const message = await ctx.reply(
      INITUSER_TEXTS.FUNCTIONS.getPrivateKeyMessage(
        wallet.address,
        wallet.privateKey
      ),
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: INITUSER_TEXTS.MESSAGES.CONFIRM_AND_DELETE_PK,
                callback_data: this.createCallback(
                  CALLBACKS.CONFIRM_PRIVATE_KEY
                ),
              },
            ],
          ],
        },
      }
    );
    return message.message_id;
  }
}
