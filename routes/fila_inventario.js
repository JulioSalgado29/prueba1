const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Listar filas de inventario por ID de inventario
// Petición: GET /api/fila_inventario/inventario/:id_inventario
router.get('/inventario/:id_inventario', async (req, res) => {
  const { id_inventario } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        id_fila_inventario,
        id_calzado,
        cantidad,
        email_user,
        fecha_creacion,
        id_inventario,
        usuario_creacion
      FROM fila_inventario
      WHERE id_inventario = $1
      ORDER BY fecha_creacion DESC`,
      [id_inventario]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/fila_inventario/inventario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar fila_inventario (PostgreSQL elimina las subfilas automáticamente por CASCADE)
// Petición: DELETE /api/fila_inventario/:id_fila_inventario
router.delete('/:id_fila_inventario', async (req, res) => {
  const { id_fila_inventario } = req.params;

  try {
    const resultado = await pool.query(
      'DELETE FROM fila_inventario WHERE id_fila_inventario = $1 RETURNING *',
      [id_fila_inventario]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Fila de inventario no encontrada' });
    }

    res.json({ mensaje: 'Fila de inventario y sus subfilas fueron eliminadas correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/fila_inventario/:id_fila_inventario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;