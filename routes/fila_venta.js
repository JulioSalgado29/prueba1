const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Listar ventas por ID de inventario y filtrado opcional por fecha (YYYY-MM-DD)
// Petición: GET /api/fila_venta/inventario/:id_inventario?fecha=2026-08-24
router.get('/inventario/:id_inventario', async (req, res) => {
  const { id_inventario } = req.params;
  const { fecha } = req.query;

  try {
    let queryText = `
      SELECT 
        fv.id_fila_venta,
        fv.id_venta,
        fv.id_inventario,
        fv.id_calzado,
        fv.cantidad,
        fv.talla,
        fv.colores,
        fv.taco,
        fv.plataforma,
        fv.precio_venta_total,
        fv.metodo_pago,
        fv.lugar_venta,
        fv.usuario_creacion,
        fv.email_user,
        fv.fecha_creacion,
        fv.fecha_venta,
        -- Datos del Calzado (INNER JOIN obligatorio)
        c.nombre AS calzado_nombre,
        c.icono AS calzado_icono,
        -- Datos de Dueño de Muestra (LEFT JOIN por inventario/usuario si aplica)
        dm.id_dueno_muestra,
        dm.nombre AS dueno_muestra_nombre
      FROM fila_venta fv
      INNER JOIN calzado c ON c.id_calzado = fv.id_calzado
      LEFT JOIN dueno_muestra dm 
        ON dm.id_inventario = fv.id_inventario 
       AND dm.email_usuario = fv.email_user
      WHERE fv.id_inventario = $1
    `;

    const queryParams = [id_inventario];

    if (fecha) {
      queryText += ` AND DATE(fv.fecha_creacion) = $2`;
      queryParams.push(fecha);
    }

    queryText += ` ORDER BY fv.fecha_creacion DESC`;

    const resultado = await pool.query(queryText, queryParams);
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/fila_venta/inventario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;