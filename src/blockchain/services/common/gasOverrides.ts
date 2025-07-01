import { logger } from "@logger";
import { PublicClient, formatEther } from "viem";

export const SpeedEnum = {
  AUTO: "AUTO",
  FAST: "FAST",
  TURBO: "TURBO",
} as const;

type SpeedType = (typeof SpeedEnum)[keyof typeof SpeedEnum];

const BASE_GAS_LIMITS = {
  BUY: 400000n, // Basado en ejemplo BUY (382,344)
  SELL: 400000n, // Basado en ejemplo SELL (399,484)
  APPROVE: 80000n,
  TRANSFER: 80000n,
};

const PRIORITY_CONFIG = {
  BUY: {
    [SpeedEnum.AUTO]: 100000000n, // 0.1 Gwei
    [SpeedEnum.FAST]: 150000000n, // 0.15 Gwei
    [SpeedEnum.TURBO]: 200000000n, // 0.2 Gwei
  },
  SELL: {
    [SpeedEnum.AUTO]: 100000000n, // 0.1 Gwei
    [SpeedEnum.FAST]: 150000000n, // 0.15 Gwei
    [SpeedEnum.TURBO]: 200000000n, // 0.2 Gwei
  },
};

const FEE_MULTIPLIERS = {
  BUY: 11n, // Representa 1.1x (11/10)
  SELL: 20n, // Representa 2.0x (20/10)
};

export async function getGasOverridesForSpeed(
  userSpeed: SpeedType,
  publicClient: PublicClient,
  options?: {
    ethValue?: bigint;
    operationType?: "BUY" | "SELL" | "APPROVE" | "TRANSFER";
    estimatedGas?: bigint; // Nuevo parámetro para gas estimado
    overridePriorityGwei?: number;
  }
): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gas: bigint;
}> {
  const operation = options?.operationType || "BUY";
  const isSell = operation === "SELL";
  const estimatedGas = options?.estimatedGas;

  // 1. Obtener base fee del bloque
  const block = await publicClient.getBlock();
  const baseFee = block.baseFeePerGas || 0n;

  // 2. Configurar prioridad según operación y velocidad
  const priorityConfig = isSell ? PRIORITY_CONFIG.SELL : PRIORITY_CONFIG.BUY;
  const maxPriorityFeePerGas = priorityConfig[userSpeed];

  // 3. Calcular max fee con multiplicador diferente para cada operación
  const feeMultiplier = isSell ? FEE_MULTIPLIERS.SELL : FEE_MULTIPLIERS.BUY;
  const maxFeePerGas =
    (baseFee * feeMultiplier) / 10n + // División entera para el multiplicador
    maxPriorityFeePerGas;

  // 4. Determinar el gas limit
  let gasLimit: bigint;

  // Si tenemos una estimación de gas, la usamos con un margen de seguridad del 30%
  if (estimatedGas) {
    gasLimit = (estimatedGas * 130n) / 100n; // Añadir 30% de margen
    logger.info(
      `[gasOverrides] Usando gas estimado: ${estimatedGas} con margen: ${gasLimit}`
    );
  } else {
    // Si no hay estimación, usamos los límites base configurados
    gasLimit = BASE_GAS_LIMITS[operation];

    // 5. Ajustar gas limit para transacciones grandes
    const ethValue = options?.ethValue || 0n;
    const ethValueFloat = parseFloat(formatEther(ethValue));

    if (ethValueFloat > (isSell ? 0.5 : 1.0)) {
      gasLimit = (gasLimit * 115n) / 100n; // +15%
      logger.info(
        `[gasOverrides] Aumentando gas limit en 15% para ${operation} de ${ethValueFloat} ETH`
      );
    }
  }

  // 6. Ajustar gas limit según la velocidad seleccionada
  if (userSpeed === SpeedEnum.FAST) {
    gasLimit = (gasLimit * 110n) / 100n; // +10% más gas para FAST
  } else if (userSpeed === SpeedEnum.TURBO) {
    gasLimit = (gasLimit * 120n) / 100n; // +20% más gas para TURBO
  }

  let maxPriority = maxPriorityFeePerGas;
  if (options?.overridePriorityGwei !== undefined) {
    maxPriority = BigInt(Math.floor(options.overridePriorityGwei * 1e9)); // gwei→wei
  }

  logger.info(
    `[Gas Config] Operación: ${operation.padEnd(5)} | ` +
      `Velocidad: ${userSpeed.padEnd(5)} | ` +
      `Base Fee: ${formatEther(baseFee).padStart(8)} ETH | ` +
      `Priority: ${formatEther(maxPriorityFeePerGas).padStart(5)} Gwei | ` +
      `Max Fee: ${formatEther(maxFeePerGas).padStart(6)} Gwei | ` +
      `Gas Limit: ${gasLimit}`
  );

  return {
    maxFeePerGas,
    maxPriorityFeePerGas: maxPriority,
    gas: gasLimit,
  };
}
