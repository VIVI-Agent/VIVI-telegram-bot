import { GlobalSceneContext, InitUserSceneData } from "@types";
import { createBaseWallet } from "@services";

/**
 * Check if the user is in the session
 * @param ctx - The context
 * @returns true if the user is in the session, false otherwise
 */

export const createWallet = async (
  ctx: GlobalSceneContext
): Promise<{
  address: `0x${string}`;
  encryptedPrivKey: string;
  privateKey: string;
}> => {
  const { address, encryptedPrivKey, privateKey } = await createBaseWallet();
  await ctx.services.walletService.createUserWallet(
    ctx.user.id,
    address,
    encryptedPrivKey,
    true
  );

  return {
    address,
    encryptedPrivKey,
    privateKey,
  };
};
