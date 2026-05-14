const express = require("express");
const router = express.Router();
const { runAgent, executeConfirmedAction, cancelConfirmation } = require("../services/aiAgent");

router.post("/schedule", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "El prompt es requerido" });
  }

  if (prompt.length > 1000) {
    return res.status(400).json({ error: "El prompt es demasiado largo (max 1000 caracteres)" });
  }

  try {
    const { message, pendingConfirmation } = await runAgent(prompt);
    res.status(200).json({ message, pendingConfirmation: pendingConfirmation ?? null });
  } catch (err) {
    console.error("[IA Agent Error]", err);
    res.status(500).json({ error: "Error procesando la solicitud de IA" });
  }
});

router.post("/confirm", async (req, res) => {
  const { id, approved } = req.body;

  if (!id || approved === undefined) {
    return res.status(400).json({ error: "id y approved son requeridos" });
  }

  try {
    if (!approved) {
      cancelConfirmation(id);
      return res.status(200).json({ message: "Operación cancelada." });
    }

    const result = await executeConfirmedAction(id);
    if (!result.ok) {
      return res.status(400).json({ error: result.message });
    }
    res.status(200).json({ message: result.message });
  } catch (err) {
    console.error("[IA Confirm Error]", err);
    res.status(500).json({ error: "Error al ejecutar la acción confirmada" });
  }
});

module.exports = router;
