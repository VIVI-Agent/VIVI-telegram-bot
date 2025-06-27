# 🔧 BaseSubScene - Referencia Completa de Métodos

## 📋 Visión General

La clase `BaseSubScene<TSceneData>` proporciona una base sólida para todas las escenas del sistema. Esta guía documenta todos los métodos disponibles con ejemplos prácticos de uso.

## 🔍 Métodos de Información y Estado

### **getSceneData(ctx: GlobalSceneContext): TSceneData**

Obtiene los datos tipados de la escena actual.

```typescript
interface MySceneData {
  step: "initial" | "processing" | "completed";
  userId?: string;
  amount?: number;
}

export class MyScene extends BaseSubScene<MySceneData> {
  async handleCallback(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<boolean> {
    const sceneData = this.getSceneData(ctx);

    if (sceneData.step === "initial") {
      // Lógica para estado inicial
    }

    return true;
  }
}
```

### **updateSceneData(ctx: GlobalSceneContext, data: Partial<TSceneData>): void**

Actualiza los datos de la escena de forma parcial y tipada.

```typescript
// Actualización parcial - solo cambia los campos especificados
this.updateSceneData(ctx, {
  step: "processing",
  amount: 100,
});

// Los demás campos se mantienen intactos
const sceneData = this.getSceneData(ctx);
// sceneData.userId sigue siendo el mismo valor anterior
```

### **updateLastActivity(ctx: GlobalSceneContext): void**

Actualiza el timestamp de última actividad. Útil para tracking y cleanup automático.

```typescript
async handleCallback(ctx: GlobalSceneContext, callback: string): Promise<boolean> {
  const validation = this.validateCallbackInstanceId(callback);
  if (!validation) return false;

  // Actualizar actividad en cada interacción
  this.updateLastActivity(ctx);

  // Procesar callback...
  return true;
}
```

## 📝 Métodos de Logging

### **log(level: "info" | "warn" | "error" | "debug", ctx: GlobalSceneContext, message: string): void**

Sistema de logging consistente con contexto de usuario.

```typescript
// Diferentes niveles de log
this.log("info", ctx, "User started payment process");
this.log("debug", ctx, `Scene data: ${JSON.stringify(this.getSceneData(ctx))}`);
this.log("warn", ctx, "User attempted invalid action");
this.log("error", ctx, `Payment failed: ${error.message}`);

// El output incluye contexto automáticamente:
// [BuySubScene:abc123] User 12345 (@username) - User started payment process
```

## 💬 Métodos de Gestión de Mensajes

### **setMainMessageId(ctx: GlobalSceneContext, messageId: number): void**

Establece el ID del mensaje principal de la escena para patrones de navegación single-message.

```typescript
async showMainMenu(ctx: GlobalSceneContext): Promise<void> {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("Opción 1", this.createCallback("option1"))],
    [Markup.button.callback("Opción 2", this.createCallback("option2"))]
  ]);

  const mainMessage = await ctx.reply("Menú Principal", keyboard);

  // Marcar como mensaje principal para futuras ediciones
  this.setMainMessageId(ctx, mainMessage.message_id);
}
```

### **getMainMessageId(ctx: GlobalSceneContext): number | undefined**

Obtiene el ID del mensaje principal actual.

```typescript
async updateMenu(ctx: GlobalSceneContext): Promise<void> {
  const mainMessageId = this.getMainMessageId(ctx);

  if (mainMessageId) {
    // Actualizar mensaje existente
    await ctx.editMessageText("Menú actualizado", newKeyboard);
  } else {
    // Crear nuevo mensaje si no existe
    const newMsg = await ctx.reply("Nuevo menú", newKeyboard);
    this.setMainMessageId(ctx, newMsg.message_id);
  }
}
```

### **addTempMessageId(ctx: GlobalSceneContext, messageId: number): void**

Agrega un mensaje temporal que se limpiará automáticamente.

