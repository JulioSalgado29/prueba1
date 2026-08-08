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

// 2. Obtener detalle de fila de inventario con datos del calzado por ID
// Petición: GET /api/fila_inventario/detalle/:id_fila_inventario
router.get('/detalle/:id_fila_inventario', async (req, res) => {
  const { id_fila_inventario } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        fi.id_fila_inventario,
        fi.id_calzado,
        fi.cantidad,
        c.taco,
        c.plataforma,
        c.colores
      FROM fila_inventario fi
      INNER JOIN calzado c ON c.id_calzado = fi.id_calzado
      WHERE fi.id_fila_inventario = $1`,
      [id_fila_inventario]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Fila de inventario no encontrada' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en GET /api/fila_inventario/detalle:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 3. Crear o actualizar automáticamente (Upsert) fila y subfilas cuando filaId es null
// Petición: POST /api/fila_inventario/guardar
router.post('/guardar', async (req, res) => {
  const { id_inventario, id_calzado, cantidad, usuario_creacion, email_user, subfilas } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Buscar si ya existe una fila para este inventario y calzado
    const filaExisteRes = await client.query(
      `SELECT id_fila_inventario, cantidad 
       FROM fila_inventario 
       WHERE id_inventario = $1 AND id_calzado = $2`,
      [id_inventario, id_calzado]
    );

    let idFila;

    if (filaExisteRes.rows.length > 0) {
      // --- CASO 1A: LA FILA EXISTE (Sumar cantidad) ---
      idFila = filaExisteRes.rows[0].id_fila_inventario;
      const nuevaCantidad = filaExisteRes.rows[0].cantidad + cantidad;

      await client.query(
        `UPDATE fila_inventario SET cantidad = $1 WHERE id_fila_inventario = $2`,
        [nuevaCantidad, idFila]
      );

      // Procesar subfilas existentes o insertar nuevas
      for (const sub of subfilas) {
        const subExisteRes = await client.query(
          `SELECT id_subfila_inventario, cantidad 
           FROM subfila_inventario 
           WHERE id_fila_inventario = $1 
             AND talla = $2 
             AND taco = $3 
             AND plataforma IS NOT DISTINCT FROM $4 
             AND colores = $5`,
          [idFila, sub.talla, sub.taco, sub.plataforma, sub.colores]
        );

        if (subExisteRes.rows.length > 0) {
          const idSub = subExisteRes.rows[0].id_subfila_inventario;
          const nuevaCantSub = subExisteRes.rows[0].cantidad + sub.cantidad;

          await client.query(
            `UPDATE subfila_inventario SET cantidad = $1 WHERE id_subfila_inventario = $2`,
            [nuevaCantSub, idSub]
          );
        } else {
          await client.query(
            `INSERT INTO subfila_inventario 
              (id_fila_inventario, cantidad, talla, taco, plataforma, colores, usuario_creacion, email_user)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [idFila, sub.cantidad, sub.talla, sub.taco, sub.plataforma, sub.colores, usuario_creacion, email_user]
          );
        }
      }
    } else {
      // --- CASO 1B: LA FILA NO EXISTE (Crear fila y subfilas desde cero) ---
      const nuevaFilaRes = await client.query(
        `INSERT INTO fila_inventario 
          (id_inventario, id_calzado, cantidad, usuario_creacion, email_user)
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id_fila_inventario`,
        [id_inventario, id_calzado, cantidad, usuario_creacion, email_user]
      );

      idFila = nuevaFilaRes.rows[0].id_fila_inventario;

      for (const sub of subfilas) {
        await client.query(
          `INSERT INTO subfila_inventario 
            (id_fila_inventario, cantidad, talla, taco, plataforma, colores, usuario_creacion, email_user)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [idFila, sub.cantidad, sub.talla, sub.taco, sub.plataforma, sub.colores, usuario_creacion, email_user]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ mensaje: 'Guardado correctamente', id_fila_inventario: idFila });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en POST /api/fila_inventario/guardar:', error.message);
    res.status(500).json({ error: 'Error interno del servidor al guardar los datos' });
  } finally {
    client.release();
  }
});

// 4. Editar fila de inventario existente y reemplazar sus subfilas cuando filaId != null
// Petición: PUT /api/fila_inventario/:id_fila_inventario
router.put('/:id_fila_inventario', async (req, res) => {
  const { id_fila_inventario } = req.params;
  const { id_calzado, cantidad, usuario_creacion, subfilas } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Actualizar la fila principal
    const resFila = await client.query(
      `UPDATE fila_inventario 
       SET id_calzado = $1, cantidad = $2 
       WHERE id_fila_inventario = $3 
       RETURNING *`,
      [id_calzado, cantidad, id_fila_inventario]
    );

    if (resFila.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fila de inventario no encontrada' });
    }

    // 2. Eliminar todas las subfilas anteriores asociadas
    await client.query(
      `DELETE FROM subfila_inventario WHERE id_fila_inventario = $1`,
      [id_fila_inventario]
    );

    // 3. Reinsertar las nuevas subfilas
    for (const sub of subfilas) {
      await client.query(
        `INSERT INTO subfila_inventario 
          (id_fila_inventario, cantidad, talla, taco, plataforma, colores, usuario_creacion)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id_fila_inventario, sub.cantidad, sub.talla, sub.taco, sub.plataforma, sub.colores, usuario_creacion]
      );
    }

    await client.query('COMMIT');
    res.json({ mensaje: 'Fila y subfilas actualizadas correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en PUT /api/fila_inventario/:id_fila_inventario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor al actualizar los datos' });
  } finally {
    client.release();
  }
});

// 5. Eliminar fila_inventario (PostgreSQL elimina las subfilas automáticamente por CASCADE)
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