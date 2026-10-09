const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas

router.post('/administrador', async (req, res) => {
  const { id_inventario } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Llamada al stored procedure pasando el ID de inventario
    await client.query(
      `CALL sp_reportar_inventario($1)`,
      [id_inventario]
    );

    // Fetch de todos los cursores retornados por el SP
    const resTotalPares = await client.query('FETCH ALL FROM c_total_pares_inventario');
    const resTipoCalzado = await client.query('FETCH ALL FROM c_tipo_calzado_inventario');
    const resDinero = await client.query('FETCH ALL FROM c_dinero_inventario');
    const resBalanceDia = await client.query('FETCH ALL FROM c_balance_por_dia');
    const resBalanceTiendaDia = await client.query('FETCH ALL FROM c_balance_por_tienda_dia');
    const resMesPrimeraVenta = await client.query('FETCH ALL FROM c_mes_primera_venta');

    await client.query('COMMIT');

    res.json({
      mensaje: 'Reporte de inventario generado correctamente',
      total_pares: resTotalPares.rows,
      tipo_calzado: resTipoCalzado.rows,
      dinero_inventario: resDinero.rows,
      balance_por_dia: resBalanceDia.rows,
      balance_por_tienda_dia: resBalanceTiendaDia.rows,
      mes_primera_venta: resMesPrimeraVenta.rows
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en POST /api/inventario:', error.message);
    res.status(500).json({ error: 'Error interno al procesar el reporte de inventario' });
  } finally {
    client.release();
  }
});

module.exports = router;