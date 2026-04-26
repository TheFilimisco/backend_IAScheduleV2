const express = require('express');
const router = express.Router();
const { ChatOpenAI } = require('@langchain/openai');

// POST /api/ia/schedule
// Endpoint principal para recibir el prompt natural y ejecutar las Skills
router.post('/schedule', async (req, res) => {
  const { prompt } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'El prompt es requerido' });
  }

  try {
    // Inicialización básica para verificar que la key de OpenAI funciona
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-4o-mini', // Puedes ajustarlo a 'gpt-4o' o 'gpt-3.5-turbo'
    });

    // TODO: Implementar las Tools (Skills) con Zod y la lógica de agente de LangChain
    
    res.json({ message: 'Ruta de IA configurada. Prompt recibido: ' + prompt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error procesando la solicitud de IA', details: error.message });
  }
});

module.exports = router;
