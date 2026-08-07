const express = require('express');
const router = express.Router();
const pool = require('../db');

// Listar calzados activos por inventario
// Petición: GET /api/calzado/inventario/:id_inventario
router.get('/inventario/:id_inventario', async (req, res) => {
    const { id_inventario } = req.params;
    try {
        const resultado = await pool.query(
            `SELECT 
        id_calzado,
        nombre,
        icono,
        precio_real,
        taco,
        plataforma,
        colores,
        id_tipo_calzado,
        usuario_creacion,
        email_usuario,
        activo,
        fecha_creacion,
        id_inventario
      FROM calzado
      WHERE activo = true AND 
            id_inventario = $1
      ORDER BY fecha_creacion DESC`,
            [id_inventario]
        );
        res.json(resultado.rows);
    } catch (error) {
        console.error('Error en GET /api/calzado/inventario:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Eliminar calzado (Baja lógica)
// Petición: DELETE /api/calzado/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      'UPDATE calzado SET activo = $2 WHERE id_calzado = $1 RETURNING *',
      [id, false]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'calzado no encontrado' });
    }

    res.json({ mensaje: 'calzado eliminado correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/calzado/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;