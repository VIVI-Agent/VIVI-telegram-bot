# 🎯 Mejores Prácticas - Sistema de Escenas

## 🏗️ Arquitectura y Estructura

### **Separación de Responsabilidades**

```typescript
// ✅ CORRECTO: Responsabilidades separadas
SubScene   → Manejo de UI y coordinación
Services   → Lógica de negocio
Menus      → Gestión de interfaces
Messages   → Contenido centralizado
Callbacks  → Constantes de acciones
```

### **Naming Conventions**

```typescript
// ✅ Archivos
BuySubScene.ts          // PascalCase + SubScene
BuyServices.ts          // PascalCase + Services
BuyMenus.ts            // PascalCase + Menus

// ✅ Clases
export class BuySubScene extends BaseSubScene<BuySceneData>
export class BuyServices extends BaseService
export class BuyMenus extends BaseMenus

// ✅ Interfaces
interface BuySceneData {
  step: "initial" | "processing" | "completed";
}

// ✅ Callbacks
export const CALLBACKS = {
  CONFIRM_PURCHASE: "confirm_purchase",
  CANCEL_ORDER: "cancel_order",
} as const;
```

## 🔄 Manejo de Estado

### **Scene Data Typing**

```typescript
// ✅ Define interfaces específicas para cada escena
interface BuySceneData {
  step: "token_selection" | "amount_input" | "confirmation" | "processing";
  tokenAddress?: string;
  amount?: string;
  slippage?: number;
  tempMessageIds?: number[];
}

export class BuySubScene extends BaseSubScene<BuySceneData> {
  // TypeScript inferirá tipos automáticamente
}
```

### **State Updates**

```typescript
// ✅ Usa updateSceneData para cambios
this.updateSceneData(ctx, {
  step: "amount_input",
  tokenAddress: selectedToken
});

// ✅ Usa getSceneData para leer
const sceneData = this.getSceneData(ctx);
if (sceneData.step === "confirmation") {
  // ...
}

// ❌ NUNCA accedas directamente
ctx.session.activeSubScenes[this.instanceId].data = { ... }; // ❌
```

## 🔄 Transiciones de Escenas

### **Transiciones Limpias**

```typescript
// ✅ Siempre desactiva antes de activar nueva escena
async completePurchase(ctx: GlobalSceneContext): Promise<void> {
  this.log("info", ctx, "Purchase completed, returning to MainMenu");

  // Cleanup automático por BaseSubScene
  await ctx.sceneManager.deactivateScene(ctx, this.instanceId);

  // Activar nueva escena
  await ctx.sceneManager.activateScene(ctx, "MainMenu");
}
```

## 🎨 UI y UX

### **Feedback Inmediato**

```typescript
// ✅ Siempre responde a callbacks
async handleConfirm(ctx: GlobalSceneContext): Promise<boolean> {
  // Respuesta inmediata
  await ctx.answerCbQuery("✅ Processing your order...");

  try {
    await this.processOrder(ctx);
  } catch (error) {
    await ctx.answerCbQuery("❌ Failed to process order");
  }

  return true;
}
```

### **Mensajes Informativos**

```typescript
// ✅ Usa funciones para mensajes dinámicos
export const BUY_TEXTS = {
  FUNCTIONS: {
    getOrderSummary(token: string, amount: string, total: string): string {
      return `🔄 Order Summary:\n\nToken: ${token}\nAmount: ${amount}\nTotal: ${total} ETH`;
    },

    getProgressMessage(step: number, total: number): string {
      return `⏳ Processing... (${step}/${total})`;
    },
  },
};
```

## 🛡️ Manejo de Errores

### **Error Boundaries**

```typescript
// ✅ Try-catch en métodos públicos
async handleCallback(ctx: GlobalSceneContext, callback: string): Promise<boolean> {
  const validation = this.validateCallbackInstanceId(callback);
  if (!validation) return false;

  const { action } = validation;

  try {
    switch (action) {
      case CALLBACKS.CONFIRM:
        return await this.handleConfirm(ctx);
      default:
        this.log("warn", ctx, `Unknown action: ${action}`);
        return false;
    }
  } catch (error) {
    await this.handleCallbackError(ctx, action, error);
    return true;
  }
}
```

