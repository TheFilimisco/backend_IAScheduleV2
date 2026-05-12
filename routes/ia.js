const express = require("express");
const router = express.Router();
const { runAgent } = require("../services/aiAgent");

router.post("/schedule", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "El prompt es requerido" });
  }

  if (prompt.length > 1000) {
    return res.status(400).json({ error: "El prompt es demasiado largo (max 1000 caracteres)" });
  }

  try {
    const message = await runAgent(prompt);
    res.status(200).json({ message });
  } catch (err) {
    console.error("[IA Agent Error]", err);
    res.status(500).json({ error: "Error procesando la solicitud de IA" });
  }
});

module.exports = router;
