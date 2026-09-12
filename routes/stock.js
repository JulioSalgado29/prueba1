const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas

// 1. Filtrar Inventario (Cabecera y Detalle usando sp_filtrar_inventario)
// Petición: POST /api/inventario/filtrar
router.post('/filtrar', async (req, res) => {
  const { 
    p_ids_calzado = [], 
    p_ids_color = [], 
    p_tallas = [], 
    p_plataforma = '0', 
    p_tacos = [], 
    p_inventario_id 
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Ejecutar el procedimiento almacenado correctamente
    await client.query(
      `SELECT sp_filtrar_inventario($1::INT[], $2::INT[], $3::INT[], $4::TEXT, $5::INT[], $6::INT())`,
      [p_ids_calzado, p_ids_color, p_tallas, p_plataforma, p_tacos, p_inventario_id]
    );

    // 2. Hacer fetch a los cursores (asegúrate de que los nombres de los cursores coincidan con los definidos en tu PL/pgSQL)
    const resultadoCabecera = await client.query('FETCH ALL FROM ref_inventario_cabecera;');
    const resultadoDetalle = await client.query('FETCH ALL FROM ref_inventario_detalle;');

    await client.query('COMMIT');

    res.json({
      cabecera: resultadoCabecera.rows,
      detalle: resultadoDetalle.rows
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('DETALLE DEL ERROR SQL:', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// 2. Filtrar Calzado con Imágenes y Colores (usando sp_filtrar_calzado_imagenes)
// Petición: POST /api/inventario/imagenes-filtradas
router.post('/imagenes-filtradas', async (req, res) => {
  const { 
    p_inventario_id, 
    p_ids_color = [], 
    p_ids_calzado = [] 
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Llamada al procedimiento almacenado
    await client.query(
      `CALL sp_filtrar_calzado_imagenes($1::INT, $2::INT[], $3::INT[])`,
      [p_inventario_id, p_ids_color, p_ids_calzado]
    );

    // Fetch del cursor de resultados
    const resultadoImagenes = await client.query('FETCH ALL FROM ref_resultado;');

    await client.query('COMMIT');

    res.json(resultadoImagenes.rows);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en POST /api/inventario/imagenes-filtradas:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

module.exports = router;