const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas

// Listar todos los roles de usuario
// Petición: GET /api/usuario-rol
router.get('/', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT 
        id_usuario_rol,
        nombre_rol
      FROM usuario_rol
      ORDER BY id_usuario_rol DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/usuario-rol:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;