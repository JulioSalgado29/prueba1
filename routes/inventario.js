const express = require('express');
const router = express.Router();
const pool = require('../db');

// Verificar si existe el inventario por ID
// Petición: GET /api/inventario/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 1 FROM inventario
       WHERE id_inventario = $1
       LIMIT 1`,
      [id]
    );
    
    // Retorna true si encontró registros, false si está vacío
    res.json(resultado.rows.length > 0);
  } catch (error) {
    console.error('Error en GET /api/inventario/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;