const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Cierre de caja por Correo (Ejecuta SP y devuelve cursores/resultados)
// Petición: POST /api/cierre_caja/correo
router.post('/correo', async (req, res) => {
  const { fecha, email_user, nombre } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Llamada al procedimiento almacenado pasando el nuevo parámetro 'nombre' (usuario_creacion usa email_user)
    await client.query(
      `CALL sp_guardar_y_reportar_cierre_caja_por_usuario($1, $2, $3, 'c_resumen_financiero_usr', 'c_calzado_cantidad_usr', 'c_detalle_caracteristicas_usr', 'c_tipo_calzado_usr', 'c_metodo_pago_usr')`,
      [fecha, email_user, nombre || email_user]
    );

    // Fetch de los cursores con los nombres internos correctos que define el SP
    const resResumen = await client.query('FETCH ALL FROM c_resumen_financiero_usr');
    const resCalzado = await client.query('FETCH ALL FROM c_calzado_cantidad_usr');
    const resCaracteristicas = await client.query('FETCH ALL FROM c_detalle_caracteristicas_usr');
    const resTipoCalzado = await client.query('FETCH ALL FROM c_tipo_calzado_usr');
    const resMetodoPago = await client.query('FETCH ALL FROM c_metodo_pago_usr');

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
  const { fecha, id_tienda, usuario_creacion } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Llamada al procedimiento almacenado por ID de tienda pasando el parámetro de usuario
    await client.query(
      `CALL sp_guardar_y_reportar_cierre_caja_por_tienda($1, $2, $3, 'c_resumen_financiero_tienda', 'c_calzado_cantidad_tienda', 'c_detalle_caracteristicas_tienda', 'c_tipo_calzado_tienda', 'c_metodo_pago_tienda')`,
      [fecha, id_tienda, usuario_creacion]
    );

    // Fetch de los cursores con los nombres internos correctos que define el SP
    const resResumen = await client.query('FETCH ALL FROM c_resumen_financiero_tienda');
    const resCalzado = await client.query('FETCH ALL FROM c_calzado_cantidad_tienda');
    const resCaracteristicas = await client.query('FETCH ALL FROM c_detalle_caracteristicas_tienda');
    const resTipoCalzado = await client.query('FETCH ALL FROM c_tipo_calzado_tienda');
    const resMetodoPago = await client.query('FETCH ALL FROM c_metodo_pago_tienda');

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