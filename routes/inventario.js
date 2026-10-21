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

// Obtener plan por inventario (usando sp_obtener_plan_inventario)
// Petición: POST /api/inventario/plan
router.post('/plan', async (req, res) => {
  let { p_id_inventario } = req.body;

  p_id_inventario = Number(p_id_inventario);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `CALL sp_obtener_plan_inventario($1, 'ref_cursor_plan')`,
      [p_id_inventario]
    );

    const resultado = await client.query('FETCH ALL FROM ref_cursor_plan;');

    await client.query('COMMIT');

    res.json(resultado.rows);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('DETALLE DEL ERROR SQL (plan):', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;