### **Validaciones Defensivas**

```typescript
// ✅ Valida datos antes de usar
async processAmount(ctx: GlobalSceneContext, amount: string): Promise<void> {
  if (!amount || isNaN(Number(amount))) {
    this.log("warn", ctx, "Invalid amount provided");
    await ctx.reply("❌ Please enter a valid amount");
    return;
  }

  if (Number(amount) <= 0) {
    this.log("warn", ctx, "Amount must be positive");
    await ctx.reply("❌ Amount must be greater than 0");
    return;
  }

  this.log("info", ctx, `Processing amount: ${amount}`);
  // ...
}
```

## 📊 Performance

### **Lazy Loading de Datos**

```typescript
// ✅ Carga datos solo cuando se necesitan
async showTokenList(ctx: GlobalSceneContext): Promise<void> {
  this.log("info", ctx, "Loading token list");

  const sceneData = this.getSceneData(ctx);
  if (!sceneData.tokenList) {
    const tokens = await this.services.loadTokens(ctx);
    this.updateSceneData(ctx, { tokenList: tokens });
  }

  await this.menus.showTokenSelection(ctx, sceneData.tokenList);
}
```

## 🧪 Testing y Debug

### **Debug Helpers**

```typescript
// ✅ Helper methods para debugging
private debugSceneState(ctx: GlobalSceneContext): void {
  if (process.env.NODE_ENV === 'development') {
    const sceneData = this.getSceneData(ctx);
    this.log("debug", ctx, `Scene state: ${JSON.stringify(sceneData, null, 2)}`);
  }
}
```

## 📱 Patrones Comunes

### **Confirmación de Acciones**

```typescript
// ✅ Patrón de confirmación estándar
async showConfirmation(ctx: GlobalSceneContext): Promise<void> {
  const sceneData = this.getSceneData(ctx);

  const message = BUY_TEXTS.FUNCTIONS.getConfirmationMessage(
    sceneData.tokenSymbol,
    sceneData.amount,
    sceneData.estimatedCost
  );

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Confirm", this.createCallback(CALLBACKS.CONFIRM)),
      Markup.button.callback("❌ Cancel", this.createCallback(CALLBACKS.CANCEL))
    ]
  ]);

  const sent = await ctx.reply(message, keyboard);
  this.setMainMessageId(ctx, sent.message_id);
}
```

### **Navegación Single-Message**

```typescript
// ✅ Patrón para menús que se actualizan en lugar de crear nuevos mensajes
async updateMainMenu(ctx: GlobalSceneContext): Promise<void> {
  const mainMessageId = this.getMainMessageId(ctx);
  const sceneData = this.getSceneData(ctx);

  const newKeyboard = this.buildMenuKeyboard(sceneData.currentStep);
  const newText = this.getMenuText(sceneData);

  if (mainMessageId) {
    try {
      await ctx.editMessageText(newText, newKeyboard);
      this.log("debug", ctx, "Updated main menu");
    } catch (error) {
      // Si falla la edición, crear nuevo mensaje
      this.log("warn", ctx, "Failed to edit message, creating new one");
      const sent = await ctx.reply(newText, newKeyboard);
      this.setMainMessageId(ctx, sent.message_id);
    }
  } else {
    const sent = await ctx.reply(newText, newKeyboard);
    this.setMainMessageId(ctx, sent.message_id);
  }
}
```

### **Manejo de Mensajes Temporales**

