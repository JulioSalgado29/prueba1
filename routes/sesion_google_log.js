const express = require('express');
const router = express.Router();
const pool = require('../db');

// Insertar sesion_google_log
// Petición: POST /api/sesion_google_log
router.post('/', async (req, res) => {
  const { email, name, plataforma } = req.body;

  // Validación básica del correo
  if (!email) {
    return res.status(400).json({ error: 'El email es obligatorio' });
  }

  const emailLimpio = email.trim().toLowerCase();
  const nombreLimpio = name ? name.trim() : 'Usuario sin nombre';

  try {
    const nuevo = await pool.query(
      `INSERT INTO sesion_google_log (email, name, plataforma) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [emailLimpio, nombreLimpio, plataforma || null]
    );

    res.status(201).json(nuevo.rows[0]);
  } catch (error) {
    console.error('Error en POST /api/sesion_google_log:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;