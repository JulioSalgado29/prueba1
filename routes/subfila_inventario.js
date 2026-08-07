const express = require('express');
const router = express.Router();
const pool = require('../db');

// Listar subfilas por ID de fila_inventario
// Petición: GET /api/subfila_inventario/fila/:id_fila_inventario
router.get('/fila/:id_fila_inventario', async (req, res) => {
  const { id_fila_inventario } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        id_subfila_inventario,
        cantidad,
        colores,
        email_user,
        fecha_creacion,
        id_fila_inventario,
        plataforma,
        taco,
        talla,
        usuario_creacion
      FROM subfila_inventario
      WHERE id_fila_inventario = $1
      ORDER BY talla ASC, taco ASC, plataforma ASC, colores ASC`,
      [id_fila_inventario]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/subfila_inventario/fila:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;