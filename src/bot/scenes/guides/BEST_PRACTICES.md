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
  this.updateSceneData(ctx, { confirmationMessageId: sent.message_id });
}
```

## 🚀 Optimizaciones

- ✅ **Usar BaseSubScene helpers** para operaciones comunes
- ✅ **Centralizar constantes** en archivos separados
- ✅ **Reutilizar componentes** entre escenas similares
- ✅ **Cache datos** que no cambian frecuentemente
- ✅ **Validar early** antes de operaciones costosas
- ✅ **Cleanup agresivo** de mensajes temporales
- ✅ **Log apropiado** para debugging y monitoring