```typescript
async showProcessingMessage(ctx: GlobalSceneContext): Promise<void> {
  // Mensaje de progreso temporal
  const progressMsg = await ctx.reply("⏳ Procesando...");
  this.addTempMessageId(ctx, progressMsg.message_id);

  // Mensaje de estado temporal
  const statusMsg = await ctx.reply("🔄 Estado: Iniciando...");
  this.addTempMessageId(ctx, statusMsg.message_id);

  // Ambos mensajes se limpiarán automáticamente al terminar la escena
}
```

## 🔗 Métodos de Callbacks

### **createCallback(action: string): string**

Crea un callback único para esta instancia de escena.

```typescript
// En la creación de teclados
const keyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("Confirmar", this.createCallback("confirm")),
    Markup.button.callback("Cancelar", this.createCallback("cancel")),
  ],
]);

// Resultado: "instanceId:confirm" y "instanceId:cancel"
```

### **validateCallbackInstanceId(callback: string): { instanceId: string; action: string } | null**

Valida que un callback pertenece a esta instancia específica.

```typescript
async handleCallback(ctx: GlobalSceneContext, callback: string): Promise<boolean> {
  const validation = this.validateCallbackInstanceId(callback);

  if (!validation) {
    // Este callback no es para esta instancia
    this.log("debug", ctx, `Callback ${callback} no pertenece a esta instancia`);
    return false;
  }

  const { instanceId, action } = validation;
  // instanceId es el ID de esta instancia
  // action es la acción específica (ej: "confirm", "cancel")

  switch (action) {
    case "confirm":
      return await this.handleConfirm(ctx);
    case "cancel":
      return await this.handleCancel(ctx);
    default:
      return false;
  }
}
```

## ⚠️ Métodos de Manejo de Errores

### **handleCallbackError(ctx: GlobalSceneContext, action: string, error: unknown, userMessage?: string): Promise<void>**

Manejo consistente de errores en callbacks con feedback al usuario.

```typescript
async handleCallback(ctx: GlobalSceneContext, callback: string): Promise<boolean> {
  const validation = this.validateCallbackInstanceId(callback);
  if (!validation) return false;

  const { action } = validation;

  try {
    switch (action) {
      case "process_payment":
        return await this.processPayment(ctx);
      default:
        return false;
    }
  } catch (error) {
    // Manejo automático de error con mensaje personalizado
    await this.handleCallbackError(
      ctx,
      action,
      error,
      "❌ Error procesando el pago. Intenta nuevamente."
    );
    return true; // Marcamos como manejado
  }
}
```

## 🧼 Métodos de Cleanup

### **cleanupTempMessages(ctx: GlobalSceneContext): Promise<void>**

Limpia todos los mensajes temporales agregados con `addTempMessageId()`.

```typescript
// Normalmente llamado automáticamente, pero puede usarse manualmente
async performCustomCleanup(ctx: GlobalSceneContext): Promise<void> {
  // Limpiar mensajes temporales específicos
  await this.cleanupTempMessages(ctx);

  // Continuar con otro cleanup personalizado...
}
```

### **cleanupMainMessage(ctx: GlobalSceneContext): Promise<void>**

Limpia el mensaje principal establecido con `setMainMessageId()`.

```typescript
async handleExit(ctx: GlobalSceneContext): Promise<void> {
  // Limpiar mensaje principal antes de salir
  await this.cleanupMainMessage(ctx);

  // Activar otra escena
  await ctx.sceneManager.activateScene(ctx, "MainMenu");
}
```

### **cleanup(ctx: GlobalSceneContext): Promise<void>**

Método principal de cleanup. Puede ser sobrescrito para lógica personalizada.

```typescript
// Override para cleanup personalizado
async cleanup(ctx: GlobalSceneContext): Promise<void> {
  this.log("info", ctx, "Iniciando cleanup personalizado");

  try {
    // Cleanup específico de la escena
    await this.cancelPendingOperations(ctx);
    await this.saveStateToDatabase(ctx);

    // Llamar al cleanup base (limpia mensajes automáticamente)
    await super.cleanup(ctx);

  } catch (error) {
    this.log("error", ctx, `Error en cleanup: ${error}`);
  }

  this.log("info", ctx, "Cleanup completado");
}
```

## 🔄 Métodos Abstractos (Obligatorios)

### **onActivate(ctx: GlobalSceneContext, data?: any): Promise<void>**

