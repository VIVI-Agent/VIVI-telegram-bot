import { GlobalSceneContext } from "@types";
import { logger } from "@logger";

/**
 * MainMenu business logic services
 */
export class MainMenuServices {
  private instanceId: string;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  /**
   * Loads user data with wallets for the main menu
   */
  public async loadUserData(ctx: GlobalSceneContext): Promise<any | null> {
    const userId = ctx.from?.id;

    if (!userId) {
      logger.warn(
        `[MainMenuServices:loadUserData] Missing user ID - instanceId: ${this.instanceId}`
      );
      return null;
    }

    try {
      logger.info(
        `[MainMenuServices:loadUserData] Loading user data for ${userId} - instanceId: ${this.instanceId}`
      );

      // Get user by Telegram ID
      const user = await ctx.services.userService.getUserByTgId(userId);

      if (!user) {
        logger.warn(
          `[MainMenuServices:loadUserData] User not found for tgId ${userId} - instanceId: ${this.instanceId}`
        );
        return null;
      }

      // Load user's wallets
      logger.debug(
        `[MainMenuServices:loadUserData] Loading wallets for user ${user.id} - instanceId: ${this.instanceId}`
      );
      const wallets = await ctx.services.walletService.getUserWallets(user.id);

      logger.info(
        `[MainMenuServices:loadUserData] Loaded ${wallets.length} wallets for user ${userId} - instanceId: ${this.instanceId}`
      );

      // Build user data with wallets and other properties
      const userWithWallets = {
        ...user,
        wallets: wallets,
        points: user.points || 0,
        referralPoints: user.referralPoints || 0,
        totalVolumeBoughtWei: user.totalVolumeBoughtWei || 0,
        totalVolumeSoldWei: user.totalVolumeSoldWei || 0,
      };

      logger.info(
        `[MainMenuServices:loadUserData] Successfully loaded user data for ${userId} - instanceId: ${this.instanceId}`
      );
      return userWithWallets;
    } catch (error) {
      logger.error(
        `[MainMenuServices:loadUserData] Error loading user data for ${userId}: ${
          error instanceof Error ? error.stack : error
        } - instanceId: ${this.instanceId}`
      );
      return null;
    }
  }

  /**
   * Handles navigation to Buy scene
   */
  public async navigateToBuy(ctx: GlobalSceneContext): Promise<void> {
    logger.info(
      `[MainMenuServices:navigateToBuy] Navigating to Buy - instanceId: ${this.instanceId}`
    );

    try {
      await ctx.answerCbQuery("🚀 Buy feature coming soon!");
      // TODO: Activate Buy scene when implemented
      // await ctx.sceneManager.activateScene(ctx, "Buy");
    } catch (error) {
      logger.error(
        `[MainMenuServices:navigateToBuy] Error: ${error} - instanceId: ${this.instanceId}`
      );
      await ctx.answerCbQuery("❌ Error navigating to Buy");
    }
  }

  /**
   * Handles navigation to Sell scene
   */
  public async navigateToSell(ctx: GlobalSceneContext): Promise<void> {
    logger.info(
      `[MainMenuServices:navigateToSell] Navigating to Sell - instanceId: ${this.instanceId}`
    );

    try {
      await ctx.answerCbQuery("💰 Sell feature coming soon!");
      // TODO: Activate Sell scene when implemented
      // await ctx.sceneManager.activateScene(ctx, "Sell");
    } catch (error) {
      logger.error(
        `[MainMenuServices:navigateToSell] Error: ${error} - instanceId: ${this.instanceId}`
      );
      await ctx.answerCbQuery("❌ Error navigating to Sell");
    }
  }

  /**
   * Handles navigation to Wallets scene
   */
  public async navigateToWallets(ctx: GlobalSceneContext): Promise<void> {
    logger.info(
      `[MainMenuServices:navigateToWallets] Navigating to Wallets - instanceId: ${this.instanceId}`
    );

    try {
      await ctx.answerCbQuery("💼 Wallets feature coming soon!");
      // TODO: Activate Wallets scene when implemented
      // await ctx.sceneManager.activateScene(ctx, "Wallets");
    } catch (error) {
      logger.error(
        `[MainMenuServices:navigateToWallets] Error: ${error} - instanceId: ${this.instanceId}`
      );
      await ctx.answerCbQuery("❌ Error navigating to Wallets");
    }
  }

