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
        subf.id_subfila_inventario,
        subf.cantidad,
        subf.colores,
        c.nombre AS nombre_color,
        subf.email_user,
        subf.fecha_creacion,
        subf.id_fila_inventario,
        subf.plataforma,
        subf.taco,
        subf.talla,
        subf.usuario_creacion
      FROM subfila_inventario subf
      INNER JOIN colores c ON c.id_color::text = subf.colores
      WHERE subf.id_fila_inventario = $1
      ORDER BY subf.talla ASC, subf.taco ASC, subf.plataforma ASC, subf.colores ASC`,
      [id_fila_inventario]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/subfila_inventario/fila:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;