import { BaseService, GlobalSceneContext } from "@types";

/**
 * MainMenu business logic services
 */
export class MainMenuServices extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "MainMenuServices");
  }

  /**
   * Loads user data with wallets for the main menu
   */
  public async loadUserData(ctx: GlobalSceneContext): Promise<any | null> {
    const userId = ctx.from?.id;

    if (!userId) {
      this.logWithoutContext("warn", "Missing user ID");
      return null;
    }

    try {
      this.log("info", ctx, "Loading user data");

      // Get user by Telegram ID
      const user = await ctx.services.userService.getUserByTgId(userId);

      if (!user) {
        this.log("warn", ctx, "User not found in database");
        return null;
      }

      // Load user's wallets
      this.log("debug", ctx, `Loading wallets for user ${user.id}`);
      const wallets = await ctx.services.walletService.getUserWallets(user.id);

      this.log("info", ctx, `Loaded ${wallets.length} wallets`);

      // Build user data with wallets and other properties
      const userWithWallets = {
        ...user,
        wallets: wallets,
        points: user.points || 0,
        referralPoints: user.referralPoints || 0,
        totalVolumeBoughtWei: user.totalVolumeBoughtWei || 0,
        totalVolumeSoldWei: user.totalVolumeSoldWei || 0,
      };

      this.log("info", ctx, "Successfully loaded user data");
      return userWithWallets;
    } catch (error) {
      this.logError(ctx, "loadUserData", error);
      return null;
    }
  }

  /**
   * Handles navigation to Buy scene
   */
  public async navigateToBuy(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Navigating to Buy");

    try {
      await ctx.answerCbQuery("🚀 Buy feature coming soon!");
      // TODO: Activate Buy scene when implemented
      // await ctx.sceneManager.activateScene(ctx, "Buy");
    } catch (error) {
      this.logError(ctx, "navigateToBuy", error);
      await ctx.answerCbQuery("❌ Error navigating to Buy");
    }
  }

  /**
   * Handles navigation to Sell scene
   */
  public async navigateToSell(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Navigating to Sell");

    try {
      await ctx.answerCbQuery("💰 Sell feature coming soon!");
      // TODO: Activate Sell scene when implemented
      // await ctx.sceneManager.activateScene(ctx, "Sell");
    } catch (error) {
      this.logError(ctx, "navigateToSell", error);
      await ctx.answerCbQuery("❌ Error navigating to Sell");
    }
  }

  /**
   * Handles navigation to Wallets scene
   */
  public async navigateToWallets(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Navigating to Wallets");

    try {
      await ctx.answerCbQuery("💼 Wallets feature coming soon!");
      // TODO: Activate Wallets scene when implemented
      // await ctx.sceneManager.activateScene(ctx, "Wallets");
    } catch (error) {
      this.logError(ctx, "navigateToWallets", error);
      await ctx.answerCbQuery("❌ Error navigating to Wallets");
    }
  }

  /**
   * Handles navigation to Holdings scene
   */
  public async navigateToHoldings(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Navigating to Holdings");

    try {
      await ctx.answerCbQuery("💰 Holdings feature coming soon!");
      // TODO: Activate Holdings scene when implemented
      // await ctx.sceneManager.activateScene(ctx, "Holdings");
    } catch (error) {
      this.logError(ctx, "navigateToHoldings", error);
      await ctx.answerCbQuery("❌ Error navigating to Holdings");
    }
  }

  /**
   * Handles navigation to Withdraw scene
   */
  public async navigateToWithdraw(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Navigating to Withdraw");

    try {
      await ctx.answerCbQuery("📤 Withdraw feature coming soon!");
      // TODO: Activate Withdraw scene when implemented
      // await ctx.sceneManager.activateScene(ctx, "Withdraw");
    } catch (error) {
      this.logError(ctx, "navigateToWithdraw", error);
      await ctx.answerCbQuery("❌ Error navigating to Withdraw");
    }
  }

  /**
   * Handles navigation to Settings scene
   */
  public async navigateToSettings(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Navigating to Settings");

    try {
      await ctx.answerCbQuery("⚙️ Settings feature coming soon!");
      // TODO: Activate Settings scene when implemented
      // await ctx.sceneManager.activateScene(ctx, "Settings");
    } catch (error) {
      this.logError(ctx, "navigateToSettings", error);
      await ctx.answerCbQuery("❌ Error navigating to Settings");
    }
  }

  /**
   * Handles referral link generation
   */
  public async handleReferralLink(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Generating referral link");

    try {
      await ctx.answerCbQuery("🤝 Referral feature coming soon!");
      // TODO: Generate and show referral link
    } catch (error) {
      this.logError(ctx, "handleReferralLink", error);
      await ctx.answerCbQuery("❌ Error generating referral link");
    }
  }

  /**
   * Handles login/dashboard access
   */
  public async handleLogin(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Handling login");

    try {
      await ctx.answerCbQuery("🔐 Dashboard access coming soon!");
      // TODO: Generate login link or token
    } catch (error) {
      this.logError(ctx, "handleLogin", error);
      await ctx.answerCbQuery("❌ Error accessing dashboard");
    }
  }

  /**
   * Handles menu refresh
   */
  public async handleRefresh(ctx: GlobalSceneContext): Promise<boolean> {
    this.log("info", ctx, "Refreshing menu");

    try {
      // Load fresh user data
      const user = await this.loadUserData(ctx);

      if (!user) {
        this.log("warn", ctx, "Failed to load user data");
        await ctx.answerCbQuery("❌ Failed to refresh. Please try again.");
        return false;
      }

      await ctx.answerCbQuery("✅ Balance refreshed!");
      return true;
    } catch (error) {
      this.logError(ctx, "handleRefresh", error);
      await ctx.answerCbQuery("❌ Failed to refresh. Please try again.");
      return false;
    }
  }

  /**
   * Handles menu dismissal
   */
  public async handleDismiss(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Dismissing menu");

    try {
      await ctx.answerCbQuery("Menu dismissed");
      // The scene will be deactivated by the MainMenuSubScene
    } catch (error) {
      this.logError(ctx, "handleDismiss", error);
      await ctx.answerCbQuery("❌ Error dismissing menu");
    }
  }
}
