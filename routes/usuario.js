const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas

// 1. Buscar dueno_muestra por ID
// Petición: GET /api/dueno_muestra/:id
router.get('/:email', async (req, res) => {
  const { email } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT
        u.id_usuario,
        u.email,
        r.nombre_rol,
        i.id_inventario,
        p.nombre AS nombre_propietario
      FROM usuario u
      INNER JOIN usuario_rol r ON u.id_usuario_rol = r.id_usuario_rol
      INNER JOIN propietario p ON u.id_propietario = p.id_propietario
      INNER JOIN inventario i ON u.id_propietario = i.id_propietario
      where u.email=$1`,
      [email]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/dueno_muestra/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;