Método ejecutado cuando la escena se activa.

```typescript
async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
  this.log("info", ctx, "Activando escena");

  // Inicializar estado
  this.updateSceneData(ctx, {
    step: "initial",
    startTime: new Date().toISOString()
  });

  // Mostrar interfaz inicial
  await this.showInitialInterface(ctx);
}
```

### **handleCallback(ctx: GlobalSceneContext, callback: string): Promise<boolean>**

Maneja callbacks de botones inline.

```typescript
async handleCallback(ctx: GlobalSceneContext, callback: string): Promise<boolean> {
  const validation = this.validateCallbackInstanceId(callback);
  if (!validation) return false;

  const { action } = validation;
  this.updateLastActivity(ctx);

  // Procesar según la acción
  switch (action) {
    case "confirm":
      return await this.handleConfirm(ctx);
    case "cancel":
      return await this.handleCancel(ctx);
    default:
      this.log("warn", ctx, `Acción desconocida: ${action}`);
      return false;
  }
}
```

### **handleText(ctx: GlobalSceneContext, text: string): Promise<boolean>**

Maneja entrada de texto del usuario.

```typescript
async handleText(ctx: GlobalSceneContext, text: string): Promise<boolean> {
  this.log("debug", ctx, `Texto recibido: ${text}`);

  const sceneData = this.getSceneData(ctx);

  switch (sceneData.step) {
    case "waiting_for_amount":
      return await this.processAmount(ctx, text);
    case "waiting_for_address":
      return await this.processAddress(ctx, text);
    default:
      // No esperamos texto en este estado
      return false;
  }
}
```

## 💡 Ejemplos de Uso Completos

### **Escena de Compra con Navegación Single-Message**

```typescript
export class BuyTokenSubScene extends BaseSubScene<BuySceneData> {
  async onActivate(ctx: GlobalSceneContext): Promise<void> {
    this.updateSceneData(ctx, { step: "token_selection" });
    await this.showTokenSelectionMenu(ctx);
  }

  private async showTokenSelectionMenu(ctx: GlobalSceneContext): Promise<void> {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("ETH", this.createCallback("select_eth"))],
      [Markup.button.callback("BTC", this.createCallback("select_btc"))],
    ]);

    const message = await ctx.reply("Selecciona un token:", keyboard);
    this.setMainMessageId(ctx, message.message_id);
  }

  private async updateToAmountInput(
    ctx: GlobalSceneContext,
    token: string
  ): Promise<void> {
    this.updateSceneData(ctx, {
      step: "amount_input",
      selectedToken: token,
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "🔙 Volver",
          this.createCallback("back_to_tokens")
        ),
      ],
    ]);

    // Actualizar el mensaje principal
    await ctx.editMessageText(
      `Token seleccionado: ${token}\n\n💰 Envía la cantidad que deseas comprar:`,
      keyboard
    );
  }

  async handleCallback(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<boolean> {
    const validation = this.validateCallbackInstanceId(callback);
    if (!validation) return false;

    const { action } = validation;
    this.updateLastActivity(ctx);

    try {
      switch (action) {
        case "select_eth":
          await this.updateToAmountInput(ctx, "ETH");
          return true;
        case "select_btc":
          await this.updateToAmountInput(ctx, "BTC");
          return true;
        case "back_to_tokens":
          await this.showTokenSelectionMenu(ctx);
          return true;
        default:
          return false;
      }
    } catch (error) {
      await this.handleCallbackError(ctx, action, error);
      return true;
    }
  }

  async handleText(ctx: GlobalSceneContext, text: string): Promise<boolean> {
    const sceneData = this.getSceneData(ctx);

    if (sceneData.step === "amount_input") {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        const errorMsg = await ctx.reply(
          "❌ Por favor ingresa una cantidad válida"
        );
        this.addTempMessageId(ctx, errorMsg.message_id);
        return true;
      }

      this.updateSceneData(ctx, { amount });
      await this.showConfirmation(ctx);
      return true;
    }

    return false;
  }
}
```

Esta documentación completa proporciona todos los métodos disponibles en `BaseSubScene` con ejemplos prácticos de implementación.
