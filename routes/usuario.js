const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas

// 1. Buscar dueno_muestra por Email
// Petición: GET /api/dueno_muestra/:email
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
    console.error('Error en GET /api/dueno_muestra/:email:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. Verificar si un inventario tiene calzados con colores y activos
// Petición: GET /api/dueno_muestra/tiene-colores/:id_inventario
router.get('/tiene-colores/:id_inventario', async (req, res) => {
  const { id_inventario } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT EXISTS (
        SELECT 1 
        FROM calzado c
        INNER JOIN inventario i ON i.id_inventario = c.id_inventario
        WHERE i.id_inventario = $1 
          AND c.colores = true 
          AND c.activo = true
      ) AS tiene_calzado_con_colores`,
      [id_inventario]
    );

    // Retorna { "tiene_calzado_con_colores": true/false }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en GET /api/dueno_muestra/tiene-colores/:id_inventario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;