```typescript
// ✅ Patrón para mensajes de progreso que se limpian automáticamente
async showProgressMessage(ctx: GlobalSceneContext, message: string): Promise<void> {
  const progressMsg = await ctx.reply(`⏳ ${message}`);
  this.addTempMessageId(ctx, progressMsg.message_id);

  // El mensaje se limpiará automáticamente cuando la escena termine
}

// ✅ Patrón para notificaciones temporales
async showTemporaryNotification(ctx: GlobalSceneContext, message: string, duration: number = 5000): Promise<void> {
  const notificationMsg = await ctx.reply(message);
  this.addTempMessageId(ctx, notificationMsg.message_id);

  // Opcional: limpiar después de un tiempo específico
  setTimeout(async () => {
    try {
      await ctx.deleteMessage(notificationMsg.message_id);
    } catch (error) {
      this.log("debug", ctx, `Failed to delete notification: ${error}`);
    }
  }, duration);
}
```

### **Manejo Robusto de Errores**

```typescript
// ✅ Patrón completo de manejo de errores en callbacks
async handleCallback(ctx: GlobalSceneContext, callback: string): Promise<boolean> {
  const validation = this.validateCallbackInstanceId(callback);
  if (!validation) {
    this.log("debug", ctx, `InstanceId mismatch for callback: ${callback}`);
    return false;
  }

  const { action } = validation;
  this.updateLastActivity(ctx);

  try {
    switch (action) {
      case CALLBACKS.PROCESS_PAYMENT:
        return await this.handlePaymentProcess(ctx);

      case CALLBACKS.CANCEL_OPERATION:
        return await this.handleCancel(ctx);

      default:
        this.log("warn", ctx, `Unknown callback action: ${action}`);
        await ctx.answerCbQuery("❌ Acción no reconocida");
        return false;
    }
  } catch (error) {
    await this.handleCallbackError(
      ctx,
      action,
      error,
      "❌ Error procesando la acción. Intenta nuevamente."
    );
    return true;
  }
}

// ✅ Manejo específico para operaciones críticas
async handlePaymentProcess(ctx: GlobalSceneContext): Promise<boolean> {
  // Respuesta inmediata al usuario
  await ctx.answerCbQuery("⏳ Procesando pago...");

  // Mostrar mensaje de progreso
  await this.showProgressMessage(ctx, "Procesando transacción...");

  try {
    const sceneData = this.getSceneData(ctx);
    const result = await this.services.processPayment(ctx, sceneData);

    // Actualizar estado y mostrar éxito
    this.updateSceneData(ctx, {
      step: "completed",
      transactionHash: result.hash
    });

    await this.showSuccessMessage(ctx, result);
    return true;

  } catch (error) {
    this.log("error", ctx, `Payment processing failed: ${error}`);

    // Mensaje específico al usuario
    const errorMessage = error.message.includes("insufficient funds")
      ? "❌ Fondos insuficientes"
      : "❌ Error procesando el pago. Intenta nuevamente.";

    await ctx.reply(errorMessage);
    return true;
  }
}
```

### **Cleanup Personalizado**

```typescript
// ✅ Override cleanup para operaciones específicas
async cleanup(ctx: GlobalSceneContext): Promise<void> {
  this.log("info", ctx, "Starting custom cleanup");

  try {
    // Cancelar operaciones pendientes
    await this.cancelPendingTransactions(ctx);

    // Limpiar recursos específicos
    await this.releaseTemporaryLocks(ctx);

    // Notificar servicios externos si es necesario
    const sceneData = this.getSceneData(ctx);
    if (sceneData.shouldNotifyExternal) {
      await this.notifyExternalService(ctx, "scene_cleanup");
    }

  } catch (error) {
    this.log("error", ctx, `Error during custom cleanup: ${error}`);
  }

  // Ejecutar cleanup estándar
  await super.cleanup(ctx);

  this.log("info", ctx, "Custom cleanup completed");
}
```

```

## 🚀 Optimizaciones

- ✅ **Usar BaseSubScene helpers** para operaciones comunes
- ✅ **Centralizar constantes** en archivos separados
- ✅ **Reutilizar componentes** entre escenas similares
- ✅ **Cache datos** que no cambian frecuentemente
- ✅ **Validar early** antes de operaciones costosas
- ✅ **Cleanup agresivo** de mensajes temporales
- ✅ **Log apropiado** para debugging y monitoring
```