  /**
   * Handles navigation to Holdings scene
   */
  public async navigateToHoldings(ctx: GlobalSceneContext): Promise<void> {
    logger.info(
      `[MainMenuServices:navigateToHoldings] Navigating to Holdings - instanceId: ${this.instanceId}`
    );

    try {
      await ctx.answerCbQuery("💰 Holdings feature coming soon!");
      // TODO: Activate Holdings scene when implemented
      // await ctx.sceneManager.activateScene(ctx, "Holdings");
    } catch (error) {
      logger.error(
        `[MainMenuServices:navigateToHoldings] Error: ${error} - instanceId: ${this.instanceId}`
      );
      await ctx.answerCbQuery("❌ Error navigating to Holdings");
    }
  }

  /**
   * Handles navigation to Withdraw scene
   */
  public async navigateToWithdraw(ctx: GlobalSceneContext): Promise<void> {
    logger.info(
      `[MainMenuServices:navigateToWithdraw] Navigating to Withdraw - instanceId: ${this.instanceId}`
    );

    try {
      await ctx.answerCbQuery("📤 Withdraw feature coming soon!");
      // TODO: Activate Withdraw scene when implemented
      // await ctx.sceneManager.activateScene(ctx, "Withdraw");
    } catch (error) {
      logger.error(
        `[MainMenuServices:navigateToWithdraw] Error: ${error} - instanceId: ${this.instanceId}`
      );
      await ctx.answerCbQuery("❌ Error navigating to Withdraw");
    }
  }

  /**
   * Handles navigation to Settings scene
   */
  public async navigateToSettings(ctx: GlobalSceneContext): Promise<void> {
    logger.info(
      `[MainMenuServices:navigateToSettings] Navigating to Settings - instanceId: ${this.instanceId}`
    );

    try {
      await ctx.answerCbQuery("⚙️ Settings feature coming soon!");
      // TODO: Activate Settings scene when implemented
      // await ctx.sceneManager.activateScene(ctx, "Settings");
    } catch (error) {
      logger.error(
        `[MainMenuServices:navigateToSettings] Error: ${error} - instanceId: ${this.instanceId}`
      );
      await ctx.answerCbQuery("❌ Error navigating to Settings");
    }
  }

  /**
   * Handles referral link generation
   */
  public async handleReferralLink(ctx: GlobalSceneContext): Promise<void> {
    logger.info(
      `[MainMenuServices:handleReferralLink] Generating referral link - instanceId: ${this.instanceId}`
    );

    try {
      await ctx.answerCbQuery("🤝 Referral feature coming soon!");
      // TODO: Generate and show referral link
    } catch (error) {
      logger.error(
        `[MainMenuServices:handleReferralLink] Error: ${error} - instanceId: ${this.instanceId}`
      );
      await ctx.answerCbQuery("❌ Error generating referral link");
    }
  }

  /**
   * Handles login/dashboard access
   */
  public async handleLogin(ctx: GlobalSceneContext): Promise<void> {
    logger.info(
      `[MainMenuServices:handleLogin] Handling login - instanceId: ${this.instanceId}`
    );

    try {
      await ctx.answerCbQuery("🔐 Dashboard access coming soon!");
      // TODO: Generate login link or token
    } catch (error) {
      logger.error(
        `[MainMenuServices:handleLogin] Error: ${error} - instanceId: ${this.instanceId}`
      );
      await ctx.answerCbQuery("❌ Error accessing dashboard");
    }
  }

  /**
   * Handles menu refresh
   */
  public async handleRefresh(ctx: GlobalSceneContext): Promise<boolean> {
    logger.info(
      `[MainMenuServices:handleRefresh] Refreshing menu - instanceId: ${this.instanceId}`
    );

    try {
      // Load fresh user data
      const user = await this.loadUserData(ctx);

      if (!user) {
        logger.warn(
          `[MainMenuServices:handleRefresh] Failed to load user data - instanceId: ${this.instanceId}`
        );
        await ctx.answerCbQuery("❌ Failed to refresh. Please try again.");
        return false;
      }

      await ctx.answerCbQuery("✅ Balance refreshed!");
      return true;
    } catch (error) {
      logger.error(
        `[MainMenuServices:handleRefresh] Error: ${error} - instanceId: ${this.instanceId}`
      );
      await ctx.answerCbQuery("❌ Failed to refresh. Please try again.");
      return false;
    }
  }

  /**
   * Handles menu dismissal
   */
  public async handleDismiss(ctx: GlobalSceneContext): Promise<void> {
    logger.info(
      `[MainMenuServices:handleDismiss] Dismissing menu - instanceId: ${this.instanceId}`
    );

    try {
      await ctx.answerCbQuery("Menu dismissed");
      // The scene will be deactivated by the MainMenuSubScene
    } catch (error) {
      logger.error(
        `[MainMenuServices:handleDismiss] Error: ${error} - instanceId: ${this.instanceId}`
      );
      await ctx.answerCbQuery("❌ Error dismissing menu");
    }
  }
}
