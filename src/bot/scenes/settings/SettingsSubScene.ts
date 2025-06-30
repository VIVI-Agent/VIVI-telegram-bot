import {
  BaseSubScene,
  BuySettingsFieldName,
  SellSettingsFieldName,
  GlobalSceneContext,
  SettingEditMode,
  SettingsSceneData,
} from "@types";
import { SettingsMenus } from "./SettingsMenus";
import { SettingsService } from "./SettingsService";
import { CB } from "./callbacks";
import { SpeedEnum } from "@prisma/client";
import { BuyAmountValidator } from "utils/inputValidators/BuyAmountValidator";
import { SellAmountValidator } from "utils/inputValidators/SellAmountValidator";
import { GENERIC_ERRORS } from "@texts";

/**
 * Settings sub-scene for managing user trading configuration.
 */
export class SettingsSubScene extends BaseSubScene<SettingsSceneData> {
  menus: SettingsMenus;

  private services: SettingsService;

  constructor(instanceId: string) {
    super(instanceId, "Settings");
    this.menus = new SettingsMenus(instanceId);
    this.services = new SettingsService(instanceId);
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    this.log("info", ctx, "Activating Settings scene");

    // Initialize scene data
    const sceneData: SettingsSceneData = {
      step: "main_settings",
      userId: ctx.from?.id || 0,
      username: ctx.from?.username || "",
      menuMessageId: undefined,
    };

    const user = await this.services.loadUserData(ctx);

    if (user) {
      sceneData.user = user;

      this.updateSceneData(ctx, sceneData);
      const menuMessageId = await this.menus.showSettingsMenu(ctx);

      if (menuMessageId) {
        sceneData.menuMessageId = menuMessageId;
        this.updateSceneData(ctx, sceneData);
      }
    }
  }

  async cleanup(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Cleaning up Settings scene");

    // Call parent cleanup for temp messages
    await super.cleanup(ctx);
  }

