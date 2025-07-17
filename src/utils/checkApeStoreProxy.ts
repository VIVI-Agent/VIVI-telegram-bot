import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { contracts, base as baseConfig } from "../config";

const APE_ROUTER_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "AllowedProxies",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function checkApeStoreProxyStatus(): Promise<boolean> {
  console.log("🔍 [checkApeStoreProxyStatus] Starting proxy status check...");
  try {
    const client = createPublicClient({
      chain: base,
      transport: http(baseConfig.BASE_RPC_URL),
    });

    console.log(
      `🔍 [checkApeStoreProxyStatus] Checking router: ${contracts.APESTORE_ROUTER_ADDRESS}`
    );
    console.log(
      `🔍 [checkApeStoreProxyStatus] Checking contract: ${contracts.FEE_SWAP_WRAPPER_APESTORE_NEW}`
    );

    const isAllowed = await client.readContract({
      address: contracts.APESTORE_ROUTER_ADDRESS as `0x${string}`,
      abi: APE_ROUTER_ABI,
      functionName: "AllowedProxies",
      args: [contracts.FEE_SWAP_WRAPPER_APESTORE_NEW as `0x${string}`],
    });

    console.log(
      `🔍 [checkApeStoreProxyStatus] Result: ${
        isAllowed ? "✅ Allowed" : "❌ Not allowed"
      }`
    );
    return isAllowed;
  } catch (error) {
    console.error(
      "❌ [checkApeStoreProxyStatus] Error checking ApeStore proxy status:",
      error
    );
    // Default to false (use old contract) if there's an error
    return false;
  }
}
