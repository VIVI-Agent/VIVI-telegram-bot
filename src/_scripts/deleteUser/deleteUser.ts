// deleteUser.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Función que realiza la eliminación del usuario y todos sus datos relacionados
async function deleteUserById(userId: number) {
  return prisma.$transaction(
    async (tx) => {
      // 1. Desconectar a otros usuarios que hacen referencia a este userId
      await tx.user.updateMany({
        where: { referredById: userId },
        data: { referredById: null },
      });

      // 2. Eliminar registros “hijos” directamente relacionados con este userId
      await tx.userFeedback.deleteMany({
        where: { userId },
      });
      await tx.buySettings.deleteMany({
        where: { userId },
      });
      await tx.sellSettings.deleteMany({
        where: { userId },
      });
      await tx.trade.deleteMany({
        where: { userId },
      });
      await tx.holding.deleteMany({
        where: { userId },
      });
      await tx.withdrawal.deleteMany({
        where: { userId },
      });

      // Eliminar dependencias indirectas antes de eliminar Wallet
      await tx.allowance.deleteMany({
        where: {
          wallet: { userId },
        },
      });

      // Eliminar todas las Wallet de ese usuario
      await tx.wallet.deleteMany({
        where: { userId },
      });

      // 3. Finalmente, eliminar el usuario
      await tx.user.delete({
        where: { id: userId },
      });
      return true;
    },
    {
      timeout: 30000, // 30 segundos en lugar de 5
    }
  );
}

// Bloque principal que se ejecuta al invocar "ts-node deleteUser.ts <userId>"
(async () => {
  try {
    // Tomamos el valor desde process.argv
    const userIdArg = process.argv[2];
    if (!userIdArg) {
      console.error("❌ Debes proporcionar un userId como argumento.");
      process.exit(1);
    }

    const userId = parseInt(userIdArg, 10);
    if (isNaN(userId)) {
      console.error("❌ El userId proporcionado no es un número válido.");
      process.exit(1);
    }

    console.log(
      `➡️ Eliminando todos los registros del usuario con ID = ${userId}`
    );

    await deleteUserById(userId);

    console.log("✅ Usuario y todos sus registros eliminados correctamente.");
  } catch (error) {
    console.error("❌ Error al eliminar usuario:", error);
  } finally {
    // Cerrar la conexión de Prisma
    await prisma.$disconnect();
  }
})();