  async handleCallback(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<boolean> {
    this.log("debug", ctx, `Handling callback: ${callback}`);

    // Validate callback belongs to this instance
    const validation = this.validateCallbackInstanceId(callback);
    if (!validation) {
      this.log("debug", ctx, `InstanceId mismatch, skipping`);
      return false;
    }

    const { action } = validation;
    this.log("info", ctx, `Processing action: ${action}`);

    const sceneData = this.getSceneData(ctx);
    const user = sceneData.user!;
    const menuMessageId = sceneData.menuMessageId!;
    try {
      switch (action) {
        // Speed settings
        case CB.EDIT_SPEED_SETTINGS:
          await ctx.answerCbQuery();
          await this.menus.showSpeedMenu(ctx, user, menuMessageId);
          return true;
        // Buy settings
        case CB.EDIT_BUY_SETTINGS:
          await ctx.answerCbQuery();
          await this.menus.showBuySettingsMenu(ctx, user, menuMessageId);
          return true;
        // Sell settings
        case CB.EDIT_SELL_SETTINGS:
          await ctx.answerCbQuery();
          await this.menus.showSellSettingsMenu(ctx, user, menuMessageId);
          return true;
        // Main menu
        case CB.MAIN_MENU:
          await ctx.answerCbQuery();
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          await ctx.sceneManager.activateScene(ctx, "MainMenu");
          return true;
        // Dismiss settings
        case CB.DISMISS_SETTINGS:
          await ctx.answerCbQuery();
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          return true;
        // Back to settings root
        case CB.BACK_TO_SETTINGS_ROOT:
          await ctx.answerCbQuery();
          await this.menus.showSettingsMenu(ctx, menuMessageId);
          return true;
        // EDIT Speed settings
        case CB.SET_SPEED:
          await ctx.answerCbQuery();

          // Extraer el parámetro de speed seleccionado
          const speedValue = validation.params[0] as SpeedEnum;
          if (!speedValue) {
            this.log("warn", ctx, "No speed parameter provided");
            return true;
          }

          await this.services.updateUserSpeedSettings(ctx, speedValue);
          const updatedUserSpeed = await this.services.loadUserData(ctx);

          if (updatedUserSpeed) {
            sceneData.user = updatedUserSpeed;
            this.updateSceneData(ctx, sceneData);
            this.log("info", ctx, `Updated user speed to ${speedValue}`);
            await this.menus.showSpeedMenu(ctx, sceneData.user!, menuMessageId);
          }
          return true;
        // EDIT Buy settings
        case CB.EDIT_BUY_FIELD:
          await ctx.answerCbQuery();

          const fieldName = validation.params[0] as BuySettingsFieldName;
          this.log(
            "debug",
            ctx,
            `🔧 Setting editField for field: ${fieldName}`
          );
          this.log(
            "debug",
            ctx,
            `🔧 Current sceneData before update: ${JSON.stringify(sceneData)}`
          );

          sceneData.editField = {
            mode: SettingEditMode.BUY,
            fieldName: fieldName,
          };

          this.log(
            "debug",
            ctx,
            `🔧 EditField object created: ${JSON.stringify(
              sceneData.editField
            )}`
          );

          this.updateSceneData(ctx, sceneData);

          // Verificar que se guardó correctamente
          const verifyData = this.getSceneData(ctx);
          this.log(
            "debug",
            ctx,
            `🔧 SceneData after updateSceneData: ${JSON.stringify(verifyData)}`
          );
          this.log(
            "debug",
            ctx,
            `🔧 EditField after update: ${JSON.stringify(verifyData.editField)}`
          );

          await this.menus.askBuyFieldValue(ctx, fieldName);
          return true;
        case CB.EDIT_SELL_FIELD:
          await ctx.answerCbQuery();

          const fieldNameSell = validation.params[0] as SellSettingsFieldName;

          this.log(
            "debug",
            ctx,
            `🔧 Setting editField for field: ${fieldNameSell}`
          );
          this.log(
            "debug",
            ctx,
            `🔧 Current sceneData before update: ${JSON.stringify(sceneData)}`
          );

          sceneData.editField = {
            mode: SettingEditMode.SELL,
            fieldName: fieldNameSell,
          };

          this.log(
            "debug",
            ctx,
            `🔧 EditField object created: ${JSON.stringify(
              sceneData.editField
            )}`
          );

          this.updateSceneData(ctx, sceneData);
          const verifySellData = this.getSceneData(ctx);

          this.log(
            "debug",
            ctx,
            `🔧 SceneData after updateSceneData: ${JSON.stringify(
              verifySellData
            )}`
          );

          await this.menus.askSellFieldValue(ctx, fieldNameSell);
          return true;
        default:
          this.log("warn", ctx, `Unknown action: ${action}`);
          return false;
      }
    } catch (error) {
      await this.handleCallbackError(ctx, action, error);
      return true; // We handled it, even if there was an error
    }
  }

  async handleText(ctx: GlobalSceneContext, text: string): Promise<boolean> {
    this.log("debug", ctx, `📝 Handling text: ${text}`);

    const sceneData = this.getSceneData(ctx);
    const menuMessageId = sceneData.menuMessageId!;
    this.log(
      "debug",
      ctx,
      `📝 Retrieved sceneData: ${JSON.stringify(sceneData)}`
    );
    this.log(
      "debug",
      ctx,
      `📝 EditField from sceneData: ${JSON.stringify(sceneData.editField)}`
    );

    const editField = sceneData.editField;

    if (!editField) {
      return false;
    }

    this.log(
      "debug",
      ctx,
      `📝 EditField exists: mode=${editField.mode}, fieldName=${editField.fieldName}`
    );

    if (!editField.mode || !editField.fieldName) {
      this.log("warn", ctx, "❌ Invalid editField structure");
      return false;
    }

    // Procesar según el modo de edición
    switch (editField.mode) {
      case SettingEditMode.BUY:
        this.log(
          "info",
          ctx,
          `✅ Updating buy settings for ${editField.fieldName} with value: ${text}`
        );

        const validation = BuyAmountValidator.validate(text);
        if (!validation.isValid) {
          this.log("warn", ctx, `❌ Validation failed: ${validation.error}`);
          await ctx.reply(`❌ ${validation.error}`);
          return true;
        }

        this.log(
          "info",
          ctx,
          `✅ Validation passed, updating with value: ${validation.value}`
        );

        try {
          await this.services.updateUserBuySettings(
            ctx,
            editField.fieldName,
            validation.value!.toString()
          );

          // Limpiar editField después de actualización exitosa
          this.updateSceneData(ctx, { editField: undefined });
          this.log(
            "info",
            ctx,
            `✅ Successfully updated ${editField.fieldName} and cleared editField`
          );

          const updatedUser = await this.services.loadUserData(ctx);
          if (updatedUser) {
            sceneData.user = updatedUser;
            this.updateSceneData(ctx, sceneData);
          }
          await this.menus.showBuySettingsMenu(
            ctx,
            sceneData.user!,
            menuMessageId
          );
        } catch (error) {
          this.log("error", ctx, `❌ Error updating buy settings: ${error}`);
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          await ctx.reply(GENERIC_ERRORS.OLD_VERSION);
        }
        break;

      case SettingEditMode.SELL:
        this.log(
          "info",
          ctx,
          `📝 Updating sell settings for ${editField.fieldName} with value: ${text}`
        );

        const validationSell = SellAmountValidator.validate(text);
        if (!validationSell.isValid) {
          this.log(
            "warn",
            ctx,
            `❌ Validation failed: ${validationSell.error}`
          );
          await ctx.reply(`❌ ${validationSell.error}`);
          return true;
        }

        this.log(
          "info",
          ctx,
          `✅ Validation passed, updating with value: ${validationSell.value}`
        );

        try {
          await this.services.updateUserSellSettings(
            ctx,
            editField.fieldName as SellSettingsFieldName,
            validationSell.value!.toString()
          );

          // Limpiar editField después de actualización exitosa
          this.updateSceneData(ctx, { editField: undefined });
          this.log(
            "info",
            ctx,
            `✅ Successfully updated ${editField.fieldName} and cleared editField`
          );

          const updatedUser = await this.services.loadUserData(ctx);
          if (updatedUser) {
            sceneData.user = updatedUser;
            this.updateSceneData(ctx, sceneData);
          }
          await this.menus.showSellSettingsMenu(
            ctx,
            sceneData.user!,
            menuMessageId
          );
          break;
        } catch (error) {
          this.log("error", ctx, `❌ Error updating sell settings: ${error}`);
          await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
          await ctx.reply(GENERIC_ERRORS.OLD_VERSION);
        }
        break;

      default:
        this.log("warn", ctx, `📝 Unknown editField mode: ${editField.mode}`);
        await ctx.sceneManager.deactivateScene(ctx, this.instanceId);
        await ctx.reply(GENERIC_ERRORS.OLD_VERSION);
        break;
    }

    return true;
  }
}
