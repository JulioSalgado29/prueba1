const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Cierre de caja por Correo (Ejecuta SP y devuelve cursores/resultados)
// Petición: POST /api/cierre_caja/correo
router.post('/correo', async (req, res) => {
  const { fecha, email_user } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Llamada al procedimiento almacenado por correo
    await client.query(
      `CALL sp_guardar_y_reportar_cierre_caja($1, $2, 'ref_resumen_financiero', 'ref_calzado_cantidad', 'ref_detalle_caracteristicas', 'ref_tipo_calzado', 'ref_metodo_pago')`,
      [fecha, email_user]
    );

    // Fetch de los cursores devueltos por el SP
    const resResumen = await client.query('FETCH ALL FROM ref_resumen_financiero');
    const resCalzado = await client.query('FETCH ALL FROM ref_calzado_cantidad');
    const resCaracteristicas = await client.query('FETCH ALL FROM ref_detalle_caracteristicas');
    const resTipoCalzado = await client.query('FETCH ALL FROM ref_tipo_calzado');
    const resMetodoPago = await client.query('FETCH ALL FROM ref_metodo_pago');

    await client.query('COMMIT');

    res.json({
      mensaje: 'Cierre de caja por vendedor realizado y guardado correctamente',
      resumen_financiero: resResumen.rows,
      calzado_cantidad: resCalzado.rows,
      detalle_caracteristicas: resCaracteristicas.rows,
      tipo_calzado: resTipoCalzado.rows,
      metodo_pago: resMetodoPago.rows
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en POST /api/cierre_caja/correo:', error.message);
    res.status(500).json({ error: 'Error interno al procesar el cierre de caja por correo' });
  } finally {
    client.release();
  }
});

// 2. Cierre de caja por ID de Tienda (Ejecuta SP y devuelve cursores/resultados)
// Petición: POST /api/cierre_caja/tienda
router.post('/tienda', async (req, res) => {
  const { fecha, id_tienda } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Llamada al procedimiento almacenado por ID de tienda
    await client.query(
      `CALL sp_guardar_y_reportar_cierre_caja_por_tienda($1, $2, 'ref_resumen_financiero', 'ref_calzado_cantidad', 'ref_detalle_caracteristicas', 'ref_tipo_calzado', 'ref_metodo_pago')`,
      [fecha, id_tienda]
    );

    // Fetch de los cursores devueltos por el SP
    const resResumen = await client.query('FETCH ALL FROM ref_resumen_financiero');
    const resCalzado = await client.query('FETCH ALL FROM ref_calzado_cantidad');
    const resCaracteristicas = await client.query('FETCH ALL FROM ref_detalle_caracteristicas');
    const resTipoCalzado = await client.query('FETCH ALL FROM ref_tipo_calzado');
    const resMetodoPago = await client.query('FETCH ALL FROM ref_metodo_pago');

    await client.query('COMMIT');

    res.json({
      mensaje: 'Cierre de caja por tienda realizado y guardado correctamente',
      resumen_financiero: resResumen.rows,
      calzado_cantidad: resCalzado.rows,
      detalle_caracteristicas: resCaracteristicas.rows,
      tipo_calzado: resTipoCalzado.rows,
      metodo_pago: resMetodoPago.rows
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en POST /api/cierre_caja/tienda:', error.message);
    res.status(500).json({ error: 'Error interno al procesar el cierre de caja por tienda' });
  } finally {
    client.release();
  }
});

// Listar todos los registros generales de cierre de caja
// Petición: GET /api/cierre_caja/listar
router.get('/listar', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Pasar NULL para que el procedimiento asigne el nombre interno 'c_cierres'
    await client.query('CALL sp_listar_cierres_caja(NULL)');
    
    // Obtener los registros del cursor definido en el SP
    const resultado = await client.query('FETCH ALL FROM c_cierres');

    await client.query('COMMIT');
    res.json(resultado.rows);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en GET /api/cierre_caja/listar:', error.message);
    res.status(500).json({ error: 'Error interno al listar los cierres de caja' });
  } finally {
    client.release();
  }
});

module.exports = router;